'use client';

import { useState, useMemo } from 'react';
import { usePedidosDoMes } from '@/lib/usePedidosDoMes';
import { calcularVendasPorDia, PRODUTOS_VENDAS } from '@/lib/dashboardAgregados';

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

const PRODUTOS = PRODUTOS_VENDAS;

export default function VendasPorDiaTable({
  pedidos: pedidosProp = null,
  mes: mesProp = null,
  loading: loadingProp = null,
  erro: erroProp = null,
  resumo = null,
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

  const { porDia, totais, linhasVisiveis } = useMemo(() => {
    // Resumo pronto do servidor (metricas_diarias) ou, sem ele, a mesma conta a partir dos pedidos.
    const porDiaList = (resumo && resumo.mes === mes && Array.isArray(resumo.vendasPorDia))
      ? resumo.vendasPorDia.map((l) => ({ ...l }))
      : calcularVendasPorDia(pedidos, ano, mesNum);

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
  }, [pedidos, resumo, mes, ano, mesNum]);

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
