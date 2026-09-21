import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { getChargeStatus } from '@/lib/efi';
import { applyPaymentApproval } from '@/lib/payments';

export const runtime = 'edge';

// Varredura de conferência: cruza as cobranças geradas com o status REAL na Efí e mostra as que
// foram pagas mas não liberaram o produto. É a versão sob demanda (painel admin) da varredura que o
// cron faz sozinho — pedido do dono em 20/09/2026, depois de encontrarmos 4 pagamentos confirmados
// e não computados (R$ 53,94, um preso há 34h) que nenhuma das três vias automáticas pegou.
//
// GET  = só relatório, não muda nada (seguro para rodar a hora que quiser).
// POST = confirma de verdade (applyPaymentApproval) as que estiverem CONCLUIDA na Efí.
//
// Cobre os dois modos de falha, que são diferentes:
//   - Música: deveria virar paymentStatus = PAGAMENTO_APROVADO.
//   - Add-on avulso (vídeo/playback/carta/retrospectiva): NUNCA mexe em paymentStatus (regra C-09),
//     então some de qualquer varredura que só olhe esse campo — a falha aparece como has*Access
//     ausente.

// Teto de consultas à Efí por execução. Cada uma é um subrequest do Worker, e o Edge Runtime tem
// limite por invocação — estourar derruba a requisição inteira e o admin não vê relatório nenhum.
// O que passar disso volta em `naoVerificados` para uma segunda execução.
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

// Monta a lista de cobranças que ainda não liberaram nada. Uma ordem pode ter mais de uma (a da
// música e a de cada add-on comprado depois), por isso o retorno é por COBRANÇA, não por pedido.
function levantarCandidatos(docs, diasLimite) {
  const agora = Date.now();
  const candidatos = [];

  for (const d of docs) {
    const o = d.data();
    if (o.deletedAt || d.id.startsWith('config_') || d.id.startsWith('session_')) continue;
    if (o.productionStatus === 'CONFIG' || o.productionStatus === 'RASCUNHO') continue;

    const criadoEm = new Date(o.createdAt).getTime();
    if (!Number.isFinite(criadoEm)) continue;
    if ((agora - criadoEm) / 86400000 > diasLimite) continue;

    const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
    const skuByTxid = o.paymentIntentSkuByTxid || {};
    const txids = new Set(
      [o.paymentIntentId, ...(Array.isArray(o.previousPaymentIntentIds) ? o.previousPaymentIntentIds : []), ...Object.keys(skuByTxid)]
        .filter(Boolean)
    );

    for (const txid of txids) {
      // Pix estático não existe na Efí (é QR da chave, sem cobrança) — confirmar exige comprovante.
      if (String(txid).startsWith('NSMUSIC')) continue;

      const sku = skuByTxid[txid] || o.paymentIntentSku || 'desconhecido';
      const campoAddon = SKU_ADDON[sku];
      if (campoAddon) {
        if (o[campoAddon]) continue; // add-on já liberado
      } else if (musicaPaga) {
        continue; // música já paga
      }

      candidatos.push({
        orderId: d.id,
        orderNumber: o.orderNumber || null,
        customerName: o.customerName || null,
        customerPhone: o.customerPhone || null,
        txid,
        sku,
        tipo: campoAddon ? 'addon' : 'musica',
        pixCopiedAt: o.pixCopiedAt || null,
        criadoEm: o.createdAt,
      });
    }
  }

  // Quem copiou o código Pix vai primeiro: é o sinal de intenção de pagamento mais forte, então é
  // onde o teto de consultas rende mais.
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

  let snap;
  try {
    snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(MAX_ORDERS_LIDOS)));
  } catch (err) {
    console.warn('[audit-payments] Falha ao listar pedidos:', err.message);
    return NextResponse.json({ error: 'Falha ao listar pedidos.' }, { status: 500 });
  }

  let candidatos = levantarCandidatos(snap.docs, dias);
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
          // Uma aprovação que falha não pode esconder as outras do relatório.
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
