'use client';

import React from 'react';
import { formatarData, estilos } from './apiAutomacao';

const ROTULOS = {
  responder: { texto: 'Respondeu', cor: '#34d399' },
  ocultar: { texto: 'Ocultou', cor: '#fbbf24' },
  responder_e_ocultar: { texto: 'Respondeu e ocultou', cor: '#fb923c' },
  ignorar: { texto: 'Deixou passar', cor: '#94a3b8' },
  erro: { texto: 'Falhou', cor: '#f87171' },
};

// Lista de decisões da automação — usada tanto no histórico quanto no resultado do teste.
export default function ListaAcoes({ acoes, simulacao = false, vazio }) {
  if (!acoes || acoes.length === 0) return <p style={estilos.mudo}>{vazio}</p>;

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {acoes.map((a, i) => {
        const rotulo = a.ok === false ? ROTULOS.erro : (ROTULOS[a.acao] || ROTULOS.ignorar);
        const verbo = simulacao && a.ok !== false
          ? { responder: 'Responderia', responder_e_ocultar: 'Responderia e ocultaria', ocultar: 'Ocultaria', ignorar: 'Deixaria passar' }[a.acao] || rotulo.texto
          : rotulo.texto;
        return (
          <div key={`${a.commentId}-${i}`} style={{ ...estilos.cartao, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '12px', marginBottom: '4px' }}>
              <span>
                <strong style={{ color: rotulo.cor }}>{verbo}</strong>
                <span style={{ color: '#94a3b8' }}> · @{a.usuario || 'usuário'} · {a.origem === 'anuncio' ? 'anúncio' : 'post'}</span>
              </span>
              <span style={{ color: '#94a3b8' }}>
                {formatarData(a.em)}
                {a.link && (
                  <>
                    {' · '}
                    <a href={a.link} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>ver</a>
                  </>
                )}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#cbd5e1', overflowWrap: 'anywhere' }}>“{a.comentario}”</div>
            {a.resposta && (
              <div style={{ fontSize: '13px', color: '#f8fafc', marginTop: '4px', overflowWrap: 'anywhere' }}>↳ {a.resposta}</div>
            )}
            {a.motivo && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{a.motivo}</div>}
          </div>
        );
      })}
    </div>
  );
}
