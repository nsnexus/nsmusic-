'use client';

import { useCallback, useEffect, useState } from 'react';

// Painel → Atendimentos: situação do modelo "Suas músicas estão prontas!" (botões "Receber minhas
// músicas" e "Acessar meu pedido") e botão para mandá-lo para aprovação na Meta.
// Dados em GET/POST /api/admin/whatsapp/modelo-entrega.

const SITUACAO = {
  APPROVED: { texto: 'Aprovado: as músicas já vão pelo WhatsApp após o pagamento', cor: '#047857' },
  PENDING: { texto: 'Em análise na Meta (costuma levar de minutos a algumas horas)', cor: '#92400E' },
  IN_APPEAL: { texto: 'Em recurso na Meta', cor: '#92400E' },
  REJECTED: { texto: 'Recusado pela Meta', cor: '#B91C1C' },
  PAUSED: { texto: 'Pausado pela Meta', cor: '#B91C1C' },
  DISABLED: { texto: 'Desativado pela Meta', cor: '#B91C1C' },
};

export default function ModeloEntregaWhatsApp({ authUser }) {
  const [info, setInfo] = useState(null);
  const [estado, setEstado] = useState('carregando'); // carregando | pronto | enviando | erro
  const [erro, setErro] = useState('');

  const pedir = useCallback(async (metodo = 'GET') => {
    const token = await authUser?.getIdToken?.();
    const res = await fetch('/api/admin/whatsapp/modelo-entrega', {
      method: metodo,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha ao falar com o servidor.');
    return data;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    pedir().then((d) => { setInfo(d); setEstado('pronto'); }).catch((e) => { setErro(e.message); setEstado('erro'); });
  }, [authUser, pedir]);

  const enviar = async () => {
    setEstado('enviando');
    setErro('');
    try {
      setInfo(await pedir('POST'));
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  };

  const s = info?.existe ? (SITUACAO[info.status] || { texto: info.status, cor: '#374151' }) : null;

  return (
    <section style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ fontSize: 15 }}>Músicas pelo WhatsApp</strong>
          <span style={{ fontSize: 13, color: s ? s.cor : '#6B7280' }}>
            {estado === 'carregando' ? 'Consultando a Meta…'
              : s ? `${s.texto}${info.motivo ? ` (${info.motivo})` : ''}`
              : info ? 'Modelo ainda não enviado para a Meta. Até lá, vai o aviso de pagamento de sempre.' : ''}
          </span>
          {info?.existe && info.categoria && info.categoria !== 'UTILITY' ? (
            <span style={{ fontSize: 12, color: '#92400E' }}>A Meta classificou como {info.categoria}: cada aviso sai mais caro que o de utilidade.</span>
          ) : null}
        </div>
        {info && !info.existe ? (
          <button type="button" disabled={estado === 'enviando'} onClick={enviar} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#D1FAE5', color: '#065F46', fontWeight: 600, cursor: 'pointer' }}>
            {estado === 'enviando' ? 'Enviando…' : 'Enviar modelo para aprovação'}
          </button>
        ) : null}
      </div>
      {erro ? <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: '#B91C1C' }}>{erro}</p> : null}
    </section>
  );
}
