import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { requireAdmin } from '@/lib/auth';
import { getChargeStatus } from '@/lib/efi';
import { applyPaymentApproval } from '@/lib/payments';

export const runtime = 'edge';

const MAX_CONSULTAS_EFI = 60;
const MAX_ORDERS_LIDOS = 400;

const SKU_ADDON = {
  video_addon: 'hasVideoAccess',
  playback_addon: 'hasPlaybackAccess',
  carta_addon: 'hasCartaAccess',
  retrospectiva_addon: 'hasRetrospectivaAccess',
};

function readEnv(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

async function authorize(req, env) {
  const expectedSecret = readEnv(env, 'RECONCILE_SECRET');
  if (expectedSecret) {
    const provided = req.headers.get('x-reconcile-secret') || '';
    if (provided === expectedSecret) return { ok: true };
  }
  const admin = await requireAdmin(req, env);
  if (admin.ok) return { ok: true };
  return { ok: false, status: admin.status || 401, error: admin.error || 'Não autorizado.' };
}

function levantarCandidatos(orders, diasLimite) {
  const agora = Date.now();
  const candidatos = [];

  for (const o of orders) {
    if (o.deletedAt || o.id.startsWith('config_') || o.id.startsWith('session_')) continue;
    if (o.productionStatus === 'CONFIG' || o.productionStatus === 'RASCUNHO') continue;

    const criadoEm = new Date(o.createdAt).getTime();
    if (!Number.isFinite(criadoEm)) continue;
    if ((agora - criadoEm) / 86400000 > diasLimite) continue;

    const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
    const skuByTxid = o.paymentIntentSkuByTxid || o.extras?.paymentIntentSkuByTxid || {};
    const txids = new Set(
      [
        o.paymentIntentId || o.extras?.paymentIntentId,
        ...(Array.isArray(o.previousPaymentIntentIds || o.extras?.previousPaymentIntentIds)
          ? (o.previousPaymentIntentIds || o.extras?.previousPaymentIntentIds)
          : []),
        ...Object.keys(skuByTxid),
      ].filter(Boolean)
    );

    for (const txid of txids) {
      if (String(txid).startsWith('NSMUSIC')) continue;

      const sku = skuByTxid[txid] || o.paymentIntentSku || o.extras?.paymentIntentSku || 'desconhecido';
      const campoAddon = SKU_ADDON[sku];
      if (campoAddon) {
        if (o[campoAddon]) continue;
      } else if (musicaPaga) {
        continue;
      }

      candidatos.push({
        orderId: o.id,
        orderNumber: o.orderNumber || null,
        customerName: o.customerName || null,
        customerPhone: o.customerPhone || null,
        txid,
        sku,
        tipo: campoAddon ? 'addon' : 'musica',
        pixCopiedAt: o.pixCopiedAt || o.extras?.pixCopiedAt || null,
        criadoEm: o.createdAt,
      });
    }
  }

  candidatos.sort((a, b) => {
    if (!!a.pixCopiedAt !== !!b.pixCopiedAt) return a.pixCopiedAt ? -1 : 1;
    return new Date(b.criadoEm) - new Date(a.criadoEm);
  });
  return candidatos;
}

async function executar(req, env, aplicar) {
  const { searchParams } = new URL(req.url);
  const dias = Math.min(Math.max(Number(searchParams.get('dias')) || 7, 1), 30);
  const somenteCopiaram = searchParams.get('pixCopiado') === 'true';

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase não inicializado.' }, { status: 500 });
  }

  let orders = [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_ORDERS_LIDOS);

    if (error) throw error;
    orders = (data || []).map(mapSupabaseOrderToFirestore);
  } catch (err) {
    console.warn('[audit-payments] Falha ao listar pedidos:', err.message);
    return NextResponse.json({ error: 'Falha ao listar pedidos.' }, { status: 500 });
  }

  let candidatos = levantarCandidatos(orders, dias);
  if (somenteCopiaram) candidatos = candidatos.filter((c) => c.pixCopiedAt);

  const aVerificar = candidatos.slice(0, MAX_CONSULTAS_EFI);
  const pagos = [];
  const erros = [];

  for (const c of aVerificar) {
    try {
      const charge = await getChargeStatus(c.txid, env);
      if (charge?.status !== 'CONCLUIDA') continue;

      const valor = Number(charge.valor?.original);
      const item = { ...c, valor, pagoEm: charge.pix?.[0]?.horario || null, aprovado: false };

      if (aplicar) {
        try {
          await applyPaymentApproval(c.orderId, c.txid, { status: 'approved', transaction_amount: valor }, env);
          item.aprovado = true;
        } catch (errAprov) {
          console.warn(`[audit-payments] Falha ao aprovar ${c.orderId}:`, errAprov.message);
          item.erroAprovacao = true;
        }
      }
      pagos.push(item);
    } catch (err) {
      erros.push({ orderId: c.orderId, txid: c.txid });
    }
  }

  return NextResponse.json({
    dias,
    somenteCopiaram,
    aplicado: aplicar,
    candidatos: candidatos.length,
    verificados: aVerificar.length,
    naoVerificados: Math.max(0, candidatos.length - aVerificar.length),
    errosConsulta: erros.length,
    pagosNaoLiberados: pagos.length,
    valorTotal: Number(pagos.reduce((s, p) => s + (p.valor || 0), 0).toFixed(2)),
    itens: pagos,
  });
}

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await authorize(req, env);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return await executar(req, env, false);
  } catch (error) {
    console.error('[audit-payments] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha na varredura.' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await authorize(req, env);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return await executar(req, env, true);
  } catch (error) {
    console.error('[audit-payments] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao aplicar a varredura.' }, { status: 500 });
  }
}
