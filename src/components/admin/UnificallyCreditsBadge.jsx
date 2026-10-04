'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

/**
 * Badge compacto que exibe em tempo real o saldo de créditos da Unifically
 * no cabeçalho do painel de administração.
 */
export default function UnificallyCreditsBadge({ style = {} }) {
  const [balance, setBalance] = useState(null);
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCredits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAdminAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/unifically-credits', { headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setBalance(data.balance_usd);
        setEmail(data.email);
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

  const isLow = balance !== null && balance <= 5;
  const isCritical = balance !== null && balance <= 1;

  let bg = '#f8fafc';
  let border = '#e2e8f0';
  let textColor = '#0f172a';
  let icon = '💎';

  if (loading && balance === null) {
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
  } else if (balance !== null) {
    bg = '#eef2ff';
    border = '#c7d2fe';
    textColor = '#4338ca';
    icon = '💎';
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
          ? `Erro ao consultar saldo da Unifically: ${error}`
          : balance !== null
            ? `Saldo da Unifically: $${Number(balance).toFixed(2)} USD${email ? ` (${email})` : ''}`
            : 'Consultando saldo na Unifically...'
      }
    >
      <span>{icon}</span>
      <span>Unifically:</span>
      {loading ? (
        <span style={{ color: '#94a3b8' }}>...</span>
      ) : error ? (
        <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>Erro</span>
      ) : balance !== null ? (
        <strong style={{ fontWeight: '800' }}>
          ${Number(balance).toFixed(2)}
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
        title="Atualizar saldo da Unifically agora"
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
