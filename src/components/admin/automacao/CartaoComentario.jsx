'use client';

import React, { useState } from 'react';
import { chamarAdmin, formatarData, estilos } from './apiAutomacao';

// Um comentário com suas respostas e as ações manuais: responder (com sugestão da IA), ocultar,
// mostrar e apagar. Avisa o pai (`onMudou`) para recarregar a lista depois de cada ação concluída.
export default function CartaoComentario({ comentario, midia, proprioUsuario, onMudou }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const [confirmarApagar, setConfirmarApagar] = useState(false);

  const proprio = String(proprioUsuario || '').toLowerCase();
  const respondido = comentario.respostas.some((r) => proprio && r.usuario.toLowerCase() === proprio);

  const agir = async (acao, extra = {}) => {
    setOcupado(acao);
    setErro('');
    const r = await chamarAdmin('/api/admin/instagram/comments', {
      method: 'POST',
      body: { acao, commentId: comentario.id, ...extra },
    });
    setOcupado('');
    if (!r.ok) {
      setErro(r.error);
      return null;
    }
    return r.data;
  };

  const sugerir = async () => {
    const data = await agir('sugerir', {
      comentario: comentario.texto,
      usuario: comentario.usuario,
      legenda: midia.legenda,
      origem: midia.origem,
    });
    if (!data) return;
    if (data.decisao?.acao === 'responder') {
      setTexto(data.decisao.resposta);
    } else {
      setErro(
        data.decisao?.acao === 'ocultar'
          ? 'A IA acha que este comentário deveria ser ocultado, não respondido.'
          : 'A IA não sugeriu resposta para este comentário.',
      );
    }
  };

  const enviar = async () => {
    if (!texto.trim()) {
      setErro('Escreva a resposta.');
      return;
    }
    const data = await agir('responder', { mensagem: texto.trim() });
    if (data) {
      setTexto('');
      setAberto(false);
      onMudou();
    }
  };

  const alternarOculto = async () => {
    const data = await agir(comentario.oculto ? 'mostrar' : 'ocultar');
    if (data) onMudou();
  };

  const apagar = async () => {
    const data = await agir('apagar');
    setConfirmarApagar(false);
    if (data) onMudou();
  };

  const idCampo = `resposta-${comentario.id}`;

  return (
    <div style={{ ...estilos.cartao, padding: '12px 14px', opacity: comentario.oculto ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <strong style={{ fontSize: '13px' }}>@{comentario.usuario || 'usuário'}</strong>
        <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: '#94a3b8' }}>
          {comentario.oculto && <span style={{ color: '#fbbf24' }}>Oculto</span>}
          {respondido && <span style={{ color: '#34d399' }}>Respondido</span>}
          {formatarData(comentario.data)}
        </span>
      </div>
      <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{comentario.texto}</p>

      {comentario.respostas.length > 0 && (
        <div style={{ borderLeft: '2px solid rgba(255,255,255,0.12)', paddingLeft: '10px', marginBottom: '8px', display: 'grid', gap: '6px' }}>
          {comentario.respostas.map((r) => (
            <div key={r.id} style={{ fontSize: '13px', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              <strong style={{ color: proprio && r.usuario.toLowerCase() === proprio ? '#60a5fa' : '#cbd5e1' }}>@{r.usuario}</strong>{' '}
              <span style={{ color: '#cbd5e1' }}>{r.texto}</span>
            </div>
          ))}
        </div>
      )}

      {erro && <div role="alert" style={{ ...estilos.erro, marginBottom: '8px' }}>{erro}</div>}

      {aberto && !comentario.oculto && (
        <div style={{ marginBottom: '8px' }}>
          <label htmlFor={idCampo} style={estilos.rotulo}>Sua resposta</label>
          <textarea
            id={idCampo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={1000}
            style={{ ...estilos.campo, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <button type="button" onClick={enviar} disabled={Boolean(ocupado)} style={{ ...estilos.botaoPrimario, opacity: ocupado ? 0.7 : 1 }}>
              {ocupado === 'responder' ? 'Enviando...' : 'Enviar resposta'}
            </button>
            <button type="button" onClick={sugerir} disabled={Boolean(ocupado)} style={{ ...estilos.botao, opacity: ocupado ? 0.7 : 1 }}>
              {ocupado === 'sugerir' ? 'Pensando...' : 'Sugerir com IA'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {!comentario.oculto && (
          <button type="button" onClick={() => setAberto((v) => !v)} style={estilos.botao}>
            {aberto ? 'Fechar' : 'Responder'}
          </button>
        )}
        <button type="button" onClick={alternarOculto} disabled={Boolean(ocupado)} style={estilos.botao}>
          {ocupado === 'ocultar' || ocupado === 'mostrar' ? 'Aguarde...' : comentario.oculto ? 'Mostrar' : 'Ocultar'}
        </button>
        {confirmarApagar ? (
          <>
            <button type="button" onClick={apagar} disabled={Boolean(ocupado)} style={{ ...estilos.botao, borderColor: 'rgba(239,68,68,0.5)', color: '#fca5a5' }}>
              {ocupado === 'apagar' ? 'Apagando...' : 'Apagar de vez'}
            </button>
            <button type="button" onClick={() => setConfirmarApagar(false)} style={estilos.botao}>Cancelar</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmarApagar(true)} style={{ ...estilos.botao, color: '#fca5a5' }}>Apagar</button>
        )}
      </div>
    </div>
  );
}
