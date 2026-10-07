'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePedidosDoMes } from '@/lib/usePedidosDoMes';
import { calcularMetricasPorPlataforma } from '@/lib/trafficSource';
import { useAdsSpend } from '@/lib/useAdsSpend';
import TikTokAdsDailyModal from '@/components/admin/TikTokAdsDailyModal';

function formatMoney(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace('.', ',')}`;
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function mesAtualPadrao() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function VendasPorPlataformaCard({ monthValue }) {
  const mesAtivo = monthValue || mesAtualPadrao();

  const [ano, mesNum] = useMemo(() => {
    const parts = (mesAtivo || '').split('-').map(Number);
    const d = new Date();
    return [parts[0] || d.getFullYear(), parts[1] || (d.getMonth() + 1)];
  }, [mesAtivo]);

  const diasNoMes = useMemo(() => new Date(ano, mesNum, 0).getDate(), [ano, mesNum]);

  const { ehMesAtual, hojeDia, ontemDia } = useMemo(() => {
    const d = new Date();
    const isCurrent = d.getFullYear() === ano && (d.getMonth() + 1) === mesNum;
    const currentDay = isCurrent ? d.getDate() : null;
    const yesterday = isCurrent && currentDay > 1 ? currentDay - 1 : null;
    return { ehMesAtual: isCurrent, hojeDia: currentDay, ontemDia: yesterday };
  }, [ano, mesNum]);

  // Estado para filtrar por dia específico ('', 'todos' ou número do dia 1..31)
  // Se for o mês atual, sempre inicia com o dia de HOJE selecionado por padrão
  const [diaSelecionado, setDiaSelecionado] = useState(() => {
    const d = new Date();
    const targetMonth = monthValue || mesAtualPadrao();
    const [tAno, tMes] = (targetMonth || '').split('-').map(Number);
    if (d.getFullYear() === tAno && (d.getMonth() + 1) === tMes) {
      return String(d.getDate());
    }
    return '';
  });

  const prevMesRef = useRef(mesAtivo);

  // Ao trocar de mês no dashboard: se for o mês atual, seleciona hoje; se for outro mês, seleciona o mês todo
  useEffect(() => {
    if (prevMesRef.current !== mesAtivo) {
      prevMesRef.current = mesAtivo;
      if (ehMesAtual && hojeDia) {
        setDiaSelecionado(String(hojeDia));
      } else {
        setDiaSelecionado('');
      }
    }
  }, [mesAtivo, ehMesAtual, hojeDia]);

  // Modal para gerenciar gastos do TikTok Ads dia a dia
  const [modalTikTokAberto, setModalTikTokAberto] = useState(false);

  const nomeDoMes = NOMES_MESES[mesNum - 1] || mesAtivo;

  // Lista de dias (do dia atual/último até o 1, para fácil acesso aos mais recentes)
  const listaDias = useMemo(() => {
    const maxDia = ehMesAtual && hojeDia ? Math.min(diasNoMes, hojeDia) : diasNoMes;
    return Array.from({ length: maxDia }, (_, i) => maxDia - i);
  }, [diasNoMes, ehMesAtual, hojeDia]);

  const { pedidos, loading, erro } = usePedidosDoMes(mesAtivo);
  const { adsSpend, loadingAds, saveManualSpend } = useAdsSpend(mesAtivo);

  const { plataformas, totais } = useMemo(() => {
    return calcularMetricasPorPlataforma(pedidos, diaSelecionado, mesAtivo);
  }, [pedidos, diaSelecionado, mesAtivo]);

  const dataFiltroStr = useMemo(() => {
    if (!diaSelecionado) return null;
    const diaPad = String(diaSelecionado).padStart(2, '0');
    const mesPad = String(mesNum).padStart(2, '0');
    return `${ano}-${mesPad}-${diaPad}`;
  }, [diaSelecionado, ano, mesNum]);

  const metaSpend = useMemo(() => {
    if (!adsSpend?.meta) return 0;
    if (dataFiltroStr) {
      return Number(adsSpend.meta.byDate?.[dataFiltroStr]) || 0;
    }
    return Number(adsSpend.meta.total) || 0;
  }, [adsSpend, dataFiltroStr]);

  const tiktokSpend = useMemo(() => {
    if (!adsSpend?.tiktok) return 0;
    if (dataFiltroStr) {
      return Number(adsSpend.tiktok.byDate?.[dataFiltroStr]) || 0;
    }
    return Number(adsSpend.tiktok.total) || 0;
  }, [adsSpend, dataFiltroStr]);

  const googleSpend = useMemo(() => {
    if (!adsSpend?.google) return 0;
    if (dataFiltroStr) {
      return Number(adsSpend.google.byDate?.[dataFiltroStr]) || 0;
    }
    return Number(adsSpend.google.total) || 0;
  }, [adsSpend, dataFiltroStr]);

  const metaConfigurado = adsSpend?.meta?.reason !== 'not_configured' || Boolean(metaSpend > 0);
  const tiktokConfigurado = adsSpend?.tiktok?.reason !== 'not_configured' || Boolean(tiktokSpend > 0) || adsSpend?.tiktok?.ok === true;
  const googleConfigurado = Boolean(googleSpend > 0) || adsSpend?.google?.ok === true;

  const handleEditSpend = async (channel, platName) => {
    if (channel === 'tiktok') {
      setModalTikTokAberto(true);
      return;
    }
    const dataAlvo = dataFiltroStr || `${ano}-${String(mesNum).padStart(2, '0')}-${String(hojeDia || '01').padStart(2, '0')}`;
    const valorAtual = dataFiltroStr ? (adsSpend?.[channel]?.byDate?.[dataAlvo] || 0) : (adsSpend?.[channel]?.total || 0);
    const entrada = window.prompt(
      `Informe o investimento em anúncios do ${platName} para ${diaSelecionado ? `o dia ${diaAtivoFormatado}` : `o dia de hoje (${dataAlvo})`} (R$):`,
      valorAtual ? valorAtual.toFixed(2) : ''
    );
    if (entrada === null) return;
    const valorNum = parseFloat(entrada.replace(',', '.'));
    if (isNaN(valorNum) || valorNum < 0) {
      alert('Por favor, informe um valor monetário válido.');
      return;
    }
    const res = await saveManualSpend({ channel, date: dataAlvo, spend: valorNum });
    if (!res?.ok) {
      alert('Erro ao salvar gasto: ' + (res?.error || 'Tente novamente.'));
    }
  };

  // Plataformas enriquecidas com gastos, lucro líquido, ROAS e CPA
  const plataformasComMetricas = useMemo(() => {
    return plataformas.map((plat) => {
      let gasto = 0;
      let configurado = false;
      let pendenteMensagem = null;

      if (plat.key === 'facebook_ads') {
        gasto = metaSpend;
        configurado = metaConfigurado;
        if (!metaConfigurado) pendenteMensagem = 'Credenciais Meta Ads pendentes';
      } else if (plat.key === 'tiktok_ads') {
        gasto = tiktokSpend;
        configurado = tiktokConfigurado;
        if (!tiktokConfigurado) pendenteMensagem = 'Token TikTok com escopo Reporting pendente';
      } else if (plat.key === 'google_ads') {
        gasto = googleSpend;
        configurado = googleConfigurado;
        if (!googleConfigurado && gasto === 0) pendenteMensagem = 'Gasto Google Ads não sincronizado';
      }

      const lucro = Math.round((plat.faturamento - gasto) * 100) / 100;
      const roas = gasto > 0 ? Math.round((plat.faturamento / gasto) * 100) / 100 : null;
      const cpa = (plat.pedidosPagos > 0 && gasto > 0) ? Math.round((gasto / plat.pedidosPagos) * 100) / 100 : null;

      return {
        ...plat,
        gasto,
        configurado,
        pendenteMensagem,
        lucro,
        roas,
        cpa,
      };
    });
  }, [plataformas, metaSpend, tiktokSpend, googleSpend, metaConfigurado, tiktokConfigurado, googleConfigurado]);

  // Totais consolidados
  const totaisConsolidados = useMemo(() => {
    const gastoTotal = Math.round((metaSpend + tiktokSpend + googleSpend) * 100) / 100;
    const lucroTotal = Math.round((totais.faturamento - gastoTotal) * 100) / 100;
    const roasGeral = gastoTotal > 0 ? Math.round((totais.faturamento / gastoTotal) * 100) / 100 : null;
    const cpaGeral = (totais.pedidosPagos > 0 && gastoTotal > 0) ? Math.round((gastoTotal / totais.pedidosPagos) * 100) / 100 : null;

    return {
      ...totais,
      gastoTotal,
      lucroTotal,
      roasGeral,
      cpaGeral,
    };
  }, [totais, metaSpend, tiktokSpend, googleSpend]);

  // Filtra as principais plataformas com atividade ou configuradas para exibição em destaque
  const principaisCards = useMemo(() => {
    return plataformasComMetricas.filter(
      (p) => p.key === 'facebook_ads' || p.key === 'tiktok_ads' || p.key === 'google_ads' || p.faturamento > 0 || p.pedidosCriados > 0 || p.gasto > 0
    );
  }, [plataformasComMetricas]);

  const diaAtivoFormatado = diaSelecionado ? `${String(diaSelecionado).padStart(2, '0')}/${String(mesNum).padStart(2, '0')}` : null;

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
              Faturamento e Lucro por Plataforma
            </h3>
            {loadingAds && (
              <span style={{ fontSize: '0.72rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' }}>
                ⏳ Carregando dados de anúncios...
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '6px 0 0 0' }}>
            Desempenho comparativo de vendas, custos de anúncios (Meta e TikTok), ROAS e lucro líquido por canal.
          </p>
        </div>

        {/* Resumo Consolidado no Topo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
              Faturamento:
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#059669' }}>
              {formatMoney(totaisConsolidados.faturamento)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
              Gasto Ads:
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#dc2626' }}>
              {formatMoney(totaisConsolidados.gastoTotal)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
              Lucro Líquido:
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: totaisConsolidados.lucroTotal >= 0 ? '#059669' : '#dc2626' }}>
              {formatMoney(totaisConsolidados.lucroTotal)}
            </span>
          </div>

          {totaisConsolidados.roasGeral !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                ROAS Geral:
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#7c3aed' }}>
                {totaisConsolidados.roasGeral.toFixed(2)}x
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Filtro por Dia / Período */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#f8fafc',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Filtrar Período:
          </span>

          {/* Botão Mês Todo */}
          <button
            type="button"
            onClick={() => setDiaSelecionado('')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              border: !diaSelecionado ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
              backgroundColor: !diaSelecionado ? '#7c3aed' : '#ffffff',
              color: !diaSelecionado ? '#ffffff' : '#334155',
              transition: 'all 0.15s ease',
            }}
          >
            📅 Mês todo ({nomeDoMes})
          </button>

          {/* Botão Hoje */}
          {ehMesAtual && hojeDia && (
            <button
              type="button"
              onClick={() => setDiaSelecionado(String(hojeDia))}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                border: diaSelecionado === String(hojeDia) ? '1.5px solid #059669' : '1px solid #cbd5e1',
                backgroundColor: diaSelecionado === String(hojeDia) ? '#059669' : '#ffffff',
                color: diaSelecionado === String(hojeDia) ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
              }}
            >
              ⚡ Hoje (Dia {hojeDia})
            </button>
          )}

          {/* Botão Ontem */}
          {ehMesAtual && ontemDia && (
            <button
              type="button"
              onClick={() => setDiaSelecionado(String(ontemDia))}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                border: diaSelecionado === String(ontemDia) ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                backgroundColor: diaSelecionado === String(ontemDia) ? '#2563eb' : '#ffffff',
                color: diaSelecionado === String(ontemDia) ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
              }}
            >
              ⏪ Ontem (Dia {ontemDia})
            </button>
          )}

          {/* Select de Dias do Mês */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label htmlFor="select-dia-plataforma" style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Dia:
            </label>
            <select
              id="select-dia-plataforma"
              value={diaSelecionado || 'todos'}
              onChange={(e) => setDiaSelecionado(e.target.value === 'todos' ? '' : e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: diaSelecionado ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="todos">Todos os dias ({nomeDoMes})</option>
              {listaDias.map((d) => {
                const isHoje = ehMesAtual && d === hojeDia;
                const isOntem = ehMesAtual && d === ontemDia;
                const tag = isHoje ? ' (Hoje)' : isOntem ? ' (Ontem)' : '';
                return (
                  <option key={d} value={String(d)}>
                    Dia {String(d).padStart(2, '0')}/{String(mesNum).padStart(2, '0')}{tag}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Indicador do filtro selecionado */}
        {diaSelecionado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: '700',
                color: '#7c3aed',
                backgroundColor: '#f3e8ff',
                padding: '4px 10px',
                borderRadius: '16px',
                border: '1px solid #ddd6fe',
              }}
            >
              🔍 Visualizando apenas: {diaAtivoFormatado}/{ano}
            </span>
            <button
              type="button"
              onClick={() => setDiaSelecionado('')}
              title="Voltar a exibir o mês inteiro"
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              ✕ Ver mês todo
            </button>
          </div>
        )}
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
                <span>
                  {diaSelecionado
                    ? `Divisão do Faturamento no Dia ${diaAtivoFormatado}`
                    : `Divisão do Faturamento do Mês (${nomeDoMes})`}
                </span>
                <span>100% ({formatMoney(totais.faturamento)})</span>
              </div>
              <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
                {plataformasComMetricas
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
                {plataformasComMetricas
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {principaisCards.map((plat) => {
              const isAds = plat.key === 'facebook_ads' || plat.key === 'tiktok_ads' || plat.key === 'google_ads';

              return (
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
                    {/* Header do Card */}
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
                        {plat.percFaturamento}% receita
                      </span>
                    </div>

                    {/* Faturamento */}
                    <div style={{ margin: '10px 0 14px' }}>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.04em' }}>
                        Faturamento {diaSelecionado ? `(${diaAtivoFormatado})` : ''}
                      </span>
                      <span style={{ fontSize: '1.45rem', fontWeight: '900', color: plat.color, lineHeight: '1.2' }}>
                        {formatMoney(plat.faturamento)}
                      </span>
                    </div>

                    {/* Bloco Financeiro de Anúncios (Gasto, Lucro, ROAS) */}
                    {isAds && (
                      <div
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '8px',
                          border: '1px solid rgba(0,0,0,0.06)',
                          padding: '10px 12px',
                          marginBottom: '12px',
                        }}
                      >
                        {plat.pendenteMensagem && plat.gasto === 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ fontSize: '0.74rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>⚠️</span>
                              <span>{plat.pendenteMensagem}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (plat.key === 'tiktok_ads') {
                                  setModalTikTokAberto(true);
                                } else if (plat.key === 'google_ads') {
                                  handleEditSpend('google', plat.name);
                                } else {
                                  handleEditSpend('meta', plat.name);
                                }
                              }}
                              style={{
                                padding: '3px 8px',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                borderRadius: '6px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #cbd5e1',
                                color: '#334155',
                                cursor: 'pointer',
                              }}
                            >
                              {plat.key === 'tiktok_ads' ? '📅 Editar Dia a Dia' : '✏️ Informar'}
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.78rem' }}>
                              <span style={{ color: '#64748b' }}>Gasto com Ads:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <strong style={{ color: '#dc2626' }}>{formatMoney(plat.gasto)}</strong>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (plat.key === 'tiktok_ads') {
                                      setModalTikTokAberto(true);
                                    } else if (plat.key === 'google_ads') {
                                      handleEditSpend('google', plat.name);
                                    } else {
                                      handleEditSpend('meta', plat.name);
                                    }
                                  }}
                                  title="Ajustar ou informar valor manualmente"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '0 2px',
                                    fontSize: '0.75rem',
                                    color: '#64748b',
                                  }}
                                >
                                  ✏️
                                </button>
                              </div>
                            </div>
                            {plat.key === 'tiktok_ads' && (
                              <button
                                type="button"
                                onClick={() => setModalTikTokAberto(true)}
                                style={{
                                  marginBottom: '8px',
                                  width: '100%',
                                  padding: '5px 8px',
                                  fontSize: '0.74rem',
                                  fontWeight: '700',
                                  borderRadius: '6px',
                                  backgroundColor: '#fff1f2',
                                  border: '1px solid #fecdd3',
                                  color: '#e11d48',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                📅 Editar TikTok Ads Dia a Dia
                              </button>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.78rem' }}>
                              <span style={{ color: '#64748b' }}>Lucro Líquido:</span>
                              <strong style={{ color: plat.lucro >= 0 ? '#059669' : '#dc2626' }}>
                                {formatMoney(plat.lucro)}
                              </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                              <div>
                                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>ROAS: </span>
                                <strong style={{ color: '#7c3aed' }}>
                                  {plat.roas !== null ? `${plat.roas.toFixed(2)}x` : (plat.gasto > 0 ? '0.00x' : '-')}
                                </strong>
                              </div>
                              <div>
                                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>CPA: </span>
                                <strong style={{ color: '#0f172a' }}>
                                  {plat.cpa !== null ? formatMoney(plat.cpa) : '-'}
                                </strong>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Vendas Pagas e Conversão */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      paddingTop: '10px',
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
              );
            })}
          </div>

          {/* Estado Vazio caso não haja vendas no dia selecionado */}
          {diaSelecionado && totais.faturamento === 0 && totais.pedidosCriados === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 16px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1',
                marginBottom: '20px',
              }}
            >
              <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '6px' }}>📭</span>
              <strong style={{ color: '#334155', fontSize: '0.95rem' }}>
                Nenhum pedido ou venda registrado no Dia {diaAtivoFormatado}
              </strong>
              <p style={{ margin: '4px 0 12px', color: '#64748b', fontSize: '0.8rem' }}>
                Nenhum cliente iniciou pedido ou realizou pagamento nessa data específica.
              </p>
              <button
                type="button"
                onClick={() => setDiaSelecionado('')}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Voltar para o Mês Todo
              </button>
            </div>
          )}

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
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>Invest. Ads</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>Lucro Líquido</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>ROAS</th>
                  <th style={{ padding: '10px 12px', fontWeight: '700', textAlign: 'right' }}>CPA</th>
                </tr>
              </thead>
              <tbody>
                {plataformasComMetricas.map((plat) => {
                  const hasData = plat.pedidosCriados > 0 || plat.pedidosPagos > 0 || plat.gasto > 0;
                  const isAds = plat.key === 'facebook_ads' || plat.key === 'tiktok_ads' || plat.key === 'google_ads';

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
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626', fontWeight: '600' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span>
                            {isAds ? (plat.configurado ? formatMoney(plat.gasto) : 'Pendente') : '-'}
                          </span>
                          {plat.key === 'tiktok_ads' && (
                            <button
                              type="button"
                              onClick={() => setModalTikTokAberto(true)}
                              title="Editar investimento do TikTok Ads dia a dia"
                              style={{
                                background: 'none',
                                border: '1px solid #fecdd3',
                                backgroundColor: '#fff1f2',
                                color: '#e11d48',
                                borderRadius: '4px',
                                padding: '1px 5px',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                              }}
                            >
                              ✏️ Dia a dia
                            </button>
                          )}
                          {(plat.key === 'facebook_ads' || plat.key === 'google_ads') && (
                            <button
                              type="button"
                              onClick={() => handleEditSpend(plat.key === 'facebook_ads' ? 'meta' : 'google', plat.name)}
                              title={`Ajustar ou informar valor ${plat.name}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0 2px',
                                fontSize: '0.75rem',
                                color: '#64748b',
                              }}
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '800' }}>
                        <span style={{ color: plat.lucro >= 0 ? '#059669' : '#dc2626' }}>
                          {formatMoney(plat.lucro)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#7c3aed' }}>
                        {plat.roas !== null ? `${plat.roas.toFixed(2)}x` : (plat.gasto > 0 ? '0.00x' : '-')}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f172a', fontWeight: '600' }}>
                        {plat.cpa !== null ? formatMoney(plat.cpa) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: '800', color: '#0f172a' }}>
                  <td style={{ padding: '12px' }}>Total Geral {diaSelecionado ? `(${diaAtivoFormatado})` : ''}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{totais.pedidosCriados}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{totais.pedidosPagos}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#059669' }}>{totais.conversaoGeral}%</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{formatMoney(totais.ticketMedioGeral)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#059669' }}>{formatMoney(totais.faturamento)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#dc2626' }}>{formatMoney(totaisConsolidados.gastoTotal)}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <span style={{ color: totaisConsolidados.lucroTotal >= 0 ? '#059669' : '#dc2626' }}>
                      {formatMoney(totaisConsolidados.lucroTotal)}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#7c3aed' }}>
                    {totaisConsolidados.roasGeral !== null ? `${totaisConsolidados.roasGeral.toFixed(2)}x` : '-'}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {totaisConsolidados.cpaGeral !== null ? formatMoney(totaisConsolidados.cpaGeral) : '-'}
                  </td>
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
              <strong>Integração de Anúncios:</strong> O gasto de <strong>Facebook Ads</strong> é sincronizado automaticamente via Meta Marketing API (Insights diários por data). O <strong>TikTok Ads</strong> pode ser informado dia a dia ou integrado via <code>TIKTOK_ADVERTISER_ID</code>. Pedidos pagos são atribuídos por UTMs, <code>fbclid</code> e <code>ttclid</code>.
            </div>
          </div>
        </>
      )}

      {/* Modal de Edição Diária do TikTok Ads */}
      <TikTokAdsDailyModal
        isOpen={modalTikTokAberto}
        onClose={() => setModalTikTokAberto(false)}
        mesAtivo={mesAtivo}
        pedidos={pedidos}
        adsSpend={adsSpend}
        onSaveDaily={saveManualSpend}
        diaFoco={diaSelecionado}
      />
    </div>
  );
}
