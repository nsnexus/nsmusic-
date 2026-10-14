'use client';

import React, { useState, useMemo } from 'react';

function formatMoney(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace('.', ',')}`;
}

export default function AdsTable({ ads = [], summary = {}, loading = false }) {
  const [sortField, setSortField] = useState('revenue');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedAds = useMemo(() => {
    const list = [...ads];
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = String(valB || '').toLowerCase();
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [ads, sortField, sortDir]);

  const renderSortArrow = (field) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px', color: '#60a5fa' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const thStyle = {
    padding: '12px 14px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '14px',
    fontSize: '13px',
    color: '#e2e8f0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    verticalAlign: 'middle',
  };

  return (
    <div style={{
      background: '#131822',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#18202f' }}>
              <th style={thStyle} onClick={() => handleSort('adName')}>
                Anúncio {renderSortArrow('adName')}
              </th>
              <th style={thStyle} onClick={() => handleSort('campaignName')}>
                Campanha / Conjunto {renderSortArrow('campaignName')}
              </th>
              <th style={thStyle} onClick={() => handleSort('spend')}>
                Gasto {renderSortArrow('spend')}
              </th>
              <th style={thStyle} onClick={() => handleSort('purchases')}>
                Compras {renderSortArrow('purchases')}
              </th>
              <th style={thStyle} onClick={() => handleSort('revenue')}>
                Faturamento {renderSortArrow('revenue')}
              </th>
              <th style={thStyle} onClick={() => handleSort('cpa')}>
                CPA Real {renderSortArrow('cpa')}
              </th>
              <th style={thStyle} onClick={() => handleSort('roas')}>
                ROAS {renderSortArrow('roas')}
              </th>
              <th style={thStyle} onClick={() => handleSort('profit')}>
                Lucro {renderSortArrow('profit')}
              </th>
              <th style={thStyle} onClick={() => handleSort('clicks')}>
                Cliques / CTR {renderSortArrow('clicks')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Carregando dados dos anúncios...
                </td>
              </tr>
            ) : sortedAds.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Nenhum anúncio encontrado para o período ou filtro selecionado.
                </td>
              </tr>
            ) : (
              sortedAds.map((ad, idx) => {
                const isRoasHigh = ad.roas >= 2.0;
                const isRoasMid = ad.roas >= 1.0 && ad.roas < 2.0;
                const isProfitGood = ad.profit >= 0;

                return (
                  <tr
                    key={ad.adId || idx}
                    style={{
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.07)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)')}
                  >
                    {/* Nome do anúncio */}
                    <td style={{ ...tdStyle, minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: ad.hasMetaSync ? '#10b981' : '#a855f7',
                        }} />
                        <div>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                            {ad.adName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {ad.hasMetaSync ? `ID Meta: ${ad.adId}` : 'Rastreado via UTM'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Campanha */}
                    <td style={{ ...tdStyle, maxWidth: '200px' }}>
                      <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                        {ad.campaignName}
                      </div>
                      {ad.adsetName && ad.adsetName !== '-' && (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Conj: {ad.adsetName}
                        </div>
                      )}
                    </td>

                    {/* Gasto */}
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {formatMoney(ad.spend)}
                    </td>

                    {/* Compras */}
                    <td style={{ ...tdStyle }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: ad.purchases > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: ad.purchases > 0 ? '#34d399' : '#94a3b8',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}>
                        {ad.purchases}
                      </span>
                    </td>

                    {/* Faturamento */}
                    <td style={{ ...tdStyle, fontWeight: 700, color: ad.revenue > 0 ? '#34d399' : '#94a3b8' }}>
                      {formatMoney(ad.revenue)}
                    </td>

                    {/* CPA Real */}
                    <td style={{ ...tdStyle }}>
                      {ad.purchases > 0 ? (
                        <span style={{
                          fontWeight: 600,
                          color: ad.cpa <= 8 ? '#34d399' : (ad.cpa <= 15 ? '#fbbf24' : '#f87171'),
                        }}>
                          {formatMoney(ad.cpa)}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>-</span>
                      )}
                    </td>

                    {/* ROAS */}
                    <td style={{ ...tdStyle }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: isRoasHigh
                          ? 'rgba(16, 185, 129, 0.18)'
                          : isRoasMid
                            ? 'rgba(245, 158, 11, 0.18)'
                            : 'rgba(239, 68, 68, 0.18)',
                        color: isRoasHigh ? '#34d399' : isRoasMid ? '#fbbf24' : '#f87171',
                      }}>
                        {ad.roas >= 900 ? '∞' : `${ad.roas.toFixed(2)}x`}
                      </span>
                    </td>

                    {/* Lucro */}
                    <td style={{
                      ...tdStyle,
                      fontWeight: 600,
                      color: isProfitGood ? '#34d399' : '#f87171',
                    }}>
                      {formatMoney(ad.profit)}
                    </td>

                    {/* Cliques / CTR */}
                    <td style={{ ...tdStyle, fontSize: '12px' }}>
                      {ad.hasMetaSync ? (
                        <div>
                          <span>{ad.clicks} cliques</span>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            CTR: {ad.ctr ? `${ad.ctr.toFixed(2)}%` : '0%'}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Rodapé com Totais Consolidados (igual ao Meta Ads) */}
          {!loading && sortedAds.length > 0 && (
            <tfoot>
              <tr style={{ background: '#1c2536', borderTop: '2px solid rgba(255, 255, 255, 0.12)' }}>
                <td style={{ ...tdStyle, fontWeight: 700, color: '#f8fafc' }} colSpan={2}>
                  Resultados totais ({sortedAds.length} anúncios)
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: '#60a5fa' }}>
                  {formatMoney(summary.totalSpend)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: '#34d399' }}>
                  {summary.totalPurchases || 0}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: '#34d399' }}>
                  {formatMoney(summary.totalRevenue)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: '#fbbf24' }}>
                  {formatMoney(summary.averageCpa)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: summary.overallRoas >= 2.0 ? '#34d399' : '#fbbf24' }}>
                  {summary.overallRoas >= 900 ? '∞' : `${Number(summary.overallRoas || 0).toFixed(2)}x`}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: summary.totalProfit >= 0 ? '#34d399' : '#f87171' }}>
                  {formatMoney(summary.totalProfit)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#94a3b8' }}>
                  {summary.totalClicks || 0} cliques
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
