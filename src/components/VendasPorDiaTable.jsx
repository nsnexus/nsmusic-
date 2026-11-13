'use client';

import { useState, useMemo } from 'react';
import { usePedidosDoMes, paraData } from '@/lib/usePedidosDoMes';
import { getPriceForSku } from '@/lib/pricing';
import { isBonusOrder } from '@/lib/trafficSource';
import { isStripePayment, calculateStripeFee } from '@/lib/paymentFees';
import { hasMusicaGerada } from '@/lib/stats';

// Tabela "vendas por dia" do dashboard admin (pedido 04/09/2026) — quantidade vendida por produto,
// por dia do mês, com total no fim.
//
// Otimização: processamento em passada linear O(N) com useMemo para evitar travamento da UI
// e re-execução de 155.000 iterações em cada re-render.
// Suporta pedidos e mês injetados via props para compartilhar o cache único do Dashboard.

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

export default function VendasPorDiaTable({
  pedidos: pedidosProp = null,
  mes: mesProp = null,
  loading: loadingProp = null,
  erro: erroProp = null,
}) {
  const [internalMes, setInternalMes] = useState(mesAtualStr);
  const mes = mesProp || internalMes;
  const setMes = (novoMes) => {
    setInternalMes(novoMes);
  };

  const { pedidos: pedidosHook, loading: loadingHook, erro: erroHook } = usePedidosDoMes(pedidosProp ? null : mes);
  const pedidos = pedidosProp !== null ? pedidosProp : pedidosHook;
  const loading = loadingProp !== null ? loadingProp : loadingHook;
  const erro = erroProp !== null ? erroProp : erroHook;

  const [ano, mesNum] = useMemo(() => mes.split('-').map(Number), [mes]);
  const diasNoMes = useMemo(() => new Date(ano, mesNum, 0).getDate(), [ano, mesNum]);

  const { porDia, totais, linhasVisiveis } = useMemo(() => {
    // Uma linha por dia do mês, zerada — preenchida abaixo em passada linear única O(N)
    const porDiaList = Array.from({ length: diasNoMes }, (_, i) => ({
      dia: i + 1,
      musicas: 0, videos: 0, playbacks: 0, cartas: 0, retrospectivas: 0,
      geracoes: 0, pedidosCriados: 0, pedidosComMusica: 0, pedidosPagos: 0,
      faturamento: 0,
    }));

    const somar = (campo, dataVal) => {
      const d = paraData(dataVal);
      if (!d) return;
      if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return; // pago em outro mês, não conta aqui
      const linha = porDiaList[d.getDate() - 1];
      if (linha) linha[campo] += 1;
    };

    const somarFaturamento = (dataVal, valor) => {
      if (!dataVal || !valor || valor <= 0) return;
      const d = paraData(dataVal);
      if (!d) return;
      if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return;
      const linha = porDiaList[d.getDate() - 1];
      if (linha) linha.faturamento += valor;
    };

    const precoMusicaPadrao = getPriceForSku('audio_only') || 9.99;
    const precoVideoPadrao = getPriceForSku('video_addon') || 6.90;
    const precoPlaybackPadrao = getPriceForSku('playback_addon') || 4.99;
    const precoCartaPadrao = getPriceForSku('carta_addon') || 4.99;
    const precoRetroPadrao = getPriceForSku('retrospectiva_addon') || 14.90;

    for (const o of pedidos) {
      if (!o) continue;
      const bonus = isBonusOrder(o);
      const musicaPaga = (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') && !bonus;

      // 1. Contagem e Faturamento de Música
      if (musicaPaga) {
        somar('musicas', o.paidAt || o.createdAt);
        let valorMusica = precoMusicaPadrao;
        if (o.paidAmount !== null && o.paidAmount !== undefined && o.paidAmount !== '') {
          const v = Number(o.paidAmount);
          if (Number.isFinite(v) && v >= 0) valorMusica = v;
        } else {
          const porSku = getPriceForSku(o.paymentIntentSku);
          if (porSku !== null && o.paymentIntentSku !== 'impacto') valorMusica = porSku;
        }
        if (isStripePayment(o)) {
          valorMusica = Math.max(0, valorMusica - calculateStripeFee(valorMusica));
        }
        somarFaturamento(o.paidAt || o.createdAt, valorMusica);
      }

      // 2. Contagem e Faturamento de Add-ons
      if (o.hasVideoAccess || o.videoAddonPaid) {
        somar('videos', o.videoPaidAt);
        if (o.videoPaymentId) {
          const v = Number(o.videoPaidAmount);
          let valor = (Number.isFinite(v) && v > 0) ? v : precoVideoPadrao;
          if (isStripePayment(o.videoPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
          somarFaturamento(o.videoPaidAt || o.paidAt || o.createdAt, valor);
        }
      }

      if (o.hasPlaybackAccess || o.playbackAddonPaid) {
        somar('playbacks', o.playbackPaidAt);
        if (o.playbackPaymentId) {
          const v = Number(o.playbackPaidAmount);
          let valor = (Number.isFinite(v) && v > 0) ? v : precoPlaybackPadrao;
          if (isStripePayment(o.playbackPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
          somarFaturamento(o.playbackPaidAt || o.paidAt || o.createdAt, valor);
        }
      }

      if (o.hasCartaAccess || o.cartaAddonPaid) {
        somar('cartas', o.cartaPaidAt);
        if (o.cartaPaymentId) {
          const v = Number(o.cartaPaidAmount);
          let valor = (Number.isFinite(v) && v > 0) ? v : precoCartaPadrao;
          if (isStripePayment(o.cartaPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
          somarFaturamento(o.cartaPaidAt || o.paidAt || o.createdAt, valor);
        }
      }

      if (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid) {
        somar('retrospectivas', o.retrospectivaPaidAt);
        if (o.retrospectivaPaymentId) {
          const v = Number(o.retrospectivaPaidAmount);
          let valor = (Number.isFinite(v) && v > 0) ? v : precoRetroPadrao;
          if (isStripePayment(o.retrospectivaPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
          somarFaturamento(o.retrospectivaPaidAt || o.paidAt || o.createdAt, valor);
        }
      }

      // 3. Gerações e conversão por data de CRIAÇÃO do pedido
      const dCriacao = paraData(o.createdAt);
      if (dCriacao && dCriacao.getFullYear() === ano && dCriacao.getMonth() === mesNum - 1) {
        const linha = porDiaList[dCriacao.getDate() - 1];
        if (linha) {
          const count = Number(o.sunoGenerationCount) || (o.sunoRequestedAt ? 1 : 0);
          linha.geracoes += count;
          if (o.sunoProvider === 'suno_local') {
            linha.geracoesBot = (linha.geracoesBot || 0) + count;
          } else {
            linha.geracoesKie = (linha.geracoesKie || 0) + count;
          }
          if (!bonus) {
            linha.pedidosCriados += 1;
            if (hasMusicaGerada(o)) linha.pedidosComMusica += 1;
            if (musicaPaga || o.videoAddonPaid) linha.pedidosPagos += 1;
          } else if (o.videoAddonPaid) {
            linha.pedidosPagos += 1;
          }
        }
      }
    }

    // Arredonda faturamento por dia para 2 casas
    for (let i = 0; i < diasNoMes; i++) {
      porDiaList[i].faturamento = Math.round(porDiaList[i].faturamento * 100) / 100;
    }

    const KIE_COST_PER_GENERATION = 0.30;
    const totaisCalc = porDiaList.reduce((acc, linha) => {
      for (const { chave } of PRODUTOS) acc[chave] += linha[chave];
      acc.geracoes += linha.geracoes;
      acc.geracoesBot = (acc.geracoesBot || 0) + (linha.geracoesBot || 0);
      acc.geracoesKie = (acc.geracoesKie || 0) + (linha.geracoesKie || 0);
      acc.pedidosCriados += linha.pedidosCriados;
      acc.pedidosComMusica = (acc.pedidosComMusica || 0) + (linha.pedidosComMusica || 0);
      acc.pedidosPagos += linha.pedidosPagos;
      acc.faturamento += linha.faturamento;
      acc.gasto += (linha.geracoesKie || 0) * KIE_COST_PER_GENERATION;
      acc.economiaBot = (acc.economiaBot || 0) + ((linha.geracoesBot || 0) * KIE_COST_PER_GENERATION);
      return acc;
    }, { musicas: 0, videos: 0, playbacks: 0, cartas: 0, retrospectivas: 0, geracoes: 0, geracoesBot: 0, geracoesKie: 0, pedidosCriados: 0, pedidosComMusica: 0, pedidosPagos: 0, faturamento: 0, gasto: 0, economiaBot: 0 });

    totaisCalc.faturamento = Math.round(totaisCalc.faturamento * 100) / 100;

    const hoje = new Date();
    const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === mesNum - 1;
    const linhasVisiveisCalc = (ehMesAtual ? porDiaList.filter((l) => l.dia <= hoje.getDate()) : porDiaList).slice().reverse();

    return { porDia: porDiaList, totais: totaisCalc, linhasVisiveis: linhasVisiveisCalc };
  }, [pedidos, diasNoMes, ano, mesNum]);

  const faturamentoDia = (linha) => linha.faturamento;
  const conversaoDia = (linha) => {
    const base = linha.pedidosComMusica > 0 ? linha.pedidosComMusica : (linha.geracoes > 0 ? linha.geracoes : 0);
    return base > 0 ? (linha.pedidosPagos / base) * 100 : null;
  };

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
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#059669', fontWeight: '700', whiteSpace: 'nowrap' }} title="Faturamento líquido real recebido no PIX/pagamento (considerando descontos dos combos)">
                  Faturado (Líq.)
                </th>
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '700', whiteSpace: 'nowrap' }} title="Chamadas aceitas pela Kie.ai nesse dia, por data de CRIAÇÃO do pedido (não de pagamento)">
                  Gerações
                </th>
                <th style={{ position: 'sticky', top: 0, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '700', whiteSpace: 'nowrap' }} title="% dos pedidos com MÚSICA GERADA nesse dia que já converteram em venda (música ou vídeo), não importa quando pagaram">
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
                  {(() => {
                  const baseTotal = (totais.pedidosComMusica || 0) > 0 ? totais.pedidosComMusica : (totais.geracoes > 0 ? totais.geracoes : 0);
                  return baseTotal > 0 ? `${((totais.pedidosPagos / baseTotal) * 100).toFixed(0)}%` : '—';
                })()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
