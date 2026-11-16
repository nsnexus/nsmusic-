'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { chamarAdmin, formatarData, estilos } from './apiAutomacao';
import CartaoComentario from './CartaoComentario';

const MOTIVOS = {
  sem_token: 'Nenhum token da Meta conectado ainda. Abra a aba Conexão.',
  sem_conta_instagram: 'O token não enxerga nenhuma conta profissional do Instagram ligada a uma Página. Veja a aba Conexão.',
  meta_erro: 'A Meta recusou a leitura dos posts.',
};

function CartaoMidia({ midia, selecionada, onSelecionar }) {
  return (
    <button
      type="button"
      onClick={() => onSelecionar(midia)}
      aria-pressed={selecionada}
      style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        padding: '8px',
        borderRadius: '10px',
        cursor: 'pointer',
        color: '#f8fafc',
        background: selecionada ? 'rgba(37, 99, 235, 0.18)' : '#0f1623',
        border: `1px solid ${selecionada ? '#2563eb' : 'rgba(255, 255, 255, 0.08)'}`,
      }}
    >
      {midia.miniatura ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={midia.miniatura} alt="" width={52} height={52} style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
      ) : (
        <span aria-hidden="true" style={{ width: '52px', height: '52px', borderRadius: '8px', background: '#1e293b', flexShrink: 0 }} />
      )}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {midia.origem === 'anuncio' ? (midia.anuncio || 'Anúncio') : (midia.legenda || 'Sem legenda')}
        </span>
        <span style={{ display: 'block', fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {midia.origem === 'anuncio'
            ? `Campanha: ${midia.campanha || '—'}`
            : `${formatarData(midia.data)} · ${midia.comentarios} comentários · ${midia.curtidas} curtidas`}
        </span>
      </span>
    </button>
  );
}

export default function AbaComentarios() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState('posts');
  const [midia, setMidia] = useState(null);
  const [comentarios, setComentarios] = useState([]);
  const [proprioUsuario, setProprioUsuario] = useState('');
  const [carregandoComentarios, setCarregandoComentarios] = useState(false);
  const [erroComentarios, setErroComentarios] = useState('');

  const carregarPosts = useCallback(async () => {
    setCarregando(true);
    setErro('');
    const r = await chamarAdmin('/api/admin/instagram/posts');
    if (r.ok) setDados(r.data);
    else setErro(r.error);
    setCarregando(false);
  }, []);

  const carregarComentarios = useCallback(async (m) => {
    setCarregandoComentarios(true);
    setErroComentarios('');
    const r = await chamarAdmin(`/api/admin/instagram/comments?mediaId=${encodeURIComponent(m.id)}`);
    if (r.ok) {
      setComentarios(r.data.comentarios || []);
      setProprioUsuario(r.data.proprioUsuario || '');
    } else {
      setComentarios([]);
      setErroComentarios(r.error);
    }
    setCarregandoComentarios(false);
  }, []);

  useEffect(() => {
    carregarPosts();
  }, [carregarPosts]);

  const selecionar = (m) => {
    setMidia(m);
    setComentarios([]);
    carregarComentarios(m);
  };

  if (carregando) return <p style={estilos.mudo}>Carregando posts do Instagram...</p>;
  if (erro) {
    return (
      <div role="alert" style={estilos.erro}>
        {erro}{' '}
        <button type="button" onClick={carregarPosts} style={{ ...estilos.botao, marginLeft: '8px' }}>Tentar de novo</button>
      </div>
    );
  }
  if (!dados?.conectado) {
    return (
      <div style={estilos.aviso}>
        {MOTIVOS[dados?.motivo] || 'Instagram não conectado.'} {dados?.aviso || ''}
      </div>
    );
  }

  const lista = filtro === 'posts' ? dados.posts : dados.anuncios;

  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 300px', minWidth: 0, maxWidth: '100%' }} aria-label="Posts e anúncios">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'posts', rotulo: `Posts e reels (${dados.posts.length})` },
            { id: 'anuncios', rotulo: `Anúncios ativos (${dados.anuncios.length})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              style={{ ...estilos.botao, background: filtro === f.id ? '#2563eb' : '#1e293b' }}
            >
              {f.rotulo}
            </button>
          ))}
          <button type="button" onClick={carregarPosts} style={estilos.botao}>Atualizar</button>
        </div>

        {filtro === 'anuncios' && dados.avisoAnuncios && (
          <div style={{ ...estilos.aviso, marginBottom: '10px' }}>{dados.avisoAnuncios}</div>
        )}

        {lista.length === 0 ? (
          <p style={estilos.mudo}>{filtro === 'posts' ? 'Nenhum post encontrado.' : 'Nenhum anúncio ativo com mídia do Instagram.'}</p>
        ) : (
          <div style={{ display: 'grid', gap: '8px', maxHeight: '70vh', overflowY: 'auto' }}>
            {lista.map((m) => (
              <CartaoMidia key={`${m.origem}-${m.id}`} midia={m} selecionada={midia?.id === m.id} onSelecionar={selecionar} />
            ))}
          </div>
        )}
      </section>

      <section style={{ flex: '2 1 360px', minWidth: 0, maxWidth: '100%' }} aria-label="Comentários">
        {!midia ? (
          <p style={estilos.mudo}>Escolha um post ou anúncio para ver os comentários.</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              <h2 style={{ fontSize: '15px', margin: 0 }}>
                Comentários {midia.origem === 'anuncio' ? 'do anúncio' : 'do post'}
              </h2>
              <span style={{ display: 'inline-flex', gap: '8px' }}>
                {midia.link && (
                  <a href={midia.link} target="_blank" rel="noopener noreferrer" style={{ ...estilos.botao, textDecoration: 'none' }}>
                    Abrir no Instagram
                  </a>
                )}
                <button type="button" onClick={() => carregarComentarios(midia)} style={estilos.botao}>Atualizar</button>
              </span>
            </div>

            {carregandoComentarios && <p style={estilos.mudo}>Carregando comentários...</p>}
            {erroComentarios && <div role="alert" style={estilos.erro}>{erroComentarios}</div>}
            {!carregandoComentarios && !erroComentarios && comentarios.length === 0 && (
              <p style={estilos.mudo}>Nenhum comentário aqui ainda.</p>
            )}

            <div style={{ display: 'grid', gap: '10px' }}>
              {comentarios.map((c) => (
                <CartaoComentario
                  key={c.id}
                  comentario={c}
                  midia={midia}
                  proprioUsuario={proprioUsuario}
                  onMudou={() => carregarComentarios(midia)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
