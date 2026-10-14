'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, onAuthStateChanged, getAdminAuthToken } from '@/lib/authClient';
import AdsKpiCards from '@/components/admin/ads/AdsKpiCards';
import AdsTable from '@/components/admin/ads/AdsTable';
import MetaConfigModal from '@/components/admin/ads/MetaConfigModal';

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminAnunciosPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Filtros de Data
  const [preset, setPreset] = useState('hoje');
  const [dateRange, setDateRange] = useState(() => {
    const hoje = formatLocalDate(new Date());
    return { since: hoje, until: hoje };
  });

  // Busca e Dados
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    summary: {},
    ads: [],
    metaConnected: false,
    metaReason: null,
  });

  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [bannerUtmAberto, setBannerUtmAberto] = useState(true);

  // Verificação de autenticação admin
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser || auth.currentUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      }
    }, 1500);

    const unsubscribe = onAuthStateChanged(
      auth,
      (authUser) => {
        clearTimeout(timeout);
        if (!authUser || authUser.email !== 'narcisofelizardo@gmail.com') {
          router.push('/admin/login');
        } else {
          setUser(authUser);
          setCheckingAuth(false);
        }
      },
      () => {
        clearTimeout(timeout);
        router.push('/admin/login');
      }
    );

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  // Altera range conforme o preset
  const handleSelectPreset = (p) => {
    setPreset(p);
    const now = new Date();
    const hojeStr = formatLocalDate(now);

    if (p === 'hoje') {
      setDateRange({ since: hojeStr, until: hojeStr });
    } else if (p === 'ontem') {
      const ontem = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const ontemStr = formatLocalDate(ontem);
      setDateRange({ since: ontemStr, until: ontemStr });
    } else if (p === '7d') {
      const inicio = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setDateRange({ since: formatLocalDate(inicio), until: hojeStr });
    } else if (p === 'mes') {
      const primeiroDia = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateRange({ since: formatLocalDate(primeiroDia), until: hojeStr });
    } else if (p === 'mes_passado') {
      const primeiroDia = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const ultimoDia = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateRange({ since: formatLocalDate(primeiroDia), until: formatLocalDate(ultimoDia) });
    }
  };

  const carregarMetricas = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAdminAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const url = `/api/admin/ads-metrics?since=${encodeURIComponent(dateRange.since)}&until=${encodeURIComponent(dateRange.until)}`;
      const res = await fetch(url, { headers });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.ok) {
          setData({
            summary: json.summary || {},
            ads: json.ads || [],
            metaConnected: json.metaConnected,
            metaReason: json.metaReason,
          });
        }
      }
    } catch (err) {
      console.warn('[AdminAnuncios] Erro ao carregar métricas:', err.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    if (!checkingAuth) {
      carregarMetricas();
    }
  }, [checkingAuth, carregarMetricas]);

  // Filtra anúncios por termo de busca
  const adsFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return data.ads;
    const term = searchTerm.toLowerCase();
    return data.ads.filter((ad) =>
      String(ad.adName || '').toLowerCase().includes(term) ||
      String(ad.campaignName || '').toLowerCase().includes(term) ||
      String(ad.adsetName || '').toLowerCase().includes(term)
    );
  }, [data.ads, searchTerm]);

  if (checkingAuth) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0d14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
      }}>
        Verificando permissões de administrador...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#090d16',
      color: '#f8fafc',
      padding: '24px 28px',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      {/* Topo / Breadcrumb & Ações */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '20px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Link
              href="/admin/dashboard"
              style={{
                color: '#60a5fa',
                fontSize: '13px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ← Voltar ao Dashboard Geral
            </Link>
            <span style={{ color: '#475569' }}>•</span>
            <Link
              href="/admin"
              style={{ color: '#94a3b8', fontSize: '13px', textDecoration: 'none' }}
            >
              Pedidos
            </Link>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
            Gerenciador de Anúncios (ROI & CPA por Criativo)
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Acompanhe o retorno financeiro real de cada anúncio cruzando dados da Meta com vendas reais no banco.
          </p>
        </div>

        {/* Status da Conexão & Botões de Ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: data.metaConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${data.metaConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            color: data.metaConnected ? '#34d399' : '#fbbf24',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: data.metaConnected ? '#10b981' : '#f59e0b',
            }} />
            {data.metaConnected ? 'Meta API Conectada' : 'Meta API: Modo UTM / Aguardando Token'}
          </div>

          <button
            type="button"
            onClick={() => setModalConfigAberto(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚙️ Conectar Meta API
          </button>

          <button
            type="button"
            onClick={carregarMetricas}
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#2563eb',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Atualizando...' : '🔄 Atualizar'}
          </button>
        </div>
      </div>

      {/* Dica de Rastreamento Automático (Dismissible) */}
      {bannerUtmAberto && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
            💡 <strong>Dica para rastreamento 100% automático:</strong> No gerenciador do Facebook Ads, configure os <em>Parâmetros de URL</em> do anúncio como:
            <code style={{
              background: '#0f172a',
              padding: '3px 8px',
              borderRadius: '6px',
              marginLeft: '8px',
              color: '#60a5fa',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}>
              utm_source=facebook&amp;utm_campaign={'{'}{'{'}campaign.name{'}'}{'}'}&amp;utm_content={'{'}{'{'}ad.name{'}'}{'}'}
            </code>
          </div>
          <button
            type="button"
            onClick={() => setBannerUtmAberto(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Barra de Filtro de Período & Busca */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {/* Presets de data */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'hoje', label: 'Hoje' },
            { id: 'ontem', label: 'Ontem' },
            { id: '7d', label: 'Últimos 7 dias' },
            { id: 'mes', label: 'Este Mês' },
            { id: 'mes_passado', label: 'Mês Passado' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectPreset(item.id)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                border: preset === item.id ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                background: preset === item.id ? 'rgba(59, 130, 246, 0.2)' : '#131823',
                color: preset === item.id ? '#60a5fa' : '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Campo de Busca por Anúncio/Campanha */}
        <div style={{ minWidth: '260px', flex: '1', maxWidth: '360px' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por nome do anúncio ou campanha..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#131823',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Cards de KPIs Consolidados */}
      <AdsKpiCards summary={data.summary} loading={loading} />

      {/* Tabela de Anúncios Estilo Meta Ads */}
      <div style={{ marginTop: '16px' }}>
        <AdsTable ads={adsFiltrados} summary={data.summary} loading={loading} />
      </div>

      {/* Modal de Conexão da Meta API */}
      <MetaConfigModal
        isOpen={modalConfigAberto}
        onClose={() => setModalConfigAberto(false)}
        onSaved={carregarMetricas}
      />
    </div>
  );
}
