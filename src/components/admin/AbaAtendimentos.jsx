'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ConfigAtendenteIA from './ConfigAtendenteIA';
import ModeloEntregaWhatsApp from './ModeloEntregaWhatsApp';

// Aba "Atendimentos" do painel: histórico do chat de suporte do site (/suporte).
// Lista as conversas (mais recentes primeiro) e mostra a conversa completa ao clicar.
// Dados em GET /api/admin/atendimentos (exige admin no servidor).

const MARCAS = {
  ajuste_pago: { texto: 'Ajuste pago', cor: '#047857', fundo: '#D1FAE5' },
  ajuste_pix: { texto: 'Pix de ajuste', cor: '#92400E', fundo: '#FEF3C7' },
  pedido_pago: { texto: 'Pagou o pedido', cor: '#047857', fundo: '#D1FAE5' },
  pedido_criado: { texto: 'Criou música', cor: '#1D4ED8', fundo: '#DBEAFE' },
  musica_nova: { texto: 'Quer música nova', cor: '#1D4ED8', fundo: '#DBEAFE' },
  humano: { texto: 'Chamou atendente', cor: '#B91C1C', fundo: '#FEE2E2' },
  ja_paguei: { texto: 'Disse que pagou', cor: '#92400E', fundo: '#FEF3C7' },
  pagamento: { texto: 'Pagamento', cor: '#374151', fundo: '#F3F4F6' },
  ritmo: { texto: 'Ritmo', cor: '#374151', fundo: '#F3F4F6' },
  letra: { texto: 'Letra', cor: '#374151', fundo: '#F3F4F6' },
  baixar: { texto: 'Baixar', cor: '#374151', fundo: '#F3F4F6' },
  criar: { texto: 'Criar', cor: '#374151', fundo: '#F3F4F6' },
};

const quando = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const telefone = (t) => {
  const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : (t || '—');
};

function Marcas({ lista }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {(lista || []).map((m) => MARCAS[m] ? (
        <span key={m} style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: MARCAS[m].cor, background: MARCAS[m].fundo }}>{MARCAS[m].texto}</span>
      ) : null)}
    </span>
  );
}

function Mensagem({ m }) {
  if (m.tipo === 'separador') {
    return (
      <div role="separator" style={{ alignSelf: 'center', margin: '6px 0', padding: '3px 10px', borderRadius: 8, background: '#E1F2FB', color: '#3B4A54', fontSize: 12 }}>
        {m.texto} · {quando(m.em)}
      </div>
    );
  }
  const minha = m.de === 'eu';
  const rotulo = { audio: '🎧 ', arquivo: '📎 ', link: '🔗 ', whatsapp: '💬 ', pix: '💠 ', imagem: '🖼️ ' }[m.tipo] || '';
  const corpo = m.tipo === 'texto' || m.tipo === 'letra' ? m.texto : [m.titulo || m.nome, m.texto].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: minha ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '80%', background: minha ? '#D9FDD3' : '#fff', borderRadius: 8, padding: '6px 9px', boxShadow: '0 1px .5px rgba(11,20,26,.13)', fontSize: 13.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', color: '#111B21' }}>
        {m.tipo === 'letra' ? <em style={{ color: '#54656F' }}>Letra:{'\n'}</em> : null}
        {rotulo}{corpo}
        {Array.isArray(m.opcoes) && m.opcoes.length ? <div style={{ marginTop: 4, fontSize: 12, color: '#0B6F8F' }}>Opções: {m.opcoes.join(' | ')}</div> : null}
        <div style={{ textAlign: 'right', fontSize: 10.5, color: '#667781', marginTop: 2 }}>{quando(m.em)}</div>
      </div>
    </div>
  );
}

export default function AbaAtendimentos({ authUser }) {
  const [conversas, setConversas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(null);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [temMais, setTemMais] = useState(false);

  const buscar = useCallback(async (params) => {
    const token = await authUser?.getIdToken?.();
    const res = await fetch(`/api/admin/atendimentos?${new URLSearchParams(params)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível carregar os atendimentos.');
    return data;
  }, [authUser]);

  const proxima = useRef(null);
  const carregar = useCallback(async ({ mais = false } = {}) => {
    setCarregando(true);
    setErro('');
    try {
      const params = { limite: '40' };
      if (busca.replace(/\D/g, '').length >= 8) params.telefone = busca.replace(/\D/g, '');
      if (mais && proxima.current) params.antes = proxima.current;
      const data = await buscar(params);
      const lista = data.conversas || [];
      proxima.current = data.proximaPagina || null;
      // Um item por cliente: na página seguinte, cliente que já está na lista não repete.
      const chave = (c) => (String(c.customer_phone || '').replace(/\D/g, '').slice(-10) || c.id);
      setConversas((atual) => (mais ? [...atual, ...lista.filter((c) => !atual.some((a) => chave(a) === chave(c)))] : lista));
      setTemMais(Boolean(data.temMais));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [busca, conversas, buscar]);

  useEffect(() => {
    if (authUser) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  const abrir = async (id) => {
    setCarregandoConversa(true);
    setAberta({ id, mensagens: [] });
    try {
      const data = await buscar({ id });
      setAberta(data.conversa);
    } catch (e) {
      setAberta({ id, erro: e.message, mensagens: [] });
    } finally {
      setCarregandoConversa(false);
    }
  };

  return (
    <>
    <ModeloEntregaWhatsApp authUser={authUser} />
    <ConfigAtendenteIA authUser={authUser} />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 380px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <label htmlFor="busca-atendimento" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Buscar por WhatsApp</label>
          <input id="busca-atendimento" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') carregar(); }} placeholder="Buscar por WhatsApp" inputMode="numeric" style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14 }} />
          <button type="button" onClick={() => carregar()} style={{ padding: '9px 14px', borderRadius: 8, border: 0, background: '#008069', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Buscar</button>
        </div>
        {erro ? <p role="alert" style={{ color: '#B91C1C', fontSize: 14 }}>{erro}</p> : null}
        {!erro && !carregando && conversas.length === 0 ? <p style={{ color: '#6B7280', fontSize: 14 }}>Nenhum atendimento ainda. As conversas do chat de suporte aparecem aqui.</p> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conversas.map((c) => (
            <button key={c.id} type="button" onClick={() => abrir(c.id)} style={{ textAlign: 'left', background: aberta?.id === c.id ? '#ECFDF5' : '#fff', border: `1px solid ${aberta?.id === c.id ? '#10B981' : '#E5E7EB'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 14, color: '#111827' }}>{c.customer_name || (c.customer_phone ? 'Cliente (pedido não escolhido)' : 'Sem pedido identificado')}</strong>
                <span style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>{quando(c.atualizado_em)}</span>
              </span>
              <span style={{ fontSize: 12.5, color: '#4B5563' }}>{c.customer_phone ? telefone(c.customer_phone) : 'WhatsApp não informado'} · {c.conversas > 1 ? `${c.conversas} conversas · ` : ''}{c.total_mensagens} mensagens</span>
              <Marcas lista={c.marcas} />
            </button>
          ))}
        </div>
        {carregando ? <p style={{ color: '#6B7280', fontSize: 14 }}>Carregando…</p> : null}
        {temMais && !carregando ? <button type="button" onClick={() => carregar({ mais: true })} style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>Carregar mais</button> : null}
      </section>

      <section style={{ flex: '1 1 420px', minWidth: 0, background: '#EFEAE2', borderRadius: 12, padding: 14, minHeight: 320 }}>
        {!aberta ? <p style={{ color: '#54656F', fontSize: 14 }}>Clique num atendimento para ver a conversa.</p> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ fontSize: 15 }}>{aberta.customer_name || 'Conversa'}</strong>
                <Marcas lista={aberta.marcas} />
              </div>
              {aberta.order_id ? <a href={`/admin/pedidos/${encodeURIComponent(aberta.order_id)}`} style={{ fontSize: 13, color: '#0B6F8F', fontWeight: 600 }}>Abrir pedido</a> : null}
            </div>
            {aberta.erro ? <p role="alert" style={{ color: '#B91C1C', fontSize: 14 }}>{aberta.erro}</p> : null}
            {carregandoConversa ? <p style={{ color: '#54656F', fontSize: 14 }}>Carregando conversa…</p> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '70vh', overflowY: 'auto' }}>
              {(aberta.mensagens || []).map((m, i) => <Mensagem key={i} m={m} />)}
            </div>
          </>
        )}
      </section>
    </div>
    </>
  );
}
