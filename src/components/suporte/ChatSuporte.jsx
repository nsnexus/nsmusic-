'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Bolha, { CORES } from './Bolha';
import BarraEnvio from './BarraEnvio';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';
import { pareceTelefone, classificarInicio, escolherPedidoPorTexto } from '@/lib/novaMusicaChat';
import { useNovaMusica } from './useNovaMusica';
import { FUNDO_CHAT } from './papelDeParede';
import { useHistorico } from './useHistorico';
import { useAguardar } from './useAguardar';
import { isInAppBrowser } from '@/lib/inAppBrowser';

// Chat de suporte do site (/suporte), com cara de WhatsApp. Toda decisão fica no servidor
// (/api/suporte/chat); aqui só desenhamos as mensagens, guardamos o "modo" da conversa e
// acompanhamos o pagamento (polling de /api/payments/status, o mesmo do checkout) e a nova versão
// da música depois de um ajuste pago.

const CHAVE_PEDIDO = 'nsmusic_suporte_pedido';
const ID_VALIDO = /^[A-Za-z0-9_-]{12,64}$/;

const agora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function lerPedidoSalvo() {
  try { return localStorage.getItem(CHAVE_PEDIDO) || ''; } catch (_) { return ''; }
}
function salvarPedido(id) {
  try { localStorage.setItem(CHAVE_PEDIDO, id); } catch (_) {}
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export default function ChatSuporte({ pedidoInicial }) {
  const [mensagens, setMensagens] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [modo, setModo] = useState(null);
  const [digitando, setDigitando] = useState(false);
  const [aguardar, setAguardar] = useState(null);
  const [opcoesDe, setOpcoesDe] = useState(null);
  const contador = useRef(0);
  const pedidosDoNumero = useRef([]);
  const telefoneInformado = useRef('');
  const mensagensRef = useRef([]);
  const aparelho = useRef({ dispositivo: '', dentroDeApp: false });
  const fimRef = useRef(null);
  const montado = useRef(true);
  const numeroSuporte = useWhatsappSuporte();
  const historico = useHistorico(orderId);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => { mensagensRef.current = mensagens; }, [mensagens]);
  // Celular e navegador do cliente: a IA usa para ensinar a sair do navegador do WhatsApp.
  useEffect(() => {
    try {
      const ua = navigator.userAgent || '';
      aparelho.current = {
        dispositivo: /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : '',
        dentroDeApp: isInAppBrowser(),
      };
    } catch (_) { /* segue sem a informação */ }
  }, []);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensagens, digitando]);

  const adicionar = useCallback((lista, de = 'bot') => {
    const novas = lista.map((m) => ({ ...m, de, id: ++contador.current, hora: agora() }));
    setMensagens((atual) => [...atual, ...novas]);
    historico.registrar(novas);
    const comOpcoes = [...novas].reverse().find((m) => Array.isArray(m.opcoes) && m.opcoes.length);
    if (de === 'bot' && comOpcoes) setOpcoesDe(comOpcoes.id);
    if (de === 'eu') setOpcoesDe(null);
  }, [historico]);

  const mostrarRespostas = useCallback(async (lista) => {
    for (const m of lista) {
      if (!montado.current) return;
      setDigitando(true);
      await esperar(m.tipo === 'texto' ? Math.min(1200, 350 + String(m.texto || '').length * 8) : 450);
      setDigitando(false);
      adicionar([m]);
    }
  }, [adicionar]);

  const aoCriarPedido = useCallback((id, { gravando }) => {
    historico.marcar('pedido_criado');
    setOrderId(id);
    salvarPedido(id);
    setModo(null);
    if (gravando) setAguardar({ tipo: 'musica_nova' });
  }, [historico]);
  const aoDesistirRef = useRef(null);
  const aoDesistir = useCallback((t) => aoDesistirRef.current?.(t), []);
  const nova = useNovaMusica({ mostrarRespostas, setDigitando, orderId, aoCriarPedido, aoDesistir });
  // Ref para o `chamar` usar o hook sem se recriar a cada render (o acompanhamento depende dele).
  const novaRef = useRef(nova);
  novaRef.current = nova;

  const gerarPixDoPedido = useCallback(async (id, sku) => {
    try {
      const res = await fetch('/api/payments/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id, sku }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (!data.qrCode && !data.checkoutUrl)) throw new Error(data.error || 'pix');
      await mostrarRespostas([
        { tipo: 'pix', copiaECola: data.qrCode || '', checkoutUrl: data.qrCode ? '' : data.checkoutUrl, titulo: 'Pagamento do pedido' },
        { tipo: 'texto', texto: 'Assim que você pagar, eu confirmo sozinho em segundos e libero sua música aqui.', opcoes: [{ id: 'ja_paguei', label: 'Já paguei' }, { id: 'humano', label: 'Falar com atendente' }] },
      ]);
      setAguardar({ tipo: 'pagamento', txid: data.paymentId || null, kind: 'pedido' });
    } catch (_) {
      await mostrarRespostas([{ tipo: 'texto', texto: 'Não consegui gerar o Pix agora. Tenta de novo, ou fala com uma pessoa da equipe:', opcoes: [{ id: 'pagamento', label: 'Tentar de novo' }, { id: 'humano', label: 'Falar com atendente' }] }]);
    }
  }, [mostrarRespostas]);

  const chamar = useCallback(async (payload, idForcado) => {
    const id = idForcado ?? orderId;
    if (payload.acao === 'identificar') {
      historico.definirTelefone(payload.telefone);
      telefoneInformado.current = String(payload.telefone || '').replace(/\D/g, '');
    }
    setDigitando(true);
    try {
      const res = await fetch('/api/suporte/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, orderId: id || undefined }) });
      const data = await res.json().catch(() => ({}));
      setDigitando(false);
      if (!res.ok) {
        await mostrarRespostas([{ tipo: 'texto', texto: data.error || 'Tive um probleminha aqui. Tenta de novo em instantes.' }]);
        return null;
      }
      if (data.fallback) return data;
      if (data.orderId && data.orderId !== id) { setOrderId(data.orderId); salvarPedido(data.orderId); }
      if (data.telefone) { telefoneInformado.current = data.telefone; historico.definirTelefone(data.telefone); }
      setModo(data.modo || null);
      if (data.transcricao) adicionar([{ tipo: 'texto', texto: `🎤 “${data.transcricao}”` }], 'eu');
      if (Array.isArray(data.escolherPedido)) pedidosDoNumero.current = data.escolherPedido;
      let lista = data.mensagens || [];
      // Número com vários pedidos: a saudação ganha a opção de voltar à lista.
      if (payload.acao === 'inicio' && !payload.listar && pedidosDoNumero.current.length > 1 && lista.length) {
        const ultima = lista[lista.length - 1];
        lista = [...lista.slice(0, -1), { ...ultima, opcoes: [...(ultima.opcoes || []), { id: 'trocar_pedido', label: 'Escolher outro pedido' }] }];
      }
      await mostrarRespostas(lista);
      if (data.rascunho) novaRef.current?.receberRascunho(data.rascunho, { telefone: telefoneInformado.current });
      if (data.gerarPix?.sku) await gerarPixDoPedido(data.orderId || id, data.gerarPix.sku);
      if (data.aguardar) {
        if (data.aguardar.tipo === 'pagamento' && data.aguardar.kind === 'ajuste') historico.marcar('ajuste_pix');
        setAguardar(data.aguardar);
      }
      return data;
    } catch (_) {
      setDigitando(false);
      await mostrarRespostas([{ tipo: 'texto', texto: 'Sem conexão no momento. Confere sua internet e tenta de novo.' }]);
      return null;
    }
  }, [orderId, adicionar, mostrarRespostas, gerarPixDoPedido, historico]);

  // Começo da conversa: pedido do link, ou o último usado neste aparelho, ou pergunta o WhatsApp.
  useEffect(() => {
    const doLink = ID_VALIDO.test(pedidoInicial || '') && !/^NS-/i.test(pedidoInicial) ? pedidoInicial : '';
    const id = doLink || lerPedidoSalvo();
    if (id && ID_VALIDO.test(id)) {
      setOrderId(id);
      // Sem link (pedido lembrado neste aparelho): se o número tiver vários pedidos, lista antes.
      chamar({ acao: 'inicio', listar: !doLink }, id);
    } else {
      setModo('inicio');
      mostrarRespostas([{ tipo: 'texto', texto: 'Oi! Aqui é a NS Music. 👋 Você já fez um pedido com a gente ou quer criar uma música nova? Se quiser, já pode me contar a história.', opcoes: [{ id: 'tem_pedido', label: 'Já tenho um pedido' }, { id: 'criar_nova', label: 'Quero criar uma música' }] }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAguardar({ aguardar, setAguardar, orderId, chamar, mostrarRespostas, historico });

  const abrirPedido = (id) => {
    setAguardar(null);
    setOrderId(id);
    salvarPedido(id);
    setModo(null);
    chamar({ acao: 'inicio' }, id);
  };

  const pedirTelefone = (texto) => {
    nova.cancelar();
    setModo('telefone');
    mostrarRespostas([{ tipo: 'texto', texto: texto || 'Entendi! Pra eu achar seu pedido, me manda o número de WhatsApp que você usou no site, com DDD.' }]);
  };

  // Quem ainda não tem pedido aberto no chat escreveu algo (em vez de tocar numa opção).
  const tratarSemPedido = (t) => {
    // Lista de pedidos na tela: tenta achar pelo nome do homenageado; senão, mostra a lista de novo.
    if (pedidosDoNumero.current.length) {
      const achado = escolherPedidoPorTexto(t, pedidosDoNumero.current);
      if (achado) { abrirPedido(achado.id.slice(7)); return; }
      if (/\b(nova|outra|criar)\b/i.test(t) && classificarInicio(t) === 'nova') { setModo(null); nova.iniciar(t); return; }
      mostrarRespostas([{ tipo: 'texto', texto: 'Toque no pedido que você quer, aqui embaixo 👇', opcoes: pedidosDoNumero.current }]);
      return;
    }
    if (modo === 'telefone' || pareceTelefone(t)) { chamar({ acao: 'identificar', telefone: t }); return; }
    const tipo = classificarInicio(t);
    if (tipo === 'pedido') { pedirTelefone(); return; }
    if (tipo === 'nova') { setModo(null); nova.iniciar(t); return; }
    mostrarRespostas([{ tipo: 'texto', texto: 'Me conta: você já fez um pedido com a gente ou quer criar uma música nova?', opcoes: [{ id: 'tem_pedido', label: 'Já tenho um pedido' }, { id: 'criar_nova', label: 'Quero criar uma música' }] }]);
  };
  aoDesistirRef.current = (t) => {
    if (orderId) chamar({ acao: 'texto', texto: t, modo: null });
    else tratarSemPedido(t);
  };

  const escolher = (opcao) => {
    adicionar([{ tipo: 'texto', texto: opcao.label }], 'eu');
    const marca = { criar_nova: 'musica_nova', humano_sem_pedido: 'humano' }[opcao.id]
      || (['ritmo', 'letra', 'baixar', 'pagamento', 'criar', 'humano', 'ja_paguei'].includes(opcao.id) ? opcao.id : null);
    historico.marcar(marca);
    if (opcao.id === 'tem_pedido') {
      pedirTelefone('Me manda o número de WhatsApp que você usou no site, com DDD, que eu acho seu pedido.');
      return;
    }
    if (opcao.id.startsWith('txt:')) { chamarIA(opcao.label); return; }
    if (opcao.id === 'criar_nova') { setModo(null); chamarIA('Quero criar uma música nova', () => nova.iniciar()); return; }
    if (opcao.id.startsWith('pedido:')) { abrirPedido(opcao.id.slice(7)); return; }
    // Pedido com música bônus: o cliente escolheu em qual música fazer a ação.
    if (opcao.id.startsWith('alvo:')) {
      const [, id, ...resto] = opcao.id.split(':');
      setOrderId(id);
      setModo(null);
      chamar({ acao: 'opcao', opcao: resto.join(':'), escolhido: true }, id);
      return;
    }
    if (opcao.id === 'trocar_pedido') {
      mostrarRespostas([{ tipo: 'texto', texto: 'Sobre qual pedido você quer falar?', opcoes: pedidosDoNumero.current }]);
      return;
    }
    if (nova.ativa && opcao.id.startsWith('nova')) { nova.responderOpcao(opcao); return; }
    if (opcao.id === 'humano_sem_pedido' || (opcao.id === 'humano' && !orderId)) {
      mostrarRespostas([{ tipo: 'whatsapp', url: linkWhatsapp(numeroSuporte, 'Olá! Vim do chat de suporte do site e não achei meu pedido.'), titulo: 'Falar com atendente no WhatsApp' }]);
      return;
    }
    if (opcao.id === 'pagamento' || opcao.id === 'ja_paguei') setAguardar(null);
    chamar({ acao: 'opcao', opcao: opcao.id });
  };

  // Atendente com IA: texto livre vai para ele. Se estiver desligado ou fora do ar, o servidor
  // responde `fallback` e o chat segue com as regras de antes.
  const chamarIA = async (t, aoFalhar = null) => {
    const historicoIA = mensagensRef.current.slice(-20).map((m) => ({
      de: m.de,
      texto: m.tipo === 'texto' ? m.texto : m.tipo === 'letra' ? `[letra] ${String(m.texto || '').slice(0, 300)}` : `[${m.tipo}${m.titulo ? `: ${m.titulo}` : ''}]`,
    }));
    const data = await chamar({
      acao: 'ia', texto: t, aguardando: aguardar, historico: historicoIA, telefone: telefoneInformado.current || undefined,
      conversaId: historico.idDaConversa(),
      dispositivo: aparelho.current.dispositivo, dentroDeApp: aparelho.current.dentroDeApp,
      urlAtual: typeof window !== 'undefined' ? window.location.href : '',
    });
    if (data?.fallback) {
      if (aoFalhar) aoFalhar();
      else if (orderId) chamar({ acao: 'texto', texto: t, modo, aguardando: aguardar });
      else tratarSemPedido(t);
    }
  };

  const enviarTexto = (t) => {
    adicionar([{ tipo: 'texto', texto: t }], 'eu');
    if (nova.ativa) { nova.responderTexto(t); return; }
    // Sub-fluxos dos botões (escrever o ritmo, dizer o que mudar na letra) seguem como estão.
    if (orderId && (modo === 'letra' || modo === 'ritmo')) { chamar({ acao: 'texto', texto: t, modo, aguardando: aguardar }); return; }
    if (modo === 'telefone' && pareceTelefone(t)) { chamar({ acao: 'identificar', telefone: t }); return; }
    chamarIA(t);
  };

  const enviarArquivo = (arquivo) => {
    const imagem = arquivo.type.startsWith('image/');
    adicionar([imagem ? { tipo: 'imagem', url: URL.createObjectURL(arquivo), nome: arquivo.name } : { tipo: 'arquivo', url: '#', nome: arquivo.name, extensao: (arquivo.name.split('.').pop() || 'ARQ').slice(0, 4).toUpperCase() }], 'eu');
    if (nova.ativa) {
      mostrarRespostas([{ tipo: 'texto', texto: 'Recebi! As fotos você manda depois, na página da música (pro vídeo). Agora me responde por texto ou áudio, tá? 😊' }]);
      return;
    }
    if (!orderId) {
      mostrarRespostas([{ tipo: 'texto', texto: 'Antes, me manda o número de WhatsApp que você usou no site, com DDD, pra eu achar seu pedido.' }]);
      return;
    }
    chamar({ acao: 'comprovante' });
  };

  const enviarAudio = async (blob) => {
    adicionar([{ tipo: 'audio', url: URL.createObjectURL(blob), titulo: 'Seu áudio' }], 'eu');
    try {
      const base64 = await blobParaBase64(blob);
      if (nova.ativa || !orderId || !(modo === 'letra' || modo === 'ritmo')) {
        setDigitando(true);
        const res = await fetch('/api/suporte/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'transcrever', audio: { base64, mimeType: blob.type || 'audio/webm' } }) });
        const data = await res.json().catch(() => ({}));
        setDigitando(false);
        const t = String(data.texto || '').trim();
        if (!t) { mostrarRespostas([{ tipo: 'texto', texto: data.error || 'Não consegui ouvir direito o seu áudio. 😕 Pode escrever pra mim?' }]); return; }
        adicionar([{ tipo: 'texto', texto: `🎤 “${t}”` }], 'eu');
        if (nova.ativa) nova.responderTexto(t);
        else chamarIA(t);
        return;
      }
      chamar({ acao: 'audio', audio: { base64, mimeType: blob.type || 'audio/webm' }, modo, aguardando: aguardar });
    } catch (_) {
      mostrarRespostas([{ tipo: 'texto', texto: 'Não consegui enviar o áudio. Pode escrever?' }]);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', justifyContent: 'center', background: '#D1D7DB', fontFamily: 'var(--font-family-body, system-ui, sans-serif)', color: CORES.texto }}>
      <style>{'@keyframes supPisca{0%,80%,100%{opacity:.25}40%{opacity:1}}.sup-dot{animation:supPisca 1.2s infinite}.sup-dot:nth-child(2){animation-delay:.2s}.sup-dot:nth-child(3){animation-delay:.4s}@keyframes supPulso{50%{opacity:.3}}.sup-rec{animation:supPulso 1s infinite}'}</style>
      <div style={{ width: '100%', maxWidth: 560, height: '100%', display: 'flex', flexDirection: 'column', background: CORES.fundo }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'calc(8px + env(safe-area-inset-top)) 12px 8px 4px', background: CORES.topo, color: '#fff', flexShrink: 0, minHeight: 60, boxSizing: 'border-box' }}>
          <a href="/" aria-label="Voltar para o site" style={{ width: 36, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NS Music" width={42} height={42} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#1b1464' }} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: 6 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#fff', fontFamily: 'inherit', letterSpacing: 0, lineHeight: 1.25 }}>NS Music</h1>
            <span style={{ fontSize: 13, color: '#E7F6F2', lineHeight: 1.2 }} aria-live="polite">{digitando ? 'digitando…' : 'online'}</span>
          </div>
        </header>

        <main style={{ ...FUNDO_CHAT, flex: 1, overflowY: 'auto', padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }} aria-live="polite">
          <div style={{ alignSelf: 'center', background: '#FFF3C4', color: '#54656F', fontSize: 12, padding: '6px 12px', borderRadius: 8, textAlign: 'center', maxWidth: 300, marginBottom: 6 }}>
            Atendimento automático da NS Music. Se precisar, uma pessoa da equipe assume a conversa.
          </div>
          {mensagens.map((m) => <Bolha key={m.id} m={m} onOpcao={escolher} opcoesAtivas={m.id === opcoesDe && !digitando} />)}
          {digitando ? (
            <div style={{ alignSelf: 'flex-start', background: '#fff', borderRadius: '2px 10px 10px 10px', padding: '12px 14px', display: 'flex', gap: 4, boxShadow: '0 1px 1px rgba(0,0,0,.1)' }} aria-label="digitando">
              <span className="sup-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#8696A0' }} />
              <span className="sup-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#8696A0' }} />
              <span className="sup-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#8696A0' }} />
            </div>
          ) : null}
          <div ref={fimRef} />
        </main>

        <BarraEnvio
          onTexto={enviarTexto} onArquivo={enviarArquivo} onAudio={enviarAudio}
          teclado={nova.ativa ? nova.teclado : modo === 'telefone' ? 'tel' : 'text'}
          placeholder={nova.ativa ? nova.placeholder : modo === 'telefone' ? 'Seu WhatsApp com DDD' : modo === 'inicio' ? 'Conte a história ou seu WhatsApp' : modo === 'letra' ? 'O que mudar na letra?' : modo === 'ritmo' ? 'Qual ritmo?' : 'Mensagem'}
        />
      </div>
    </div>
  );
}
