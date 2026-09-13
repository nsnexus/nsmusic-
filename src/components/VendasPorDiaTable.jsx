'use client';

import { useState } from 'react';
import { usePedidosDoMes, paraData } from '@/lib/usePedidosDoMes';
import { getPriceForSku } from '@/lib/pricing';

// Tabela "vendas por dia" do dashboard admin (pedido 04/09/2026) — quantidade vendida por produto,
// por dia do mês, com total no fim. Ver src/lib/usePedidosDoMes.js pro porquê da consulta própria.
//
// Contagem por PRODUTO usa o campo `*PaidAt` de cada um (gravado por src/lib/payments.js na mesma
// transação que concede o acesso, tanto pra add-on isolado quanto pra combo — ver skuGrants*Access)
// — assim um vídeo/carta/retrospectiva vendido junto da música no mesmo checkout (combo) conta no
// dia certo sem precisar de lógica separada pra "veio de combo ou avulso".
//
// Pedido 12/09/2026: + Faturamento, Gerações e Taxa de conversão por dia.

function mesAtualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PRODUTOS = [
  { chave: 'musicas', label: '🎵 Músicas', sku: 'audio_only' },
  { chave: 'videos', label: '🎬 Vídeos', sku: 'video_addon' },
  { chave: 'playbacks', label: '🎧 Playback', sku: 'playback_addon' },
  { chave: 'cartas', label: '💌 Cartas', sku: 'carta_addon' },
  { chave: 'retrospectivas', label: '📖 Retrospectivas', sku: 'retrospectiva_addon' },
];

export default function VendasPorDiaTable() {
  const [mes, setMes] = useState(mesAtualStr);
  const { pedidos, loading, erro } = usePedidosDoMes(mes);

  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();

  // Uma linha por dia do mês, zerada — preenchida abaixo com o que foi vendido/gerado/criado em cada uma.
  const porDia = Array.from({ length: diasNoMes }, (_, i) => ({
    dia: i + 1,
    musicas: 0, videos: 0, playbacks: 0, cartas: 0, retrospectivas: 0,
    geracoes: 0, pedidosCriados: 0, pedidosPagos: 0,
  }));

  const somar = (campo, dataVal) => {
    const d = paraData(dataVal);
    if (!d) return;
    if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return; // pago em outro mês, não conta aqui
    const linha = porDia[d.getDate() - 1];
    if (linha) linha[campo] += 1;
  };

  for (const o of pedidos) {
    const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
    if (musicaPaga) somar('musicas', o.paidAt || o.createdAt);
    if (o.hasVideoAccess || o.videoAddonPaid) somar('videos', o.videoPaidAt);
    if (o.hasPlaybackAccess || o.playbackAddonPaid) somar('playbacks', o.playbackPaidAt);
    if (o.hasCartaAccess || o.cartaAddonPaid) somar('cartas', o.cartaPaidAt);
    if (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid) somar('retrospectivas', o.retrospectivaPaidAt);

    // Gerações e conversão são por data de CRIAÇÃO do pedido, não de pagamento — a chamada à Kie.ai
    // acontece na criação, e "taxa de conversão do dia" aqui significa "desse pedidos criados NESTE
    // dia, quantos % já converteram em venda (não importa quando pagaram)" — cohort por criação, não
    // por pagamento (misturar as duas datas daria um número sem significado real).
    const dCriacao = paraData(o.createdAt);
    if (dCriacao && dCriacao.getFullYear() === ano && dCriacao.getMonth() === mesNum - 1) {
      const linha = porDia[dCriacao.getDate() - 1];
      if (linha) {
        const count = Number(o.sunoGenerationCount) || (o.sunoRequestedAt ? 1 : 0);
        linha.geracoes += count;
        linha.pedidosCriados += 1;
        if (musicaPaga || o.videoAddonPaid) linha.pedidosPagos += 1;
      }
    }
  }

  const KIE_COST_PER_GENERATION = 0.30;
  const precoPorProduto = Object.fromEntries(PRODUTOS.map((p) => [p.chave, getPriceForSku(p.sku)]));

  const faturamentoDia = (linha) => PRODUTOS.reduce((s, p) => s + linha[p.chave] * precoPorProduto[p.chave], 0);
  const conversaoDia = (linha) => (linha.pedidosCriados > 0 ? (linha.pedidosPagos / linha.pedidosCriados) * 100 : null);

  const totais = porDia.reduce((acc, linha) => {
    for (const { chave } of PRODUTOS) acc[chave] += linha[chave];
    acc.geracoes += linha.geracoes;
    acc.pedidosCriados += linha.pedidosCriados;
    acc.pedidosPagos += linha.pedidosPagos;
    acc.faturamento += faturamentoDia(linha);
    acc.gasto += linha.geracoes * KIE_COST_PER_GENERATION;
    return acc;
  }, { musicas: 0, videos: 0, playbacks: 0, cartas: 0, retrospectivas: 0, geracoes: 0, pedidosCriados: 0, pedidosPagos: 0, faturamento: 0, gasto: 0 });

  const hoje = new Date();
  const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === mesNum - 1;
  // Mais recente primeiro (pedido 11/09/2026) — dia de hoje/último dia do mês no topo, sem precisar
  // rolar até o fim da tabela pra ver a venda mais recente.
  const linhasVisiveis = (ehMesAtual ? porDia.filter((l) => l.dia <= hoje.getDate()) : porDia).slice().reverse();

  const fmtMoeda = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  return (
    <div style={{ marginTop: '32px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
          📊 Vendas por dia
        </h3>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
          aria-label="Mês das vendas"
        />
      </div>

      {loading ? (
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Carregando...</p>
      ) : erro ? (
        <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{erro}</p>
      ) : (
        /* maxHeight + overflowY: rolagem vertical própria (pedido 11/09/2026) — sem isso a tabela
           cresce uma linha por dia do mês e estica a página inteira até o fim do mês. Cabeçalho
           sticky pra continuar visível rolando. */
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '420px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'left', padding: '8px 10px', color: '#475569', fontWeight: '700' }}>Dia</th>
                {PRODUTOS.map((p) => (
                  <th key={p.chave} style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '700', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </th>
                ))}
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '800' }}>Total</th>
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#059669', fontWeight: '700', whiteSpace: 'nowrap' }}>Faturado</th>
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '700', whiteSpace: 'nowrap' }} title="Chamadas aceitas pela Kie.ai nesse dia, por data de CRIAÇÃO do pedido (não de pagamento)">
                  Gerações
                </th>
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '700', whiteSpace: 'nowrap' }} title="% dos pedidos CRIADOS nesse dia que já converteram em venda (música ou vídeo), não importa quando pagaram">
                  Conversão
                </th>
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((linha) => {
                const totalDia = PRODUTOS.reduce((s, p) => s + linha[p.chave], 0);
                const conv = conversaoDia(linha);
                return (
                  <tr key={linha.dia} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', color: '#0f172a', fontWeight: '600' }}>{String(linha.dia).padStart(2, '0')}</td>
                    {PRODUTOS.map((p) => (
                      <td key={p.chave} style={{ textAlign: 'right', padding: '7px 10px', color: linha[p.chave] ? '#0f172a' : '#cbd5e1' }}>
                        {linha[p.chave] || '—'}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: '700', color: totalDia ? '#059669' : '#cbd5e1' }}>
                      {totalDia || '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: '600', color: '#059669' }}>
                      {fmtMoeda(faturamentoDia(linha))}
                    </td>
                    <td style={{ textAlign: 'right', padding: '7px 10px', color: linha.geracoes ? '#0f172a' : '#cbd5e1' }}>
                      {linha.geracoes || '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '7px 10px', color: conv === null ? '#cbd5e1' : '#0f172a' }}>
                      {conv === null ? '—' : `${conv.toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                <td style={{ padding: '9px 10px', fontWeight: '800', color: '#0f172a' }}>Total</td>
                {PRODUTOS.map((p) => (
                  <td key={p.chave} style={{ textAlign: 'right', padding: '9px 10px', fontWeight: '800', color: '#0f172a' }}>
                    {totais[p.chave]}
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: '800', color: '#059669' }}>
                  {Object.values({ musicas: totais.musicas, videos: totais.videos, playbacks: totais.playbacks, cartas: totais.cartas, retrospectivas: totais.retrospectivas }).reduce((a, b) => a + b, 0)}
                </td>
                <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: '800', color: '#059669' }}>
                  {fmtMoeda(totais.faturamento)}
                </td>
                <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: '800', color: '#0f172a' }}>
                  {totais.geracoes}
                </td>
                <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: '800', color: '#0f172a' }}>
                  {totais.pedidosCriados > 0 ? `${((totais.pedidosPagos / totais.pedidosCriados) * 100).toFixed(0)}%` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
