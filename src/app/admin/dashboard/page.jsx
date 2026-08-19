'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import Image from 'next/image';

// toISOStr precisa lidar com os dois formatos gravados historicamente (Timestamp do Firestore e
// string ISO) — mesmo utilitário replicado de admin/page.jsx.
function toISOStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?.toDate) return value.toDate().toISOString();
  return null;
}

function daysInMonth(year, month) {
  // month é 1-indexado aqui (1=Janeiro) — Date(year, month, 0) devolve o último dia do mês anterior.
  return new Date(year, month, 0).getDate();
}

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [monthValue, setMonthValue] = useState(defaultMonth);

  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser || auth.currentUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      }
    }, 1500);

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      clearTimeout(timeout);
      if (!authUser || authUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      } else {
        setUser(authUser);
        setCheckingAuth(false);
      }
    }, () => {
      clearTimeout(timeout);
      router.push('/admin/login');
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((d) => {
        const o = d.data();
        if (o.deletedAt) return;
        data.push({ id: d.id, ...o });
      });
      setOrders(data);
      setLoadingOrders(false);
    }, () => setLoadingOrders(false));
    return () => unsubscribe();
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/admin/login');
  };

  // Série diária do mês selecionado: quantos pedidos foram CRIADOS em cada dia (feito) e quantos
  // foram PAGOS em cada dia (convertido, usa paidAt — não createdAt, um pedido pode converter dias
  // depois de criado). % é sempre relativo ao que foi criado NAQUELE mesmo dia, não cumulativo — dá
  // pra ver se a conversão de um dia específico foi boa ou ruim, que é a pergunta que o gráfico
  // responde.
  const monthlySeries = useMemo(() => {
    const [yearStr, monthStr] = monthValue.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr); // 1-indexado
    const totalDays = daysInMonth(year, month);

    const feito = new Array(totalDays).fill(0);
    const convertido = new Array(totalDays).fill(0);

    for (const o of orders) {
      const createdIso = toISOStr(o.createdAt);
      if (createdIso) {
        const d = new Date(createdIso);
        if (d.getFullYear() === year && d.getMonth() + 1 === month) {
          feito[d.getDate() - 1]++;
        }
      }
      const paidIso = toISOStr(o.paidAt);
      if (paidIso) {
        const d = new Date(paidIso);
        if (d.getFullYear() === year && d.getMonth() + 1 === month) {
          convertido[d.getDate() - 1]++;
        }
      }
    }

    const percent = feito.map((f, i) => (f > 0 ? Math.round((convertido[i] / f) * 1000) / 10 : 0));

    return {
      days: Array.from({ length: totalDays }, (_, i) => i + 1),
      feito,
      convertido,
      percent,
      totalFeito: feito.reduce((a, b) => a + b, 0),
      totalConvertido: convertido.reduce((a, b) => a + b, 0),
    };
  }, [orders, monthValue]);

  const overallPercent = monthlySeries.totalFeito > 0
    ? Math.round((monthlySeries.totalConvertido / monthlySeries.totalFeito) * 1000) / 10
    : 0;

  if (checkingAuth || (loadingOrders && orders.length === 0)) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <div style={styles.headerContainer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              <Image src="/logo.png" alt="NSMusic" width={36} height={36} style={{ height: '36px', width: 'auto' }} priority />
              <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Painel Admin</span>
            </Link>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link href="/admin" style={{ ...styles.tabBtn, backgroundColor: '#e2e8f0', color: '#334155', textDecoration: 'none', display: 'inline-block' }}>
                📦 Pedidos
              </Link>
              <span style={{ ...styles.tabBtn, backgroundColor: '#7c3aed', color: '#ffffff' }}>
                📊 Dashboard
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: '600' }}>{user?.email}</span>
            <button onClick={handleLogout} style={styles.logoutBtn}>Sair ➔</button>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px 0' }}>
        <div className="container" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Dashboard de Conversão</h1>
            <div>
              <label htmlFor="dashboard-month" style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px' }}>Mês</label>
              <input
                id="dashboard-month"
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#0f172a' }}
              />
            </div>
          </div>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Solicitações no mês</span>
              <h2 style={styles.metricValue}>{monthlySeries.totalFeito}</h2>
            </div>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Convertidas (pagas)</span>
              <h2 style={{ ...styles.metricValue, color: '#059669' }}>{monthlySeries.totalConvertido}</h2>
            </div>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Taxa de conversão do mês</span>
              <h2 style={{ ...styles.metricValue, color: '#d97706' }}>{overallPercent}%</h2>
            </div>
          </div>

          <div className="glass-card" style={{ marginTop: '24px', padding: '24px', borderRadius: '16px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Solicitações x Conversões por dia</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 20px' }}>
              Barras: quantidade feita e convertida por dia. Linha: % de conversão do dia (eixo direito).
            </p>
            <ConversionChart series={monthlySeries} />
          </div>
        </div>
      </main>
    </div>
  );
}

// Gráfico de barras agrupadas (feito/convertido) + linha de conversão (%), em SVG puro — sem
// dependência nova só pra um gráfico (projeto não tem lib de gráfico hoje, ver package.json).
function ConversionChart({ series }) {
  const { days, feito, convertido, percent } = series;
  if (days.length === 0) return null;

  const width = 900;
  const height = 340;
  const marginTop = 20;
  const marginBottom = 40;
  const marginLeft = 44;
  const marginRight = 44;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const maxCount = Math.max(1, ...feito, ...convertido);
  // Arredonda o teto do eixo de contagem pra um número "redondo" — evita eixo tipo "0, 3.4, 6.8, ...".
  const countAxisMax = Math.max(4, Math.ceil(maxCount / 4) * 4);

  const groupWidth = plotWidth / days.length;
  const barWidth = Math.max(2, groupWidth * 0.32);

  const xForDay = (i) => marginLeft + i * groupWidth + groupWidth / 2;
  const yForCount = (v) => marginTop + plotHeight - (v / countAxisMax) * plotHeight;
  const yForPercent = (v) => marginTop + plotHeight - (Math.min(v, 100) / 100) * plotHeight;

  const linePoints = days.map((_, i) => `${xForDay(i)},${yForPercent(percent[i])}`).join(' ');

  const countTicks = [0, countAxisMax / 4, countAxisMax / 2, (countAxisMax * 3) / 4, countAxisMax];
  const percentTicks = [0, 25, 50, 75, 100];

  // Mostra só alguns rótulos de dia no eixo X (senão 31 números colidem) — a cada 5 dias, garantindo
  // o primeiro e o último.
  const showDayLabel = (i) => i === 0 || i === days.length - 1 || (i + 1) % 5 === 0;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '600px', height: 'auto', fontFamily: 'inherit' }}>
        {/* Grade + eixo esquerdo (contagem) */}
        {countTicks.map((t, i) => (
          <g key={`count-${i}`}>
            <line x1={marginLeft} y1={yForCount(t)} x2={width - marginRight} y2={yForCount(t)} stroke="#f1f5f9" strokeWidth="1" />
            <text x={marginLeft - 8} y={yForCount(t) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{t}</text>
          </g>
        ))}

        {/* Eixo direito (percentual) */}
        {percentTicks.map((t, i) => (
          <text key={`pct-${i}`} x={width - marginRight + 8} y={yForPercent(t) + 4} textAnchor="start" fontSize="11" fill="#d97706">{t}%</text>
        ))}

        {/* Eixo X — dias do mês */}
        {days.map((day, i) => (
          showDayLabel(i) && (
            <text key={`day-${i}`} x={xForDay(i)} y={height - marginBottom + 16} textAnchor="middle" fontSize="11" fill="#94a3b8">
              {day}
            </text>
          )
        ))}

        {/* Barras: feito (azul) e convertido (verde), lado a lado por dia */}
        {days.map((day, i) => {
          const cx = xForDay(i);
          const fH = plotHeight - (yForCount(feito[i]) - marginTop);
          const cH = plotHeight - (yForCount(convertido[i]) - marginTop);
          return (
            <g key={`bars-${i}`}>
              <title>{`Dia ${day}: ${feito[i]} feito(s), ${convertido[i]} convertido(s) (${percent[i]}%)`}</title>
              <rect x={cx - barWidth - 1} y={yForCount(feito[i])} width={barWidth} height={Math.max(0, fH)} fill="#3b82f6" rx="1.5" />
              <rect x={cx + 1} y={yForCount(convertido[i])} width={barWidth} height={Math.max(0, cH)} fill="#10b981" rx="1.5" />
            </g>
          );
        })}

        {/* Linha de conversão (%) */}
        <polyline points={linePoints} fill="none" stroke="#d97706" strokeWidth="2.5" />
        {days.map((day, i) => (
          <circle key={`dot-${i}`} cx={xForDay(i)} cy={yForPercent(percent[i])} r="3" fill="#d97706" />
        ))}
      </svg>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '12px', fontSize: '0.82rem', color: '#334155' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#3b82f6', display: 'inline-block' }} /> Feito
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#10b981', display: 'inline-block' }} /> Convertido
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#d97706', display: 'inline-block' }} /> % Conversão
        </span>
      </div>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' },
  loadingWrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  spinner: { width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header: { backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' },
  headerContainer: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
  },
  tabBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: '#dc2626',
    fontSize: '0.9rem',
    fontWeight: '700',
    cursor: 'pointer',
    outline: 'none',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
  },
  metricCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    padding: '20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
  },
  metricLabel: { fontSize: '0.82rem', color: '#64748b', fontWeight: '600' },
  metricValue: { fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', margin: '8px 0 0' },
};
