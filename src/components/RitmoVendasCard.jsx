'use client';

import React, { useState, useMemo } from 'react';
import { calculateIntradayPace } from '@/lib/ritmoVendas';
import { usePedidosRecentes } from '@/lib/usePedidosRecentes';

export default function RitmoVendasCard({ pedidos: pedidosProp = null }) {
  const [metricMode, setMetricMode] = useState('revenue'); // 'revenue' | 'conversion'
  const [activeHour, setActiveHour] = useState(null);

  // Se pedidos não foi passado explicitamente (ex: em teste), carrega os pedidos dos últimos 8 dias (hoje + 7 dias)
  const { pedidos: pedidosRecentes, loading: loadingRecentes } = usePedidosRecentes(8);
  const pedidos = pedidosProp !== null ? pedidosProp : pedidosRecentes;

  // Calcula o ritmo com base nos pedidos carregados e na janela dos últimos 7 dias
  const pace = useMemo(() => {
    return calculateIntradayPace(pedidos, { daysLimit: 7 });
  }, [pedidos]);

  const {
    currentHour,
    todayRevenueSoFar,
    avgRevenueAtCurrentHour,
    revenueDiffPercent,
    projectedDayEndRevenue,
    todayCumulativeRevenue,
    avgCumulativeRevenue,
    projectedCumulativeRevenue,
    todayCumulativeConversion,
    avgCumulativeConversion,
    todayConversionSoFar,
    avgConversionSoFar,
    daysAveragedCount,
  } = pace;

  // Dimensões do gráfico SVG
  const width = 800;
  const height = 280;
  const paddingLeft = 60;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 40;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Determina valores do modo ativo
  const isRevenue = metricMode === 'revenue';

  const todayData = isRevenue ? todayCumulativeRevenue : todayCumulativeConversion;
  const avgData = isRevenue ? avgCumulativeRevenue : avgCumulativeConversion;
  const projData = isRevenue ? projectedCumulativeRevenue : null;

  // Calcula escala máxima do eixo Y
  const allValues = [
    ...(todayData.filter(v => v !== null)),
    ...avgData,
    ...(projData ? projData.filter(v => v !== null) : [])
  ];
  const rawMax = Math.max(1, ...allValues);
  const yMax = isRevenue
    ? Math.max(50, Math.ceil(rawMax / 50) * 50)
    : Math.max(20, Math.min(100, Math.ceil(rawMax / 10) * 10));

  const getX = (hour) => paddingLeft + (hour / 23) * plotWidth;
  const getY = (val) => {
    if (val === null || val === undefined) return paddingTop + plotHeight;
    const clamped = Math.min(val, yMax);
    return paddingTop + plotHeight - (clamped / yMax) * plotHeight;
  };

  // Monta caminhos SVG
  const todayPoints = [];
  for (let h = 0; h <= currentHour; h++) {
    if (todayData[h] !== null) {
      todayPoints.push(`${getX(h)},${getY(todayData[h])}`);
    }
  }
  const todayPath = todayPoints.length > 0 ? `M ${todayPoints.join(' L ')}` : '';
  const todayArea = todayPoints.length > 0
    ? `${todayPath} L ${getX(currentHour)},${paddingTop + plotHeight} L ${getX(0)},${paddingTop + plotHeight} Z`
    : '';

  const avgPoints = avgData.map((v, h) => `${getX(h)},${getY(v)}`);
  const avgPath = `M ${avgPoints.join(' L ')}`;

  const projPoints = [];
  if (projData) {
    for (let h = currentHour; h < 24; h++) {
      if (projData[h] !== null) {
        projPoints.push(`${getX(h)},${getY(projData[h])}`);
      }
    }
  }
  const projPath = projPoints.length > 0 ? `M ${projPoints.join(' L ')}` : '';

  // Formatação monetária e de porcentagem
  const fmtMoney = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

  // Dados do tooltip interativo
  const inspectHour = activeHour !== null ? activeHour : currentHour;
  const inspectToday = todayData[inspectHour];
  const inspectAvg = avgData[inspectHour];
  const inspectProj = projData ? projData[inspectHour] : null;

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
          marginBottom: '10px'
        }} />
        <div>Carregando ritmo dos últimos 7 dias...</div>
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
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
      fontFamily: 'inherit',
    }}>
      {/* Cabeçalho do Card com Título e Toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
              Ritmo de Vendas Intradiário
            </h3>
            <span style={{
              background: '#ecfdf5',
              color: '#059669',
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '12px',
              border: '1px solid #a7f3d0'
            }}>
              Tempo Real
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Comparativo hora a hora do ritmo de hoje contra a média dos últimos 7 dias ({daysAveragedCount} {daysAveragedCount === 1 ? 'dia' : 'dias'}).
          </p>
        </div>

        {/* Toggle Faturamento vs Conversão */}
        <div style={{
          display: 'flex',
          background: '#f1f5f9',
          padding: '3px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
        }}>
          <button
            type="button"
            onClick={() => setMetricMode('revenue')}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: isRevenue ? '#ffffff' : 'transparent',
              color: isRevenue ? '#7c3aed' : '#64748b',
              boxShadow: isRevenue ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            💰 Faturamento (R$)
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('conversion')}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: !isRevenue ? '#ffffff' : 'transparent',
              color: !isRevenue ? '#7c3aed' : '#64748b',
              boxShadow: !isRevenue ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            🎯 Conversão (%)
          </button>
        </div>
      </div>

      {/* 3 Cards de Resumo Rápido (Mobile First Grid) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '20px',
      }}>
        {/* Card 1: Ritmo Atual */}
        <div style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e2e8f0',
        }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Hoje até às {String(currentHour).padStart(2, '0')}:59
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: '4px 0' }}>
            {fmtMoney(todayRevenueSoFar)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
            <span style={{
              fontWeight: '700',
              color: revenueDiffPercent >= 0 ? '#059669' : '#dc2626',
              background: revenueDiffPercent >= 0 ? '#d1fae5' : '#fee2e2',
              padding: '2px 6px',
              borderRadius: '6px'
            }}>
              {revenueDiffPercent >= 0 ? `▲ +${revenueDiffPercent}%` : `▼ ${revenueDiffPercent}%`}
            </span>
            <span style={{ color: '#64748b' }}>
              vs média ({fmtMoney(avgRevenueAtCurrentHour)})
            </span>
          </div>
        </div>

        {/* Card 2: Projeção de Fechamento */}
        <div style={{
          background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e9d5ff',
        }}>
          <span style={{ fontSize: '0.78rem', color: '#7e22ce', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🎯 Projeção para 23h59
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#6b21a8', margin: '4px 0' }}>
            {fmtMoney(projectedDayEndRevenue)}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#9333ea' }}>
            Estimativa no ritmo atual
          </span>
        </div>

        {/* Card 3: Taxa de Conversão */}
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #fde68a',
        }}>
          <span style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            📈 Taxa de Conversão Hoje
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#92400e', margin: '4px 0' }}>
            {fmtPct(todayConversionSoFar)}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#b45309' }}>
            Média dos últimos 7 dias: {fmtPct(avgConversionSoFar)}
          </span>
        </div>
      </div>

      {/* Gráfico SVG Responsivo Interativo */}
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', minWidth: '550px', height: 'auto', display: 'block' }}
          onMouseLeave={() => setActiveHour(null)}
        >
          <defs>
            <linearGradient id="ritmoGradientToday" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
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
                  strokeDasharray={pct > 0 && pct < 1 ? '4,4' : 'none'}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="11"
                  fontWeight="600"
                >
                  {isRevenue ? fmtMoney(val).replace(',00', '') : fmtPct(val)}
                </text>
              </g>
            );
          })}

          {/* Rótulos do Eixo X (Horas do dia) */}
          {[0, 4, 8, 12, 16, 20, 23].map((h) => {
            const x = getX(h);
            return (
              <text
                key={h}
                x={x}
                y={height - 12}
                textAnchor="middle"
                fill="#64748b"
                fontSize="11"
                fontWeight="700"
              >
                {String(h).padStart(2, '0')}h
              </text>
            );
          })}

          {/* Área preenchida sob a linha de hoje */}
          {todayArea && (
            <path d={todayArea} fill="url(#ritmoGradientToday)" />
          )}

          {/* Linha 1: Média dos Dias Anteriores (Tracejada Cinza) */}
          <path
            d={avgPath}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2.2"
            strokeDasharray="5,5"
          />

          {/* Linha 2: Projeção de Tendência (Pontilhada Roxa) */}
          {projPath && (
            <path
              d={projPath}
              fill="none"
              stroke="#a855f7"
              strokeWidth="2.4"
              strokeDasharray="3,3"
            />
          )}

          {/* Linha 3: Hoje (Sólida Roxa) */}
          {todayPath && (
            <path
              d={todayPath}
              fill="none"
              stroke="#7c3aed"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          )}

          {/* Ponto brilhante na hora atual */}
          {todayData[currentHour] !== null && (
            <g transform={`translate(${getX(currentHour)}, ${getY(todayData[currentHour])})`}>
              <circle r="7" fill="#7c3aed" fillOpacity="0.25" />
              <circle r="4" fill="#7c3aed" stroke="#ffffff" strokeWidth="2" />
            </g>
          )}

          {/* Colunas invisíveis clicáveis/tocáveis para interação em cada hora */}
          {Array.from({ length: 24 }, (_, h) => {
            const x = getX(h);
            const colWidth = plotWidth / 24;
            const isHovered = activeHour === h;
            return (
              <g key={h}>
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={paddingTop + plotHeight}
                    stroke="#7c3aed"
                    strokeWidth="1.5"
                    strokeDasharray="2,2"
                  />
                )}
                <rect
                  x={x - colWidth / 2}
                  y={paddingTop}
                  width={colWidth}
                  height={plotHeight}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setActiveHour(h)}
                  onTouchStart={() => setActiveHour(h)}
                />
              </g>
            );
          })}
        </svg>

        {/* Tooltip Dinâmico em Destaque */}
        <div style={{
          marginTop: '10px',
          padding: '10px 14px',
          background: '#f8fafc',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '0.85rem',
        }}>
          <div>
            <span style={{ fontWeight: '800', color: '#0f172a' }}>
              🕒 Horário: {String(inspectHour).padStart(2, '0')}:00 {inspectHour === currentHour ? '(Agora)' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {inspectToday !== null && inspectToday !== undefined ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />
                <span style={{ color: '#475569' }}>Hoje:</span>
                <strong style={{ color: '#7c3aed' }}>
                  {isRevenue ? fmtMoney(inspectToday) : fmtPct(inspectToday)}
                </strong>
              </div>
            ) : inspectProj !== null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
                <span style={{ color: '#475569' }}>Projetado:</span>
                <strong style={{ color: '#a855f7' }}>
                  {isRevenue ? fmtMoney(inspectProj) : fmtPct(inspectProj)}
                </strong>
              </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} />
              <span style={{ color: '#475569' }}>Média (7 dias):</span>
              <strong style={{ color: '#334155' }}>
                {isRevenue ? fmtMoney(inspectAvg) : fmtPct(inspectAvg)}
              </strong>
            </div>

            {inspectToday !== null && inspectAvg > 0 && (
              <div style={{
                color: inspectToday >= inspectAvg ? '#059669' : '#dc2626',
                fontWeight: '700',
              }}>
                {inspectToday >= inspectAvg ? '+' : ''}
                {isRevenue ? fmtMoney(inspectToday - inspectAvg) : fmtPct(inspectToday - inspectAvg)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legenda Informativa */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        fontSize: '0.78rem',
        color: '#64748b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '4px', background: '#7c3aed', borderRadius: '2px', display: 'inline-block' }} />
          <span>Hoje (acumulado em tempo real)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '4px', background: '#94a3b8', borderRadius: '2px', display: 'inline-block' }} />
          <span>Média dos últimos 7 dias</span>
        </div>
        {isRevenue && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '14px', height: '4px', background: '#a855f7', borderRadius: '2px', display: 'inline-block' }} />
            <span>Tendência projetada até 23h59</span>
          </div>
        )}
      </div>
    </div>
  );
}
