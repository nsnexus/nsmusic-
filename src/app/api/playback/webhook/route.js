import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Mesmo padrão de autenticação de src/app/api/suno/webhook/route.js. Diferente daquele webhook, não
// existe uma coleção tipo suno_tasks pra resolver taskId->orderId aqui (é uma tarefa de separação
// vocal, não de geração de música) — por isso orderId vai embutido na própria query string do
// callBackUrl (ver src/lib/playback.js), junto do secret.
function getWebhookSecret() {
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.KIE_WEBHOOK_SECRET) return String(ctx.env.KIE_WEBHOOK_SECRET).trim();
  } catch (e) {}
  return String(process.env.KIE_WEBHOOK_SECRET || '').trim();
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId') || '';

    const expectedSecret = getWebhookSecret();
    if (expectedSecret) {
      const providedSecret = searchParams.get('secret') || '';
      if (providedSecret !== expectedSecret) {
        console.warn('[Webhook playback] Segredo ausente ou inválido — notificação rejeitada.');
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    } else {
      console.warn('[Webhook playback] KIE_WEBHOOK_SECRET não configurado — aceitando sem autenticação.');
    }

    if (!orderId) {
      console.error('[Webhook playback] Recebido sem orderId na query string.');
      return NextResponse.json({ error: 'missing_order_id' }, { status: 200 });
    }

    const data = await req.json();
    // Achado 07/09/2026: a doc oficial promete `data.vocal_separation_info.instrumental_url`
    // (snake_case), mas a Kie.ai vem mandando `data.response.instrumentalUrl` (camelCase — mesmo
    // shape do endpoint "get vocal separation details" da API deles). Um cliente pagou, a separação
    // rodou certo do lado da Kie.ai (2 faixas geradas, confirmado no painel deles), mas só o formato
    // snake_case era reconhecido — o pedido caía em FAILED com o áudio pronto, e cada "tentar de
    // novo" do cliente cobrava crédito de novo à toa. Aceita os dois formatos.
    const instrumentalUrl =
      data?.data?.vocal_separation_info?.instrumental_url ||
      data?.data?.response?.instrumentalUrl ||
      data?.data?.instrumentalUrl ||
      '';
    const orderRef = doc(db, 'orders', orderId);

    if (data?.code === 200 && instrumentalUrl) {
      await updateDoc(orderRef, {
        playbackUrl: instrumentalUrl,
        playbackStatus: 'READY',
        playbackReadyAt: new Date().toISOString(),
        playbackError: null,
        updatedAt: new Date().toISOString()
      });
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Log do shape bruto (sem PII, é só a resposta da Kie.ai) — se aparecer uma TERCEIRA variante de
    // formato, dá pra corrigir rápido sem depender de reproduzir o pagamento de novo.
    console.error('[Webhook playback] Callback sem instrumental_url válido:', data?.code, data?.msg, JSON.stringify(data)?.slice(0, 500));
    await updateDoc(orderRef, {
      playbackStatus: 'FAILED',
      playbackError: `kie_callback_${data?.code || 'invalid'}`,
      updatedAt: new Date().toISOString()
    });
    return NextResponse.json({ error: 'invalid_callback_payload' }, { status: 200 });
  } catch (error) {
    console.error('[Webhook playback] Erro processando callback:', error.message);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}
