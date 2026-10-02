'use client';

import React, { useMemo } from 'react';
import { usePedidosDoMes } from '@/lib/usePedidosDoMes';
import { calcularMetricasPorPlataforma } from '@/lib/trafficSource';

function formatMoney(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace('.', ',')}`;
}

export default function VendasPorPlataformaCard({ monthValue }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mesAtivo = monthValue || defaultMonth;

  const { pedidos, loading, erro } = usePedidosDoMes(mesAtivo);

  const { plataformas, totais } = useMemo(() => {
    return calcularMetricasPorPlataforma(pedidos);
  }, [pedidos]);

  // Filtra as principais plataformas com atividade ou configuradas para exibição em destaque
  const principaisCards = useMemo(() => {
    return plataformas.filter((p) => p.key === 'facebook_ads' || p.key === 'tiktok_ads' || p.faturamento > 0 || p.pedidosCriados > 0);
  }, [plataformas]);

  return (
    <div
      className="glass-card"
      style={{
        marginTop: '24px',
        padding: '24px',
        borderRadius: '16px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎯</span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Faturamento por Plataforma de Conversão
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '6px 0 0 0' }}>
            Desempenho comparativo de vendas e faturamento entre Facebook Ads, TikTok Ads, Orgânico e Direto.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Faturamento Total:</span>
          <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#059669' }}>
            {formatMoney(totais.faturamento)}
          </span>
        </div>
      </div>

      {loading && pedidos.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
          Carregando dados por plataforma...
        </div>
      ) : erro ? (
        <div style={{ padding: '16px', color: '#dc2626', backgroundColor: '#fef2f2', borderRadius: '8px', fontSize: '0.85rem' }}>
          {erro}
        </div>
      ) : (
        <>
          {/* Barra de Distribuição de Faturamento */}
          {totais.faturamento > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '6px' }}>
                <span>Divisão do Faturamento do Mês</span>
                <span>100% ({formatMoney(totais.faturamento)})</span>
              </div>
              <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
                {plataformas
                  .filter((p) => p.percFaturamento > 0)
                  .map((p) => (
                    <div
                      key={p.key}
                      title={`${p.name}: ${formatMoney(p.faturamento)} (${p.percFaturamento}%)`}
                      style={{
                        width: `${p.percFaturamento}%`,
                        backgroundColor: p.color,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  ))}
              </div>

              {/* Legenda rápida da barra */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
                {plataformas
                  .filter((p) => p.percFaturamento > 0)
                  .map((p) => (
                    <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: p.color, display: 'inline-block' }} />
                      <span style={{ fontWeight: '600' }}>{p.shortName}:</span>
                      <span>{p.percFaturamento}%</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Cards de Resumo das Plataformas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {principaisCards.map((plat) => (
              <div
                key={plat.key}
                style={{
                  backgroundColor: plat.bgLight,
                  border: `1.5px solid ${plat.borderColor}`,
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{plat.icon}</span>
                      <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{plat.name}</strong>
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        color: '#ffffff',
                        backgroundColor: plat.badgeBg,
                        padding: '2px 8px',
                        borderRadius: '12px',
                      }}
                    >
                      {plat.percFaturamento}% da receita
                    </span>
                  </div>

                  <div style={{ margin: '12px 0 16px' }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.04em' }}>
                      Faturamento
                    </span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: plat.color, lineHeight: '1.2' }}>
                      {formatMoney(plat.faturamento)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    paddingTop: '12px',
                    borderTop: '1px dashed rgba(0, 0, 0, 0.08)',
                    fontSize: '0.78rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Vendas Pagas:</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{plat.pedidosPagos}</strong>
                    <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>
                      (TM: {formatMoney(plat.ticketMedio)})
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Conversão:</span>
                    <strong style={{ color: plat.conversao >= 5 ? '#059669' : '#d97706', fontSize: '0.9rem' }}>
                      {plat.conversao}%
                    </strong>
                    <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>
                      {plat.pedidosCriados} criados
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabela Comparativa Detalhada */}
          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '10px 12px', fontWeight: '700' }}>Canal de Conversão</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>Pedidos Criados</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>Vendas Pagas</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>Taxa Conversão</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>Ticket Médio</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>Faturamento</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>% da Receita</th>
                </tr>
              </thead>
              <tbody>
                {plataformas.map((plat) => {
                  const hasData = plat.pedidosCriados > 0 || plat.pedidosPagos > 0;
                  return (
                    <tr
                      key={plat.key}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: hasData ? '#ffffff' : '#fafafa',
                      }}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: '#0f172a' }}>
                        <span style={{ marginRight: '6px' }}>{plat.icon}</span>
                        {plat.name}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                        {plat.pedidosCriados}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                        {plat.pedidosPagos}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: plat.conversao >= 5 ? '#059669' : '#d97706' }}>
                        {plat.conversao}%
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                        {formatMoney(plat.ticketMedio)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '800', color: plat.color }}>
                        {formatMoney(plat.faturamento)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', fontWeight: '600' }}>
                        {plat.percFaturamento}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: '800', color: '#0f172a' }}>
                  <td style={{ padding: '12px' }}>Total Geral</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{totais.pedidosCriados}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{totais.pedidosPagos}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#059669' }}>{totais.conversaoGeral}%</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{formatMoney(totais.ticketMedioGeral)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#059669' }}>{formatMoney(totais.faturamento)}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Nota de rodapé explicativa */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.78rem',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>ℹ️</span>
            <div>
              <strong>Atribuição de tráfego:</strong> Pedidos anteriores sem marcação de campanha foram atribuídos a <strong>Facebook Ads</strong> (conforme histórico de campanhas). Todos os novos pedidos vindos de Facebook Ads, TikTok Ads, busca orgânica ou acesso direto são identificados automaticamente em tempo real via UTMs, <code>fbclid</code> e <code>ttclid</code>.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
