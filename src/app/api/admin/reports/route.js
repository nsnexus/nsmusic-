import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const KIE_COST_PER_GENERATION = 0.30;

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

      if (dateFrom) {
        vQuery = vQuery.gte('dia', dateFrom);
        pQuery = pQuery.gte('dia', dateFrom);
      }
      if (dateTo) {
        vQuery = vQuery.lte('dia', dateTo);
        pQuery = pQuery.lte('dia', dateTo);
      }

      const [vRes, pRes] = await Promise.all([vQuery, pQuery]);

      if (vRes.error) throw new Error(vRes.error.message);
      if (pRes.error) throw new Error(pRes.error.message);

      const vData = vRes.data || [];
      const pData = pRes.data || [];

      const faturamentoTotal = vData.reduce((acc, r) => acc + (Number(r.faturamento) || 0), 0);
      const vendasCount = vData.reduce((acc, r) => acc + (Number(r.pedidos_pagos) || 0), 0);
      const geracoes = pData.reduce((acc, r) => acc + (Number(r.geracoes) || 0), 0);
      const gastoGeracao = geracoes * KIE_COST_PER_GENERATION;

      return NextResponse.json({
        ok: true,
        faturamentoTotal,
        vendasCount,
        geracoes,
        gastoGeracao,
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
      const [anoStr, mesStr] = mes.split('-');
      const ano = Number(anoStr);
      const mesNum = Number(mesStr);

      const inicio = new Date(Date.UTC(ano, mesNum - 1, 1, 0, 0, 0, 0)).toISOString();
      const fim = new Date(Date.UTC(ano, mesNum, 1, 0, 0, 0, 0)).toISOString();

      const todosPedidos = [];
      let pageOffset = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, order_number, customer_phone, payment_status, paid_at, created_at, has_video_access, has_carta_access, has_playback_access, has_retrospectiva_access, suno_generation_count, suno_requested_at, extras')
          .gte('created_at', inicio)
          .lt('created_at', fim)
          .is('deleted_at', 'null')
          .order('created_at', { ascending: true })
          .limit(pageSize)
          .offset(pageOffset);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        for (const row of data) {
          const extras = row.extras || {};
          todosPedidos.push({
            id: row.id,
            orderNumber: row.order_number,
            customerPhone: row.customer_phone,
            paymentStatus: row.payment_status,
            paidAt: row.paid_at,
            createdAt: row.created_at,
            hasVideoAccess: row.has_video_access,
            hasCartaAccess: row.has_carta_access,
            hasPlaybackAccess: row.has_playback_access,
            hasRetrospectivaAccess: row.has_retrospectiva_access,
            sunoGenerationCount: row.suno_generation_count,
            sunoRequestedAt: row.suno_requested_at,
            videoAddonPaid: extras.videoAddonPaid ?? (row.has_video_access && row.payment_status === 'PAGO'),
            videoPaidAt: extras.videoPaidAt ?? row.paid_at,
            playbackAddonPaid: extras.playbackAddonPaid ?? (row.has_playback_access && row.payment_status === 'PAGO'),
            playbackPaidAt: extras.playbackPaidAt ?? row.paid_at,
            cartaAddonPaid: extras.cartaAddonPaid ?? (row.has_carta_access && row.payment_status === 'PAGO'),
            cartaPaidAt: extras.cartaPaidAt ?? row.paid_at,
            retrospectivaAddonPaid: extras.retrospectivaAddonPaid ?? (row.has_retrospectiva_access && row.payment_status === 'PAGO'),
            retrospectivaPaidAt: extras.retrospectivaPaidAt ?? row.paid_at,
            paidAmount: extras.paidAmount ?? null,
            ...extras,
          });
        }

        if (data.length < pageSize) break;
        pageOffset += pageSize;
      }

      return NextResponse.json({
        ok: true,
        mes,
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
