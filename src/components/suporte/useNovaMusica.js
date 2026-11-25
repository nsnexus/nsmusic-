'use client';

import { useCallback, useRef, useState } from 'react';
import { buildSunoPayload } from '@/lib/sunoPayload';
import { getStoredTrafficSource } from '@/lib/trafficSource';
import { CAMPOS_VAZIOS, proximaEtapa, aplicarResposta, mesclarExtraidos } from '@/lib/novaMusicaChat';

// "Criar uma música nova" dentro do chat de suporte. Pergunta o essencial (roteiro em
// src/lib/novaMusicaChat.js), escreve a letra com o MESMO gerador do site, e na aprovação cria o
// pedido e manda gravar pelas MESMAS rotas do /criar (/api/orders/create e /api/suno/generate) —
// com elas vêm as travas de sempre: bloqueio, limite de músicas sem pagamento, bônus automático e
// Pacote Família.

const limparMarcacoes = (letra) => String(letra || '').replace(/^\[[^\]]+\]\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

async function postar(url, corpo) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function useNovaMusica({ mostrarRespostas, setDigitando, orderId, aoCriarPedido }) {
  const [ativa, setAtiva] = useState(false);
  const [etapa, setEtapa] = useState(null);
  const [fase, setFase] = useState('perguntas'); // perguntas | letra | mudando_letra | gravando
  const campos = useRef({ ...CAMPOS_VAZIOS });
  const letra = useRef('');

  const escreverLetra = useCallback(async () => {
    setEtapa(null);
    setFase('perguntas');
    await mostrarRespostas([{ tipo: 'texto', texto: 'Já tenho tudo que preciso! Deixa eu escrever a letra, só um instantinho… ✍️' }]);
    setDigitando(true);
    const c = campos.current;
    const r = await postar('/api/lyrics/generate', {
      occasion: c.occasion, honoreeName: c.honoreeName, customerName: c.customerName, relationship: c.relationship,
      story: c.story, musicStyle: c.musicStyle, musicMood: c.musicMood, voiceType: c.voiceType,
    }).catch(() => ({ ok: false, data: {} }));
    setDigitando(false);
    if (!r.ok || !r.data?.lyrics) {
      await mostrarRespostas([{ tipo: 'texto', texto: 'Tive um probleminha pra escrever a letra agora. Vamos tentar de novo?', opcoes: [{ id: 'nova_outra', label: 'Tentar de novo' }, { id: 'humano', label: 'Falar com atendente' }] }]);
      return;
    }
    letra.current = r.data.lyrics;
    setFase('letra');
    await mostrarRespostas([
      { tipo: 'texto', texto: `Olha como ficou a letra${c.honoreeName ? ` pra *${c.honoreeName}*` : ''}:` },
      { tipo: 'letra', texto: limparMarcacoes(r.data.lyrics) },
      { tipo: 'texto', texto: 'Gostou? Se quiser, eu mudo o que você quiser antes de gravar.', opcoes: [
        { id: 'nova_gravar', label: 'Gostei, pode gravar!' },
        { id: 'nova_mudar', label: 'Quero mudar algo' },
        { id: 'nova_outra', label: 'Escrever outra letra' },
      ] },
    ]);
  }, [mostrarRespostas, setDigitando]);

  const perguntar = useCallback(async () => {
    const p = proximaEtapa(campos.current);
    if (!p) { await escreverLetra(); return; }
    setEtapa(p.etapa);
    await mostrarRespostas([p.opcoes ? { tipo: 'texto', texto: p.texto, opcoes: p.opcoes } : { tipo: 'texto', texto: p.texto }]);
  }, [escreverLetra, mostrarRespostas]);

  const lerHistoria = useCallback(async (texto) => {
    setDigitando(true);
    const r = await postar('/api/suporte/chat', { acao: 'nova_extrair', texto }).catch(() => ({ ok: false, data: {} }));
    setDigitando(false);
    return r.ok ? (r.data?.extraidos || {}) : {};
  }, [setDigitando]);

  const iniciar = useCallback(async (textoInicial = '') => {
    setAtiva(true);
    setFase('perguntas');
    letra.current = '';
    campos.current = { ...CAMPOS_VAZIOS };
    if (orderId) {
      const r = await postar('/api/suporte/chat', { acao: 'nova_dados', orderId }).catch(() => ({ ok: false, data: {} }));
      if (r.ok && r.data?.cliente) campos.current = { ...campos.current, ...r.data.cliente };
    }
    const t = String(textoInicial || '').trim();
    if (t.length >= 20) {
      const ex = await lerHistoria(t);
      campos.current = mesclarExtraidos(campos.current, ex);
      if (ex.temHistoria) campos.current.story = t.slice(0, 3000);
      await mostrarRespostas([{ tipo: 'texto', texto: 'Que lindo, anotei tudo! 😊 Só preciso de mais umas coisinhas.' }]);
    }
    await perguntar();
  }, [orderId, lerHistoria, mostrarRespostas, perguntar]);

  const gravar = useCallback(async () => {
    setFase('gravando');
    setDigitando(true);
    const c = campos.current;
    const pedido = { ...c, recipientType: c.relationship, lyrics: letra.current, productionStatus: 'LETRA_APROVADA', ...getStoredTrafficSource() };
    const criado = await postar('/api/orders/create', pedido).catch(() => ({ ok: false, data: {} }));
    if (!criado.ok || !criado.data?.orderId) {
      setDigitando(false);
      setFase('letra');
      await mostrarRespostas([{ tipo: 'texto', texto: criado.data?.error || 'Não consegui registrar seu pedido agora. Tenta de novo?', opcoes: [{ id: 'nova_gravar', label: 'Tentar de novo' }, { id: 'humano', label: 'Falar com atendente' }] }]);
      return;
    }
    const novoId = criado.data.orderId;
    const gerou = await postar('/api/suno/generate', { ...buildSunoPayload({ ...c, lyrics: letra.current }), orderId: novoId }).catch(() => ({ ok: false, data: {} }));
    setDigitando(false);
    setAtiva(false);
    setEtapa(null);
    if (!gerou.ok) {
      aoCriarPedido(novoId, { gravando: false });
      await mostrarRespostas([{ tipo: 'texto', texto: gerou.data?.error || 'Seu pedido foi registrado, mas tive um problema pra começar a gravação agora.', opcoes: [{ id: 'humano', label: 'Falar com atendente' }] }]);
      return;
    }
    aoCriarPedido(novoId, { gravando: true });
    await mostrarRespostas([{ tipo: 'texto', texto: gerou.data?.bonusAutomatico || gerou.data?.geracaoExtra
      ? 'Mandei pro estúdio gravar! 🎧 E essa sai por conta do seu pedido pago. Leva de 1 a 3 minutinhos, fica aqui que eu te mostro assim que ficar pronta.'
      : 'Mandei pro estúdio gravar suas 2 versões! 🎧 Leva de 1 a 3 minutinhos, fica aqui que eu te mostro assim que ficar pronta.' }]);
  }, [aoCriarPedido, mostrarRespostas, setDigitando]);

  const ajustarLetra = useCallback(async (instrucao) => {
    setDigitando(true);
    const r = await postar('/api/suporte/chat', { acao: 'nova_ajustar_letra', letra: letra.current, instrucao, homenageado: campos.current.honoreeName }).catch(() => ({ ok: false, data: {} }));
    setDigitando(false);
    if (!r.ok || !r.data?.letra) {
      await mostrarRespostas([{ tipo: 'texto', texto: r.data?.error || 'Não consegui ajustar agora. Tenta de novo?' }]);
      return;
    }
    letra.current = r.data.letra;
    setFase('letra');
    await mostrarRespostas([
      { tipo: 'texto', texto: 'Ajustei! Olha como ficou:' },
      { tipo: 'letra', texto: limparMarcacoes(r.data.letra) },
      { tipo: 'texto', texto: 'E agora, posso gravar?', opcoes: [{ id: 'nova_gravar', label: 'Pode gravar!' }, { id: 'nova_mudar', label: 'Quero mudar mais' }] },
    ]);
  }, [mostrarRespostas, setDigitando]);

  const responderTexto = useCallback(async (texto) => {
    if (fase === 'gravando') return;
    if (fase === 'letra' || fase === 'mudando_letra') { await ajustarLetra(texto); return; }
    if (!etapa) { await perguntar(); return; }
    let base = campos.current;
    // História longa pode já trazer o ritmo, a ocasião, a voz… — aproveita para não perguntar de novo.
    if (etapa === 'story' && texto.length >= 60) base = mesclarExtraidos(base, await lerHistoria(texto));
    const r = aplicarResposta(etapa, texto, base);
    campos.current = r.campos;
    if (r.erro) { await mostrarRespostas([{ tipo: 'texto', texto: r.erro }]); return; }
    await perguntar();
  }, [fase, etapa, ajustarLetra, perguntar, lerHistoria, mostrarRespostas]);

  const responderOpcao = useCallback(async (opcao) => {
    if (opcao.id === 'nova_gravar') return gravar();
    if (opcao.id === 'nova_outra') return escreverLetra();
    if (opcao.id === 'nova_mudar') {
      setFase('mudando_letra');
      return mostrarRespostas([{ tipo: 'texto', texto: 'Me fala o que você quer mudar. Ex.: "troca Ana por Aninha" ou "fala da viagem pra praia".' }]);
    }
    const r = aplicarResposta(etapa, opcao.id, campos.current);
    campos.current = r.campos;
    if (r.pedirTexto) return mostrarRespostas([{ tipo: 'texto', texto: r.pedirTexto }]);
    if (r.erro) return mostrarRespostas([{ tipo: 'texto', texto: r.erro }]);
    return perguntar();
  }, [etapa, gravar, escreverLetra, perguntar, mostrarRespostas]);

  const cancelar = useCallback(() => { setAtiva(false); setEtapa(null); }, []);

  const teclado = etapa === 'customerPhone' ? 'tel' : 'text';
  const placeholder = fase === 'letra' || fase === 'mudando_letra' ? 'O que mudar na letra?'
    : etapa === 'story' ? 'Conte a história…' : etapa === 'customerPhone' ? 'Seu WhatsApp com DDD' : 'Mensagem';

  return { ativa, iniciar, responderTexto, responderOpcao, cancelar, teclado, placeholder };
}
