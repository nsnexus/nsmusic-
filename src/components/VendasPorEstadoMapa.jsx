'use client';

import { useState, useMemo } from 'react';
import { usePedidosDoMes } from '@/lib/usePedidosDoMes';
import { ufFromPhone, UF_NOME } from '@/lib/dddToUf';
import { BR_UF_SHAPES, BR_VIEWBOX } from '@/lib/brUfShapes';
import { sequentialBlue } from '@/lib/sequentialColor';

// Mapa do Brasil por estado (pedido 12/09/2026) — contorno real dos estados (ver
// src/lib/brUfShapes.js), colorido por volume de venda. Não existe campo de endereço/estado no
// pedido — o estado é INFERIDO pelo DDD do telefone (ver src/lib/dddToUf.js), uma aproximação: quem
// mudou de estado e manteve o número antigo conta pro estado errado. Aceitável pra visão geral, não
// pra decisão fina por região.

function mesAtualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const pagouAlgumProduto = (o) => Boolean(
  o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO' ||
  o.videoAddonPaid || o.hasPlaybackAccess || o.playbackAddonPaid ||
  o.hasCartaAccess || o.cartaAddonPaid || o.hasRetrospectivaAccess || o.retrospectivaAddonPaid
);

export default function VendasPorEstadoMapa() {
  const [mes, setMes] = useState(mesAtualStr);
  const { pedidos, loading, erro } = usePedidosDoMes(mes);
  const [hover, setHover] = useState(null); // uf

  const { porEstado, semEstado, totalVendas } = useMemo(() => {
    const contagem = {};
    let semUf = 0;
    let total = 0;
    for (const o of pedidos) {
      if (!pagouAlgumProduto(o)) continue;
      total += 1;
      const uf = ufFromPhone(o.customerPhone);
      if (!uf) { semUf += 1; continue; }
      contagem[uf] = (contagem[uf] || 0) + 1;
    }
    return { porEstado: contagem, semEstado: semUf, totalVendas: total };
  }, [pedidos]);

  const pico = Math.max(1, ...Object.values(porEstado));
  const ranking = Object.entries(porEstado).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ marginTop: '24px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
          🗺️ Vendas por estado
        </h3>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
          aria-label="Mês do mapa por estado"
        />
      </div>

      {loading ? (
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Carregando...</p>
      ) : erro ? (
        <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{erro}</p>
      ) : totalVendas === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Nenhuma venda neste mês ainda.</p>
      ) : (
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <svg viewBox={BR_VIEWBOX} style={{ width: '100%', maxWidth: '380px', height: 'auto', flexShrink: 0 }}>
            {BR_UF_SHAPES.map(({ uf, tag, points, d }) => {
              const total = porEstado[uf] || 0;
              const t = total / pico;
              const props = {
                key: uf,
                onMouseEnter: () => setHover(uf),
                onMouseLeave: () => setHover(null),
                fill: sequentialBlue(t),
                stroke: hover === uf ? '#0f172a' : '#ffffff',
                strokeWidth: hover === uf ? 1.5 : 0.75,
                style: { cursor: 'default' },
              };
              return (
                <g key={uf}>
                  {tag === 'polygon'
                    ? <polygon {...props} points={points} />
                    : <path {...props} d={d} />}
                  <title>{`${UF_NOME[uf]}: ${total} venda${total === 1 ? '' : 's'}`}</title>
                </g>
              );
            })}
          </svg>

          <div style={{ flex: 1, minWidth: '180px' }}>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 10px' }}>
              {hover
                ? <strong style={{ color: '#0f172a' }}>{UF_NOME[hover]}: {porEstado[hover] || 0} venda{(porEstado[hover] || 0) === 1 ? '' : 's'}</strong>
                : 'Passe o mouse sobre um estado pra ver o total.'}
            </p>
            <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', margin: '0 0 6px' }}>Top 5 estados</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {ranking.map(([uf, total]) => (
                <div key={uf} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: sequentialBlue(total / pico), flexShrink: 0 }} />
                  <span style={{ color: '#0f172a', fontWeight: '600', minWidth: '28px' }}>{uf}</span>
                  <span style={{ color: '#64748b' }}>{total}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '12px' }}>
              Estado inferido pelo DDD do telefone — aproximado.
              {semEstado > 0 ? ` ${semEstado} venda${semEstado === 1 ? '' : 's'} sem estado identificável.` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
