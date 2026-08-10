import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, setDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendFreeTextReply } from '@/lib/whatsapp';

export const runtime = 'edge';

// Webhook exigido pela Meta pra configurar o produto WhatsApp Business Platform no App Dashboard.
// Também responde automaticamente quem manda mensagem pro número — ele é usado só pra envio via
// API (Templates), ninguém lê o app normal desse número pra responder de verdade.
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

const AUTO_REPLY_TEXT = 'Olá! Esse número é usado só para o envio automático de notificações do NSMusic e não tem atendimento por aqui. Para falar com a gente, chama no nosso WhatsApp de suporte: https://wa.me/5594991064043 💜';
const AUTO_REPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Responde automaticamente uma única vez a cada 24h por número — evita reenviar a mesma resposta
// se a pessoa mandar várias mensagens seguidas. Registro simples por doc ID (sem where), não
// precisa de índice novo em firestore.indexes.json.
async function maybeSendAutoReply(from, env) {
  try {
    const ref = doc(db, 'whatsapp_autoreplies', from);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const lastSentAt = snap.data()?.lastSentAt;
      if (lastSentAt && (Date.now() - new Date(lastSentAt).getTime()) < AUTO_REPLY_COOLDOWN_MS) {
        return;
      }
    }

    const result = await sendFreeTextReply(from, AUTO_REPLY_TEXT, env);
    if (result.success) {
      await setDoc(ref, { lastSentAt: new Date().toISOString() }, { merge: true });
    } else {
      console.warn('[WhatsApp Webhook] Falha ao enviar resposta automática:', result.error);
    }
  } catch (err) {
    console.warn('[WhatsApp Webhook] Erro na resposta automática:', err.message);
  }
}

// Sempre responde 200 pra Meta não ficar reenviando, mesmo se a resposta automática falhar.
export async function POST(req) {
  let envVars = process.env;
  try {
    if (getRequestContext().env) envVars = getRequestContext().env;
  } catch (e) {}

  try {
    const body = await req.json().catch(() => ({}));
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    // Nunca logar payload completo (pode conter telefone do cliente, ver M-25 no AUDIT_REPORT.md) —
    // só o tipo de evento recebido, útil pra confirmar que o webhook está vivo.
    console.log(`[WhatsApp Webhook] Notificação recebida (${entries.length} entrada(s)).`);

    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const messages = change?.value?.messages;
        if (!Array.isArray(messages)) continue;
        for (const message of messages) {
          if (message?.from) {
            await maybeSendAutoReply(message.from, envVars);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[WhatsApp Webhook] Erro ao processar notificação:', err.message);
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
