'use client';

import { useState, useMemo } from 'react';
import { usePedidosDoMes } from '@/lib/usePedidosDoMes';
import { ufFromPhone, UF_GRID, UF_NOME } from '@/lib/dddToUf';
import { sequentialBlue, textoSobreSequencial } from '@/lib/sequentialColor';

// "Mapa do Brasil" por estado (pedido 12/09/2026) — cartograma em grade (tile grid map): cada UF vira
// um quadrado numa posição que aproxima sua posição geográfica real, sem precisar de um SVG com o
// contorno exato do país. Não existe campo de endereço/estado no pedido — o estado é INFERIDO pelo
// DDD do telefone (ver src/lib/dddToUf.js), uma aproximação: quem mudou de estado e manteve o número
// antigo conta pro estado errado. Aceitável pra visão geral, não pra decisão fina por região.

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
  const nCols = Math.max(...UF_GRID.map((c) => c.col)) + 1;
  const nRows = Math.max(...UF_GRID.map((c) => c.row)) + 1;

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
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${nCols}, minmax(34px, 44px))`,
              gridTemplateRows: `repeat(${nRows}, 34px)`,
              gap: '2px',
              overflowX: 'auto',
            }}
          >
            {UF_GRID.map(({ uf, row, col }) => {
              const total = porEstado[uf] || 0;
              const t = total / pico;
              return (
                <div
                  key={uf}
                  onMouseEnter={() => setHover(uf)}
                  onMouseLeave={() => setHover(null)}
                  title={`${UF_NOME[uf]}: ${total} venda${total === 1 ? '' : 's'}`}
                  style={{
                    gridRow: row + 1,
                    gridColumn: col + 1,
                    borderRadius: '4px',
                    background: sequentialBlue(t),
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.68rem',
                    fontWeight: '800',
                    color: textoSobreSequencial(t),
                    cursor: 'default',
                    outline: hover === uf ? '2px solid #0f172a' : 'none',
                    outlineOffset: '1px',
                  }}
                >
                  {uf}
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: '14px', fontSize: '0.78rem', color: '#64748b' }}>
            {hover
              ? `${UF_NOME[hover]}: ${porEstado[hover] || 0} venda${(porEstado[hover] || 0) === 1 ? '' : 's'} no mês`
              : `Estado inferido pelo DDD do telefone — aproximado. ${semEstado > 0 ? `${semEstado} venda${semEstado === 1 ? '' : 's'} sem estado identificável.` : ''}`}
          </p>
        </>
      )}
    </div>
  );
}
