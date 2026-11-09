'use client';

import React, { useState, useMemo } from 'react';
import { calculateIntradayPace } from '@/lib/ritmoVendas';
import { usePedidosRecentes } from '@/lib/usePedidosRecentes';

export default function RitmoVendasCard({ pedidos: pedidosProp = null }) {
  // Modos de exibição do gráfico: 'sales' (Qtd de Vendas) | 'conversion' (Conversão %) | 'revenue' (Faturamento R$)
  const [metricMode, setMetricMode] = useState('sales');
  const [activeHour, setActiveHour] = useState(null);
  const [showTable, setShowTable] = useState(false);

  // Se pedidos não foi passado explicitamente (ex: no topo do dashboard), carrega os pedidos dos últimos 8 dias
  const { pedidos: pedidosRecentes, loading: loadingRecentes } = usePedidosRecentes(8);
  const pedidos = pedidosProp !== null ? pedidosProp : pedidosRecentes;

  // Calcula o ritmo hora a hora com base nos pedidos carregados e na janela dos últimos 7 dias
  const pace = useMemo(() => {
    return calculateIntradayPace(pedidos, { daysLimit: 7 });
  }, [pedidos]);

  const {
    currentHour,
    todayRevenueSoFar,
    avgRevenueAtCurrentHour,
    revenueDiffPercent,
    projectedDayEndRevenue,
    todayCumulativeConversion,
    avgCumulativeConversion,
    todayConversionSoFar,
    avgConversionSoFar,
    daysAveragedCount,
    todayCreatedTotal,
    todayPaidTotal,
    // Métricas hora a hora
    todayHourlyPaid = [],
    todayHourlyRevenue = [],
    todayHourlyCreated = [],
    todayHourlyConversion = [],
    avgHourlyPaid = [],
    avgHourlyRevenue = [],
    avgHourlyCreated = [],
    avgHourlyConversion = [],
    projectedHourlyPaid = [],
    projectedHourlyRevenue = [],
    projectedDayEndPaid = 0,
    todayPaidSoFar = 0,
    avgPaidAtCurrentHour = 0,
    paidDiffPercent = 0,
    bestHourSales = null,
    bestHourConversion = null,
  } = pace;

  // Formatação monetária, percentual e inteira
  const fmtMoney = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
  const fmtInt = (v) => `${Math.round(Number(v || 0))}`;

  // Configuração das dimensões do gráfico SVG
  const width = 860;
  const height = 290;
  const paddingLeft = 48;
  const paddingRight = 20;
  const paddingTop = 32;
  const paddingBottom = 42;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const slotWidth = plotWidth / 24;
  const barWidth = Math.max(16, slotWidth - 10);

  // Configurações do modo ativo
  const isSales = metricMode === 'sales';
  const isConversion = metricMode === 'conversion';
  const isRevenue = metricMode === 'revenue';

  const theme = useMemo(() => {
    if (isSales) {
      return {
        label: 'Vendas (Qtd)',
        unit: 'vendas',
        barColor: '#7c3aed',
        barCurrentColor: '#8b5cf6',
        barHoverColor: '#6d28d9',
        barProjColor: '#ede9fe',
        barProjBorder: '#c4b5fd',
        lineColor: '#64748b',
        badgeBg: '#f3e8ff',
        badgeColor: '#7e22ce',
        todayData: todayHourlyPaid,
        avgData: avgHourlyPaid,
        projData: projectedHourlyPaid,
        formatVal: (v) => `${Math.round(Number(v || 0))} un`,
        formatAxis: (v) => `${Math.round(v)}`,
      };
    }
    if (isConversion) {
      return {
        label: 'Taxa de Conversão (%)',
        unit: '%',
        barColor: '#d97706',
        barCurrentColor: '#f59e0b',
        barHoverColor: '#b45309',
        barProjColor: '#fef3c7',
        barProjBorder: '#fcd34d',
        lineColor: '#64748b',
        badgeBg: '#fef3c7',
        badgeColor: '#92400e',
        todayData: todayHourlyConversion,
        avgData: avgHourlyConversion,
        projData: null,
        formatVal: (v) => fmtPct(v),
        formatAxis: (v) => `${Math.round(v)}%`,
      };
    }
    return {
      label: 'Faturamento Líquido (R$)',
      unit: 'R$',
      barColor: '#059669',
      barCurrentColor: '#10b981',
      barHoverColor: '#047857',
      barProjColor: '#d1fae5',
      barProjBorder: '#6ee7b7',
      lineColor: '#64748b',
      badgeBg: '#ecfdf5',
      badgeColor: '#065f46',
      todayData: todayHourlyRevenue,
      avgData: avgHourlyRevenue,
      projData: projectedHourlyRevenue,
      formatVal: (v) => fmtMoney(v),
      formatAxis: (v) => fmtMoney(v).replace(',00', ''),
    };
  }, [isSales, isConversion, isRevenue, todayHourlyPaid, avgHourlyPaid, projectedHourlyPaid, todayHourlyConversion, avgHourlyConversion, todayHourlyRevenue, avgHourlyRevenue, projectedHourlyRevenue]);

  // Escala Máxima do Eixo Y
  const allValues = [
    ...(theme.todayData.filter((v) => v !== null && v !== undefined)),
    ...theme.avgData,
    ...(theme.projData ? theme.projData.filter((v) => v !== null && v !== undefined) : []),
  ];
  const rawMax = Math.max(1, ...allValues);
  const yMax = useMemo(() => {
    if (isSales) {
      if (rawMax <= 5) return 6;
      if (rawMax <= 10) return 12;
      return Math.ceil(rawMax * 1.25);
    }
    if (isConversion) {
      return Math.min(100, Math.max(20, Math.ceil((rawMax * 1.15) / 10) * 10));
    }
    // Faturamento
    if (rawMax <= 50) return 60;
    return Math.ceil((rawMax * 1.25) / 20) * 20;
  }, [isSales, isConversion, rawMax]);

  const getX = (hour) => paddingLeft + (hour + 0.5) * slotWidth;
  const getY = (val) => {
    if (val === null || val === undefined) return paddingTop + plotHeight;
    const clamped = Math.max(0, Math.min(val, yMax));
    return paddingTop + plotHeight - (clamped / yMax) * plotHeight;
  };

  // Linha da média histórica dos últimos 7 dias
  const avgLinePoints = theme.avgData.map((v, h) => `${getX(h)},${getY(v)}`);
  const avgLinePath = `M ${avgLinePoints.join(' L ')}`;

  // Hora em inspeção (hover ou hora atual)
  const inspectHour = activeHour !== null ? activeHour : currentHour;
  const isPastOrCurrent = inspectHour <= currentHour;
  const inspectPaid = isPastOrCurrent ? (todayHourlyPaid[inspectHour] ?? 0) : null;
  const inspectCreated = isPastOrCurrent ? (todayHourlyCreated[inspectHour] ?? 0) : null;
  const inspectConversion = isPastOrCurrent ? (todayHourlyConversion[inspectHour] ?? 0) : null;
  const inspectRevenue = isPastOrCurrent ? (todayHourlyRevenue[inspectHour] ?? 0) : null;
  const inspectAvgPaid = avgHourlyPaid[inspectHour] ?? 0;
  const inspectAvgRevenue = avgHourlyRevenue[inspectHour] ?? 0;
  const inspectAvgConversion = avgHourlyConversion[inspectHour] ?? 0;
  const inspectProjPaid = !isPastOrCurrent ? (projectedHourlyPaid[inspectHour] ?? 0) : null;
  const inspectProjRevenue = !isPastOrCurrent ? (projectedHourlyRevenue[inspectHour] ?? 0) : null;

  // Ritmo da hora inspecionada
  const hourlySalesDiff = inspectPaid !== null && inspectAvgPaid > 0
    ? Math.round(((inspectPaid - inspectAvgPaid) / inspectAvgPaid) * 100)
    : null;

  if (pedidosProp === null && loadingRecentes && pedidos.length === 0) {
    return (
      <div style={{
        marginTop: '24px',
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        padding: '36px 24px',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.88rem',
      }}>
        <div style={{
          display: 'inline-block',
          width: '26px',
          height: '26px',
          border: '3px solid #e2e8f0',
          borderTopColor: '#7c3aed',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '10px',
        }} />
        <div>Carregando métricas de vendas hora a hora...</div>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: '24px',
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      padding: '24px',
      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
      fontFamily: 'inherit',
    }}>
      {/* 1. Cabeçalho com Título, Badge de Tempo Real e Seletor de Modo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        marginBottom: '20px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: '800', color: '#0f172a' }}>
              Vendas Hora a Hora & Ritmo Intradiário
            </h3>
            <span style={{
              background: '#ecfdf5',
              color: '#059669',
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '12px',
              border: '1px solid #a7f3d0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
              Tempo Real
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Volume de vendas, taxa de conversão e ritmo de cada horário do dia (00h às 23h) comparados com os últimos 7 dias.
          </p>
        </div>

        {/* Seletor de Modo (Vendas | Conversão | Faturamento) */}
        <div style={{
          display: 'flex',
          background: '#f1f5f9',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          gap: '2px',
        }}>
          <button
            type="button"
            onClick={() => setMetricMode('sales')}
            style={{
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              background: isSales ? '#ffffff' : 'transparent',
              color: isSales ? '#7c3aed' : '#64748b',
              boxShadow: isSales ? '0 2px 4px rgba(124, 58, 237, 0.12)' : 'none',
            }}
          >
            🛒 Vendas (Qtd)
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('conversion')}
            style={{
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              background: isConversion ? '#ffffff' : 'transparent',
              color: isConversion ? '#d97706' : '#64748b',
              boxShadow: isConversion ? '0 2px 4px rgba(217, 119, 6, 0.12)' : 'none',
            }}
          >
            🎯 Conversão (%)
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('revenue')}
            style={{
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              background: isRevenue ? '#ffffff' : 'transparent',
              color: isRevenue ? '#059669' : '#64748b',
              boxShadow: isRevenue ? '0 2px 4px rgba(5, 150, 105, 0.12)' : 'none',
            }}
          >
            💰 Faturamento (R$)
          </button>
        </div>
      </div>

      {/* 2. Cards de Resumo Executivo (4 Colunas Responsivas) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {/* Card 1: Vendas Hoje */}
        <div style={{
          background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
          borderRadius: '12px',
          padding: '14px 16px',
          border: '1px solid #ddd6fe',
        }}>
          <span style={{ fontSize: '0.74rem', color: '#6b21a8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            🛒 Vendas Hoje (até {String(currentHour).padStart(2, '0')}:59)
          </span>
          <div style={{ fontSize: '1.55rem', fontWeight: '800', color: '#581c87', margin: '4px 0 2px' }}>
            {todayPaidSoFar} <span style={{ fontSize: '0.88rem', fontWeight: '600' }}>vendas</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', flexWrap: 'wrap' }}>
            <span style={{
              fontWeight: '700',
              color: paidDiffPercent >= 0 ? '#059669' : '#dc2626',
              background: paidDiffPercent >= 0 ? '#d1fae5' : '#fee2e2',
              padding: '1px 5px',
              borderRadius: '4px',
            }}>
              {paidDiffPercent >= 0 ? `▲ +${paidDiffPercent}%` : `▼ ${paidDiffPercent}%`}
            </span>
            <span style={{ color: '#6b21a8' }}>
              vs média ({fmtInt(avgPaidAtCurrentHour)} un)
            </span>
          </div>
        </div>

        {/* Card 2: Conversão Média Hoje */}
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          borderRadius: '12px',
          padding: '14px 16px',
          border: '1px solid #fde68a',
        }}>
          <span style={{ fontSize: '0.74rem', color: '#92400e', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            🎯 Conversão Geral Hoje
          </span>
          <div style={{ fontSize: '1.55rem', fontWeight: '800', color: '#78350f', margin: '4px 0 2px' }}>
            {fmtPct(todayConversionSoFar)}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#92400e' }}>
            {todayPaidTotal} pagas de {todayCreatedTotal} músicas geradas
            <span style={{ marginLeft: '4px', opacity: 0.8 }}>(Média 7d: {fmtPct(avgConversionSoFar)})</span>
          </div>
        </div>

        {/* Card 3: Faturamento Líquido */}
        <div style={{
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          borderRadius: '12px',
          padding: '14px 16px',
          border: '1px solid #a7f3d0',
        }}>
          <span style={{ fontSize: '0.74rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            💰 Faturamento Líquido Hoje
          </span>
          <div style={{ fontSize: '1.55rem', fontWeight: '800', color: '#064e3b', margin: '4px 0 2px' }}>
            {fmtMoney(todayRevenueSoFar)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', flexWrap: 'wrap' }}>
            <span style={{
              fontWeight: '700',
              color: revenueDiffPercent >= 0 ? '#059669' : '#dc2626',
              background: revenueDiffPercent >= 0 ? '#bbf7d0' : '#fee2e2',
              padding: '1px 5px',
              borderRadius: '4px',
            }}>
              {revenueDiffPercent >= 0 ? `▲ +${revenueDiffPercent}%` : `▼ ${revenueDiffPercent}%`}
            </span>
            <span style={{ color: '#065f46' }}>
              vs média ({fmtMoney(avgRevenueAtCurrentHour)})
            </span>
          </div>
        </div>

        {/* Card 4: Projeção Fechamento 23h59 */}
        <div style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '12px',
          padding: '14px 16px',
          border: '1px solid #e2e8f0',
        }}>
          <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            🔮 Projeção para 23h59
          </span>
          <div style={{ fontSize: '1.55rem', fontWeight: '800', color: '#0f172a', margin: '4px 0 2px' }}>
            ~{projectedDayEndPaid} <span style={{ fontSize: '0.88rem', fontWeight: '600' }}>vendas</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
            Receita estimada: <strong>{fmtMoney(projectedDayEndRevenue)}</strong>
          </div>
        </div>
      </div>

      {/* 3. Destaques do Dia (Mini Badges de Picos) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '16px',
        fontSize: '0.78rem',
      }}>
        {bestHourSales && (
          <div style={{
            background: '#faf5ff',
            color: '#6b21a8',
            border: '1px solid #e9d5ff',
            borderRadius: '8px',
            padding: '4px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span>🏆</span>
            <strong>Pico de Vendas:</strong>
            <span>{String(bestHourSales.hour).padStart(2, '0')}h ({bestHourSales.count} vendas • {fmtMoney(bestHourSales.revenue)})</span>
          </div>
        )}
        {bestHourConversion && (
          <div style={{
            background: '#fffbeb',
            color: '#92400e',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '4px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span>🎯</span>
            <strong>Pico de Conversão:</strong>
            <span>{String(bestHourConversion.hour).padStart(2, '0')}h ({fmtPct(bestHourConversion.rate)} • {bestHourConversion.paid}/{bestHourConversion.created} músicas)</span>
          </div>
        )}
        <div style={{
          background: paidDiffPercent >= 0 ? '#ecfdf5' : '#fef2f2',
          color: paidDiffPercent >= 0 ? '#065f46' : '#991b1b',
          border: `1px solid ${paidDiffPercent >= 0 ? '#a7f3d0' : '#fecaca'}`,
          borderRadius: '8px',
          padding: '4px 10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span>{paidDiffPercent >= 0 ? '🔥' : '❄️'}</span>
          <strong>Ritmo Geral:</strong>
          <span>{paidDiffPercent >= 0 ? `Acima da média semanal (+${paidDiffPercent}%)` : `Abaixo da média semanal (${paidDiffPercent}%)`}</span>
        </div>
      </div>

      {/* 4. Gráfico SVG Responsivo Interativo */}
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', minWidth: '640px', height: 'auto', display: 'block' }}
          onMouseLeave={() => setActiveHour(null)}
        >
          <defs>
            <linearGradient id="barGradCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.barCurrentColor} stopOpacity="1" />
              <stop offset="100%" stopColor={theme.barColor} stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="barGradPast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.barColor} stopOpacity="0.95" />
              <stop offset="100%" stopColor={theme.barColor} stopOpacity="0.75" />
            </linearGradient>
          </defs>

          {/* Linhas horizontais de grade (Eixo Y) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const val = yMax * pct;
            const y = paddingTop + plotHeight - pct * plotHeight;
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                  strokeDasharray={pct > 0 && pct < 1 ? '3,3' : 'none'}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="10.5"
                  fontWeight="600"
                >
                  {theme.formatAxis(val)}
                </text>
              </g>
            );
          })}

          {/* Linha da Média Histórica dos Últimos 7 Dias (Tracejada) */}
          <path
            d={avgLinePath}
            fill="none"
            stroke={theme.lineColor}
            strokeWidth="2"
            strokeDasharray="4,4"
            strokeLinecap="round"
          />

          {/* Pontos da Média Histórica */}
          {theme.avgData.map((v, h) => {
            const x = getX(h);
            const y = getY(v);
            return (
              <circle
                key={`avg-pt-${h}`}
                cx={x}
                cy={y}
                r="2.5"
                fill="#ffffff"
                stroke={theme.lineColor}
                strokeWidth="1.5"
              />
            );
          })}

          {/* Barras de Cada Hora (00h a 23h) */}
          {Array.from({ length: 24 }, (_, h) => {
            const x = getX(h);
            const barX = x - barWidth / 2;
            const isCurrent = h === currentHour;
            const isPast = h < currentHour;
            const isFuture = h > currentHour;
            const isHovered = activeHour === h;

            // Valor a renderizar na barra
            let val = null;
            let isProjected = false;

            if (h <= currentHour) {
              val = theme.todayData[h];
            } else if (theme.projData) {
              val = theme.projData[h];
              isProjected = true;
            }

            const barY = getY(val || 0);
            const barHeight = Math.max(0, paddingTop + plotHeight - barY);

            return (
              <g key={h}>
                {/* Linha vertical de foco em hover */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={paddingTop + plotHeight}
                    stroke={theme.barColor}
                    strokeWidth="1.2"
                    strokeDasharray="2,2"
                    opacity="0.6"
                  />
                )}

                {/* Barra da Hora */}
                {val !== null && val !== undefined && barHeight > 0 && (
                  <rect
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barHeight}
                    rx="4"
                    fill={
                      isProjected
                        ? theme.barProjColor
                        : isCurrent
                          ? 'url(#barGradCurrent)'
                          : isHovered
                            ? theme.barHoverColor
                            : 'url(#barGradPast)'
                    }
                    stroke={isProjected ? theme.barProjBorder : isCurrent ? theme.barColor : 'none'}
                    strokeWidth={isProjected ? 1.5 : isCurrent ? 1.5 : 0}
                    strokeDasharray={isProjected ? '3,2' : 'none'}
                    style={{ transition: 'all 0.15s ease-in-out' }}
                  />
                )}

                {/* Rótulo de Valor no Topo da Barra (se houver valor relevante) */}
                {val !== null && val > 0 && !isProjected && barHeight >= 14 && (
                  <text
                    x={x}
                    y={barY - 4}
                    textAnchor="middle"
                    fill={isCurrent ? theme.barCurrentColor : '#334155'}
                    fontSize="9.5"
                    fontWeight="700"
                  >
                    {isSales ? Math.round(val) : isConversion ? `${Math.round(val)}%` : Math.round(val)}
                  </text>
                )}

                {/* Badge indicador da Hora Atual (AGORA) */}
                {isCurrent && (
                  <g transform={`translate(${x}, ${paddingTop - 12})`}>
                    <rect
                      x="-18"
                      y="-12"
                      width="36"
                      height="15"
                      rx="7.5"
                      fill="#7c3aed"
                    />
                    <text
                      x="0"
                      y="-2"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="8"
                      fontWeight="800"
                    >
                      AGORA
                    </text>
                  </g>
                )}

                {/* Rótulo do Eixo X (Horas) */}
                <text
                  x={x}
                  y={height - 14}
                  textAnchor="middle"
                  fill={isCurrent ? '#7c3aed' : isPast ? '#0f172a' : '#94a3b8'}
                  fontSize={isCurrent ? '11' : '10'}
                  fontWeight={isCurrent ? '800' : isPast ? '600' : '500'}
                >
                  {String(h).padStart(2, '0')}h
                </text>

                {/* Área invisível clicável/tocável ampla para hover em cada hora */}
                <rect
                  x={x - slotWidth / 2}
                  y={paddingTop - 15}
                  width={slotWidth}
                  height={plotHeight + 35}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setActiveHour(h)}
                  onTouchStart={() => setActiveHour(h)}
                />
              </g>
            );
          })}
        </svg>

        {/* 5. Painel de Inspeção Dinâmica da Hora Selecionada */}
        <div style={{
          marginTop: '12px',
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          fontSize: '0.84rem',
        }}>
          {/* Identificação do Horário */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}>🕒</span>
            <div>
              <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem' }}>
                Horário: {String(inspectHour).padStart(2, '0')}:00 às {String(inspectHour).padStart(2, '0')}:59
                {inspectHour === currentHour && (
                  <span style={{
                    marginLeft: '8px',
                    background: '#ede9fe',
                    color: '#6d28d9',
                    padding: '2px 7px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: '800',
                  }}>
                    Hora Atual
                  </span>
                )}
                {inspectHour > currentHour && (
                  <span style={{
                    marginLeft: '8px',
                    background: '#f1f5f9',
                    color: '#64748b',
                    padding: '2px 7px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                  }}>
                    Hora Futura (Projeção)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '1px' }}>
                {isPastOrCurrent ? 'Dados consolidados deste horário hoje' : 'Expectativa estimada com base no ritmo atual'}
              </div>
            </div>
          </div>

          {/* Dados Detalhados da Hora */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            {/* Vendas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />
              <span style={{ color: '#475569' }}>Vendas:</span>
              <strong style={{ color: '#7c3aed', fontSize: '0.92rem' }}>
                {inspectPaid !== null ? `${inspectPaid} un` : `~${inspectProjPaid} un`}
              </strong>
              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                (Média 7d: {fmtInt(inspectAvgPaid)})
              </span>
            </div>

            {/* Músicas Criadas */}
            {isPastOrCurrent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                <span style={{ color: '#475569' }}>Músicas Geradas:</span>
                <strong style={{ color: '#1e40af' }}>{inspectCreated}</strong>
              </div>
            )}

            {/* Conversão */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
              <span style={{ color: '#475569' }}>Conversão:</span>
              <strong style={{ color: '#b45309' }}>
                {isPastOrCurrent ? fmtPct(inspectConversion) : fmtPct(inspectAvgConversion)}
              </strong>
            </div>

            {/* Faturamento */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
              <span style={{ color: '#475569' }}>Faturamento:</span>
              <strong style={{ color: '#047857' }}>
                {inspectRevenue !== null ? fmtMoney(inspectRevenue) : `~${fmtMoney(inspectProjRevenue)}`}
              </strong>
            </div>

            {/* Comparativo de Ritmo da Hora */}
            {hourlySalesDiff !== null && (
              <div style={{
                fontWeight: '700',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                background: hourlySalesDiff >= 0 ? '#dcfce7' : '#fee2e2',
                color: hourlySalesDiff >= 0 ? '#15803d' : '#b91c1c',
              }}>
                {hourlySalesDiff >= 0 ? `▲ +${hourlySalesDiff}% vs média` : `▼ ${hourlySalesDiff}% vs média`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6. Legenda Visual e Botão de Expansão de Tabela */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        fontSize: '0.78rem',
        color: '#64748b',
        borderTop: '1px solid #f1f5f9',
        paddingTop: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: theme.barColor, display: 'inline-block' }} />
            <span>Hoje realizado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: theme.barProjColor, border: `1px dashed ${theme.barProjBorder}`, display: 'inline-block' }} />
            <span>Projeção para horas futuras</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', background: theme.lineColor, display: 'inline-block' }} />
            <span>Média dos últimos 7 dias ({daysAveragedCount} {daysAveragedCount === 1 ? 'dia' : 'dias'})</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#7c3aed',
            fontWeight: '700',
            fontSize: '0.8rem',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {showTable ? '▲ Ocultar grade das 24 horas' : '▼ Ver detalhamento das 24 horas'}
        </button>
      </div>

      {/* 7. Grade Completa das 24 Horas (Expansível) */}
      {showTable && (
        <div style={{ marginTop: '16px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '8px 10px' }}>Hora</th>
                <th style={{ padding: '8px 10px' }}>Vendas Hoje</th>
                <th style={{ padding: '8px 10px' }}>Média Vendas (7d)</th>
                <th style={{ padding: '8px 10px' }}>Músicas Criadas</th>
                <th style={{ padding: '8px 10px' }}>Conversão Hoje</th>
                <th style={{ padding: '8px 10px' }}>Média Conversão</th>
                <th style={{ padding: '8px 10px' }}>Faturamento</th>
                <th style={{ padding: '8px 10px' }}>Ritmo</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, h) => {
                const isCurrent = h === currentHour;
                const isPast = h < currentHour;
                const paid = isPast || isCurrent ? (todayHourlyPaid[h] ?? 0) : null;
                const created = isPast || isCurrent ? (todayHourlyCreated[h] ?? 0) : null;
                const conv = isPast || isCurrent ? (todayHourlyConversion[h] ?? 0) : null;
                const rev = isPast || isCurrent ? (todayHourlyRevenue[h] ?? 0) : null;
                const avgPaid = avgHourlyPaid[h] ?? 0;
                const avgRev = avgHourlyRevenue[h] ?? 0;
                const avgConv = avgHourlyConversion[h] ?? 0;
                const projPaid = h > currentHour ? (projectedHourlyPaid[h] ?? 0) : null;

                const diff = paid !== null && avgPaid > 0
                  ? Math.round(((paid - avgPaid) / avgPaid) * 100)
                  : null;

                return (
                  <tr
                    key={h}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: isCurrent ? '#f5f3ff' : h % 2 === 0 ? '#ffffff' : '#fafafa',
                      fontWeight: isCurrent ? '700' : 'normal',
                    }}
                  >
                    <td style={{ padding: '8px 10px', color: isCurrent ? '#7c3aed' : '#0f172a' }}>
                      {String(h).padStart(2, '0')}:00 {isCurrent ? '⚡ (Agora)' : ''}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#7c3aed', fontWeight: '700' }}>
                      {paid !== null ? `${paid} un` : `~${projPaid} un (proj)`}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>
                      {fmtInt(avgPaid)} un
                    </td>
                    <td style={{ padding: '8px 10px', color: '#1e40af' }}>
                      {created !== null ? created : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#b45309', fontWeight: '700' }}>
                      {conv !== null ? fmtPct(conv) : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>
                      {fmtPct(avgConv)}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#059669', fontWeight: '700' }}>
                      {rev !== null ? fmtMoney(rev) : '-'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {diff !== null ? (
                        <span style={{
                          color: diff >= 0 ? '#059669' : '#dc2626',
                          fontWeight: '700',
                        }}>
                          {diff >= 0 ? `+${diff}%` : `${diff}%`}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
