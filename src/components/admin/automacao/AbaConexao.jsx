'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { chamarAdmin, estilos } from './apiAutomacao';

const MOTIVOS = {
  sem_token: 'Nenhum token conectado ainda.',
  permissoes: 'O token funciona, mas faltam permissões.',
  sem_conta_instagram: 'O token não enxerga nenhuma conta profissional do Instagram ligada a uma Página do Facebook.',
  meta_erro: 'A Meta recusou o token.',
};

export default function AbaConexao() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);
  const [token, setToken] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    const r = await chamarAdmin('/api/admin/instagram/config?diagnostico=1');
    if (r.ok) setDados(r.data);
    else setErro(r.error);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async (campos) => {
    setSalvando(true);
    setMensagem(null);
    const r = await chamarAdmin('/api/admin/instagram/config', { method: 'POST', body: campos });
    setSalvando(false);
    if (r.ok) {
      setToken('');
      setMensagem({ tipo: 'sucesso', texto: 'Salvo. Conferindo a conexão...' });
      carregar();
    } else {
      setMensagem({ tipo: 'erro', texto: r.error });
    }
  };

  if (carregando) return <p style={estilos.mudo}>Conferindo a conexão com a Meta...</p>;
  if (erro || !dados) {
    return (
      <div role="alert" style={estilos.erro}>
        {erro || 'Não foi possível conferir a conexão.'}{' '}
        <button type="button" onClick={carregar} style={{ ...estilos.botao, marginLeft: '8px' }}>Tentar de novo</button>
      </div>
    );
  }

  const { config, diagnostico, permissoesNecessarias } = dados;
  const faltando = diagnostico?.faltando || [];
  const contas = diagnostico?.contas || [];

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '860px' }}>
      <section style={{ ...estilos.cartao, display: 'grid', gap: '10px' }}>
        <h2 style={{ fontSize: '15px', margin: 0 }}>Situação</h2>
        {diagnostico?.ok ? (
          <div style={estilos.sucesso}>
            Tudo certo: conectado a @{config.igUsername || contas[0]?.username}
            {config.tokenProprio ? '' : ' usando o mesmo token do painel de Anúncios'}.
          </div>
        ) : (
          <div role="alert" style={estilos.aviso}>
            {MOTIVOS[diagnostico?.motivo] || 'Conexão incompleta.'} {diagnostico?.aviso || ''}
          </div>
        )}

        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: 1.7 }}>
          {permissoesNecessarias.map((p) => {
            const eAnuncio = p === 'ads_read';
            const ok = config.temToken && diagnostico?.motivo !== 'meta_erro' && (eAnuncio ? diagnostico?.temAnuncios : !faltando.includes(p));
            return (
              <li key={p} style={{ color: ok ? '#6ee7b7' : '#fcd34d' }}>
                <code>{p}</code> — {ok ? 'concedida' : 'faltando'}
                {eAnuncio && <span style={{ color: '#94a3b8' }}> (só para comentários de anúncios)</span>}
              </li>
            );
          })}
        </ul>

        {contas.length > 1 && (
          <div>
            <span style={estilos.rotulo}>Conta do Instagram usada</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {contas.map((c) => (
                <button
                  key={c.igUserId}
                  type="button"
                  disabled={salvando}
                  aria-pressed={config.igUserId === c.igUserId}
                  onClick={() => salvar({ igUserId: c.igUserId, igUsername: c.username })}
                  style={{ ...estilos.botao, background: config.igUserId === c.igUserId ? '#2563eb' : '#1e293b' }}
                >
                  @{c.username}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section style={{ ...estilos.cartao, display: 'grid', gap: '10px' }}>
        <h2 style={{ fontSize: '15px', margin: 0 }}>Token da Meta</h2>
        <p style={{ ...estilos.mudo, margin: 0 }}>
          {config.tokenProprio
            ? 'Há um token próprio salvo para a automação. Colar outro substitui o atual.'
            : config.temToken
              ? 'Hoje a automação usa o token do painel de Anúncios. Se faltar permissão nele, cole aqui um token novo com as permissões da lista acima.'
              : 'Cole aqui um token com as permissões da lista acima.'}
        </p>
        <div>
          <label htmlFor="conexao-token" style={estilos.rotulo}>Token de acesso</label>
          <input
            id="conexao-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="EAAG..."
            style={estilos.campo}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            disabled={salvando || !token.trim()}
            onClick={() => salvar({ accessToken: token.trim() })}
            style={{ ...estilos.botaoPrimario, opacity: salvando || !token.trim() ? 0.6 : 1 }}
          >
            {salvando ? 'Salvando...' : 'Salvar token'}
          </button>
          {config.tokenProprio && (
            <button type="button" disabled={salvando} onClick={() => salvar({ accessToken: '' })} style={estilos.botao}>
              Remover token próprio
            </button>
          )}
          <button type="button" onClick={carregar} style={estilos.botao}>Conferir de novo</button>
          {mensagem && (
            <span role="status" style={{ fontSize: '13px', color: mensagem.tipo === 'sucesso' ? '#6ee7b7' : '#fca5a5' }}>{mensagem.texto}</span>
          )}
        </div>
      </section>

      <section style={{ ...estilos.cartao, fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1' }}>
        <h2 style={{ fontSize: '15px', margin: '0 0 8px 0', color: '#f8fafc' }}>Como gerar um token que não expira</h2>
        <ol style={{ margin: 0, paddingLeft: '18px' }}>
          <li>O Instagram precisa ser conta profissional e estar ligado à Página do Facebook da NS Music.</li>
          <li>No Gerenciador de Negócios da Meta: Configurações do negócio → Usuários → Usuários do sistema. Use o usuário do sistema que já existe (o do token de anúncios) ou crie um como Admin.</li>
          <li>Em “Atribuir ativos”, dê a esse usuário controle total da Página, da conta do Instagram e da conta de anúncios.</li>
          <li>Clique em “Gerar token”, escolha o seu app, validade “Nunca” e marque as permissões da lista acima.</li>
          <li>Cole o token no campo acima e toque em “Conferir de novo”: a lista mostra o que ainda falta.</li>
        </ol>
      </section>
    </div>
  );
}
