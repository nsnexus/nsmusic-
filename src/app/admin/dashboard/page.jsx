'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged, signOut } from '@/lib/authClient';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useResumoMes } from '@/lib/useResumoMes';
import { diaSp } from '@/lib/relogioSp';
import KieCreditsBadge from '@/components/admin/KieCreditsBadge';
import UnificallyCreditsBadge from '@/components/admin/UnificallyCreditsBadge';
import WhatsAppUsageBadge from '@/components/admin/WhatsAppUsageBadge';
import ComoEstaODia from '@/components/admin/ComoEstaODia';
import RoasCard from '@/components/admin/RoasCard';
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

const VendasPorPlataformaCard = dynamic(() => import('@/components/VendasPorPlataformaCard'), { ssr: false });
const RitmoVendasCard = dynamic(() => import('@/components/RitmoVendasCard'), { ssr: false });

// Lista vazia estável (os cards recebem o resumo pronto; não há pedidos no navegador).
const EMPTY_ORDERS = [];

const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['mes', 'Mês todo']];

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [periodo, setPeriodo] = useState('hoje');
  const [monthValue, setMonthValue] = useState(() => diaSp().slice(0, 7));
  const [compararRitmo, setCompararRitmo] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [mostrarSaldos, setMostrarSaldos] = useState(false);

  const { resumo, loading: loadingResumo, erro: erroResumo, montando } = useResumoMes(
    checkingAuth ? null : periodo,
    periodo === 'mes' ? monthValue : null,
    tentativa
  );
  const ritmo = useResumoMes(resumo && periodo === 'hoje' && compararRitmo ? 'ritmo' : null);

  const router = useRouter();

  useEffect(() => {
    if (resumo || erroResumo) setMostrarSaldos(true);
  }, [resumo, erroResumo]);

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

  const monthlySeries = useMemo(() => {
    const { feito = [], convertido = [] } = resumo?.serie || {};
    const percent = feito.map((f, i) => (f > 0 ? Math.round((convertido[i] / f) * 1000) / 10 : 0));

    return {
      days: resumo?.dias || [],
      feito,
      convertido,
      percent,
      totalFeito: feito.reduce((a, b) => a + b, 0),
      totalConvertido: convertido.reduce((a, b) => a + b, 0),
    };
  }, [resumo]);

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
            {mostrarSaldos && (
              <>
                <UnificallyCreditsBadge />
                <KieCreditsBadge />
                <WhatsAppUsageBadge />
              </>
            )}
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
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Dashboard de vendas</h1>
            <div role="group" aria-label="Período do dashboard" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {PERIODOS.map(([valor, label]) => (
                <button
                  type="button"
                  key={valor}
                  aria-pressed={periodo === valor}
                  onClick={() => { setCompararRitmo(false); setPeriodo(valor); }}
                  style={{ ...styles.tabBtn, background: periodo === valor ? '#0f172a' : '#ffffff', color: periodo === valor ? '#ffffff' : '#334155' }}
                >
                  {label}
                </button>
              ))}
            </div>
            {periodo === 'mes' && (
              <input
                aria-label="Mês do dashboard"
                type="month"
                value={monthValue}
                max={diaSp().slice(0, 7)}
                onChange={(e) => { if (e.target.value) setMonthValue(e.target.value); }}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#0f172a' }}
              />
            )}
          </div>

          {periodo === 'hoje' && <ComoEstaODia />}
          {periodo !== 'ritmo' && (
            <div style={{ marginBottom: '24px' }}>
              <RoasCard mes={periodo === 'mes' ? monthValue : diaSp().slice(0, 7)} />
            </div>
          )}

          {resumo?.dia && (
            <time dateTime={resumo.dia} style={{ display: 'block', color: '#475569', marginBottom: '12px' }}>
              {resumo.dia.split('-').reverse().join('/')}
            </time>
          )}

          <div style={{ ...styles.metricsGrid, marginBottom: '24px' }} aria-busy={loadingResumo}>
            {[
              { label: 'Músicas geradas', valor: monthlySeries.totalFeito },
              { label: 'Convertidas em venda', valor: monthlySeries.totalConvertido },
              { label: 'Taxa de conversão', valor: `${String(overallPercent).replace('.', ',')}%` },
            ].map(item => (
              <div key={item.label} style={{ ...styles.metricCard, padding: 'clamp(10px, 2vw, 20px)' }}>
                <div style={styles.metricLabel}>{item.label}</div>
                <div style={{ ...styles.metricValue, fontVariantNumeric: 'tabular-nums' }}>{resumo ? item.valor : '—'}</div>
              </div>
            ))}
          </div>

          {resumo?.diag && monthlySeries.totalFeito === 0 && monthlySeries.totalConvertido > 0 && (
            <p style={{ margin: '-12px 0 20px', fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              diagnóstico: lidos {resumo.diag.pedidos} · criados no dia {resumo.diag.criadosNoDia} · com música {resumo.diag.criadosComMusica} · pagos no dia {resumo.diag.pagosNoDia} · datas inválidas {resumo.diag.datasInvalidas} · ex. {resumo.diag.exemploCriadoEm}
            </p>
          )}

          {(loadingResumo || erroResumo || montando) && (
            <div role={erroResumo ? 'alert' : 'status'} style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', background: erroResumo ? '#fef2f2' : '#eff6ff', color: erroResumo ? '#b91c1c' : '#1d4ed8' }}>
              {erroResumo || (montando ? 'Carregando os dias restantes do mês…' : 'Carregando dados do período…')}
              {erroResumo && (
                <button type="button" onClick={() => setTentativa(t => t + 1)} style={{ ...styles.tabBtn, marginLeft: '8px', background: '#ffffff', color: '#334155' }}>
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          {resumo && (
            <>
              <section style={{ ...styles.metricCard, marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>{resumo.dia ? 'Vendas por horário' : 'Músicas geradas e convertidas por dia'}</h2>
                {resumo.dia && <p style={{ color: '#475569', margin: '0 0 16px' }}>Músicas e adicionais pelo horário do pagamento.</p>}
                {resumo.dia ? <VendasPorHorario horas={resumo.horas} /> : <ConversionChart series={monthlySeries} />}
              </section>

              {periodo === 'hoje' && (
                <>
                  <button
                    type="button"
                    aria-expanded={compararRitmo}
                    onClick={() => setCompararRitmo(!compararRitmo)}
                    style={{ ...styles.tabBtn, background: '#ffffff', color: '#334155' }}
                  >
                    {compararRitmo ? 'Fechar comparação' : 'Comparar com os últimos 7 dias'}
                  </button>
                  {ritmo.erro && <p role="alert">{ritmo.erro}</p>}
                  {compararRitmo && !ritmo.erro && (
                    <RitmoVendasCard pedidos={EMPTY_ORDERS} pace={ritmo.resumo?.ritmo || null} loading={ritmo.loading} />
                  )}
                </>
              )}

              <VendasPorPlataformaCard monthValue={resumo.mes} pedidos={EMPTY_ORDERS} resumo={resumo} dataSelecionada={resumo.dia} onVerMes={() => setPeriodo('mes')} />
              <VendasPorDiaTable mes={resumo.mes} pedidos={EMPTY_ORDERS} resumo={resumo} />
              {!resumo.dia && <VendasPorHoraHeatmap mes={resumo.mes} pedidos={EMPTY_ORDERS} resumo={resumo} />}
              <VendasPorEstadoMapa mes={resumo.mes} pedidos={EMPTY_ORDERS} resumo={resumo} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function VendasPorHorario({ horas }) {
  const max = Math.max(...horas);
  if (!max) return <p style={{ color: '#475569', margin: 0 }}>Nenhuma venda registrada neste dia.</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: '3px' }}>
      {horas.map((vendas, hora) => {
        const label = `${String(hora).padStart(2, '0')}h`;
        return (
          <div key={hora} style={{ minWidth: 0, textAlign: 'center' }}>
            <div role="img" aria-label={`${label}, ${vendas} vendas`} title={`${label} · ${vendas} vendas`} style={{ height: '132px', display: 'flex', alignItems: 'end', borderBottom: '1px solid #cbd5e1' }}>
              <span style={{ display: 'block', width: '100%', height: `${(vendas / max) * 100}%`, background: '#7c3aed', borderRadius: '3px 3px 0 0' }} />
            </div>
            {hora % 4 === 0 && <span aria-hidden="true" style={{ display: 'block', marginTop: '6px', color: '#475569', fontSize: '0.75rem' }}>{label}</span>}
          </div>
        );
      })}
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
    border: '1px solid #cbd5e1',
    minHeight: '44px',
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
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 'clamp(8px, 2vw, 20px)',
  },
  metricCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    padding: '20px',
      },
  metricLabel: { fontSize: '0.82rem', color: '#64748b', fontWeight: '600' },
  metricValue: { fontSize: 'clamp(1.15rem, 4.5vw, 1.8rem)', fontWeight: '800', color: '#0f172a', margin: '8px 0 0' },
};
