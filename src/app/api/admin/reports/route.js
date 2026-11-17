import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { calculateStripeFee } from '@/lib/paymentFees';
import { buscarPedidosDoPeriodo, buscarPedidosRecentes } from '@/lib/pedidosRelatorio';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const KIE_COST_PER_GENERATION = 0.30;

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Conversão de datas para o fuso oficial da plataforma (America/Sao_Paulo / UTC-3).
// No Supabase, as views vendas_por_dia e producao_por_dia usam `at time zone 'America/Sao_Paulo'`,
// gravando a coluna 'dia' como DATE local (ex: '2026-10-11').
// Quando o front envia 'YYYY-MM-DD', o início do dia no fuso de Brasília é 'YYYY-MM-DDT00:00:00-03:00'
// (e não T00:00:00.000Z em UTC, que começaria às 21h do dia anterior e inflaria as gerações).
function toSpDay(dateStr) {
  if (!dateStr) return null;
  if (!dateStr.includes('T')) return dateStr.slice(0, 10);
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime())
    ? dateStr.slice(0, 10)
    : d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function toBrStartIso(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00-03:00`;
}

function toBrEndIso(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T23:59:59.999-03:00`;
}

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo') || 'faturamento';

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase não configurado no servidor' }, { status: 503 });
  }

  try {
    // --------------------------------------------------------------------------
    // 1. FATURAMENTO CARDS (faturamento, vendas pagas, gerações, custo)
    // --------------------------------------------------------------------------
    if (tipo === 'faturamento') {
      const dateFrom = searchParams.get('dateFrom');
      const dateTo = searchParams.get('dateTo');

      let vQuery = supabase.from('vendas_por_dia').select('*');
      let pQuery = supabase.from('producao_por_dia').select('*');
      let oQuery = supabase.from('orders').select('suno_provider, suno_generation_count').is('deleted_at', null).neq('production_status', 'CONFIG');
      let payQuery = supabase.from('payments').select('txid, amount, paid_at');

      const diaFrom = toSpDay(dateFrom);
      const diaTo = toSpDay(dateTo);
      const fromIso = toBrStartIso(dateFrom);
      const toIso = toBrEndIso(dateTo);

      if (diaFrom) {
        vQuery = vQuery.gte('dia', diaFrom);
        pQuery = pQuery.gte('dia', diaFrom);
      }
      if (fromIso) {
        oQuery = oQuery.gte('created_at', fromIso);
        payQuery = payQuery.gte('paid_at', fromIso);
      }
      if (diaTo) {
        vQuery = vQuery.lte('dia', diaTo);
        pQuery = pQuery.lte('dia', diaTo);
      }
      if (toIso) {
        oQuery = oQuery.lte('created_at', toIso);
        payQuery = payQuery.lte('paid_at', toIso);
      }

      const [vRes, pRes, oRes, payRes] = await Promise.all([vQuery, pQuery, oQuery, payQuery]);

      if (vRes.error) throw new Error(vRes.error.message);
      if (pRes.error) throw new Error(pRes.error.message);

      const vData = vRes.data || [];
      const pData = pRes.data || [];
      const oData = oRes?.data || [];
      const payData = payRes?.data || [];

      const faturamentoTotal = vData.reduce((acc, r) => acc + (Number(r.faturamento) || 0), 0);
      const vendasCount = vData.reduce((acc, r) => acc + (Number(r.pedidos_pagos) || 0), 0);
      const geracoesGerais = pData.reduce((acc, r) => acc + (Number(r.geracoes) || 0), 0);

      // Métricas de divisão PIX vs Cartão (Stripe) e repasse D+30
      let pixTotal = 0;
      let cardTotal = 0;
      let cardFees = 0;
      let cardNet = 0;
      let cardBlocked = 0;
      let cardReleased = 0;
      let pixCount = 0;
      let cardCount = 0;

      const now = Date.now();
      const PAYOUT_MS = 30 * 24 * 60 * 60 * 1000;

      for (const p of payData) {
        const amt = Number(p.amount) || 0;
        const isCard = String(p.txid || '').startsWith('cs_') || String(p.txid || '').startsWith('pi_');
        if (isCard) {
          cardCount++;
          cardTotal += amt;
          const fee = calculateStripeFee(amt);
          const net = Math.max(0, Math.round((amt - fee) * 100) / 100);
          cardFees += fee;
          cardNet += net;

          const paidTime = new Date(p.paid_at).getTime();
          if (!Number.isNaN(paidTime) && (now >= paidTime + PAYOUT_MS)) {
            cardReleased += net;
          } else {
            cardBlocked += net;
          }
        } else {
          pixCount++;
          pixTotal += amt;
        }
      }

      // Se não houver dados em payments (legado), o faturamentoTotal equivale ao PIX
      if (payData.length === 0 && faturamentoTotal > 0) {
        pixTotal = faturamentoTotal;
        pixCount = vendasCount;
      }

      const faturamentoLiquido = Math.round((pixTotal + cardNet) * 100) / 100;

      let geracoesBot = 0;
      let geracoesKie = 0;

      if (oData.length > 0) {
        for (const row of oData) {
          const count = Number(row.suno_generation_count) || 0;
          if (count === 0) continue;
          if (row.suno_provider === 'suno_local') {
            geracoesBot += count;
          } else {
            // kie, unifically ou legado antes de gravar provider
            geracoesKie += count;
          }
        }
      } else {
        geracoesKie = geracoesGerais;
      }

      const geracoesTotal = (geracoesBot + geracoesKie) || geracoesGerais;
      const gastoKie = geracoesKie * KIE_COST_PER_GENERATION;
      const economiaBot = geracoesBot * KIE_COST_PER_GENERATION;

      return NextResponse.json({
        ok: true,
        faturamentoTotal,
        faturamentoLiquido,
        pixTotal: Math.round(pixTotal * 100) / 100,
        pixCount,
        cardTotal: Math.round(cardTotal * 100) / 100,
        cardFees: Math.round(cardFees * 100) / 100,
        cardNet: Math.round(cardNet * 100) / 100,
        cardBlocked: Math.round(cardBlocked * 100) / 100,
        cardReleased: Math.round(cardReleased * 100) / 100,
        cardCount,
        vendasCount,
        geracoes: geracoesTotal,
        geracoesTotal,
        geracoesBot,
        geracoesKie,
        gastoGeracao: gastoKie, // Apenas o gasto real com a Kie.ai (Robô local = R$ 0,00)
        gastoKie,
        economiaBot,
        source: 'supabase',
      });
    }

    // --------------------------------------------------------------------------
    // 2. VENDAS POR DIA (tabela agregada do mês com produtos e conversão)
    // --------------------------------------------------------------------------
    if (tipo === 'vendas_por_dia') {
      const mes = searchParams.get('mes') || formatLocalDate(new Date()).slice(0, 7);
      const [anoStr, mesStr] = mes.split('-');
      const ano = Number(anoStr);
      const mesNum = Number(mesStr);
      const diasNoMes = new Date(ano, mesNum, 0).getDate();

      const diaInicio = `${mes}-01`;
      const diaFim = `${mes}-${String(diasNoMes).padStart(2, '0')}`;

      const [vRes, pRes] = await Promise.all([
        supabase.from('vendas_por_dia').select('*').gte('dia', diaInicio).lte('dia', diaFim),
        supabase.from('producao_por_dia').select('*').gte('dia', diaInicio).lte('dia', diaFim),
      ]);

      if (vRes.error) throw new Error(vRes.error.message);
      if (pRes.error) throw new Error(pRes.error.message);

      const vMap = new Map((vRes.data || []).map((r) => [r.dia, r]));
      const pMap = new Map((pRes.data || []).map((r) => [r.dia, r]));

      const dias = [];
      for (let d = 1; d <= diasNoMes; d++) {
        const diaStr = `${mes}-${String(d).padStart(2, '0')}`;
        const v = vMap.get(diaStr) || {};
        const p = pMap.get(diaStr) || {};

        dias.push({
          dia: d,
          dataIso: diaStr,
          musicas: Number(v.musicas) || 0,
          videos: Number(v.videos) || 0,
          playbacks: Number(v.playbacks) || 0,
          cartas: Number(v.cartas) || 0,
          retrospectivas: Number(v.retrospectivas) || 0,
          pedidosPagos: Number(v.pedidos_pagos) || 0,
          faturamento: Number(v.faturamento) || 0,
          pedidosCriados: Number(p.pedidos_criados) || 0,
          geracoes: Number(p.geracoes) || 0,
        });
      }

      return NextResponse.json({
        ok: true,
        mes,
        dias,
        source: 'supabase',
      });
    }

    // --------------------------------------------------------------------------
    // 3. PEDIDOS DO MÊS (para mapa de estados, mapa de horários e detalhamento)
    // --------------------------------------------------------------------------
    if (tipo === 'pedidos_mes') {
      const mes = searchParams.get('mes') || formatLocalDate(new Date()).slice(0, 7);
      const diaParam = searchParams.get('dia');
      // `mes` inválido (ex: "null") gerava Date inválida -> RangeError -> 500 genérico.
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return NextResponse.json({ error: 'Parâmetro mes inválido (use AAAA-MM).' }, { status: 400 });
      }
      const [anoStr, mesStr] = mes.split('-');
      const ano = Number(anoStr);
      const mesNum = Number(mesStr);
      const diasNoMes = new Date(ano, mesNum, 0).getDate();

      // Limites no fuso oficial (America/Sao_Paulo, UTC-3 fixo desde 2019) — o front agrupa por
      // data local; com limites em UTC o mês perdia as vendas das 21h-24h do último dia e herdava
      // as do último dia do mês anterior.
      const pad = (n) => String(n).padStart(2, '0');
      const proxAno = mesNum === 12 ? ano + 1 : ano;
      const proxMes = mesNum === 12 ? 1 : mesNum + 1;
      let inicio = `${ano}-${pad(mesNum)}-01T00:00:00-03:00`;
      let fim = `${proxAno}-${pad(proxMes)}-01T00:00:00-03:00`;

      if (diaParam && !isNaN(Number(diaParam))) {
        const diaNum = Math.max(1, Math.min(diasNoMes, Number(diaParam)));
        inicio = `${ano}-${pad(mesNum)}-${pad(diaNum)}T00:00:00-03:00`;
        fim = diaNum >= diasNoMes
          ? fim
          : `${ano}-${pad(mesNum)}-${pad(diaNum + 1)}T00:00:00-03:00`;
      }

      const todosPedidos = await buscarPedidosDoPeriodo(supabase, inicio, fim);

      return NextResponse.json({
        ok: true,
        mes,
        dia: diaParam || null,
        total: todosPedidos.length,
        pedidos: todosPedidos,
        source: 'supabase',
      });
    }

    // --------------------------------------------------------------------------
    // 4. PEDIDOS RECENTES (para Ritmo de Vendas Intradiário - Hoje + últimos N dias)
    // --------------------------------------------------------------------------
    if (tipo === 'pedidos_recentes') {
      const dias = Math.max(1, Math.min(30, Number(searchParams.get('dias')) || 8));
      const todosPedidos = await buscarPedidosRecentes(supabase, dias);

      return NextResponse.json({
        ok: true,
        dias,
        total: todosPedidos.length,
        pedidos: todosPedidos,
        source: 'supabase',
      });
    }

    return NextResponse.json({ error: `Tipo desconhecido: ${tipo}` }, { status: 400 });
  } catch (error) {
    console.error('[admin/reports] Erro ao gerar relatório:', error.message);
    return NextResponse.json({ error: `Falha ao gerar relatório: ${error.message}` }, { status: 500 });
  }
}
