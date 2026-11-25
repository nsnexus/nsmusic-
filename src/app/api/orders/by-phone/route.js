import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { findOrdersByPhone } from '@/lib/orderLookup';

export const runtime = 'edge';

// "Procurar minhas músicas pelo WhatsApp" da /conta (24/11/2026). Decisão do Narciso: só o
// número, sem código de confirmação. Para limitar o estrago de alguém digitar o número de outra
// pessoa: devolve só o mínimo (para quem é, data, se está pago e o link), nada de história/letra,
// e limita as buscas por IP.
const LIMITE_POR_MINUTO = 6;
const buscasPorIp = new Map();

function excedeuLimite(ip) {
  const agora = Date.now();
  const recentes = (buscasPorIp.get(ip) || []).filter((t) => agora - t < 60000);
  recentes.push(agora);
  buscasPorIp.set(ip, recentes);
  if (buscasPorIp.size > 5000) buscasPorIp.clear();
  return recentes.length > LIMITE_POR_MINUTO;
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (_) {}

  let phone = '';
  try {
    ({ phone } = await req.json());
  } catch (_) {}
  const digitos = String(phone || '').replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 13) {
    return NextResponse.json({ error: 'Digite seu WhatsApp com DDD.' }, { status: 400 });
  }

  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'desconhecido';
  if (excedeuLimite(ip)) {
    return NextResponse.json({ error: 'Muitas buscas seguidas. Aguarde um minuto e tente de novo.' }, { status: 429 });
  }

  try {
    const pedidos = await findOrdersByPhone(digitos, env, 20);
    const musicas = pedidos
      .filter((o) => o?.audioUrl || o?.audioFiles?.length)
      .map((o) => ({
        orderId: o.id,
        honoreeName: o.honoreeName || '',
        createdAt: o.createdAt || null,
        pago: o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO',
      }));
    return NextResponse.json({ musicas });
  } catch (err) {
    console.warn('[by-phone] Falha na busca:', err?.message);
    return NextResponse.json({ error: 'Não foi possível buscar agora. Tente de novo.' }, { status: 500 });
  }
}
