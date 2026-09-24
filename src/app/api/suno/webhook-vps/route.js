import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { updateTaskResult } from '@/lib/db';
import { readEnvValue } from '@/lib/envValue';
import { consultarClipesVps, avaliarClipes } from '@/lib/sunoVps';

export const runtime = 'edge';

// Callback da API de Suno própria (VPS), provedor primário desde 24/09/2026.
//
// Diferença central em relação ao webhook da Kie.ai: a VPS avisa UMA VEZ POR CLIPE, e a Suno sempre
// gera dois. Gravar o pedido no primeiro aviso entregaria uma única versão ao cliente, que pagou
// por duas — e o segundo aviso sobrescreveria o campo. Por isso aqui o callback é só um gatilho:
// quem manda é a reconsulta dos dois clipes na VPS, e o pedido só fecha quando não há mais nada por
// vir (todos prontos, ou os que faltam já falharam).
//
// Responde 200 mesmo em erro, pelo mesmo motivo do webhook de pagamento: retentativa infinita do
// outro lado não conserta nada aqui, e o polling (/api/suno/status) mais a reconciliação por cron
// continuam como rede de segurança.
export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const { searchParams } = new URL(req.url);

    // Mesmo segredo compartilhado do callback da Kie.ai: sem ele, qualquer um que descubra a URL
    // fecha o pedido de outra pessoa com o áudio que quiser (ver A-03 no AUDIT_REPORT.md).
    const esperado = readEnvValue(env, 'KIE_WEBHOOK_SECRET');
    if (esperado && searchParams.get('secret') !== esperado) {
      console.warn('[webhook-vps] Segredo ausente ou inválido — notificação rejeitada.');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const orderId = searchParams.get('orderId') || '';
    if (!orderId) {
      console.warn('[webhook-vps] Callback sem orderId na query string.');
      return NextResponse.json({ ok: false, motivo: 'sem_orderid' }, { status: 200 });
    }

    // O corpo é lido só para log de diagnóstico: quem decide é o estado real na VPS, consultado
    // abaixo. Um callback forjado com áudio de terceiro não teria efeito nenhum por aqui.
    const corpo = await req.json().catch(() => ({}));
    const statusAvisado = String(corpo?.status || corpo?.clip?.status || '');

    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      console.warn('[webhook-vps] Pedido não encontrado para o callback.');
      return NextResponse.json({ ok: false, motivo: 'pedido_inexistente' }, { status: 200 });
    }

    const pedido = orderSnap.data();
    const taskId = pedido.sunoTaskId;
    const clipIds = Array.isArray(pedido.sunoClipIds) ? pedido.sunoClipIds : [];

    if (!taskId || clipIds.length === 0) {
      console.warn('[webhook-vps] Pedido sem sunoTaskId/sunoClipIds — nada a fechar.');
      return NextResponse.json({ ok: false, motivo: 'pedido_sem_task' }, { status: 200 });
    }

    const consulta = await consultarClipesVps(clipIds, env);
    if (!consulta.ok) {
      console.error('[webhook-vps] Falha ao reconsultar os clipes na VPS:', consulta.erro);
      return NextResponse.json({ ok: false, motivo: 'consulta_falhou' }, { status: 200 });
    }

    const avaliacao = avaliarClipes(consulta.clipes, clipIds.length);

    if (!avaliacao.fechar) {
      // Ainda falta clipe. O próximo callback (ou o polling do cliente) fecha.
      console.log('[webhook-vps] Parcial:', { avisado: statusAvisado, prontos: avaliacao.totalPronto, esperados: clipIds.length });
      return NextResponse.json({ ok: true, parcial: true, prontos: avaliacao.totalPronto }, { status: 200 });
    }

    // updateTaskResult é o ponto único de convergência das duas vias (webhook e polling) e é quem
    // dispara o WhatsApp de "música pronta" — nunca duplicar a lógica aqui.
    await updateTaskResult(taskId, { data: avaliacao.prontos }, orderId);

    return NextResponse.json({ ok: true, faixas: avaliacao.totalPronto }, { status: 200 });
  } catch (error) {
    console.error('[webhook-vps] Erro processando callback:', error.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
