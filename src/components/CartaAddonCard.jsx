'use client';

import { useState, useEffect } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import { cartaTemaId, CARTA_TEMA_SLOTS } from '@/lib/cartaModelo';
import CartaEditor from './delivery/CartaEditor';
import { AddonCheckout } from './delivery/EditorParts';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite dos outros add-ons

// Add-on "Carta Virtual" (R$ 3,99) — mesmo padrão de pagamento do playback e do vídeo, em
// componente próprio pra não engordar entrega/page.jsx (já acima do limite de 400 linhas, ver
// .claude/rules/frontend.md).
//
// Depois de pago, o texto já vem escrito pelo servidor (src/lib/payments.js chama generateCartaText
// na aprovação). O botão de gerar aqui é a rede de segurança pra quando aquela geração falhou ou quando
// o cliente solicita a criação.
export default function CartaAddonCard({ orderId, order, onUnlocked, onCartaCriada }) {
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erroTexto, setErroTexto] = useState('');

  const hasAccess = unlocked || order?.hasCartaAccess || order?.cartaAddonPaid;
  const texto = order?.cartaTexto || '';
  const remetente = order?.customerName || '';
  const honoree = order?.honoreeName || '';
  const linkPublico = typeof window !== 'undefined' ? `${window.location.origin}/c/${orderId}` : '';

  // Qual música toca sozinha quando alguém abre a página pública da carta (pedido 04/09/2026) — só
  // mostra escolha quando tem mais de uma faixa gerada; com uma só, não tem o que escolher.
  const faixasMusica = [order?.audioUrl, ...(Array.isArray(order?.audioFiles) ? order.audioFiles : [])].filter(Boolean);
  const faixasUnicas = [...new Set(faixasMusica)];
  const [musicaEscolhida, setMusicaEscolhida] = useState('');
  const [salvandoMusica, setSalvandoMusica] = useState(false);

  useEffect(() => {
    if (order?.cartaMusicaUrl) setMusicaEscolhida(order.cartaMusicaUrl);
    else if (faixasUnicas[0]) setMusicaEscolhida(faixasUnicas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.cartaMusicaUrl, faixasUnicas[0]]);

  const handleEscolherMusica = async (url) => {
    if (salvandoMusica) return;
    const anterior = musicaEscolhida;
    setMusicaEscolhida(url);
    setSalvandoMusica(true);
    try {
      const response = await fetch('/api/carta/choose-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, audioUrl: url }),
      });
      if (!response.ok) throw new Error('Não foi possível salvar a música escolhida. Tente novamente.');
      setErroTexto('');
    } catch (e) {
      setMusicaEscolhida(anterior);
      setErroTexto(e.message || 'Não foi possível salvar a música escolhida.');
    }
    setSalvandoMusica(false);
  };

  // Tema visual da carta (pedido 17/09/2026: "cliente poder alterar o tema da cartinha") — busca as
  // imagens configuradas no painel admin pra mostrar como miniatura de cada uma das 7 opções. Some
  // sozinho se o admin ainda não configurou nenhuma (nada pra escolher visualmente).
  const [temasDisponiveis, setTemasDisponiveis] = useState(null); // null = carregando
  const [salvandoTema, setSalvandoTema] = useState(false);
  const [temaEscolhido, setTemaEscolhido] = useState('');
  const temaAtual = temaEscolhido || order?.cartaTemaEscolhido || cartaTemaId(order || {});

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const response = await fetch('/api/carta/temas');
        if (!response.ok) throw new Error('Temas indisponíveis.');
        const json = await response.json();
        if (!ativo) return;
        const porId = json?.temas || {};
        setTemasDisponiveis(CARTA_TEMA_SLOTS.map((slot) => ({ ...slot, imagemUrl: porId[slot.id]?.imagemUrl || null })));
      } catch (e) {
        if (ativo) setTemasDisponiveis([]);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const handleEscolherTema = async (temaId) => {
    if (temaId === temaAtual) return;
    setSalvandoTema(true);
    try {
      const response = await fetch('/api/carta/choose-theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, temaId }),
      });
      if (!response.ok) throw new Error('Não foi possível salvar o tema. Tente novamente.');
      setTemaEscolhido(temaId);
      setErroTexto('');
    } catch (e) {
      setErroTexto(e.message || 'Não foi possível salvar o tema.');
    }
    setSalvandoTema(false);
  };

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);

    const resultado = await requestPixCharge(
      { orderId, sku: 'carta_addon', isSecondaryPayment: true },
      { attempts: MAX_PIX_ATTEMPTS }
    );

    setLoading(false);
    if (resultado.ok) {
      setPixInfo({ qrCode: resultado.data.qrCode || '', paymentId: resultado.data.paymentId || '' });
    } else {
      setPixError(resultado.error);
    }
  };

  // Polling do pagamento — com cleanup obrigatório (ver .claude/rules/frontend.md).
  useEffect(() => {
    if (!orderId || !pixInfo.paymentId || hasAccess) return;

    setPollingTimedOut(false);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= PIX_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        setPollingTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/payments/status?orderId=${orderId}&paymentId=${pixInfo.paymentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved' || data.status === 'PAGO' || data.status === 'PAGAMENTO_APROVADO') {
            setUnlocked(true);
            if (typeof onUnlocked === 'function') {
              onUnlocked();
            }
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn('[CartaAddonCard] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess, onUnlocked]);

  const chamarApi = async (payload) => {
    const res = await fetch('/api/carta/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível concluir agora.');
    return data;
  };

  const handleGerar = async () => {
    setGerando(true);
    setErroTexto('');
    try {
      const data = await chamarApi({});
      if (data?.texto && onCartaCriada) {
        onCartaCriada(data.texto);
      }
    } catch (err) {
      setErroTexto(err.message);
    } finally {
      setGerando(false);
    }
  };

  const handleSalvar = async () => {
    if (!rascunho.trim()) return;
    setSalvando(true);
    setErroTexto('');
    try {
      const data = await chamarApi({ texto: rascunho });
      if (data?.texto && onCartaCriada) {
        onCartaCriada(data.texto);
      }
      setEditando(false);
    } catch (err) {
      setErroTexto(err.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!hasAccess) return <AddonCheckout sku="carta_addon" title="O que o coração quer dizer." description="Uma carta com a história de vocês, a sua assinatura e a música de presente." features={['Texto inspirado na história da sua música', 'Edição de cada palavra e escolha de tema', 'Uma página de presente para compartilhar']} image="/experiencia/amor.webp" pix={pixInfo} loading={loading} error={pixError} timedOut={pollingTimedOut} onGenerate={handleGeneratePix} />;
  return <CartaEditor order={order} texto={texto} remetente={remetente} honoree={honoree}
    editando={editando} rascunho={rascunho} setRascunho={setRascunho}
    onEdit={() => { setRascunho(texto); setEditando(true); }} onCancel={() => setEditando(false)}
    onSave={handleSalvar} onGenerate={handleGerar} salvando={salvando} gerando={gerando} error={erroTexto}
    themes={temasDisponiveis} theme={temaAtual} onTheme={handleEscolherTema} savingTheme={salvandoTema}
    tracks={faixasUnicas} track={musicaEscolhida} onTrack={handleEscolherMusica} savingTrack={salvandoMusica} url={linkPublico} />;
}
