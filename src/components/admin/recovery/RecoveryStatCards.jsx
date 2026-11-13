'use client';

export default function RecoveryStatCards({ metrics = {} }) {
  const {
    totalSent = 0,
    totalRecovered = 0,
    conversionRate = 0,
    recoveredRevenue = 0,
  } = metrics;

  const cards = [
    {
      titulo: 'Mensagens Enviadas',
      valor: totalSent,
      subtexto: 'Leads notificados via Meta Cloud API',
      icone: '💬',
      corBorda: '#3b82f6',
      bgIcone: 'rgba(59, 130, 246, 0.1)',
      corTexto: '#1d4ed8',
    },
    {
      titulo: 'Vendas Recuperadas',
      valor: totalRecovered,
      subtexto: 'Clientes que pagaram após a mensagem',
      icone: '🎯',
      corBorda: '#10b981',
      bgIcone: 'rgba(16, 185, 129, 0.1)',
      corTexto: '#047857',
    },
    {
      titulo: 'Taxa de Conversão',
      valor: `${conversionRate}%`,
      subtexto: 'Eficiência de recuperação de PIX',
      icone: '📈',
      corBorda: '#8b5cf6',
      bgIcone: 'rgba(139, 92, 246, 0.1)',
      corTexto: '#6d28d9',
    },
    {
      titulo: 'Faturamento Recuperado',
      valor: `R$ ${Number(recoveredRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      subtexto: 'Receita gerada pela automação',
      icone: '💰',
      corBorda: '#f59e0b',
      bgIcone: 'rgba(245, 158, 11, 0.1)',
      corTexto: '#b45309',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
      }}
    >
      {cards.map((c, idx) => (
        <div
          key={idx}
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid #e2e8f0',
            borderLeft: `4px solid ${c.corBorda}`,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748b' }}>{c.titulo}</span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: c.bgIcone,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
              }}
            >
              {c.icone}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#0f172a', lineHeight: 1.2, marginBottom: '4px' }}>
              {c.valor}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{c.subtexto}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

