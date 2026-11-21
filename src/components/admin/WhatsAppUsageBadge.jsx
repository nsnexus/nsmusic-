'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

/**
 * Error boundary local para garantir que nenhuma falha no badge
 * cause erro de renderização na página administrativa.
 */
class WhatsAppUsageBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    console.warn('[WhatsAppUsageBadge] Erro capturado no badge:', err);
  }
  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

/**
 * Medidor visual de volumetria e custos de mensagens do WhatsApp Cloud API Oficial.
 * Exibe no cabeçalho do painel de administração:
 * - Quantidade de envios na janela móvel de 24h vs Limite da Meta (Tier 250 / 1.000)
 * - Custo acumulado estimado em R$ (baseado nos centavos por mensagem da Meta)
 * - Alerta visual quando o limite de mensagens estiver próximo de estourar
 */
function WhatsAppUsageBadgeInner({ style = {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openModal, setOpenModal] = useState(false);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAdminAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/whatsapp-usage', { headers });
      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.ok) {
        setData(resData);
      } else {
        setError(resData.error || 'Falha ao consultar');
      }
    } catch (err) {
      setError(err.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    // Atualiza a cada 3 minutos automaticamente
    const interval = setInterval(fetchUsage, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  const isOver = Boolean(data?.isOverLimit);
  const isNear = Boolean(data?.isNearLimit);

  let bg = '#f0fdf4';
  let border = '#bbf7d0';
  let textColor = '#166534';
  let icon = '💬';

  if (loading && !data) {
    textColor = '#64748b';
  } else if (error) {
    bg = '#fef2f2';
    border = '#fecaca';
    textColor = '#dc2626';
    icon = '⚠️';
  } else if (isOver) {
    bg = '#fef2f2';
    border = '#f87171';
    textColor = '#b91c1c';
    icon = '🚨';
  } else if (isNear) {
    bg = '#fffbeb';
    border = '#fde68a';
    textColor = '#b45309';
    icon = '⚠️';
  }

  const formatBrl = (val) =>
    Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Custo real da Meta quando disponível; senão a estimativa antiga (marcada com "~").
  const real = data?.custoReal || null;
  const custoHoje = real ? real.hoje.custoBrl : data?.costTodayBrl;
  const custoMes = real ? real.mes.custoBrl : data?.costMonthBrl;
  const NOMES_CATEGORIA = { MARKETING: 'Marketing', UTILITY: 'Utilidade', SERVICE: 'Atendimento', AUTHENTICATION: 'Autenticação' };
  const categoriasHoje = real ? Object.entries(real.hoje.porCategoria).sort((a, b) => b[1].custoBrl - a[1].custoBrl) : [];

  return (
    <>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 12px',
          borderRadius: '20px',
          background: bg,
          border: `1px solid ${border}`,
          fontSize: '0.8rem',
          fontWeight: '600',
          color: textColor,
          cursor: 'pointer',
          userSelect: 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          transition: 'all 0.2s ease',
          ...style,
        }}
        onClick={() => setOpenModal(true)}
        title="Clique para ver o detalhamento de envios e custos do WhatsApp"
      >
        <span>{icon}</span>
        {loading && !data ? (
          <span>Carregando WA...</span>
        ) : error && !data ? (
          <span>WA: {error}</span>
        ) : !data ? (
          <span>Carregando WA...</span>
        ) : (
          <span>
            WA hoje: <strong>{real ? '' : '~'}{formatBrl(custoHoje)}</strong>{' '}
            <span style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: '500' }}>
              ({real ? `${real.hoje.pagas} pagas` : `${data.sentToday ?? 0} msgs`})
            </span>
          </span>
        )}
      </div>

      {/* Modal de Detalhamento de Custos e Limites */}
      {openModal && data && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setOpenModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              position: 'relative',
              color: '#1e293b',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>📊</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>
                    Medidor de WhatsApp Cloud API
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Número Oficial: {data.displayPhone || 'Oficial'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Alerta de saúde do número (segundo a Meta) */}
            {data.isOverLimit && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #f87171', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#991b1b', lineHeight: '1.4' }}>
                <strong>🚨 A Meta está limitando os envios deste número.</strong>
                <br />
                Situação: {data.canSendMessage}. Qualidade: {data.qualityRating}.
              </div>
            )}

            {/* Custo de hoje por categoria (valores da Meta) */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '8px', color: '#0f172a' }}>
                Hoje por tipo de mensagem {real ? '(valores da Meta)' : ''}
              </div>
              {real ? (
                categoriasHoje.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Nenhuma mensagem cobrada hoje até agora.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {categoriasHoje.map(([cat, v]) => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '7px 10px', borderRadius: '8px', background: cat === 'MARKETING' ? '#fff7ed' : '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <span>
                          <strong>{NOMES_CATEGORIA[cat] || cat}</strong>{' '}
                          <span style={{ color: '#64748b' }}>· {v.volume} msgs{v.gratis ? ` (${v.gratis} grátis)` : ''}</span>
                        </span>
                        <strong>{formatBrl(v.custoBrl)}</strong>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div style={{ fontSize: '0.78rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px' }}>
                  A Meta não devolveu o custo real agora. Os valores abaixo são estimativa (R$ 0,035 por mensagem).
                </div>
              )}
            </div>

            {/* Grid de Cards de Estatísticas e Custos */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
                  Enviadas (24h)
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                  {data.sentLast24h ?? 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  todas as mensagens, pagas e grátis
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
                  {real ? 'Custo de hoje (Meta)' : 'Custo estimado (hoje)'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                  {formatBrl(custoHoje)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  {real ? `${real.hoje.pagas} pagas · ${real.hoje.gratis} grátis` : `${data.sentToday ?? 0} disparos desde 00:00`}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
                  {real ? 'Mês (Meta)' : 'Acumulado no mês (estimativa)'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                  {formatBrl(custoMes)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  {data.sentMonth ?? 0} mensagens enviadas
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
                  Qualidade da Conta
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: data.qualityRating === 'GREEN' ? '#22c55e' : '#f59e0b',
                    }}
                  />
                  <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                    {data.qualityRating === 'GREEN' ? 'Excelente' : data.qualityRating || 'OK'}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  Status: {data.status || 'CONECTADO'}
                </div>
              </div>
            </div>

            {/* Ações do Rodapé */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: '1px solid #f1f5f9',
              }}
            >
              <button
                type="button"
                onClick={fetchUsage}
                disabled={loading}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                🔄 {loading ? 'Atualizando...' : 'Atualizar Dados'}
              </button>

              <button
                type="button"
                onClick={() => setOpenModal(false)}
                style={{
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 16px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function WhatsAppUsageBadge(props) {
  return (
    <WhatsAppUsageBoundary>
      <WhatsAppUsageBadgeInner {...props} />
    </WhatsAppUsageBoundary>
  );
}
