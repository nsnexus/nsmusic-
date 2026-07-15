'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'NEW', 'PRODUCTION', 'FINISHED'
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (!authUser) {
        router.push('/admin/login');
      } else {
        setUser(authUser);
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    // Load orders in real-time from Firestore database
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = [];
      snapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() });
      });
      setOrders(ordersData);
      setLoadingOrders(false);
    }, (error) => {
      console.error("Erro ao escutar pedidos:", error);
      // Fallback local mock data for testing/offline presentation
      setOrders([
        {
          id: 'MOCK-ORDER-12345',
          orderNumber: 'NS-98273-2026',
          customerName: 'João da Silva',
          customerEmail: 'joao@email.com',
          customerPhone: '11999999999',
          honoreeName: 'Ana Maria',
          occasion: 'namoro',
          musicStyle: 'acoustic_folk',
          voiceType: 'feminina',
          package: 'presente',
          total: 79.90,
          paymentStatus: 'PAGAMENTO_APROVADO',
          productionStatus: 'EM_PRODUCAO',
          createdAt: { toDate: () => new Date() }
        }
      ]);
      setLoadingOrders(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/admin/login');
    } catch (err) {
      console.error(err);
    }
  };

  const getFilteredOrders = () => {
    switch (filter) {
      case 'NEW':
        return orders.filter(o => o.paymentStatus === 'PAGAMENTO_APROVADO' && o.productionStatus === 'LETRA_APROVADA');
      case 'PRODUCTION':
        return orders.filter(o => o.productionStatus === 'EM_PRODUCAO' || o.productionStatus === 'VERSOES_EM_PRODUCAO');
      case 'FINISHED':
        return orders.filter(o => o.productionStatus === 'FINALIZADO' || o.productionStatus === 'ENTREGUE');
      default:
        return orders;
    }
  };

  const getFaturamentoTotal = () => {
    return orders
      .filter(o => o.paymentStatus === 'PAGAMENTO_APROVADO')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  };

  const getOccasionEmoji = (occ) => {
    switch (occ) {
      case 'aniversario': return '🎂';
      case 'casamento': return '💒';
      case 'namoro': return '💕';
      case 'mae_pai': return '👩‍👦';
      case 'empresa': return '🏢';
      default: return '✨';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'PAGAMENTO_APROVADO':
      case 'FINALIZADO':
      case 'ENTREGUE':
        return 'var(--success)';
      case 'EM_PRODUCAO':
      case 'VERSOES_EM_PRODUCAO':
        return 'var(--primary)';
      case 'LETRA_GERADA':
      case 'AGUARDANDO_APROVACAO':
        return 'var(--warning)';
      default:
        return 'var(--text-muted)';
    }
  };

  if (checkingAuth) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
      </div>
    );
  }

  const filteredOrders = getFilteredOrders();

  return (
    <div style={styles.wrapper}>
      {/* Sidebar/Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>🎵</span>
            <span style={styles.logoText}>NS<span className="gradient-text">Music</span> Admin</span>
          </div>
          <div style={styles.userInfo}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{user.email}</span>
            <button onClick={handleLogout} style={styles.logoutBtn}>Sair ➔</button>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container">
          
          {/* Metrics summary cards */}
          <div style={styles.metricsGrid}>
            <div style={styles.metricCard} className="glass-card">
              <span style={styles.metricLabel}>Faturamento Total</span>
              <h2 style={styles.metricValue} className="gradient-text">R$ {getFaturamentoTotal().toFixed(2)}</h2>
            </div>
            <div style={styles.metricCard} className="glass-card">
              <span style={styles.metricLabel}>Total de Pedidos</span>
              <h2 style={styles.metricValue}>{orders.length}</h2>
            </div>
            <div style={styles.metricCard} className="glass-card">
              <span style={styles.metricLabel}>Novos (Aguardando Produção)</span>
              <h2 style={styles.metricValue}>{orders.filter(o => o.productionStatus === 'LETRA_APROVADA').length}</h2>
            </div>
            <div style={styles.metricCard} className="glass-card">
              <span style={styles.metricLabel}>Em Produção</span>
              <h2 style={styles.metricValue}>{orders.filter(o => o.productionStatus === 'EM_PRODUCAO').length}</h2>
            </div>
          </div>

          {/* Filters and List */}
          <div style={{ marginTop: '40px' }}>
            <div style={styles.filterBar}>
              <div style={styles.filterTitle}>
                <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-family-title)' }}>Pedidos Recebidos</h3>
              </div>
              <div style={styles.filterBtns}>
                <button 
                  onClick={() => setFilter('ALL')} 
                  style={{ ...styles.filterBtn, borderBottom: filter === 'ALL' ? '2px solid var(--primary)' : 'none', color: filter === 'ALL' ? '#fff' : 'var(--text-muted)' }}
                >
                  Todos ({orders.length})
                </button>
                <button 
                  onClick={() => setFilter('NEW')} 
                  style={{ ...styles.filterBtn, borderBottom: filter === 'NEW' ? '2px solid var(--primary)' : 'none', color: filter === 'NEW' ? '#fff' : 'var(--text-muted)' }}
                >
                  Novos ({orders.filter(o => o.paymentStatus === 'PAGAMENTO_APROVADO' && o.productionStatus === 'LETRA_APROVADA').length})
                </button>
                <button 
                  onClick={() => setFilter('PRODUCTION')} 
                  style={{ ...styles.filterBtn, borderBottom: filter === 'PRODUCTION' ? '2px solid var(--primary)' : 'none', color: filter === 'PRODUCTION' ? '#fff' : 'var(--text-muted)' }}
                >
                  Em Produção ({orders.filter(o => o.productionStatus === 'EM_PRODUCAO' || o.productionStatus === 'VERSOES_EM_PRODUCAO').length})
                </button>
                <button 
                  onClick={() => setFilter('FINISHED')} 
                  style={{ ...styles.filterBtn, borderBottom: filter === 'FINISHED' ? '2px solid var(--primary)' : 'none', color: filter === 'FINISHED' ? '#fff' : 'var(--text-muted)' }}
                >
                  Finalizados ({orders.filter(o => o.productionStatus === 'FINALIZADO' || o.productionStatus === 'ENTREGUE').length})
                </button>
              </div>
            </div>

            {loadingOrders ? (
              <div style={styles.loadingOrders}>
                <div style={styles.spinner} />
                <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Carregando listagem de pedidos...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div style={styles.emptyState} className="glass-card">
                <span>📭</span>
                <h4>Nenhum pedido encontrado</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Nenhum registro se enquadra no filtro selecionado.</p>
              </div>
            ) : (
              <div style={styles.tableCard} className="glass-card">
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={styles.th}>Código</th>
                      <th style={styles.th}>Cliente</th>
                      <th style={styles.th}>Homenageado</th>
                      <th style={styles.th}>Estilo/Voz</th>
                      <th style={styles.th}>Pacote</th>
                      <th style={styles.th}>Valor</th>
                      <th style={styles.th}>Pagamento</th>
                      <th style={styles.th}>Produção</th>
                      <th style={styles.th}>Data</th>
                      <th style={styles.th}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((o) => (
                      <tr key={o.id} style={styles.tr}>
                        <td style={{ ...styles.td, fontWeight: '700' }}>{o.orderNumber || o.id.substring(0, 8)}</td>
                        <td style={styles.td}>
                          <div>{o.customerName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{o.customerPhone}</div>
                        </td>
                        <td style={styles.td}>
                          {getOccasionEmoji(o.occasion)} {o.honoreeName}
                        </td>
                        <td style={{ ...styles.td, fontSize: '0.85rem' }}>
                          <div>{o.musicStyle}</div>
                          <div style={{ color: 'var(--text-muted)' }}>{o.voiceType}</div>
                        </td>
                        <td style={{ ...styles.td, textTransform: 'capitalize' }}>{o.package}</td>
                        <td style={{ ...styles.td, fontWeight: '700' }}>R$ {(Number(o.total) || 0).toFixed(2)}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, border: `1px solid ${getStatusBadgeColor(o.paymentStatus)}22`, color: getStatusBadgeColor(o.paymentStatus), backgroundColor: `${getStatusBadgeColor(o.paymentStatus)}08` }}>
                            {o.paymentStatus === 'PAGAMENTO_APROVADO' ? 'Aprovado' : 'Aguardando'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, border: `1px solid ${getStatusBadgeColor(o.productionStatus)}22`, color: getStatusBadgeColor(o.productionStatus), backgroundColor: `${getStatusBadgeColor(o.productionStatus)}08` }}>
                            {o.productionStatus}
                          </span>
                        </td>
                        <td style={styles.td}>{o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('pt-BR') : o.createdAt || 'N/A'}</td>
                        <td style={styles.td}>
                          <Link href={`/admin/pedidos/${o.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Gerenciar ⚙️
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0c',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255,255,255,0.06)',
    borderTopColor: 'var(--primary)',
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
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--danger)',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    outline: 'none',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
  },
  metricCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  metricLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: '1.8rem',
    fontWeight: '800',
  },
  filterBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '16px',
    marginBottom: '20px',
  },
  filterTitle: {
    flex: 1,
  },
  filterBtns: {
    display: 'flex',
    gap: '8px',
  },
  filterBtn: {
    background: 'none',
    border: 'none',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
    outline: 'none',
    transition: 'all 0.2s',
  },
  loadingOrders: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 0',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 20px',
    textAlign: 'center',
  },
  tableCard: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  thRow: {
    borderBottom: '1px solid var(--border-color)',
  },
  th: {
    padding: '16px 20px',
    fontSize: '0.85rem',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tr: {
    borderBottom: '1px solid var(--border-color)',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.01)',
    },
  },
  td: {
    padding: '16px 20px',
    fontSize: '0.95rem',
    verticalAlign: 'middle',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '100px',
    fontSize: '0.75rem',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
};
