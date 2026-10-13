'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';
import { CATEGORIAS_RECEITA, CATEGORIAS_DESPESA } from '@/lib/financial';

function formatMoney(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCurrentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AbaFinanceiro() {
  const [mesAtivo, setMesAtivo] = useState(getCurrentMonthStr);
  const [filtroTipo, setFiltroTipo] = useState('all'); // 'all', 'receita', 'despesa'
  const [lancamentos, setLancamentos] = useState([]);
  const [resumo, setResumo] = useState({ totalReceitas: 0, totalDespesas: 0, saldoLiquido: 0 });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Estado do Modal de Novo Lançamento
  const [modalAberto, setModalAberto] = useState(false);
  const [tipoModal, setTipoModal] = useState('receita'); // 'receita' ou 'despesa'
  const [formData, setFormData] = useState({
    data: getTodayStr(),
    valor: '',
    categoria: CATEGORIAS_RECEITA[0],
    descricao: '',
    observacoes: '',
    valorBaseAds: '', // aux para calculo de 13,8% de imposto
  });
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);

  // Carrega lançamentos da API
  const carregarDados = async () => {
    setCarregando(true);
    setErro('');
    try {
      let token = await getAdminAuthToken();
      const params = new URLSearchParams();
      if (mesAtivo) params.set('mes', mesAtivo);
      if (filtroTipo !== 'all') params.set('tipo', filtroTipo);

      let res = await fetch(`/api/admin/financial?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 401) {
        const freshToken = await getAdminAuthToken(true);
        if (freshToken) {
          token = freshToken;
          res = await fetch(`/api/admin/financial?${params.toString()}`, {
            headers: { Authorization: `Bearer ${freshToken}` },
          });
        }
      }

      const json = await res.json();
      if (res.ok && json.ok) {
        setLancamentos(json.entries || []);
        setResumo(json.resumo || { totalReceitas: 0, totalDespesas: 0, saldoLiquido: 0 });
      } else {
        setErro(json.error || 'Erro ao carregar dados financeiros.');
      }
    } catch (err) {
      console.error('[AbaFinanceiro] Erro ao carregar lançamentos:', err);
      setErro('Não foi possível carregar os lançamentos. Verifique sua conexão.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [mesAtivo, filtroTipo]);

  // Abertura do modal com tipo pré-definido
  const abrirModal = (tipo, categoriaPadrao = null) => {
    setTipoModal(tipo);
    const cat = categoriaPadrao || (tipo === 'receita' ? CATEGORIAS_RECEITA[0] : CATEGORIAS_DESPESA[0]);
    setFormData({
      data: getTodayStr(),
      valor: '',
      categoria: cat,
      descricao: '',
      observacoes: '',
      valorBaseAds: '',
    });
    setModalAberto(true);
    setErro('');
    setSucesso('');
  };

  // Alterna tipo dentro do modal
  const handleTrocarTipoModal = (novoTipo) => {
    setTipoModal(novoTipo);
    setFormData((prev) => ({
      ...prev,
      categoria: novoTipo === 'receita' ? CATEGORIAS_RECEITA[0] : CATEGORIAS_DESPESA[0],
    }));
  };

  // Cálculo automático do imposto de 13,8% sobre anúncios no Facebook
  const handleCalcularImpostoAds = () => {
    const base = parseFloat(String(formData.valorBaseAds).replace(',', '.'));
    if (isNaN(base) || base <= 0) {
      alert('Digite o valor gasto com anúncios no Facebook para calcular o imposto.');
      return;
    }
    const imposto = Math.round(base * 0.138 * 100) / 100;
    setFormData((prev) => ({
      ...prev,
      valor: imposto.toFixed(2),
      descricao: prev.descricao || `Imposto 13,8% sobre anúncio Face Ads (${formatMoney(base)})`,
    }));
  };

  // Salvar novo lançamento
  const handleSalvarLancamento = async (e) => {
    e.preventDefault();
    const valorNum = parseFloat(String(formData.valor).replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      alert('Por favor, informe um valor monetário maior que zero.');
      return;
    }
    if (!formData.descricao.trim()) {
      alert('Por favor, informe a descrição do lançamento.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      let token = await getAdminAuthToken();
      const payload = {
        tipo: tipoModal,
        data: formData.data,
        valor: valorNum,
        categoria: formData.categoria,
        descricao: formData.descricao.trim(),
        observacoes: formData.observacoes.trim(),
      };

      const res = await fetch('/api/admin/financial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setSucesso(
          `${tipoModal === 'receita' ? 'Receita' : 'Despesa'} de ${formatMoney(valorNum)} lançada com sucesso!`
        );
        setModalAberto(false);
        await carregarDados();
        setTimeout(() => setSucesso(''), 4000);
      } else {
        alert(json.error || 'Erro ao salvar lançamento.');
      }
    } catch (err) {
      console.error('[AbaFinanceiro] Erro ao salvar:', err);
      alert('Erro ao conectar ao servidor para salvar.');
    } finally {
      setSalvando(false);
    }
  };

  // Excluir lançamento
  const handleExcluirLancamento = async (item) => {
    const conf = window.confirm(
      `Deseja realmente excluir o lançamento "${item.descricao}" no valor de ${formatMoney(item.valor)}?`
    );
    if (!conf) return;

    setExcluindoId(item.id);
    try {
      let token = await getAdminAuthToken();
      const res = await fetch(`/api/admin/financial?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setSucesso('Lançamento excluído com sucesso.');
        await carregarDados();
        setTimeout(() => setSucesso(''), 3000);
      } else {
        alert(json.error || 'Erro ao excluir lançamento.');
      }
    } catch (err) {
      console.error('[AbaFinanceiro] Erro ao excluir:', err);
      alert('Falha ao excluir lançamento.');
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      {/* Cabeçalho da Seção */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px' }}>
            💰 Controle Financeiro (Receitas & Despesas)
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            Lance receitas avulsas, despesas operacionais e controle o imposto de anúncios (13,8%) do seu negócio.
          </p>
        </div>

        {/* Filtro de Mês e Botões de Lançamento */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <label
              htmlFor="financial-month"
              style={{ display: 'block', fontSize: '0.74rem', color: '#64748b', marginBottom: '2px', fontWeight: '600' }}
            >
              Mês de Referência
            </label>
            <input
              id="financial-month"
              type="month"
              value={mesAtivo}
              onChange={(e) => setMesAtivo(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.88rem',
                color: '#0f172a',
                backgroundColor: '#ffffff',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => abrirModal('receita')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '8px',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.88rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(5,150,105,0.2)',
            }}
          >
            + Nova Receita
          </button>

          <button
            type="button"
            onClick={() => abrirModal('despesa')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '8px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.88rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(220,38,38,0.2)',
            }}
          >
            - Nova Despesa
          </button>
        </div>
      </div>

      {/* Alertas de Sucesso / Erro */}
      {sucesso && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#ecfdf5',
            border: '1px solid #10b981',
            color: '#065f46',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '0.88rem',
            fontWeight: '600',
          }}
        >
          ✅ {sucesso}
        </div>
      )}
      {erro && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #ef4444',
            color: '#991b1b',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '0.88rem',
            fontWeight: '600',
          }}
        >
          ⚠️ {erro}
        </div>
      )}

      {/* Cards de Resumo Consolidado (KPIs) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Total Receitas */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1.5px solid #a7f3d0',
            padding: '18px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#047857', fontWeight: '700', textTransform: 'uppercase' }}>
              🟢 Receitas Avulsas
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                backgroundColor: '#d1fae5',
                color: '#065f46',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: '700',
              }}
            >
              {resumo.countReceitas || 0} lanç.
            </span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#059669' }}>
            {formatMoney(resumo.totalReceitas)}
          </div>
        </div>

        {/* Total Despesas */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1.5px solid #fecdd3',
            padding: '18px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: '700', textTransform: 'uppercase' }}>
              🔴 Despesas Operacionais
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                backgroundColor: '#ffe4e6',
                color: '#9f1239',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: '700',
              }}
            >
              {resumo.countDespesas || 0} lanç.
            </span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#dc2626' }}>
            {formatMoney(resumo.totalDespesas)}
          </div>
        </div>

        {/* Saldo Líquido do Caixa */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: `1.5px solid ${resumo.saldoLiquido >= 0 ? '#bbf7d0' : '#fecaca'}`,
            padding: '18px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: '700', textTransform: 'uppercase' }}>
              💵 Saldo Líquido Avulso
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                backgroundColor: resumo.saldoLiquido >= 0 ? '#dcfce7' : '#fee2e2',
                color: resumo.saldoLiquido >= 0 ? '#15803d' : '#b91c1c',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: '700',
              }}
            >
              {resumo.saldoLiquido >= 0 ? 'Positivo' : 'Negativo'}
            </span>
          </div>
          <div
            style={{
              fontSize: '1.65rem',
              fontWeight: '900',
              color: resumo.saldoLiquido >= 0 ? '#16a34a' : '#ef4444',
            }}
          >
            {formatMoney(resumo.saldoLiquido)}
          </div>
        </div>

        {/* Dica / Atalho Imposto Face Ads */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '12px',
            border: '1.5px dashed #cbd5e1',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              ⚡ Imposto Face Ads (13,8%)
            </span>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 8px' }}>
              Lança o imposto sobre notas de anúncio da Meta (+R$ 13,80 a cada R$ 100).
            </p>
          </div>
          <button
            type="button"
            onClick={() => abrirModal('despesa', 'Imposto Facebook Ads (13,8%)')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#1877f2',
              color: '#ffffff',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            + Lançar Imposto Ads
          </button>
        </div>
      </div>

      {/* Barra de Filtro de Listagem */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#ffffff',
          padding: '12px 18px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setFiltroTipo('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filtroTipo === 'all' ? '#0f172a' : '#f1f5f9',
              color: filtroTipo === 'all' ? '#ffffff' : '#475569',
            }}
          >
            Todos ({lancamentos.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo('receita')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filtroTipo === 'receita' ? '#059669' : '#f1f5f9',
              color: filtroTipo === 'receita' ? '#ffffff' : '#475569',
            }}
          >
            Apenas Receitas
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo('despesa')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filtroTipo === 'despesa' ? '#dc2626' : '#f1f5f9',
              color: filtroTipo === 'despesa' ? '#ffffff' : '#475569',
            }}
          >
            Apenas Despesas
          </button>
        </div>

        <button
          type="button"
          onClick={carregarDados}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: '600',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Tabela de Lançamentos */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}
      >
        {carregando ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            Carregando lançamentos financeiros...
          </div>
        ) : lancamentos.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '8px' }}>📂</span>
            <strong style={{ fontSize: '1rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
              Nenhum lançamento encontrado
            </strong>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 16px' }}>
              Não há receitas ou despesas cadastradas para o período selecionado ({mesAtivo}).
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => abrirModal('receita')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                + Lançar Receita
              </button>
              <button
                type="button"
                onClick={() => abrirModal('despesa')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                - Lançar Despesa
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Data</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Tipo</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Categoria</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Descrição</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Observações</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700', textAlign: 'right' }}>Valor</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700', textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((item) => {
                  const isReceita = item.tipo === 'receita';

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: '#334155', fontWeight: '600' }}>
                        {formatDateBr(item.data)}
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            backgroundColor: isReceita ? '#dcfce7' : '#fee2e2',
                            color: isReceita ? '#15803d' : '#b91c1c',
                          }}
                        >
                          {isReceita ? '🟢 Receita' : '🔴 Despesa'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: '600' }}>
                        {item.categoria}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#1e293b' }}>
                        {item.descricao}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.82rem' }}>
                        {item.observacoes || '-'}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: '800',
                          color: isReceita ? '#059669' : '#dc2626',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isReceita ? `+ ${formatMoney(item.valor)}` : `- ${formatMoney(item.valor)}`}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleExcluirLancamento(item)}
                          disabled={excluindoId === item.id}
                          title="Excluir lançamento"
                          style={{
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                          }}
                        >
                          {excluindoId === item.id ? '...' : '🗑️ Excluir'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Lançamento */}
      {modalAberto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              boxSizing: 'border-box',
            }}
          >
            {/* Header do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                {tipoModal === 'receita' ? '🟢 Novo Lançamento de Receita' : '🔴 Novo Lançamento de Despesa'}
              </h3>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Alternador de Tipo */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => handleTrocarTipoModal('receita')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: tipoModal === 'receita' ? '#059669' : '#f1f5f9',
                  color: tipoModal === 'receita' ? '#ffffff' : '#475569',
                }}
              >
                🟢 Receita
              </button>
              <button
                type="button"
                onClick={() => handleTrocarTipoModal('despesa')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: tipoModal === 'despesa' ? '#dc2626' : '#f1f5f9',
                  color: tipoModal === 'despesa' ? '#ffffff' : '#475569',
                }}
              >
                🔴 Despesa
              </button>
            </div>

            <form onSubmit={handleSalvarLancamento}>
              {/* Data e Categoria */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#334155', fontWeight: '600', marginBottom: '4px' }}>
                    Data do Lançamento
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.data}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#334155', fontWeight: '600', marginBottom: '4px' }}>
                    Categoria
                  </label>
                  <select
                    value={formData.categoria}
                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.85rem',
                      backgroundColor: '#ffffff',
                      boxSizing: 'border-box',
                    }}
                  >
                    {(tipoModal === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Assistente de Cálculo de Imposto Facebook Ads (13,8%) */}
              {tipoModal === 'despesa' && formData.categoria === 'Imposto Facebook Ads (13,8%)' && (
                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '14px',
                  }}
                >
                  <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#1d4ed8', marginBottom: '4px' }}>
                    ⚡ Calculadora de Imposto (13,8%)
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Valor gasto com anúncio (ex: 100)"
                      value={formData.valorBaseAds}
                      onChange={(e) => setFormData({ ...formData, valorBaseAds: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #93c5fd',
                        fontSize: '0.82rem',
                        backgroundColor: '#ffffff',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleCalcularImpostoAds}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Calcular 13,8%
                    </button>
                  </div>
                </div>
              )}

              {/* Valor (R$) e Descrição */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#334155', fontWeight: '600', marginBottom: '4px' }}>
                  Valor (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0,00"
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '1rem',
                    fontWeight: '700',
                    color: tipoModal === 'receita' ? '#059669' : '#dc2626',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#334155', fontWeight: '600', marginBottom: '4px' }}>
                  Descrição *
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    tipoModal === 'receita'
                      ? 'Ex: Venda avulsa via WhatsApp cliente Marcos'
                      : 'Ex: Imposto nota Meta Ads Outubro / Hetzner VPS'
                  }
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Observações */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#334155', fontWeight: '600', marginBottom: '4px' }}>
                  Observações (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalhes adicionais, comprovante ou anotações..."
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Ações do Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    backgroundColor: tipoModal === 'receita' ? '#059669' : '#dc2626',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    border: 'none',
                    cursor: salvando ? 'not-allowed' : 'pointer',
                    opacity: salvando ? 0.7 : 1,
                  }}
                >
                  {salvando ? 'Salvando...' : 'Salvar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
