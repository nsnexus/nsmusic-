'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

/**
 * Badge compacto que exibe em tempo real o saldo de créditos da Kie.ai
 * no cabeçalho do painel de administração.
 */
export default function KieCreditsBadge({ style = {} }) {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCredits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAdminAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/kie-credits', { headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setCredits(data.credits);
      } else {
        setError(data.error || 'Falha ao consultar');
      }
    } catch (err) {
      setError(err.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const isLow = credits !== null && credits <= 100;
  const isCritical = credits !== null && credits <= 25;

  let bg = '#f8fafc';
  let border = '#e2e8f0';
  let textColor = '#0f172a';
  let icon = '⚡';

  if (loading && credits === null) {
    textColor = '#64748b';
  } else if (error) {
    bg = '#fef2f2';
    border = '#fecaca';
    textColor = '#dc2626';
    icon = '⚠️';
  } else if (isCritical) {
    bg = '#fef2f2';
    border = '#f87171';
    textColor = '#b91c1c';
    icon = '🚨';
  } else if (isLow) {
    bg = '#fffbeb';
    border = '#fde68a';
    textColor = '#b45309';
    icon = '⚠️';
  } else if (credits !== null) {
    bg = '#f5f3ff';
    border = '#ddd6fe';
    textColor = '#6d28d9';
    icon = '⚡';
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 10px',
        borderRadius: '8px',
        backgroundColor: bg,
        border: `1px solid ${border}`,
        fontSize: '0.8rem',
        fontWeight: '600',
        color: textColor,
        whiteSpace: 'nowrap',
        transition: 'all 0.2s',
        ...style,
      }}
      title={
        error
          ? `Erro ao consultar créditos da Kie.ai: ${error}`
          : credits !== null
            ? `Saldo da Kie.ai: ${credits.toLocaleString('pt-BR')} créditos disponíveis`
            : 'Consultando saldo na Kie.ai...'
      }
    >
      <span>{icon}</span>
      <span>Kie.ai:</span>
      {loading ? (
        <span style={{ color: '#94a3b8' }}>...</span>
      ) : error ? (
        <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>Erro</span>
      ) : credits !== null ? (
        <strong style={{ fontWeight: '800' }}>
          {credits.toLocaleString('pt-BR')} cr
          {isCritical ? ' (Crítico!)' : isLow ? ' (Baixo!)' : ''}
        </strong>
      ) : (
        <span style={{ color: '#94a3b8' }}>—</span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          fetchCredits();
        }}
        disabled={loading}
        title="Atualizar saldo de créditos agora"
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0 2px',
          marginLeft: '2px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '0.75rem',
          opacity: loading ? 0.4 : 0.7,
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        🔄
      </button>
    </div>
  );
}
