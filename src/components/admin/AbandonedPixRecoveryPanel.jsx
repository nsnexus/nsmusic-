'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';
import RecoveryStatCards from './recovery/RecoveryStatCards';
import RecoveryMetaTemplateBox from './recovery/RecoveryMetaTemplateBox';
import RecoveryOrdersTable from './recovery/RecoveryOrdersTable';

export default function AbandonedPixRecoveryPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerFeedback, setTriggerFeedback] = useState(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getAdminAuthToken();
      const res = await fetch('/api/admin/recovery-metrics', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Erro HTTP ${res.status}`);
      setMetrics(data.metrics || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handleToggle = async () => {
    if (!metrics || toggling) return;
    const novoStatus = !metrics.enabled;
    setToggling(true);
    try {
      const token = await getAdminAuthToken();
      const res = await fetch('/api/admin/recovery-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'toggle', enabled: novoStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao alterar status.');
      setMetrics((prev) => ({ ...prev, enabled: novoStatus }));
    } catch (err) {
      alert(`Falha ao alterar status: ${err.message}`);
    } finally {
      setToggling(false);
    }
  };

  const handleTriggerNow = async () => {
    if (triggering) return;
    const confirm = window.confirm(
      'Deseja disparar a verificação de pedidos agora?\nO sistema vai buscar pedidos pendentes entre 1h e 24h atrás que clicaram em pagar e nunca compraram nada.'
    );
    if (!confirm) return;

    setTriggering(true);
    setTriggerFeedback(null);
    try {
      const token = await getAdminAuthToken();
      const res = await fetch('/api/admin/recovery-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'trigger_now' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao executar verificação.');
      setTriggerFeedback(data.result);
      if (data.metrics) setMetrics(data.metrics);
      else await fetchMetrics();
    } catch (err) {
      alert(`Erro na execução: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
        <p style={{ margin: 0, fontWeight: '600' }}>Carregando dados de recuperação de PIX...</p>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#991b1b', margin: '20px 0' }}>
        <p style={{ fontWeight: '700', margin: '0 0 6px' }}>Erro ao carregar painel de recuperação</p>
        <p style={{ margin: '0 0 16px', fontSize: '0.85rem' }}>{error}</p>
        <button
          type="button"
          onClick={fetchMetrics}
          style={{ padding: '8px 16px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const isEnabled = metrics?.enabled === true;

  return (
    <div style={{ padding: '4px 0 32px' }}>
      {/* Top Header Card with Controls */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h2 style={{ margin: 0, fontSize: '1.28rem', fontWeight: '700', color: '#0f172a' }}>
              💬 Recuperação de PIX Abandonado
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '3px 8px',
                borderRadius: '6px',
                background: isEnabled ? '#dcfce7' : '#fef3c7',
                color: isEnabled ? '#15803d' : '#b45309',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isEnabled ? '#16a34a' : '#d97706',
                }}
              />
              {isEnabled ? 'AUTOMAÇÃO ATIVA (A CADA 1H)' : 'AUTOMAÇÃO PAUSADA'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b', maxWidth: '620px' }}>
            Notifica automaticamente clientes que geraram ou copiaram o PIX nas últimas 24h mas não pagaram.
            <strong> Exclui rigorosamente quem já comprou antes</strong> e limita a {metrics?.maxPerHour || 15} mensagens/hora para segurança.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Switch Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#475569' }}>Envio Automático:</span>
            <button
              type="button"
              onClick={handleToggle}
              disabled={toggling}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: isEnabled ? '#16a34a' : '#94a3b8',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.78rem',
                cursor: toggling ? 'not-allowed' : 'pointer',
                opacity: toggling ? 0.7 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {toggling ? 'Salvando...' : isEnabled ? 'LIGADO' : 'DESLIGADO'}
            </button>
          </div>

          {/* Trigger Now Button */}
          <button
            type="button"
            onClick={handleTriggerNow}
            disabled={triggering}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.84rem',
              cursor: triggering ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: triggering ? 0.7 : 1,
              boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
              transition: 'all 0.15s ease',
            }}
          >
            {triggering ? '⚡ Verificando Pedidos...' : '⚡ Executar Verificação Agora'}
          </button>
        </div>
      </div>

      {/* Trigger Feedback Banner */}
      {triggerFeedback && (
        <div
          style={{
            background: triggerFeedback.sentCount > 0 ? '#ecfdf5' : '#f8fafc',
            border: `1px solid ${triggerFeedback.sentCount > 0 ? '#a7f3d0' : '#e2e8f0'}`,
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '24px',
            color: '#1e293b',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '0.9rem', color: triggerFeedback.sentCount > 0 ? '#065f46' : '#334155' }}>
              Resultado da Execução:
            </span>
            <button
              type="button"
              onClick={() => setTriggerFeedback(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '0.82rem', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span><strong>Candidatos avaliados:</strong> {triggerFeedback.candidatesFound ?? 0}</span>
            <span><strong>Leads únicos elegíveis:</strong> {triggerFeedback.eligibleLeads ?? 0}</span>
            <span><strong>Excluídos (já compraram antes):</strong> {triggerFeedback.excludedPriorPurchasesCount ?? 0}</span>
            <span style={{ color: '#059669' }}><strong>Mensagens enviadas com sucesso:</strong> {triggerFeedback.sentCount ?? 0}</span>
            {triggerFeedback.failedCount > 0 && (
              <span style={{ color: '#dc2626' }}><strong>Falhas de envio:</strong> {triggerFeedback.failedCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <RecoveryStatCards metrics={metrics} />

      {/* Meta Cloud API Template Box */}
      <RecoveryMetaTemplateBox whatsappSuporte={metrics?.whatsappSuporte} />

      {/* Orders Table */}
      <RecoveryOrdersTable
        recentRecovered={metrics?.recentRecovered || []}
        recentSent={metrics?.recentSent || []}
      />
    </div>
  );
}

