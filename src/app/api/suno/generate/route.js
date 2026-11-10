import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requestSunoGeneration } from '@/lib/suno';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt, tags, orderId, useCustomVoice } = await req.json();

    if (!prompt?.trim() || !tags?.trim()) {
      return NextResponse.json({ error: 'Estilo musical e detalhes do homenageado são obrigatórios.' }, { status: 400 });
    }

    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    if (orderId) {
      try {
        const { findOrderByIdOrNumber } = await import('@/lib/orderLookup');
        const { isContactBlocked } = await import('@/lib/blocklist');
        const { isBlockedByFreeLimit } = await import('@/app/api/orders/create/route');
        const order = await findOrderByIdOrNumber(orderId, env);
        if (order) {
          const block = await isContactBlocked(order.customerPhone, order.customerEmail, env);
          if (block.blocked) {
            return NextResponse.json({ error: 'Contato bloqueado para novas gerações na plataforma.' }, { status: 403 });
          }

          const isPaid = order.paymentStatus === 'PAGO' || order.paymentStatus === 'PAGAMENTO_APROVADO';
          const isBonus = Boolean(order.isSecondGeneration || order.origem === 'segunda_geracao' || order.origem === 'segunda_musica');
          if (!isPaid && !isBonus) {
            const freeLimitBlocked = await isBlockedByFreeLimit(order.customerPhone, order.customerEmail, env);
            if (freeLimitBlocked) {
              return NextResponse.json(
                { error: 'Você atingiu o limite de 5 músicas geradas sem pagamento. Realize o pagamento de uma das músicas para continuar.', blocked: true, reason: 'cota_excedida' },
                { status: 403 }
              );
            }
          }
        }
      } catch (checkErr) {
        console.warn('[suno/generate] Falha ao conferir bloqueio do pedido:', checkErr.message);
      }
    }

    // A chamada de fato à Kie.ai e a persistência do vínculo taskId->orderId vivem em
    // src/lib/suno.js — compartilhado com a retentativa automática (polling em tempo real e
    // reconciliação por cron), para as três nunca divergirem no que significa "gerar uma música".
    const persistPromise = requestSunoGeneration({ orderId, prompt, tags, useCustomVoice }, env);

    // Envolvido em waitUntil: se o cliente fechar a aba/desconectar bem aqui, o Cloudflare pode
    // cancelar o resto da execução do Worker antes desse await terminar — a Kie.ai já recebeu e vai
    // gerar a música mesmo assim, então sem waitUntil o taskId ficava órfão (sem orderId associado)
    // e nada encontraria pra onde escrever o resultado depois.
    try {
      const { ctx } = getRequestContext();
      if (ctx?.waitUntil) ctx.waitUntil(persistPromise.catch(() => {}));
    } catch (e) {}

    const result = await persistPromise;
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 502 });
    }

    return NextResponse.json({ taskId: result.taskId, status: 'PROCESSING' });
  } catch (error) {
    console.error('Erro fatal na rota /api/suno/generate:', error);
    return NextResponse.json({ error: 'Erro interno ao iniciar a geração da música.' }, { status: 500 });
  }
}
