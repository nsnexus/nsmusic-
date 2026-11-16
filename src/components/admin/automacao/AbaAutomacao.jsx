'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { chamarAdmin, formatarData, estilos } from './apiAutomacao';
import ListaAcoes from './ListaAcoes';

const MOTIVOS_EXECUCAO = {
  desligada: 'A automação está desligada.',
  sem_token: 'Nenhum token da Meta conectado (aba Conexão).',
  sem_conta_instagram: 'O token não enxerga a conta do Instagram (aba Conexão).',
  supabase_ausente: 'Banco de dados não configurado.',
  estado_nao_gravado: 'As ações foram feitas, mas o histórico não pôde ser salvo.',
  meta_erro: 'A Meta recusou a leitura.',
};

function Interruptor({ id, marcado, onChange, rotulo, descricao, disabled }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#2563eb' }}
      />
      <span>
        <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>{rotulo}</span>
        {descricao && <span style={{ display: 'block', fontSize: '12px', color: '#94a3b8' }}>{descricao}</span>}
      </span>
    </label>
  );
}

export default function AbaAutomacao() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [config, setConfig] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [ultimaExecucao, setUltimaExecucao] = useState(null);
  const [instrucoes, setInstrucoes] = useState('');
  const [maxPorExecucao, setMaxPorExecucao] = useState(8);
  const [salvando, setSalvando] = useState('');
  const [mensagem, setMensagem] = useState(null);
  const [rodando, setRodando] = useState('');
  const [resultado, setResultado] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    const r = await chamarAdmin('/api/admin/instagram/config');
    if (r.ok) {
      setConfig(r.data.config);
      setInstrucoes(r.data.config.instrucoes || '');
      setMaxPorExecucao(r.data.config.maxPorExecucao || 8);
      setHistorico(r.data.historico || []);
      setUltimaExecucao(r.data.ultimaExecucao || null);
    } else {
      setErro(r.error);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async (campos, chave) => {
    setSalvando(chave);
    setMensagem(null);
    const r = await chamarAdmin('/api/admin/instagram/config', { method: 'POST', body: campos });
    setSalvando('');
    if (r.ok) {
      setConfig(r.data.config);
      setMensagem({ tipo: 'sucesso', texto: 'Salvo.' });
    } else {
      setMensagem({ tipo: 'erro', texto: r.error });
    }
  };

  const rodar = async (simular) => {
    setRodando(simular ? 'teste' : 'real');
    setResultado(null);
    const r = await chamarAdmin('/api/cron/instagram-comments', { method: 'POST', body: { simular } });
    setRodando('');
    if (!r.ok) {
      setResultado({ falha: r.error });
      return;
    }
    setResultado(r.data);
    if (!simular) carregar();
  };

  if (carregando) return <p style={estilos.mudo}>Carregando configuração...</p>;
  if (erro || !config) {
    return (
      <div role="alert" style={estilos.erro}>
        {erro || 'Configuração indisponível.'}{' '}
        <button type="button" onClick={carregar} style={{ ...estilos.botao, marginLeft: '8px' }}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '860px' }}>
      <section style={estilos.cartao}>
        <Interruptor
          id="auto-ligada"
          marcado={config.ligada}
          disabled={salvando === 'ligada'}
          onChange={(v) => salvar({ ligada: v }, 'ligada')}
          rotulo={config.ligada ? 'Automação ligada' : 'Automação desligada'}
          descricao={
            config.ligada
              ? `A IA responde sozinha os comentários feitos desde ${formatarData(config.ligadaEm)}. Roda a cada 15 minutos.`
              : 'Ao ligar, a IA passa a responder só os comentários novos — os antigos ficam como estão.'
          }
        />
        {ultimaExecucao && (
          <p style={{ ...estilos.mudo, margin: '10px 0 0 0' }}>
            Última passada: {formatarData(ultimaExecucao.em)} — {ultimaExecucao.responder} respondidos, {ultimaExecucao.ocultar} ocultados,{' '}
            {ultimaExecucao.ignorar} deixados passar{ultimaExecucao.falhas ? `, ${ultimaExecucao.falhas} falhas` : ''}.
          </p>
        )}
      </section>

      <section style={{ ...estilos.cartao, display: 'grid', gap: '14px' }}>
        <div>
          <label htmlFor="auto-instrucoes" style={estilos.rotulo}>O que a IA sabe sobre o negócio e como deve responder</label>
          <textarea
            id="auto-instrucoes"
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            rows={7}
            maxLength={3000}
            style={{ ...estilos.campo, resize: 'vertical', lineHeight: 1.5 }}
          />
          <p style={{ ...estilos.mudo, margin: '6px 0 0 0', fontSize: '12px' }}>
            A IA só fala de preço, prazo e promoção se estiver escrito aqui.
          </p>
        </div>

        <Interruptor
          id="auto-ocultar"
          marcado={config.ocultarOfensivos}
          disabled={salvando === 'ocultar'}
          onChange={(v) => salvar({ ocultarOfensivos: v }, 'ocultar')}
          rotulo="Ocultar comentários ofensivos e spam"
          descricao="Palavrão, ofensa, golpe e divulgação de outro perfil. Crítica e reclamação não são ocultadas — recebem resposta."
        />
        <Interruptor
          id="auto-anuncios"
          marcado={config.incluirAnuncios}
          disabled={salvando === 'anuncios'}
          onChange={(v) => salvar({ incluirAnuncios: v }, 'anuncios')}
          rotulo="Incluir comentários dos anúncios ativos"
          descricao={config.temContaDeAnuncios ? 'Usa a conta de anúncios já conectada na aba Anúncios.' : 'Conta de anúncios ainda não conectada (aba Anúncios → Conectar Meta API).'}
        />

        <div style={{ maxWidth: '260px' }}>
          <label htmlFor="auto-max" style={estilos.rotulo}>Máximo de comentários tratados por passada (1 a 20)</label>
          <input
            id="auto-max"
            type="number"
            min={1}
            max={20}
            value={maxPorExecucao}
            onChange={(e) => setMaxPorExecucao(e.target.value)}
            style={estilos.campo}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => salvar({ instrucoes, maxPorExecucao: Number(maxPorExecucao) }, 'texto')}
            disabled={salvando === 'texto'}
            style={{ ...estilos.botaoPrimario, opacity: salvando === 'texto' ? 0.7 : 1 }}
          >
            {salvando === 'texto' ? 'Salvando...' : 'Salvar instruções'}
          </button>
          {mensagem && (
            <span role="status" style={{ fontSize: '13px', color: mensagem.tipo === 'sucesso' ? '#6ee7b7' : '#fca5a5' }}>{mensagem.texto}</span>
          )}
        </div>
      </section>

      <section style={{ ...estilos.cartao, display: 'grid', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '15px', margin: '0 0 4px 0' }}>Testar antes de ligar</h2>
          <p style={{ ...estilos.mudo, margin: 0 }}>
            O teste mostra o que a IA faria com os comentários sem resposta dos últimos 7 dias, sem publicar nada.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => rodar(true)} disabled={Boolean(rodando)} style={{ ...estilos.botaoPrimario, opacity: rodando ? 0.7 : 1 }}>
            {rodando === 'teste' ? 'Testando...' : 'Testar agora (não publica)'}
          </button>
          <button
            type="button"
            onClick={() => rodar(false)}
            disabled={Boolean(rodando) || !config.ligada}
            title={config.ligada ? undefined : 'Ligue a automação para rodar de verdade'}
            style={{ ...estilos.botao, opacity: rodando || !config.ligada ? 0.6 : 1, cursor: config.ligada ? 'pointer' : 'not-allowed' }}
          >
            {rodando === 'real' ? 'Rodando...' : 'Rodar agora'}
          </button>
        </div>

        {resultado?.falha && <div role="alert" style={estilos.erro}>{resultado.falha}</div>}
        {resultado && !resultado.falha && !resultado.ok && (
          <div role="alert" style={estilos.aviso}>{MOTIVOS_EXECUCAO[resultado.motivo] || 'Não foi possível rodar.'} {resultado.erro || ''}</div>
        )}
        {resultado?.ok && resultado.motivo === 'desligada' && <div style={estilos.aviso}>{MOTIVOS_EXECUCAO.desligada}</div>}
        {resultado?.avisoAnuncios && <div style={estilos.aviso}>Anúncios não foram lidos: {resultado.avisoAnuncios}</div>}
        {resultado?.ok && resultado.resumo && (
          <>
            <div style={estilos.sucesso}>
              {resultado.simular ? 'Simulação: ' : ''}
              {resultado.resumo.responder} para responder, {resultado.resumo.ocultar} para ocultar, {resultado.resumo.ignorar} deixados passar
              {resultado.resumo.falhas ? `, ${resultado.resumo.falhas} falhas` : ''}
              {resultado.resumo.naFila ? ` · ${resultado.resumo.naFila} ainda na fila` : ''}.
            </div>
            <ListaAcoes acoes={resultado.acoes} simulacao={resultado.simular} vazio="Nenhum comentário esperando resposta." />
          </>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: '15px', margin: '0 0 10px 0' }}>Histórico da automação</h2>
        <ListaAcoes acoes={historico} vazio="A automação ainda não tratou nenhum comentário." />
      </section>
    </div>
  );
}
