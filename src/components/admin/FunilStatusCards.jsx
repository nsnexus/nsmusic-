'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';
import { hasMusicaGerada } from '@/lib/stats';

/**
 * FunilStatusCards
 * Exibe os cards do funil de conversão e abandono por etapa, incluindo:
 * - Acessos ao site (visitantes únicos) por plataforma
 * - Pedidos parados em cada etapa (Etapa 1, 2, 3, 4, Letra Gerada, Áudio Gerado)
 * - Pedidos Pagos / Concluídos
 * - Percentual sobre o total e taxa de desistência
 * - Filtro interativo por clique que conecta com a tabela de pedidos abaixo
 */
export default function FunilStatusCards({
  orders = [],
  dateFrom = '',
  dateTo = '',
  reloadTrigger = 0,
  activeProductionFilter = 'ALL',
  onSelectProductionFilter,
  activePaymentFilter = 'ALL',
  onSelectPaymentFilter,
}) {
  const [visitsData, setVisitsData] = useState({ total: 0, byPlatform: {}, loaded: false });

  // Busca contador de visitas único por período de forma incremental
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const token = await getAdminAuthToken();
        const params = new URLSearchParams();
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);

        const res = await fetch(`/api/analytics/visit?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (res.ok) {
          const json = await res.json();
          if (ativo && json?.ok) {
            setVisitsData({
              total: typeof json.total === 'number' ? json.total : 0,
              byPlatform: json.byPlatform || {},
              loaded: true,
            });
          }
        }
      } catch (e) {
        // Fallback silencioso
      }
    })();
    return () => { ativo = false; };
  }, [dateFrom, dateTo, reloadTrigger]);

  // Cálculos do Funil em memória (instantâneo, 0 requisições extras)
  const stats = useMemo(() => {
    const totalOrders = orders.length;

    let etapa1 = 0;
    let etapa2 = 0;
    let etapa3 = 0;
    let etapa4 = 0;
    let letraGerada = 0;
    let emProducao = 0;
    let audioGerado = 0;
    let pagos = 0;
    let musicasGeradas = 0;

    for (const o of orders) {
      if (hasMusicaGerada(o)) {
        musicasGeradas++;
      }

      const isPaid = o.paymentStatus === 'PAGO' || o.paymentStatus === 'PAGAMENTO_APROVADO';
      if (isPaid) {
        pagos++;
        continue;
      }

      const st = o.productionStatus;
      if (st === 'ETAPA_1') etapa1++;
      else if (st === 'ETAPA_2') etapa2++;
      else if (st === 'ETAPA_3') etapa3++;
      else if (st === 'ETAPA_4') etapa4++;
      else if (st === 'LETRA_GERADA') letraGerada++;
      else if (st === 'EM_PRODUCAO' || st === 'LETRA_APROVADA' || st === 'VERSOES_EM_PRODUCAO') emProducao++;
      else if (st === 'AUDIO_GERADO') audioGerado++;
      else if (st === 'FINALIZADO' || st === 'ENTREGUE') pagos++;
      else etapa1++; // Fallback seguro
    }

    const calcPct = (num) => {
      if (!totalOrders) return '0%';
      return ((num / totalOrders) * 100).toFixed(1) + '%';
    };

    // Percentual de conversão sobre o total de pedidos com músicas geradas
    const totalComMusica = musicasGeradas > 0 ? musicasGeradas : (audioGerado + pagos);
    const pctConversaoMusica = totalComMusica > 0 ? ((pagos / totalComMusica) * 100).toFixed(1) + '%' : '0%';

    return {
      totalOrders,
      totalComMusica,
      etapa1,
      etapa2,
      etapa3,
      etapa4,
      letraGerada,
      emProducao,
      audioGerado,
      pagos,
      pctEtapa1: calcPct(etapa1),
      pctEtapa2: calcPct(etapa2),
      pctEtapa3: calcPct(etapa3),
      pctEtapa4: calcPct(etapa4),
      pctLetra: calcPct(letraGerada),
      pctProducao: calcPct(emProducao),
      pctAudio: calcPct(audioGerado),
      pctPagos: pctConversaoMusica,
    };
  }, [orders]);

  const totalAcessos = Math.max(visitsData.total, stats.totalOrders);
  const taxaEntradaSite = totalAcessos > 0 ? ((stats.totalOrders / totalAcessos) * 100).toFixed(1) + '%' : '100%';

  const handleCardClick = (targetType, value) => {
    if (targetType === 'PAYMENT') {
      if (activePaymentFilter === value) {
        if (onSelectPaymentFilter) onSelectPaymentFilter('ALL');
      } else {
        if (onSelectProductionFilter) onSelectProductionFilter('ALL');
        if (onSelectPaymentFilter) onSelectPaymentFilter(value);
      }
    } else if (targetType === 'PRODUCTION') {
      if (activeProductionFilter === value) {
        if (onSelectProductionFilter) onSelectProductionFilter('ALL');
      } else {
        if (onSelectPaymentFilter) onSelectPaymentFilter('ALL');
        if (onSelectProductionFilter) onSelectProductionFilter(value);
      }
    }
  };

  const cards = [
    {
      id: 'visits',
      type: 'INFO',
      title: 'Acessos ao Site',
      icon: '👀',
      count: totalAcessos,
      badge: 'Visitantes',
      badgeColor: '#e0f2fe',
      badgeTextColor: '#0369a1',
      desc: visitsData.total > 0
        ? `Meta: ${visitsData.byPlatform.facebook_ads || 0} • TikTok: ${visitsData.byPlatform.tiktok_ads || 0} • Outros: ${(visitsData.byPlatform.organico || 0) + (visitsData.byPlatform.direto || 0)}`
        : 'Rastreando novos acessos...',
      highlight: false,
      clickable: false,
      borderAccent: '#38bdf8',
    },
    {
      id: 'etapa1',
      type: 'PRODUCTION',
      value: 'ETAPA_1',
      title: 'Etapa 1',
      sub: 'Nome Homenageado',
      icon: '👤',
      count: stats.etapa1,
      pct: stats.pctEtapa1,
      badge: 'Pararam no início',
      badgeColor: '#f1f5f9',
      badgeTextColor: '#475569',
      active: activeProductionFilter === 'ETAPA_1',
      borderAccent: '#94a3b8',
    },
    {
      id: 'etapa2',
      type: 'PRODUCTION',
      value: 'ETAPA_2',
      title: 'Etapa 2',
      sub: 'Estilo Musical',
      icon: '🎵',
      count: stats.etapa2,
      pct: stats.pctEtapa2,
      badge: 'Pararam no estilo',
      badgeColor: '#f1f5f9',
      badgeTextColor: '#475569',
      active: activeProductionFilter === 'ETAPA_2',
      borderAccent: '#a855f7',
    },
    {
      id: 'etapa3',
      type: 'PRODUCTION',
      value: 'ETAPA_3',
      title: 'Etapa 3',
      sub: 'História & Memórias',
      icon: '📖',
      count: stats.etapa3,
      pct: stats.pctEtapa3,
      badge: 'Pararam na história',
      badgeColor: '#fef3c7',
      badgeTextColor: '#b45309',
      active: activeProductionFilter === 'ETAPA_3',
      borderAccent: '#f59e0b',
    },
    {
      id: 'etapa4',
      type: 'PRODUCTION',
      value: 'ETAPA_4',
      title: 'Etapa 4',
      sub: 'WhatsApp / Contato',
      icon: '📱',
      count: stats.etapa4,
      pct: stats.pctEtapa4,
      badge: 'Pararam antes da letra',
      badgeColor: '#ffedd5',
      badgeTextColor: '#c2410c',
      active: activeProductionFilter === 'ETAPA_4',
      borderAccent: '#f97316',
    },
    {
      id: 'letra',
      type: 'PRODUCTION',
      value: 'LETRA_GERADA',
      title: 'Letra Gerada',
      sub: 'Aguardando aprovação',
      icon: '✍️',
      count: stats.letraGerada,
      pct: stats.pctLetra,
      badge: 'Leram a letra',
      badgeColor: '#e0e7ff',
      badgeTextColor: '#4338ca',
      active: activeProductionFilter === 'LETRA_GERADA',
      borderAccent: '#6366f1',
    },
    {
      id: 'audio',
      type: 'PRODUCTION',
      value: 'AUDIO_GERADO',
      title: 'Áudio Ouvido',
      sub: 'Aguardando PIX',
      icon: '🎧',
      count: stats.audioGerado,
      pct: stats.pctAudio,
      badge: '🔥 Quase comprando',
      badgeColor: '#fee2e2',
      badgeTextColor: '#b91c1c',
      active: activeProductionFilter === 'AUDIO_GERADO',
      borderAccent: '#ef4444',
    },
    {
      id: 'pagos',
      type: 'PAYMENT',
      value: 'PAGAMENTO_APROVADO',
      title: 'Vendas Pagas',
      sub: 'PIX Confirmado',
      icon: '💰',
      count: stats.pagos,
      pct: stats.pctPagos,
      badge: stats.totalComMusica > 0 ? `${stats.pctPagos} das músicas` : '✅ Concluídos',
      badgeColor: '#dcfce7',
      badgeTextColor: '#15803d',
      active: activePaymentFilter === 'PAGAMENTO_APROVADO',
      borderAccent: '#22c55e',
    },
  ];

  return (
    <div
      style={{
        marginTop: '18px',
        marginBottom: '20px',
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        padding: '16px 18px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
      }}
    >
      {/* Header do Funil */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '14px',
          paddingBottom: '12px',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.25rem' }}>📊</span>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: '700',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              Funil de Produção & Abandono
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: '#64748b',
                  backgroundColor: '#f1f5f9',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {stats.totalOrders} criações iniciadas • {stats.totalComMusica} músicas geradas
              </span>
            </h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
              Acompanhe onde os clientes estão parando. Clique em qualquer etapa para filtrar os pedidos na lista.
            </p>
          </div>
        </div>

        {/* Resumo da Conversão Geral */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: '600',
              color: '#0f172a',
              backgroundColor: '#f8fafc',
              padding: '4px 12px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <span>Conversão Geral (Músicas Geradas):</span>
            <span style={{ color: '#16a34a', fontWeight: '800' }}>{stats.pctPagos}</span>
            <span style={{ color: '#64748b', fontSize: '0.74rem' }}>({stats.pagos} de {stats.totalComMusica} com música)</span>
          </div>

          {(activeProductionFilter !== 'ALL' || activePaymentFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                if (onSelectProductionFilter) onSelectProductionFilter('ALL');
                if (onSelectPaymentFilter) onSelectPaymentFilter('ALL');
              }}
              style={{
                background: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fca5a5',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              ✕ Limpar Filtro de Etapa
            </button>
          )}
        </div>
      </div>

      {/* Grid de Cards de cada Etapa */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '10px',
        }}
      >
        {cards.map((c) => {
          const isSelected = Boolean(c.active);
          const isClickable = c.clickable !== false;

          return (
            <div
              key={c.id}
              onClick={() => {
                if (isClickable) handleCardClick(c.type, c.value);
              }}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '12px 10px',
                borderRadius: '10px',
                backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                border: isSelected
                  ? `2px solid ${c.borderAccent}`
                  : '1px solid #e2e8f0',
                boxShadow: isSelected
                  ? `0 0 0 3px ${c.borderAccent}22, 0 4px 6px rgba(0,0,0,0.05)`
                  : '0 1px 3px rgba(0,0,0,0.02)',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'all 0.18s ease',
                userSelect: 'none',
              }}
            >
              {/* Topo do Card: Ícone e Título */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1.15rem' }}>{c.icon}</span>
                  {isSelected && (
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: '800',
                        color: '#ffffff',
                        backgroundColor: c.borderAccent,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Filtrado
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e293b', lineHeight: 1.2 }}>
                  {c.title}
                </div>
                {c.sub && (
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px', lineHeight: 1.1 }}>
                    {c.sub}
                  </div>
                )}
              </div>

              {/* Centro: Contagem e Porcentagem */}
              <div style={{ marginTop: '10px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>
                    {c.count}
                  </span>
                  {c.pct && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        color: c.id === 'pagos' ? '#16a34a' : '#64748b',
                      }}
                    >
                      {c.pct}
                    </span>
                  )}
                </div>
              </div>

              {/* Rodapé: Badge explicativa */}
              <div
                style={{
                  fontSize: '0.66rem',
                  fontWeight: '600',
                  color: c.badgeTextColor || '#475569',
                  backgroundColor: c.badgeColor || '#f1f5f9',
                  padding: '3px 6px',
                  borderRadius: '6px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={c.desc || c.badge}
              >
                {c.badge}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
