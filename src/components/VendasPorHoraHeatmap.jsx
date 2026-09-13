'use client';

import { useState, useMemo } from 'react';
import { usePedidosDoMes, paraData } from '@/lib/usePedidosDoMes';
import { sequentialBlue, textoSobreSequencial } from '@/lib/sequentialColor';

// Mapa de calor "vendas por horário do dia" (pedido 12/09/2026) — em qual hora do dia as vendas
// acontecem, somado o mês inteiro. Ajuda a decidir horário de campanha/anúncio e de atendimento.
//
// Conta qualquer evento de venda (música OU add-on) pela hora local do respectivo *PaidAt — mesmo
// critério de produto usado em VendasPorDiaTable, só que agrupado por HORA em vez de por DIA.

function mesAtualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function VendasPorHoraHeatmap() {
  const [mes, setMes] = useState(mesAtualStr);
  const { pedidos, loading, erro } = usePedidosDoMes(mes);
  const [hover, setHover] = useState(null); // { hora, total }

  const porHora = useMemo(() => {
    const [ano, mesNum] = mes.split('-').map(Number);
    const horas = Array.from({ length: 24 }, () => 0);

    const somar = (dataVal) => {
      const d = paraData(dataVal);
      if (!d) return;
      if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return;
      horas[d.getHours()] += 1;
    };

    for (const o of pedidos) {
      const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
      if (musicaPaga) somar(o.paidAt || o.createdAt);
      if (o.hasVideoAccess || o.videoAddonPaid) somar(o.videoPaidAt);
      if (o.hasPlaybackAccess || o.playbackAddonPaid) somar(o.playbackPaidAt);
      if (o.hasCartaAccess || o.cartaAddonPaid) somar(o.cartaPaidAt);
      if (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid) somar(o.retrospectivaPaidAt);
    }
    return horas;
  }, [pedidos, mes]);

  const pico = Math.max(1, ...porHora);
  const totalVendas = porHora.reduce((a, b) => a + b, 0);

  return (
    <div style={{ marginTop: '24px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
          🕒 Vendas por horário do dia
        </h3>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
          aria-label="Mês do mapa de calor por horário"
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
          <div style={{ display: 'flex', gap: '2px', overflowX: 'auto', paddingBottom: '4px' }}>
            {porHora.map((total, hora) => {
              const t = total / pico;
              return (
                <div
                  key={hora}
                  onMouseEnter={() => setHover({ hora, total })}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    flex: '1 0 28px',
                    minWidth: '28px',
                    height: '48px',
                    borderRadius: '4px',
                    background: sequentialBlue(t),
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    color: textoSobreSequencial(t),
                    cursor: 'default',
                    outline: hover?.hora === hora ? '2px solid #0f172a' : 'none',
                    outlineOffset: '1px',
                  }}
                  title={`${String(hora).padStart(2, '0')}h: ${total} venda${total === 1 ? '' : 's'}`}
                >
                  {total || ''}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
            {porHora.map((_, hora) => (
              <span key={hora} style={{ flex: '1 0 28px', minWidth: '28px', textAlign: 'center', fontSize: '0.66rem', color: '#94a3b8' }}>
                {hora % 3 === 0 ? String(hora).padStart(2, '0') : ''}
              </span>
            ))}
          </div>

          <p style={{ marginTop: '14px', fontSize: '0.78rem', color: '#64748b' }}>
            {hover
              ? `${String(hover.hora).padStart(2, '0')}h–${String((hover.hora + 1) % 24).padStart(2, '0')}h: ${hover.total} venda${hover.total === 1 ? '' : 's'} no mês`
              : `Pico às ${String(porHora.indexOf(pico)).padStart(2, '0')}h (${pico} venda${pico === 1 ? '' : 's'}) — passe o mouse pra ver hora a hora.`}
          </p>
        </>
      )}
    </div>
  );
}
