import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requestSunoGeneration } from '@/lib/suno';

export const runtime = 'edge';

const ERRO_PACOTE_FAMILIA = 'Não foi possível usar uma geração do Pacote Família. Volte à página do pacote, confira o saldo e inicie uma nova música com o mesmo WhatsApp da compra.';

export async function POST(req) {
  try {
    const { prompt, tags, orderId, useCustomVoice, familiaRef: familiaRefRecebida } = await req.json();
    let familiaRef = familiaRefRecebida;

    if (!prompt?.trim() || !tags?.trim()) {
      return NextResponse.json({ error: 'Estilo musical e detalhes do homenageado são obrigatórios.' }, { status: 400 });
    }
    if (familiaRef && (!orderId || typeof familiaRef !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(familiaRef))) {
      return NextResponse.json({ error: ERRO_PACOTE_FAMILIA }, { status: 409 });
    }

    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    let bonusVinculado = null;
    let geracaoExtra = null;
    if (orderId) {
      try {
        const { findOrderByIdOrNumber } = await import('@/lib/orderLookup');
        const { isContactBlocked } = await import('@/lib/blocklist');
        const { isBlockedByFreeLimit } = await import('@/app/api/orders/create/route');
        const order = await findOrderByIdOrNumber(orderId, env);
        if (familiaRef && !order) {
          return NextResponse.json({ error: ERRO_PACOTE_FAMILIA }, { status: 409 });
        }
        if (order) {
          familiaRef = order.familiaRef || familiaRef;
          const { obterIpDoCliente, isBlockedByIpLimit } = await import('@/lib/cotaPorIp');
          const ipDoCliente = obterIpDoCliente(req);
          const block = await isContactBlocked(order.customerPhone, order.customerEmail, env, ipDoCliente);
          if (block.blocked) {
            return NextResponse.json({ error: 'Contato bloqueado para novas gerações na plataforma.' }, { status: 403 });
          }

          let isPaid = order.paymentStatus === 'PAGO' || order.paymentStatus === 'PAGAMENTO_APROVADO';
          let isBonus = Boolean(order.isSecondGeneration || order.origem === 'segunda_geracao' || order.origem === 'segunda_musica');

          // Bônus automático: pedido novo não pago de quem já pagou e ainda tem a 2ª geração sobrando
          // vira esse bônus aqui, antes de gerar (ver src/lib/bonusAutomatico.js).
          if (!familiaRef && !isPaid && !isBonus && order.customerPhone) {
            try {
              const { encontrarBonusDisponivel, vincularPedidoAoBonus } = await import('@/lib/bonusAutomatico');
              const parent = await encontrarBonusDisponivel(order.customerPhone, env, { orderIdAtual: order.id, somenteMesmoDia: true });
              if (parent) {
                bonusVinculado = await vincularPedidoAoBonus(order.id, parent, env);
                isPaid = true;
                isBonus = true;
              }
            } catch (bonusErr) {
              console.warn('[suno/generate] Falha ao vincular bônus automático:', bonusErr?.message);
            }
          }

          // O botão na entrega usa o pacote escolhido. A criação comum tenta o bônus antes do saldo extra.
          if (!isPaid && !isBonus && order.customerPhone) {
            try {
              const { encontrarPacoteComSaldo, usarGeracaoExtra } = await import('@/lib/geracoesExtras');
              const achado = await encontrarPacoteComSaldo(order.customerPhone, env, { orderIdAtual: order.id, familiaRef });
              if (achado) {
                geracaoExtra = await usarGeracaoExtra(order.id, achado, env);
                isPaid = true;
              }
            } catch (extraErr) {
              console.warn('[suno/generate] Falha ao usar geração extra do Pacote Família:', extraErr?.message);
            }
          }

          if (familiaRef && !isPaid) {
            return NextResponse.json({ error: ERRO_PACOTE_FAMILIA }, { status: 409 });
          }

          if (!isPaid && !isBonus) {
            const freeLimitBlocked = (await isBlockedByFreeLimit(order.customerPhone, order.customerEmail, env))
              || (await isBlockedByIpLimit(ipDoCliente, env));
            if (freeLimitBlocked) {
              return NextResponse.json(
                { error: 'Você atingiu o limite de músicas geradas sem pagamento. Realize o pagamento de uma das músicas para continuar.', blocked: true, reason: 'cota_excedida' },
                { status: 403 }
              );
            }
          }
        }
      } catch (checkErr) {
        console.warn('[suno/generate] Falha ao conferir bloqueio do pedido:', checkErr.message);
        if (familiaRef) {
          return NextResponse.json({ error: 'O saldo do Pacote Família está indisponível no momento. Tente novamente em instantes.' }, { status: 503 });
        }
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

    return NextResponse.json({
      taskId: result.taskId,
      status: 'PROCESSING',
      ...(bonusVinculado ? { bonusAutomatico: true, parentOrderId: bonusVinculado.parentOrderId, parentOrderNumber: bonusVinculado.parentOrderNumber } : {}),
      ...(geracaoExtra ? { geracaoExtra: true, familiaOrderNumber: geracaoExtra.familiaOrderNumber, geracoesExtrasRestantes: geracaoExtra.restantes, geracoesExtrasTotal: geracaoExtra.total } : {}),
    });
  } catch (error) {
    console.error('Erro fatal na rota /api/suno/generate:', error);
    return NextResponse.json({ error: 'Erro interno ao iniciar a geração da música.' }, { status: 500 });
  }
}
