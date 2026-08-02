'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function AcompanharContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchOrder() {
      if (!orderId) {
        setError('Nenhum pedido especificado na URL.');
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'orders', orderId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const addons = [];
          if (data.hasVideoAccess) addons.push('Vídeo Homenagem Animado (+R$6,90)');
          
          const isPaid = data.paymentStatus === 'PAGO' || data.paymentStatus === 'PAGAMENTO_APROVADO';
          const isProd = data.productionStatus === 'EM_PRODUCAO';
          const isRev = data.productionStatus === 'AGUARDANDO_REVISAO_INTERNA';
          const isDone = data.productionStatus === 'CONCLUIDO';
          
          setOrder({
            id: docSnap.id,
            orderNumber: data.orderNumber || 'NS-XXXXX-2026',
            customerName: data.customerName || 'Cliente',
            honoreeName: data.honoreeName || '',
            musicStyle: data.musicStyle || '',
            voiceType: data.voiceType || '',
            total: (data.videoAddonPaid || data.hasVideoAccess) ? 'R$ 16,89' : 'R$ 9,99',
            addons,
            timeline: [
              { status: 'LETRA_APROVADA', label: 'Letra Aprovada', date: data.createdAt ? new Date(data.createdAt).toLocaleString('pt-BR') : '', done: true },
              { status: 'PAGAMENTO_APROVADO', label: 'Pagamento Confirmado', date: data.paidAt ? new Date(data.paidAt).toLocaleString('pt-BR') : (isPaid ? 'Confirmado' : 'Pendente'), done: isPaid },
              { status: 'EM_PRODUCAO', label: 'Em Produção (Suno)', date: isPaid && !isDone ? 'Em andamento...' : (isDone ? 'Finalizado' : 'Aguardando'), active: isPaid && !isDone && !isRev, done: isDone || isRev },
              { status: 'AGUARDANDO_REVISAO_INTERNA', label: 'Revisão de Qualidade', date: isDone ? 'Revisado' : (isRev ? 'Em andamento...' : 'Pendente'), active: isRev, done: isDone },
              { status: 'ENTREGUE', label: 'Música Entregue', date: isDone ? 'Liberado na Entrega Privada' : 'Pendente', active: isDone, done: isDone }
            ]
          });
        } else {
          setError('Pedido não encontrado.');
        }
      } catch (err) {
        console.error("Erro ao buscar pedido:", err);
        setError('Erro ao carregar os dados do pedido.');
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
        <h3 style={{ marginTop: '16px', fontFamily: 'var(--font-family-title)' }}>Carregando status do seu pedido...</h3>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={styles.loadingWrapper}>
        <h3 style={{ fontFamily: 'var(--font-family-title)', color: 'var(--danger)' }}>{error || 'Erro inesperado.'}</h3>
        <Link href="/" className="btn btn-primary" style={{ marginTop: '16px' }}>Voltar ao Início</Link>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="NSMusic" style={{ height: '40px', width: 'auto' }} />
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

          <div className="responsive-grid-split">
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
                      <h4 style={{ fontSize: '1rem', color: step.done || step.active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: step.active ? '800' : '600' }}>{step.label}</h4>
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
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default function AcompanharPedido() {
  return (
    <Suspense fallback={<div style={styles.loadingWrapper}><div style={styles.spinner} /></div>}>
      <AcompanharContent />
    </Suspense>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-primary)',
  },
  loadingWrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  spinner: {
    width: '44px',
    height: '44px',
    border: '3px solid var(--border-color)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    borderRadius: 0,
    borderWidth: '0 0 1px 0',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '12px 20px',
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
    color: 'var(--text-primary)',
  },
  orderBadge: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: 'var(--primary)',
    backgroundColor: 'var(--primary-light)',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid rgba(124, 58, 237, 0.2)',
  },
  introCard: {
    padding: '28px',
    marginBottom: '28px',
    backgroundColor: '#FFFFFF',
    boxShadow: 'var(--card-shadow)',
  },
  layoutGrid: {},
  timelineCard: {
    padding: '28px',
    backgroundColor: '#FFFFFF',
    boxShadow: 'var(--card-shadow)',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  timelineItem: {
    display: 'flex',
    gap: '16px',
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
    color: '#FFFFFF',
    zIndex: 2,
  },
  timelineLine: {
    width: '2px',
    flex: 1,
    minHeight: '36px',
    backgroundColor: 'var(--border-color)',
  },
  timelineInfo: {
    paddingBottom: '20px',
  },
  detailsCard: {
    padding: '28px',
    backgroundColor: '#FFFFFF',
    boxShadow: 'var(--card-shadow)',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--border-color)',
    fontSize: '0.95rem',
  },
  detailLabel: {
    color: 'var(--text-muted)',
  },
  detailVal: {
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
};

