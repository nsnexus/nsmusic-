import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// Webhook exigido pela Meta pra configurar o produto WhatsApp Business Platform no App Dashboard.
// Não é usado hoje pra nenhuma lógica de negócio — a rota de envio (sendMusicReadyTemplate em
// src/lib/whatsapp.js) não depende de nada aqui. Só existe pra: (1) responder o handshake de
// verificação que a Meta faz ao salvar a URL de callback, e (2) receber atualizações de status de
// entrega/leitura no futuro, se algum dia isso virar necessário.
function getVerifyToken() {
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.WHATSAPP_WEBHOOK_VERIFY_TOKEN) return String(ctx.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN).trim();
  } catch (e) {}
  return String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
}

// Handshake de verificação da Meta: GET com hub.mode=subscribe, hub.verify_token e hub.challenge.
// Precisa responder com o valor de hub.challenge em texto puro (não JSON) se o token bater.
export async function GET(req) {
  const expected = getVerifyToken();
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!expected) {
    console.warn('[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurado — verificação recusada.');
    return NextResponse.json({ error: 'unconfigured' }, { status: 403 });
  }

  if (mode === 'subscribe' && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  console.warn('[WhatsApp Webhook] Verificação recusada — token ausente ou inválido.');
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

// Status de entrega/leitura das mensagens enviadas (não usado ainda — o sistema já rastreia envio
// pelo retorno da própria chamada de envio). Sempre responde 200 pra Meta não ficar reenviando.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    // Nunca logar payload completo (pode conter telefone do cliente, ver M-25 no AUDIT_REPORT.md) —
    // só o tipo de evento recebido, útil pra confirmar que o webhook está vivo.
    const entryCount = Array.isArray(body?.entry) ? body.entry.length : 0;
    console.log(`[WhatsApp Webhook] Notificação recebida (${entryCount} entrada(s)).`);
  } catch (err) {
    console.warn('[WhatsApp Webhook] Erro ao processar notificação:', err.message);
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
