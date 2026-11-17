'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged, signOut } from '@/lib/authClient';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useResumoMes } from '@/lib/useResumoMes';
import RitmoVendasCard from '@/components/RitmoVendasCard';
import VendasPorPlataformaCard from '@/components/VendasPorPlataformaCard';
import KieCreditsBadge from '@/components/admin/KieCreditsBadge';
import UnificallyCreditsBadge from '@/components/admin/UnificallyCreditsBadge';
import WhatsAppUsageBadge from '@/components/admin/WhatsAppUsageBadge';
import { hasMusicaGerada } from '@/lib/stats';
import { Package, BarChart3, Megaphone, Mail, LogOut } from 'lucide-react';

// Componentes pesados carregados sob demanda (code-splitting) para reduzir First Load JS
// e não bloquear a renderização inicial do dashboard.
const VendasPorDiaTable = dynamic(() => import('@/components/VendasPorDiaTable'), {
  ssr: false,
  loading: () => <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Carregando vendas por dia...</div>,
});
const VendasPorHoraHeatmap = dynamic(() => import('@/components/VendasPorHoraHeatmap'), {
  ssr: false,
  loading: () => <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Carregando mapa por horário...</div>,
});
const VendasPorEstadoMapa = dynamic(() => import('@/components/VendasPorEstadoMapa'), {
  ssr: false,
  loading: () => <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Carregando mapa por estado...</div>,
});

// toISOStr precisa lidar com os dois formatos gravados historicamente (Timestamp do Firestore e
// string ISO) — mesmo utilitário replicado de admin/page.jsx.
function toISOStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?.toDate) return value.toDate().toISOString();
  return null;
}

// Lista vazia estável (os cards recebem o resumo pronto; não há pedidos no navegador).
const EMPTY_ORDERS = [];

function daysInMonth(year, month) {
  // month é 1-indexado aqui (1=Janeiro) — Date(year, month, 0) devolve o último dia do mês anterior.
  return new Date(year, month, 0).getDate();
}

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [monthValue, setMonthValue] = useState(defaultMonth);

  // Resumo do mês já calculado no servidor (tabela metricas_diarias): o navegador não baixa mais
  // os pedidos do mês — dias fechados vêm guardados e só os dias abertos são recalculados.
  const { resumo, loading: loadingResumo, erro: erroResumo, montando } = useResumoMes(monthValue);
  const orders = EMPTY_ORDERS;
  const loadingOrders = loadingResumo && !resumo;

  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser || auth.currentUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      }
    }, 4500);

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

    const vazio = new Array(totalDays).fill(0);
    const serie = (resumo && resumo.mes === monthValue && resumo.serie) ? resumo.serie : null;
    const feito = serie ? serie.feito.slice(0, totalDays) : vazio;
    const convertido = serie ? serie.convertido.slice(0, totalDays) : vazio.slice();
    const percent = feito.map((f, i) => (f > 0 ? Math.round((convertido[i] / f) * 1000) / 10 : 0));

    return {
      days: Array.from({ length: totalDays }, (_, i) => i + 1),
      feito,
      convertido,
      percent,
      totalFeito: feito.reduce((a, b) => a + b, 0),
      totalConvertido: convertido.reduce((a, b) => a + b, 0),
    };
  }, [resumo, monthValue]);

  const overallPercent = monthlySeries.totalFeito > 0
    ? Math.round((monthlySeries.totalConvertido / monthlySeries.totalFeito) * 1000) / 10
    : 0;

  if (checkingAuth) {
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
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
              <Image src="/logo.png" alt="NSMusic" width={32} height={32} style={{ height: '32px', width: 'auto' }} priority />
              <span style={{ fontSize: '1rem', color: '#0f172a', fontWeight: '800', letterSpacing: '-0.02em' }}>NS Music</span>
              <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '6px' }}>Admin</span>
            </Link>
            <nav aria-label="Seções do painel" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {[
                { href: '/admin', label: 'Pedidos', Icon: Package },
                { href: '/admin/dashboard', label: 'Dashboard', Icon: BarChart3, active: true },
                { href: '/admin/anuncios', label: 'Anúncios', Icon: Megaphone },
                { href: '/admin/cartas', label: 'Cartas', Icon: Mail },
              ].map(({ href, label, Icon, active }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  style={{ padding: '7px 13px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: active ? 700 : 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', color: active ? '#ffffff' : '#475569', backgroundColor: active ? '#0f172a' : 'transparent' }}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <UnificallyCreditsBadge />
            <KieCreditsBadge />
            <WhatsAppUsageBadge />
            <span style={{ fontSize: '0.84rem', color: '#475569', fontWeight: '600' }}>{user?.email}</span>
            <button type="button" onClick={handleLogout} style={{ ...styles.logoutBtn, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <LogOut size={14} aria-hidden="true" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px 0' }}>
        <div className="container" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Dashboard do mês</h1>
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

          {/* Resumo do mês: os três números que respondem 'como estamos' antes dos detalhes */}
          <div style={{ ...styles.metricsGrid, marginBottom: '24px' }}>
            {[
              { label: 'Músicas geradas no mês', valor: monthlySeries.totalFeito },
              { label: 'Convertidas em venda', valor: monthlySeries.totalConvertido },
              { label: 'Taxa de conversão', valor: `${String(overallPercent).replace('.', ',')}%` },
            ].map(item => (
              <div key={item.label} style={styles.metricCard}>
                <div style={styles.metricLabel}>{item.label}</div>
                <div style={{ ...styles.metricValue, fontVariantNumeric: 'tabular-nums' }}>{loadingOrders && orders.length === 0 ? '…' : item.valor}</div>
              </div>
            ))}
          </div>

          {/* Ritmo de Ganho Intradiário em Tempo Real (Hoje vs Média Líquida dos Últimos 7 Dias) */}
          {(erroResumo || montando) && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', background: erroResumo ? '#fef2f2' : '#eff6ff', color: erroResumo ? '#b91c1c' : '#1d4ed8', border: `1px solid ${erroResumo ? '#fecaca' : '#bfdbfe'}` }}>
              {erroResumo || 'Montando os dias do mês pela primeira vez… os números vão completando sozinhos.'}
            </div>
          )}

          <RitmoVendasCard pedidos={EMPTY_ORDERS} pace={resumo?.ritmo || null} loading={loadingOrders} />

          {/* Faturamento e conversões por plataforma (Facebook Ads, TikTok Ads, Orgânico, Direto) */}
          <VendasPorPlataformaCard monthValue={monthValue} pedidos={orders} loading={loadingOrders} resumo={resumo} />

          {/* Vendas por dia (+ faturamento líquido, gerações e conversão), mapa de calor por horário e mapa por estado */}
          <VendasPorDiaTable mes={monthValue} pedidos={orders} loading={loadingOrders} resumo={resumo} />
          <VendasPorHoraHeatmap mes={monthValue} pedidos={orders} loading={loadingOrders} resumo={resumo} />
          <VendasPorEstadoMapa mes={monthValue} pedidos={orders} loading={loadingOrders} resumo={resumo} />

          {/* Solicitações x Conversões por dia com rótulos de dados (no final da página) */}
          <div className="glass-card admin-card-responsive" style={{ marginTop: '32px', padding: '24px', borderRadius: '16px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Músicas Geradas x Conversões por dia</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 20px' }}>
              Barras: quantidade de músicas geradas e convertidas por dia. Linha: % de conversão do dia (eixo direito).
            </p>
            {loadingOrders && orders.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                <div style={{ ...styles.spinner, margin: '0 auto 12px' }} />
                Carregando gráfico mensal...
              </div>
            ) : (
              <ConversionChart series={monthlySeries} />
            )}
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

        {/* Barras: feito (azul) e convertido (verde), lado a lado por dia com rótulos */}
        {days.map((day, i) => {
          const cx = xForDay(i);
          const fH = plotHeight - (yForCount(feito[i]) - marginTop);
          const cH = plotHeight - (yForCount(convertido[i]) - marginTop);
          return (
            <g key={`bars-${i}`}>
              <title>{`Dia ${day}: ${feito[i]} música(s) gerada(s), ${convertido[i]} convertido(s) (${percent[i]}%)`}</title>
              <rect x={cx - barWidth - 1} y={yForCount(feito[i])} width={barWidth} height={Math.max(0, fH)} fill="#3b82f6" rx="1.5" />
              <rect x={cx + 1} y={yForCount(convertido[i])} width={barWidth} height={Math.max(0, cH)} fill="#10b981" rx="1.5" />
              {/* Rótulo de feito */}
              {feito[i] > 0 && (
                <text x={cx - barWidth / 2 - 1} y={Math.max(12, yForCount(feito[i]) - 3)} textAnchor="middle" fontSize="8" fontWeight="700" fill="#2563eb">
                  {feito[i]}
                </text>
              )}
              {/* Rótulo de convertido */}
              {convertido[i] > 0 && (
                <text x={cx + barWidth / 2 + 1} y={Math.max(12, yForCount(convertido[i]) - 3)} textAnchor="middle" fontSize="8" fontWeight="700" fill="#059669">
                  {convertido[i]}
                </text>
              )}
            </g>
          );
        })}

        {/* Linha de conversão (%) */}
        <polyline points={linePoints} fill="none" stroke="#d97706" strokeWidth="2.5" />
        {days.map((day, i) => (
          <g key={`dot-${i}`}>
            <circle cx={xForDay(i)} cy={yForPercent(percent[i])} r="3" fill="#d97706" />
            {percent[i] > 0 && (
              <text x={xForDay(i)} y={Math.max(12, yForPercent(percent[i]) - 6)} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#d97706">
                {percent[i]}%
              </text>
            )}
          </g>
        ))}
      </svg>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '12px', fontSize: '0.82rem', color: '#334155' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#3b82f6', display: 'inline-block' }} /> Músicas Geradas
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
      },
  metricLabel: { fontSize: '0.82rem', color: '#64748b', fontWeight: '600' },
  metricValue: { fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', margin: '8px 0 0' },
};
