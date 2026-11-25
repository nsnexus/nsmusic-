'use client';

import { useCallback, useEffect, useState } from 'react';

// Painel → Atendimentos: liga/desliga o atendente com IA do chat de suporte e edita o que ele sabe
// (preços, prazos, regras, jeito de falar). Salvo em GET/PUT /api/admin/atendente.

export default function ConfigAtendenteIA({ authUser }) {
  const [aberto, setAberto] = useState(false);
  const [ligado, setLigado] = useState(true);
  const [texto, setTexto] = useState('');
  const [padrao, setPadrao] = useState('');
  const [estado, setEstado] = useState('carregando'); // carregando | pronto | salvando | salvo | erro
  const [erro, setErro] = useState('');

  const pedir = useCallback(async (metodo = 'GET', corpo = null) => {
    const token = await authUser?.getIdToken?.();
    const res = await fetch('/api/admin/atendente', {
      method: metodo,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha ao falar com o servidor.');
    return data;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    pedir().then((d) => {
      setLigado(d.config?.ligado !== false);
      setTexto(d.config?.texto || '');
      setPadrao(d.padrao || '');
      setEstado('pronto');
    }).catch((e) => { setErro(e.message); setEstado('erro'); });
  }, [authUser, pedir]);

  const salvar = async (novoLigado = ligado) => {
    setEstado('salvando');
    setErro('');
    try {
      const d = await pedir('PUT', { ligado: novoLigado, texto });
      setLigado(d.config.ligado);
      setEstado('salvo');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  };

  return (
    <section style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ fontSize: 15 }}>Atendente com IA</strong>
          <span style={{ fontSize: 13, color: ligado ? '#047857' : '#6B7280' }}>{estado === 'carregando' ? 'Carregando…' : ligado ? 'Ligado: a IA conversa com os clientes no chat' : 'Desligado: o chat usa só os botões e regras'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={estado === 'carregando' || estado === 'salvando'} onClick={() => salvar(!ligado)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', background: ligado ? '#FEE2E2' : '#D1FAE5', color: ligado ? '#991B1B' : '#065F46', fontWeight: 600, cursor: 'pointer' }}>
            {ligado ? 'Desligar' : 'Ligar'}
          </button>
          <button type="button" onClick={() => setAberto((v) => !v)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>
            {aberto ? 'Fechar conhecimento' : 'Editar conhecimento'}
          </button>
        </div>
      </div>
      {erro ? <p role="alert" style={{ color: '#B91C1C', fontSize: 13, margin: '8px 0 0' }}>{erro}</p> : null}
      {aberto ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="conhecimento-ia" style={{ fontSize: 13, color: '#374151' }}>
            O que o atendente sabe: preços, prazos, regras e jeito de falar. Escreva como se estivesse explicando para um funcionário novo.
          </label>
          <textarea id="conhecimento-ia" value={texto} onChange={(e) => { setTexto(e.target.value); setEstado('pronto'); }} rows={18} maxLength={12000} style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13.5, lineHeight: 1.45, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => salvar()} disabled={estado === 'salvando'} style={{ padding: '9px 16px', borderRadius: 8, border: 0, background: '#008069', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              {estado === 'salvando' ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => { setTexto(padrao); setEstado('pronto'); }} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>Voltar ao texto padrão</button>
            {estado === 'salvo' ? <span style={{ fontSize: 13, color: '#047857' }}>Salvo! Já vale para as próximas mensagens.</span> : null}
            <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 'auto' }}>{texto.length}/12000</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
