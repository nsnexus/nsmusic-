'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

/**
 * Medidor visual de volumetria e custos de mensagens do WhatsApp Cloud API Oficial.
 * Exibe no cabeçalho do painel de administração:
 * - Quantidade de envios na janela móvel de 24h vs Limite da Meta (Tier 250 / 1.000)
 * - Custo acumulado estimado em R$ (baseado nos centavos por mensagem da Meta)
 * - Alerta visual quando o limite de mensagens estiver próximo de estourar
 */
export default function WhatsAppUsageBadge({ style = {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
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

  const isOver = data?.isOverLimit;
  const isNear = data?.isNearLimit;

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
        ) : error ? (
          <span>WA: {error}</span>
        ) : (
          <span>
            WA: <strong>{data.sentLast24h}</strong>/{data.limitTier}{' '}
            <span style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: '500' }}>
              ({formatBrl(data.costLast24hBrl)})
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
                    Número Oficial: {data.displayPhone}
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

            {/* Alerta de Limite */}
            {data.isOverLimit && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #f87171',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '0.82rem',
                  color: '#991b1b',
                  lineHeight: '1.4',
                }}
              >
                <strong>🚨 Limite de mensagens atingido!</strong>
                <br />
                Sua conta enviou {data.sentLast24h} mensagens no período de 24h (teto da Meta: {data.limitTier}). Novos envios liberam gradualmente conforme as mensagens antigas completam 24h.
              </div>
            )}

            {/* Barra de Progresso do Limite */}
            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  marginBottom: '6px',
                }}
              >
                <span>Uso da Janela Móvel (24 horas)</span>
                <span style={{ color: isOver ? '#dc2626' : isNear ? '#d97706' : '#16a34a' }}>
                  {data.sentLast24h} / {data.limitTier} ({data.usagePercent}%)
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '10px',
                  backgroundColor: '#e2e8f0',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, (data.sentLast24h / data.limitTier) * 100)}%`,
                    height: '100%',
                    backgroundColor: isOver ? '#ef4444' : isNear ? '#f59e0b' : '#22c55e',
                    borderRadius: '6px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
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
                  Custo Estimado (24h)
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                  {formatBrl(data.costLast24hBrl)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  {data.sentLast24h} disparos (~R$ 0,19/msg)
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
                  Custo Estimado (Hoje)
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                  {formatBrl(data.costTodayBrl)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  {data.sentToday} disparos desde 00:00
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
                  Acumulado no Mês
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                  {formatBrl(data.costMonthBrl)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  {data.sentMonth} mensagens enviadas
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
                    {data.qualityRating === 'GREEN' ? 'Excelente' : data.qualityRating}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  Status: {data.status}
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
