'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getOrderPlatform, dataCorrespondeAoDia, calcularFaturamentoPedido } from '@/lib/trafficSource';

function formatMoney(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace('.', ',')}`;
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function TikTokAdsDailyModal({
  isOpen,
  onClose,
  mesAtivo,
  pedidos = [],
  adsSpend,
  onSaveDaily,
  diaFoco = null,
}) {
  const [ano, mesNum] = useMemo(() => {
    const d = new Date();
    if (!mesAtivo) return [d.getFullYear(), d.getMonth() + 1];
    const parts = mesAtivo.split('-').map(Number);
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

  // Estado local para os valores editados por data: { '2026-10-06': '45.00', ... }
  const [valoresPorData, setValoresPorData] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [statusPorData, setStatusPorData] = useState({}); // { [dateStr]: 'salvo' | 'salvando' | 'erro' }
  const [feedbackGeral, setFeedbackGeral] = useState(null);

  // Inicializa os valores com base no adsSpend do TikTok
  useEffect(() => {
    if (!isOpen) return;
    const initial = {};
    const existingByDate = adsSpend?.tiktok?.byDate || {};
    for (let d = 1; d <= diasNoMes; d++) {
      const dateStr = `${ano}-${String(mesNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const val = existingByDate[dateStr];
      initial[dateStr] = val !== undefined && val !== null ? String(Number(val).toFixed(2)) : '';
    }
    setValoresPorData(initial);
    setStatusPorData({});
    setFeedbackGeral(null);
  }, [isOpen, adsSpend, ano, mesNum, diasNoMes]);

  // Agrupa pedidos e faturamento do TikTok por dia
  const dadosPorDia = useMemo(() => {
    const mapa = {};
    for (let d = 1; d <= diasNoMes; d++) {
      const dateStr = `${ano}-${String(mesNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      mapa[d] = {
        dia: d,
        dateStr,
        pedidosPagos: 0,
        pedidosCriados: 0,
        faturamento: 0,
      };
    }

    if (Array.isArray(pedidos)) {
      for (const p of pedidos) {
        const plat = getOrderPlatform(p);
        if (plat !== 'tiktok_ads') continue;

        const dataRef = p.paidAt || p.createdAt;
        if (!dataRef) continue;
        const dObj = typeof dataRef?.toDate === 'function' ? dataRef.toDate() : new Date(dataRef);
        if (Number.isNaN(dObj.getTime())) continue;

        const diaNum = dObj.getDate();
        if (mapa[diaNum] && dataCorrespondeAoDia(dataRef, diaNum, mesAtivo)) {
          const musicaPaga = p.paymentStatus === 'PAGAMENTO_APROVADO' || p.paymentStatus === 'PAGO';
          if (musicaPaga) {
            mapa[diaNum].pedidosPagos += 1;
            mapa[diaNum].faturamento += calcularFaturamentoPedido(p, diaNum, mesAtivo);
          } else {
            mapa[diaNum].pedidosCriados += 1;
          }
        }
      }
    }
    return mapa;
  }, [pedidos, diasNoMes, ano, mesNum, mesAtivo]);

  // Lista de dias em ordem decrescente (hoje no topo) para facilitar o acesso
  const listaDias = useMemo(() => {
    const arr = [];
    const maxDia = ehMesAtual && hojeDia ? Math.min(diasNoMes, hojeDia) : diasNoMes;
    for (let d = maxDia; d >= 1; d--) {
      arr.push(d);
    }
    return arr;
  }, [diasNoMes, ehMesAtual, hojeDia]);

  // Totais do mês calculados com base nos valores preenchidos no formulário
  const totaisCalculados = useMemo(() => {
    let gastoTotal = 0;
    let faturamentoTotal = 0;
    let vendasTotal = 0;

    for (let d = 1; d <= diasNoMes; d++) {
      const info = dadosPorDia[d];
      if (info) {
        faturamentoTotal += info.faturamento;
        vendasTotal += info.pedidosPagos;
        const dateStr = info.dateStr;
        const v = parseFloat((valoresPorData[dateStr] || '').replace(',', '.'));
        if (!isNaN(v) && v > 0) {
          gastoTotal += v;
        }
      }
    }

    const lucroTotal = Math.round((faturamentoTotal - gastoTotal) * 100) / 100;
    const roasTotal = gastoTotal > 0 ? Math.round((faturamentoTotal / gastoTotal) * 100) / 100 : null;

    return { gastoTotal, faturamentoTotal, lucroTotal, roasTotal, vendasTotal };
  }, [dadosPorDia, valoresPorData, diasNoMes]);

  const handleChangeValor = (dateStr, val) => {
    setValoresPorData((prev) => ({ ...prev, [dateStr]: val }));
    setStatusPorData((prev) => ({ ...prev, [dateStr]: null }));
  };

  const handleSalvarDiaIndividual = async (dateStr) => {
    const valStr = valoresPorData[dateStr] || '';
    const num = parseFloat(valStr.replace(',', '.'));
    const spend = isNaN(num) || num < 0 ? 0 : Math.round(num * 100) / 100;

    setStatusPorData((prev) => ({ ...prev, [dateStr]: 'salvando' }));
    try {
      const res = await onSaveDaily({ channel: 'tiktok', date: dateStr, spend });
      if (res?.ok) {
        setStatusPorData((prev) => ({ ...prev, [dateStr]: 'salvo' }));
        setTimeout(() => {
          setStatusPorData((prev) => ({ ...prev, [dateStr]: null }));
        }, 3000);
      } else {
        setStatusPorData((prev) => ({ ...prev, [dateStr]: 'erro' }));
      }
    } catch (e) {
      setStatusPorData((prev) => ({ ...prev, [dateStr]: 'erro' }));
    }
  };

  const handleSalvarTudo = async () => {
    setSalvando(true);
    setFeedbackGeral(null);
    try {
      const entries = {};
      for (const [dateStr, valStr] of Object.entries(valoresPorData)) {
        if (valStr !== '' && valStr !== null && valStr !== undefined) {
          const num = parseFloat(String(valStr).replace(',', '.'));
          if (!isNaN(num) && num >= 0) {
            entries[dateStr] = Math.round(num * 100) / 100;
          }
        }
      }

      const res = await onSaveDaily({ channel: 'tiktok', entries });
      if (res?.ok) {
        setFeedbackGeral({ tipo: 'sucesso', texto: 'Gastos diários do TikTok Ads salvos com sucesso!' });
        setTimeout(() => setFeedbackGeral(null), 4000);
      } else {
        setFeedbackGeral({ tipo: 'erro', texto: res?.error || 'Erro ao salvar gastos do TikTok Ads.' });
      }
    } catch (e) {
      setFeedbackGeral({ tipo: 'erro', texto: e?.message || 'Erro inesperado.' });
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            backgroundColor: '#0f172a',
            color: '#ffffff',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>🎵</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                TikTok Ads — Investimento Dia a Dia
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  backgroundColor: '#fe2c55',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                }}
              >
                Mês {String(mesNum).padStart(2, '0')}/{ano}
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '6px 0 0 0' }}>
              Informe quanto investiu em anúncios no TikTok a cada dia. O faturamento, lucro e ROAS diários são calculados em tempo real.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '0 4px',
            }}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Resumo do Mês */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                Total Investido:
              </span>
              <strong style={{ fontSize: '1rem', color: '#dc2626' }}>
                {formatMoney(totaisCalculados.gastoTotal)}
              </strong>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                Faturamento TikTok:
              </span>
              <strong style={{ fontSize: '1rem', color: '#059669' }}>
                {formatMoney(totaisCalculados.faturamentoTotal)}
              </strong>
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '4px' }}>
                ({totaisCalculados.vendasTotal} vendas)
              </span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                Lucro Líquido:
              </span>
              <strong style={{ fontSize: '1rem', color: totaisCalculados.lucroTotal >= 0 ? '#059669' : '#dc2626' }}>
                {formatMoney(totaisCalculados.lucroTotal)}
              </strong>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                ROAS TikTok:
              </span>
              <strong style={{ fontSize: '1rem', color: '#7c3aed' }}>
                {totaisCalculados.roasTotal !== null ? `${totaisCalculados.roasTotal.toFixed(2)}x` : '-'}
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSalvarTudo}
            disabled={salvando}
            style={{
              padding: '8px 16px',
              backgroundColor: salvando ? '#94a3b8' : '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '700',
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)',
            }}
          >
            {salvando ? '⏳ Salvando...' : '💾 Salvar Todos os Dias'}
          </button>
        </div>

        {/* Feedback geral */}
        {feedbackGeral && (
          <div
            style={{
              padding: '10px 24px',
              fontSize: '0.82rem',
              fontWeight: '600',
              backgroundColor: feedbackGeral.tipo === 'sucesso' ? '#ecfdf5' : '#fef2f2',
              color: feedbackGeral.tipo === 'sucesso' ? '#065f46' : '#991b1b',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{feedbackGeral.tipo === 'sucesso' ? '✅' : '⚠️'}</span>
            <span>{feedbackGeral.texto}</span>
          </div>
        )}

        {/* Lista / Tabela dos Dias */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '8px 10px', fontWeight: '700' }}>Data</th>
                <th style={{ padding: '8px 10px', fontWeight: '700', textAlign: 'right' }}>Vendas TikTok</th>
                <th style={{ padding: '8px 10px', fontWeight: '700', textAlign: 'right' }}>Faturamento</th>
                <th style={{ padding: '8px 10px', fontWeight: '700', width: '160px' }}>Investimento Ads (R$)</th>
                <th style={{ padding: '8px 10px', fontWeight: '700', textAlign: 'right' }}>Lucro Dia</th>
                <th style={{ padding: '8px 10px', fontWeight: '700', textAlign: 'right' }}>ROAS</th>
                <th style={{ padding: '8px 10px', fontWeight: '700', textAlign: 'center', width: '90px' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {listaDias.map((d) => {
                const info = dadosPorDia[d];
                const dateStr = info?.dateStr;
                const dObj = new Date(ano, mesNum - 1, d);
                const diaSemana = DIAS_SEMANA[dObj.getDay()];
                const isHoje = ehMesAtual && d === hojeDia;
                const isOntem = ehMesAtual && d === ontemDia;
                const isFoco = diaFoco && String(diaFoco) === String(d);

                const valStr = valoresPorData[dateStr] || '';
                const gastoNum = parseFloat(valStr.replace(',', '.')) || 0;
                const lucroDia = Math.round(((info?.faturamento || 0) - gastoNum) * 100) / 100;
                const roasDia = gastoNum > 0 ? Math.round(((info?.faturamento || 0) / gastoNum) * 100) / 100 : null;
                const status = statusPorData[dateStr];

                return (
                  <tr
                    key={d}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: isFoco ? '#fef3c7' : isHoje ? '#f0fdf4' : isOntem ? '#f8fafc' : '#ffffff',
                    }}
                  >
                    {/* Coluna Data */}
                    <td style={{ padding: '8px 10px', fontWeight: '600', color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>
                          {String(d).padStart(2, '0')}/{String(mesNum).padStart(2, '0')} ({diaSemana})
                        </span>
                        {isHoje && (
                          <span style={{ fontSize: '0.68rem', fontWeight: '700', backgroundColor: '#059669', color: '#ffffff', padding: '1px 6px', borderRadius: '6px' }}>
                            Hoje
                          </span>
                        )}
                        {isOntem && (
                          <span style={{ fontSize: '0.68rem', fontWeight: '700', backgroundColor: '#2563eb', color: '#ffffff', padding: '1px 6px', borderRadius: '6px' }}>
                            Ontem
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Vendas Pagas */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#334155' }}>
                      {info?.pedidosPagos > 0 ? (
                        <strong style={{ color: '#059669' }}>{info.pedidosPagos} pagas</strong>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>0</span>
                      )}
                    </td>

                    {/* Faturamento */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: info?.faturamento > 0 ? '#059669' : '#94a3b8' }}>
                      {formatMoney(info?.faturamento || 0)}
                    </td>

                    {/* Input de Gasto */}
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={valStr}
                          onChange={(e) => handleChangeValor(dateStr, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSalvarDiaIndividual(dateStr);
                          }}
                          style={{
                            width: '100px',
                            padding: '4px 8px',
                            fontSize: '0.84rem',
                            fontWeight: '700',
                            borderRadius: '6px',
                            border: gastoNum > 0 ? '1.5px solid #fe2c55' : '1px solid #cbd5e1',
                            outline: 'none',
                            color: gastoNum > 0 ? '#dc2626' : '#0f172a',
                            backgroundColor: '#ffffff',
                          }}
                        />
                      </div>
                    </td>

                    {/* Lucro do Dia */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700' }}>
                      <span style={{ color: lucroDia >= 0 ? (lucroDia > 0 ? '#059669' : '#64748b') : '#dc2626' }}>
                        {formatMoney(lucroDia)}
                      </span>
                    </td>

                    {/* ROAS do Dia */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#7c3aed' }}>
                      {roasDia !== null ? `${roasDia.toFixed(2)}x` : '-'}
                    </td>

                    {/* Botão de Salvar da Linha */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {status === 'salvando' ? (
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>⏳</span>
                      ) : status === 'salvo' ? (
                        <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '700' }}>✓ Salvo</span>
                      ) : status === 'erro' ? (
                        <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: '700' }}>Erro</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSalvarDiaIndividual(dateStr)}
                          title="Salvar apenas este dia"
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            fontWeight: '600',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          Salvar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            💡 Você pode digitar e apertar <strong>Enter</strong> para salvar o dia, ou clicar em <strong>Salvar Todos os Dias</strong>.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSalvarTudo}
              disabled={salvando}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: salvando ? '#94a3b8' : '#fe2c55',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: salvando ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(254, 44, 85, 0.3)',
              }}
            >
              {salvando ? 'Salvando...' : '💾 Salvar Tudo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
