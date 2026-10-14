'use client';

import React from 'react';

function formatMoney(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace('.', ',')}`;
}

export default function AdsKpiCards({ summary, loading }) {
  const {
    totalSpend = 0,
    totalPurchases = 0,
    totalRevenue = 0,
    averageCpa = 0,
    overallRoas = 0,
    totalProfit = 0,
  } = summary || {};

  const roasDisplay = overallRoas >= 900 ? '∞' : `${overallRoas.toFixed(2)}x`;
  const isRoasGood = overallRoas >= 2.0;
  const isProfitPositive = totalProfit >= 0;

  const cards = [
    {
      title: 'Valor Usado (Gasto)',
      value: formatMoney(totalSpend),
      subtitle: 'Total investido no período',
      color: '#3b82f6',
      icon: '💸',
    },
    {
      title: 'Faturamento Real',
      value: formatMoney(totalRevenue),
      subtitle: `${totalPurchases} pedidos confirmados`,
      color: '#10b981',
      icon: '💰',
    },
    {
      title: 'ROAS Real',
      value: roasDisplay,
      subtitle: isRoasGood ? 'Ótimo retorno sobre gasto' : 'Abaixo do ideal (alvo > 2.0x)',
      color: isRoasGood ? '#10b981' : (overallRoas > 1.2 ? '#f59e0b' : '#ef4444'),
      icon: '📈',
    },
    {
      title: 'Custo por Compra (CPA)',
      value: formatMoney(averageCpa),
      subtitle: totalPurchases > 0 ? `Baseado em ${totalPurchases} compras` : 'Sem compras registradas',
      color: averageCpa > 0 && averageCpa <= 8 ? '#10b981' : (averageCpa <= 15 ? '#f59e0b' : '#ef4444'),
      icon: '🎯',
    },
    {
      title: 'Lucro Líquido de Anúncios',
      value: formatMoney(totalProfit),
      subtitle: isProfitPositive ? 'Faturamento menos gastos' : 'Prejuízo no período',
      color: isProfitPositive ? '#10b981' : '#ef4444',
      icon: isProfitPositive ? '✨' : '⚠️',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '14px',
      marginBottom: '20px',
    }}>
      {cards.map((c, idx) => (
        <div
          key={idx}
          style={{
            background: 'linear-gradient(145deg, #181d28 0%, #11151e 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>
              {c.title}
            </span>
            <span style={{ fontSize: '18px' }}>{c.icon}</span>
          </div>

          <div style={{
            fontSize: '22px',
            fontWeight: 700,
            color: loading ? '#64748b' : (c.color || '#f8fafc'),
            marginBottom: '4px',
            letterSpacing: '-0.5px',
          }}>
            {loading ? '---' : c.value}
          </div>

          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {c.subtitle}
          </div>
        </div>
      ))}
    </div>
  );
}
