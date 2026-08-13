import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requestSunoGeneration } from '@/lib/suno';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt, tags, orderId } = await req.json();

    if (!prompt?.trim() || !tags?.trim()) {
      return NextResponse.json({ error: 'Estilo musical e detalhes do homenageado são obrigatórios.' }, { status: 400 });
    }

    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    // A chamada de fato à Kie.ai e a persistência do vínculo taskId->orderId vivem em
    // src/lib/suno.js — compartilhado com a retentativa automática (polling em tempo real e
    // reconciliação por cron), para as três nunca divergirem no que significa "gerar uma música".
    const persistPromise = requestSunoGeneration({ orderId, prompt, tags }, env);

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
