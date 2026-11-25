'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Bolha, { CORES } from './Bolha';
import BarraEnvio from './BarraEnvio';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';

// Chat de suporte do site (/suporte), com cara de WhatsApp. Toda decisão fica no servidor
// (/api/suporte/chat); aqui só desenhamos as mensagens, guardamos o "modo" da conversa e
// acompanhamos o pagamento (polling de /api/payments/status, o mesmo do checkout) e a nova versão
// da música depois de um ajuste pago.

const CHAVE_PEDIDO = 'nsmusic_suporte_pedido';
const ID_VALIDO = /^[A-Za-z0-9_-]{12,64}$/;
const INTERVALO_PAGAMENTO_MS = 5000;
const TENTATIVAS_PAGAMENTO = 72; // 6 minutos
const INTERVALO_MUSICA_MS = 10000;
const TENTATIVAS_MUSICA = 48; // 8 minutos

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
  const fimRef = useRef(null);
  const montado = useRef(true);
  const numeroSuporte = useWhatsappSuporte();

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensagens, digitando]);

  const adicionar = useCallback((lista, de = 'bot') => {
    const novas = lista.map((m) => ({ ...m, de, id: ++contador.current, hora: agora() }));
    setMensagens((atual) => [...atual, ...novas]);
    const comOpcoes = [...novas].reverse().find((m) => Array.isArray(m.opcoes) && m.opcoes.length);
    if (de === 'bot' && comOpcoes) setOpcoesDe(comOpcoes.id);
    if (de === 'eu') setOpcoesDe(null);
  }, []);

  const mostrarRespostas = useCallback(async (lista) => {
    for (const m of lista) {
      if (!montado.current) return;
      setDigitando(true);
      await esperar(m.tipo === 'texto' ? Math.min(1200, 350 + String(m.texto || '').length * 8) : 450);
      setDigitando(false);
      adicionar([m]);
    }
  }, [adicionar]);

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
    setDigitando(true);
    try {
      const res = await fetch('/api/suporte/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, orderId: id || undefined }) });
      const data = await res.json().catch(() => ({}));
      setDigitando(false);
      if (!res.ok) {
        await mostrarRespostas([{ tipo: 'texto', texto: data.error || 'Tive um probleminha aqui. Tenta de novo em instantes.' }]);
        return null;
      }
      if (data.orderId && data.orderId !== id) { setOrderId(data.orderId); salvarPedido(data.orderId); }
      setModo(data.modo || null);
      if (data.transcricao) adicionar([{ tipo: 'texto', texto: `🎤 “${data.transcricao}”` }], 'eu');
      await mostrarRespostas(data.mensagens || []);
      if (data.gerarPix?.sku) await gerarPixDoPedido(data.orderId || id, data.gerarPix.sku);
      if (data.aguardar) setAguardar(data.aguardar);
      return data;
    } catch (_) {
      setDigitando(false);
      await mostrarRespostas([{ tipo: 'texto', texto: 'Sem conexão no momento. Confere sua internet e tenta de novo.' }]);
      return null;
    }
  }, [orderId, adicionar, mostrarRespostas, gerarPixDoPedido]);

  // Começo da conversa: pedido do link, ou o último usado neste aparelho, ou pergunta o WhatsApp.
  useEffect(() => {
    const id = ID_VALIDO.test(pedidoInicial || '') && !/^NS-/i.test(pedidoInicial) ? pedidoInicial : lerPedidoSalvo();
    if (id && ID_VALIDO.test(id)) {
      setOrderId(id);
      chamar({ acao: 'inicio' }, id);
    } else {
      setModo('telefone');
      mostrarRespostas([{ tipo: 'texto', texto: 'Oi! Aqui é o suporte da NS Music. 👋 Pra eu achar seu pedido, me manda o número de WhatsApp que você usou no site, com DDD.' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Acompanha o pagamento (pedido ou ajuste) e, depois de um ajuste pago, a nova versão.
  useEffect(() => {
    if (!aguardar || !orderId) return undefined;
    let ativo = true;
    let tentativas = 0;
    let timer = null;

    const passo = async () => {
      if (!ativo) return;
      tentativas++;
      try {
        if (aguardar.tipo === 'pagamento') {
          const qs = new URLSearchParams({ orderId });
          if (aguardar.txid) qs.set('paymentId', aguardar.txid);
          const r = await fetch(`/api/payments/status?${qs}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => ({}));
          if (!ativo) return;
          if (r.status === 'approved') {
            setAguardar(null);
            chamar(aguardar.kind === 'ajuste' ? { acao: 'ajuste_pago', txid: aguardar.txid } : { acao: 'pago' });
            return;
          }
          if (tentativas >= TENTATIVAS_PAGAMENTO) {
            setAguardar(null);
            mostrarRespostas([{ tipo: 'texto', texto: 'Ainda não vi o pagamento cair. Se você já pagou, toca em "Já paguei" que eu confiro de novo no banco.', opcoes: [{ id: aguardar.kind === 'ajuste' ? 'menu' : 'ja_paguei', label: aguardar.kind === 'ajuste' ? 'Voltar ao menu' : 'Já paguei' }, { id: 'humano', label: 'Falar com atendente' }] }]);
            return;
          }
          timer = setTimeout(passo, INTERVALO_PAGAMENTO_MS);
        } else if (aguardar.tipo === 'musica') {
          const res = await fetch('/api/suporte/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'nova_versao', orderId, assinatura: aguardar.assinatura }) });
          const r = await res.json().catch(() => ({}));
          if (!ativo) return;
          if (r.pronto) {
            setAguardar(null);
            mostrarRespostas(r.mensagens || []);
            return;
          }
          if (tentativas >= TENTATIVAS_MUSICA) {
            setAguardar(null);
            mostrarRespostas([
              { tipo: 'texto', texto: 'Está demorando um pouquinho mais que o normal. Assim que ficar pronta, sua nova versão aparece na página da sua música:' },
              { tipo: 'link', url: `/entrega/${encodeURIComponent(orderId)}`, titulo: 'Abrir a página da minha música' },
            ]);
            return;
          }
          timer = setTimeout(passo, INTERVALO_MUSICA_MS);
        }
      } catch (_) {
        if (ativo) timer = setTimeout(passo, INTERVALO_PAGAMENTO_MS * 2);
      }
    };
    timer = setTimeout(passo, aguardar.tipo === 'musica' ? INTERVALO_MUSICA_MS : INTERVALO_PAGAMENTO_MS);
    return () => { ativo = false; clearTimeout(timer); };
  }, [aguardar, orderId, chamar, mostrarRespostas]);

  const escolher = (opcao) => {
    adicionar([{ tipo: 'texto', texto: opcao.label }], 'eu');
    if (opcao.id === 'humano_sem_pedido') {
      mostrarRespostas([{ tipo: 'whatsapp', url: linkWhatsapp(numeroSuporte, 'Olá! Vim do chat de suporte do site e não achei meu pedido.'), titulo: 'Falar com atendente no WhatsApp' }]);
      return;
    }
    if (opcao.id === 'pagamento' || opcao.id === 'ja_paguei') setAguardar(null);
    chamar({ acao: 'opcao', opcao: opcao.id });
  };

  const enviarTexto = (t) => {
    adicionar([{ tipo: 'texto', texto: t }], 'eu');
    if (modo === 'telefone' || !orderId) chamar({ acao: 'identificar', telefone: t });
    else chamar({ acao: 'texto', texto: t, modo });
  };

  const enviarArquivo = (arquivo) => {
    const imagem = arquivo.type.startsWith('image/');
    adicionar([imagem ? { tipo: 'imagem', url: URL.createObjectURL(arquivo), nome: arquivo.name } : { tipo: 'arquivo', url: '#', nome: arquivo.name, extensao: (arquivo.name.split('.').pop() || 'ARQ').slice(0, 4).toUpperCase() }], 'eu');
    if (!orderId) {
      mostrarRespostas([{ tipo: 'texto', texto: 'Antes, me manda o número de WhatsApp que você usou no site, com DDD, pra eu achar seu pedido.' }]);
      return;
    }
    chamar({ acao: 'comprovante' });
  };

  const enviarAudio = async (blob) => {
    adicionar([{ tipo: 'audio', url: URL.createObjectURL(blob), titulo: 'Seu áudio' }], 'eu');
    if (!orderId) {
      mostrarRespostas([{ tipo: 'texto', texto: 'Antes, me manda por escrito o número de WhatsApp que você usou no site, com DDD.' }]);
      return;
    }
    try {
      const base64 = await blobParaBase64(blob);
      chamar({ acao: 'audio', audio: { base64, mimeType: blob.type || 'audio/webm' }, modo });
    } catch (_) {
      mostrarRespostas([{ tipo: 'texto', texto: 'Não consegui enviar o áudio. Pode escrever?' }]);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', justifyContent: 'center', background: '#D1D7DB', fontFamily: 'var(--font-family-body, system-ui, sans-serif)', color: CORES.texto }}>
      <style>{'@keyframes supPisca{0%,80%,100%{opacity:.25}40%{opacity:1}}.sup-dot{animation:supPisca 1.2s infinite}.sup-dot:nth-child(2){animation-delay:.2s}.sup-dot:nth-child(3){animation-delay:.4s}@keyframes supPulso{50%{opacity:.3}}.sup-rec{animation:supPulso 1s infinite}.sup-fundo{background-color:#EFE7DD;background-image:radial-gradient(rgba(60,40,20,.07) 1px,transparent 1px);background-size:16px 16px}'}</style>
      <div style={{ width: '100%', maxWidth: 560, height: '100%', display: 'flex', flexDirection: 'column', background: CORES.fundo }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(10px + env(safe-area-inset-top)) 14px 10px', background: CORES.topo, color: '#fff', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F2B544', color: CORES.topo, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Suporte NS Music</h1>
            <span style={{ fontSize: 12.5, color: '#CFE3E0' }} aria-live="polite">{digitando ? 'digitando…' : 'online'}</span>
          </div>
        </header>

        <main className="sup-fundo" style={{ flex: 1, overflowY: 'auto', padding: '12px 10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }} aria-live="polite">
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
          teclado={modo === 'telefone' ? 'tel' : 'text'}
          placeholder={modo === 'telefone' ? 'Seu WhatsApp com DDD' : modo === 'letra' ? 'O que mudar na letra?' : modo === 'ritmo' ? 'Qual ritmo?' : 'Mensagem'}
        />
      </div>
    </div>
  );
}
