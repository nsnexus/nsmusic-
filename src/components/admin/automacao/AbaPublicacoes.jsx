'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { chamarAdmin, formatarData, estilos } from './apiAutomacao';
import ConfigDrive from './ConfigDrive';

const MOTIVOS = {
  publicado: 'Post publicado.',
  ja_publicado: 'O post de hoje já foi publicado.',
  sem_pasta_hoje: 'Ainda não existe pasta com a data de hoje no Drive.',
  drive_nao_configurado: 'Configure a pasta do Drive e a conta de serviço primeiro.',
  drive_erro: 'Não foi possível ler o Drive.',
  tentativa_sem_conclusao: 'Há uma tentativa de hoje que não terminou. Confira no perfil se o post saiu e, se não saiu, libere o dia para tentar de novo.',
  outra_execucao_em_andamento: 'Outra publicação está em andamento agora.',
  erro: 'Não foi possível publicar.',
  supabase_ausente: 'Banco de dados não configurado.',
};

const STATUS = {
  publicado: { texto: 'Publicado', cor: '#34d399' },
  erro: { texto: 'Falhou', cor: '#f87171' },
  iniciada: { texto: 'Sem conclusão', cor: '#fbbf24' },
};

function formatarDia(data) {
  const [a, m, d] = String(data).split('-');
  return d && m ? `${d}/${m}/${a}` : data;
}

function PastaDeHoje({ hoje }) {
  if (!hoje) return null;
  if (!hoje.configurado) return <div style={estilos.aviso}>{MOTIVOS.drive_nao_configurado}</div>;
  if (hoje.erro) return <div role="alert" style={estilos.erro}>{hoje.erro}</div>;
  if (!hoje.existe) {
    return (
      <div style={estilos.aviso}>
        {MOTIVOS.sem_pasta_hoje}
        {hoje.proximas?.length > 0 && ` Próximas pastas encontradas: ${hoje.proximas.map(formatarDia).join(', ')}.`}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {hoje.problemas.length > 0 && (
        <div role="alert" style={estilos.erro}>
          {hoje.problemas.map((p) => <div key={p}>{p}</div>)}
        </div>
      )}
      {hoje.imagens.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {hoje.imagens.filter((img) => img.link).map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.nome}
              src={img.link}
              alt={`Imagem ${i + 1} do post de hoje: ${img.nome}`}
              style={{ width: '120px', height: '150px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, background: '#1e293b' }}
            />
          ))}
        </div>
      )}
      {hoje.imagens.length > 0 && (
        <span style={estilos.mudo}>{hoje.imagens.length === 1 ? 'Foto única' : `Carrossel com ${hoje.imagens.length} imagens`}</span>
      )}
      {hoje.legenda && (
        <div style={{ ...estilos.campo, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '180px', overflowY: 'auto', fontSize: '13px' }}>
          {hoje.legenda}
        </div>
      )}
      {hoje.proximas?.length > 0 && (
        <span style={estilos.mudo}>Próximas pastas: {hoje.proximas.map(formatarDia).join(', ')}.</span>
      )}
    </div>
  );
}

export default function AbaPublicacoes() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);
  const [horario, setHorario] = useState('09:00');
  const [ocupado, setOcupado] = useState('');
  const [mensagem, setMensagem] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    const r = await chamarAdmin('/api/admin/instagram/publicacao?conferir=1');
    if (r.ok) {
      setDados(r.data);
      setHorario(r.data.config.horario);
    } else {
      setErro(r.error);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const enviar = async (campos, chave) => {
    setOcupado(chave);
    setMensagem(null);
    const r = await chamarAdmin('/api/admin/instagram/publicacao', { method: 'POST', body: campos });
    setOcupado('');
    return r;
  };

  const salvar = async (campos, chave) => {
    const r = await enviar(campos, chave);
    if (r.ok) {
      setMensagem({ tipo: 'sucesso', texto: 'Salvo.' });
      carregar();
    } else {
      setMensagem({ tipo: 'erro', texto: r.error });
    }
  };

  const publicarAgora = async () => {
    setConfirmando(false);
    const r = await enviar({ acao: 'publicar' }, 'publicar');
    if (!r.ok) {
      setMensagem({ tipo: 'erro', texto: r.error });
      return;
    }
    const res = r.data;
    const texto = `${MOTIVOS[res.motivo] || 'Concluído.'}${res.erro ? ` ${res.erro}` : ''}`;
    setMensagem({ tipo: res.ok && (res.motivo === 'publicado' || res.motivo === 'ja_publicado') ? 'sucesso' : 'erro', texto });
    carregar();
  };

  const liberar = async (data) => {
    const r = await enviar({ acao: 'liberar', data }, `liberar-${data}`);
    if (r.ok) {
      setMensagem({ tipo: 'sucesso', texto: 'Dia liberado. Já pode tentar de novo.' });
      carregar();
    } else {
      setMensagem({ tipo: 'erro', texto: r.error });
    }
  };

  if (carregando && !dados) return <p style={estilos.mudo}>Conferindo a pasta de hoje no Drive...</p>;
  if (erro || !dados) {
    return (
      <div role="alert" style={estilos.erro}>
        {erro || 'Não foi possível carregar.'}{' '}
        <button type="button" onClick={carregar} style={{ ...estilos.botao, marginLeft: '8px' }}>Tentar de novo</button>
      </div>
    );
  }

  const { config, hoje, historico, dataDeHoje } = dados;
  const registroDeHoje = historico.find((h) => h.data === dataDeHoje);
  const prontoParaPublicar = hoje?.existe && hoje.problemas.length === 0 && !registroDeHoje;

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '860px' }}>
      {dados.permissaoPublicar === false && (
        <div role="alert" style={estilos.aviso}>
          O token da Meta não tem a permissão <code>instagram_content_publish</code>. Sem ela o Instagram recusa a publicação. Adicione no
          caso de uso do Instagram do app, gere o token de novo e salve na aba Conexão.
        </div>
      )}
      {!dados.assinaturaConfigurada && (
        <div role="alert" style={estilos.erro}>CRON_SECRET não está configurado no servidor; sem ele não é possível publicar.</div>
      )}

      <section style={{ ...estilos.cartao, display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ fontSize: '15px', margin: 0 }}>Post de hoje — {formatarDia(dataDeHoje)}</h2>
          <button type="button" onClick={carregar} disabled={carregando} style={{ ...estilos.botao, opacity: carregando ? 0.7 : 1 }}>
            {carregando ? 'Conferindo...' : 'Conferir pasta'}
          </button>
        </div>

        {registroDeHoje?.status === 'publicado' && (
          <div style={estilos.sucesso}>
            Publicado às {formatarData(registroDeHoje.em)}.{' '}
            {registroDeHoje.link && <a href={registroDeHoje.link} target="_blank" rel="noopener noreferrer" style={{ color: '#6ee7b7' }}>Ver no Instagram</a>}
          </div>
        )}
        {registroDeHoje && registroDeHoje.status !== 'publicado' && (
          <div role="alert" style={registroDeHoje.status === 'iniciada' ? estilos.aviso : estilos.erro}>
            {registroDeHoje.status === 'iniciada' ? MOTIVOS.tentativa_sem_conclusao : `Falhou: ${registroDeHoje.erro}`}{' '}
            {registroDeHoje.status === 'iniciada' && registroDeHoje.erro}
            <div style={{ marginTop: '8px' }}>
              <button type="button" onClick={() => liberar(dataDeHoje)} disabled={Boolean(ocupado)} style={estilos.botao}>
                {ocupado === `liberar-${dataDeHoje}` ? 'Liberando...' : 'Liberar para tentar de novo'}
              </button>
            </div>
          </div>
        )}

        <PastaDeHoje hoje={hoje} />

        {prontoParaPublicar && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {confirmando ? (
              <>
                <button type="button" onClick={publicarAgora} disabled={Boolean(ocupado)} style={estilos.botaoPrimario}>Sim, publicar no Instagram</button>
                <button type="button" onClick={() => setConfirmando(false)} style={estilos.botao}>Cancelar</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmando(true)} disabled={Boolean(ocupado)} style={{ ...estilos.botao, opacity: ocupado ? 0.7 : 1 }}>
                {ocupado === 'publicar' ? 'Publicando...' : 'Publicar agora'}
              </button>
            )}
            <span style={estilos.mudo}>
              {config.ligada ? `Se você não tocar, sai sozinho a partir das ${config.horario}.` : 'A publicação automática está desligada.'}
            </span>
          </div>
        )}

        {mensagem && <div role="status" style={mensagem.tipo === 'sucesso' ? estilos.sucesso : estilos.erro}>{mensagem.texto}</div>}
      </section>

      <section style={{ ...estilos.cartao, display: 'grid', gap: '14px' }}>
        <label htmlFor="pub-ligada" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            id="pub-ligada"
            type="checkbox"
            checked={config.ligada}
            disabled={ocupado === 'ligada'}
            onChange={(e) => salvar({ ligada: e.target.checked }, 'ligada')}
            style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#2563eb' }}
          />
          <span>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>
              {config.ligada ? 'Publicação automática ligada' : 'Publicação automática desligada'}
            </span>
            <span style={{ display: 'block', fontSize: '12px', color: '#94a3b8' }}>
              Todo dia, a partir do horário abaixo, publica o que estiver na pasta com a data do dia. A conferência roda a cada 15 minutos,
              então o post sai até 15 minutos depois do horário. Se a pasta chegar atrasada, sai assim que chegar, no mesmo dia.
            </span>
          </span>
        </label>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="pub-horario" style={estilos.rotulo}>Horário (Brasília)</label>
            <input id="pub-horario" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} style={{ ...estilos.campo, width: '140px' }} />
          </div>
          <button
            type="button"
            onClick={() => salvar({ horario }, 'horario')}
            disabled={ocupado === 'horario' || horario === config.horario}
            style={{ ...estilos.botaoPrimario, opacity: ocupado === 'horario' || horario === config.horario ? 0.6 : 1 }}
          >
            {ocupado === 'horario' ? 'Salvando...' : 'Salvar horário'}
          </button>
        </div>
      </section>

      <ConfigDrive config={config} onSalvo={carregar} />

      <section>
        <h2 style={{ fontSize: '15px', margin: '0 0 10px 0' }}>Histórico</h2>
        {historico.length === 0 ? (
          <p style={estilos.mudo}>Nenhuma publicação registrada ainda.</p>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {historico.map((h) => {
              const s = STATUS[h.status] || STATUS.erro;
              return (
                <div key={h.data} style={{ ...estilos.cartao, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '13px' }}>
                  <span>
                    <strong>{formatarDia(h.data)}</strong> · <span style={{ color: s.cor }}>{s.texto}</span>
                    {h.status === 'publicado' && h.imagens > 1 && <span style={{ color: '#94a3b8' }}> · carrossel de {h.imagens}</span>}
                    {h.status !== 'publicado' && h.erro && <span style={{ color: '#94a3b8' }}> · {h.erro}</span>}
                  </span>
                  <span style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
                    {h.link && <a href={h.link} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>ver post</a>}
                    {h.status !== 'publicado' && h.data !== dataDeHoje && (
                      <button type="button" onClick={() => liberar(h.data)} disabled={Boolean(ocupado)} style={{ ...estilos.botao, padding: '4px 10px', fontSize: '12px' }}>
                        Limpar
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
