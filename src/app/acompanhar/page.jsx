'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AcompanharPedido() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  // Simulated order details for high-fidelity presentation (real order will be loaded from DB in Phase 3)
  useEffect(() => {
    const timer = setTimeout(() => {
      setOrder({
        orderNumber: 'NS-98273-2026',
        customerName: 'João da Silva',
        customerEmail: 'joao@email.com',
        honoreeName: 'Ana Maria',
        occasion: 'Namoro / Aniversário de Relação',
        musicStyle: '🎸 Folk Acústico',
        voiceType: 'Voz Feminina',
        createdAt: '14/07/2026',
        total: 'R$ 79,90',
        paymentStatus: 'PAGAMENTO_APROVADO',
        productionStatus: 'EM_PRODUCAO',
        addons: ['Capa personalizada com foto', 'Arte com QR Code exclusivo'],
        // Timelines of statuses
        timeline: [
          { status: 'LETRA_APROVADA', label: 'Letra Aprovada', date: '14/07/2026 17:20', done: true },
          { status: 'PAGAMENTO_APROVADO', label: 'Pagamento Confirmado', date: '14/07/2026 17:22', done: true },
          { status: 'EM_PRODUCAO', label: 'Em Produção (Suno)', date: 'Em andamento...', active: true, done: false },
          { status: 'AGUARDANDO_REVISAO_INTERNA', label: 'Revisão de Qualidade', date: 'Pendente', done: false },
          { status: 'ENTREGUE', label: 'Música Entregue', date: 'Pendente', done: false }
        ]
      });
      setLoading(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
        <h3 style={{ marginTop: '16px', fontFamily: 'var(--font-family-title)' }}>Carregando status do seu pedido...</h3>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/" style={styles.logo}>
            <span style={styles.logoIcon}>🎵</span>
            <span style={styles.logoText}>NS<span className="gradient-text">Nexus</span></span>
          </Link>
          <span style={styles.orderBadge}>Pedido: {order.orderNumber}</span>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          
          <div style={styles.introCard} className="glass-card">
            <h2 style={{ fontFamily: 'var(--font-family-title)', marginBottom: '8px' }}>Tudo certo com o seu pedido, {order.customerName}!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Confirmamos a aprovação da letra e o pagamento. Sua música personalizada está sendo gerada e refinada com todo carinho pela nossa equipe de áudio.
            </p>
          </div>

          <div style={styles.layoutGrid}>
            {/* Timeline */}
            <div style={styles.timelineCard} className="glass-card">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '24px', fontFamily: 'var(--font-family-title)' }}>Acompanhamento de Status</h3>
              
              <div style={styles.timeline}>
                {order.timeline.map((step, idx) => (
                  <div key={idx} style={styles.timelineItem}>
                    <div style={styles.timelineLineContainer}>
                      <div 
                        style={{
                          ...styles.timelineDot,
                          backgroundColor: step.done ? 'var(--success)' : step.active ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                          boxShadow: step.active ? '0 0 10px var(--primary-glow)' : 'none'
                        }}
                      >
                        {step.done ? '✓' : ''}
                      </div>
                      {idx < order.timeline.length - 1 && <div style={styles.timelineLine} />}
                    </div>
                    <div style={styles.timelineInfo}>
                      <h4 style={{ fontSize: '1rem', color: step.done || step.active ? '#fff' : 'var(--text-muted)' }}>{step.label}</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{step.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order info details */}
            <div style={styles.detailsCard} className="glass-card">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', fontFamily: 'var(--font-family-title)' }}>Detalhes da Produção</h3>
              
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Homenageado</span>
                <span style={styles.detailVal}>{order.honoreeName}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Estilo</span>
                <span style={styles.detailVal}>{order.musicStyle}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Voz</span>
                <span style={styles.detailVal}>{order.voiceType}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Faturamento</span>
                <span style={styles.detailVal}>{order.total}</span>
              </div>

              {order.addons.length > 0 && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Adicionais Incluídos:</h4>
                  {order.addons.map((add, idx) => (
                    <div key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      🌟 {add}
                    </div>
                  ))}
                </div>
              )}

              {/* Secret admin preview link for demonstration */}
              <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  ⚙️ <em>Demonstração: Clique abaixo para ver o resultado final da entrega privada.</em>
                </p>
                <Link href="/entrega?id=NS-98273-2026" className="btn btn-secondary" style={{ width: '100%', padding: '10px 14px', fontSize: '0.85rem' }}>
                  Acessar Entrega Privada 🔑
                </Link>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0a0a0c',
  },
  loadingWrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0c',
    color: '#fff',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid rgba(255,255,255,0.06)',
    borderTopColor: 'var(--secondary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  header: {
    borderRadius: 0,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '1.5rem',
  },
  logoText: {
    fontFamily: 'var(--font-family-title)',
    fontWeight: '800',
    fontSize: '1.3rem',
    letterSpacing: '-0.02em',
    color: '#fff',
  },
  orderBadge: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: 'var(--secondary)',
    backgroundColor: 'rgba(6, 182, 212, 0.05)',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid var(--secondary-glow)',
  },
  introCard: {
    padding: '32px',
    marginBottom: '32px',
  },
  layoutGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 0.8fr',
    gap: '32px',
    alignItems: 'start',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
  timelineCard: {
    padding: '32px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  timelineItem: {
    display: 'flex',
    gap: '20px',
  },
  timelineLineContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  timelineDot: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#fff',
    zIndex: 2,
  },
  timelineLine: {
    width: '2px',
    flex: 1,
    minHeight: '40px',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  timelineInfo: {
    paddingBottom: '24px',
  },
  detailsCard: {
    padding: '32px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--border-color)',
    fontSize: '0.95rem',
  },
  detailLabel: {
    color: 'var(--text-secondary)',
  },
  detailVal: {
    fontWeight: '600',
  },
};
