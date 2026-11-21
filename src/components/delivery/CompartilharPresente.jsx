'use client';

import React, { useState } from 'react';
import { MessageCircle, Share2, Copy, Check, QrCode, Film } from 'lucide-react';
import { getPriceForSku } from '@/lib/pricing';
import { formatBrl } from '@/lib/deliveryPackages';
import QrCodeHomenagem from '@/components/QrCodeHomenagem';
import { buildGiftUrl, buildGiftMessage } from '@/lib/giftShare';

const botao = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
  minHeight: '76px', padding: '10px 8px', borderRadius: '14px', border: '1.5px solid #e4e0ea',
  background: '#ffffff', color: '#1f1a24', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
  textDecoration: 'none', textAlign: 'center', lineHeight: 1.15,
};

// Bloco "postar nas redes" (21/11/2026): Status, Reels e TikTok só aceitam vídeo. Quem ainda não tem
// o vídeo vê a oferta na hora em que quer compartilhar; quem tem é levado direto até ele.
function PostarNasRedes({ temVideo, onVideo }) {
  if (!onVideo) return null;
  if (temVideo) {
    return (
      <button type="button" onClick={onVideo} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', padding: '12px 14px', borderRadius: '14px', border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#14532d', fontWeight: 700, fontSize: '0.88rem', textAlign: 'left', cursor: 'pointer' }}>
        <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>📲</span>
        <span>Postar no Status, Reels ou TikTok: baixe o seu vídeo e poste ↗</span>
      </button>
    );
  }
  return (
    <div style={{ marginBottom: '14px', padding: '14px', borderRadius: '16px', background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)', color: '#ffffff' }}>
      <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem' }}>📲 Quer postar no Status, Reels ou TikTok?</p>
      <p style={{ margin: '6px 0 12px', fontSize: '0.85rem', lineHeight: 1.45, color: '#ede9fe' }}>
        Essas redes só aceitam <strong>vídeo</strong>, não aceitam música sozinha. Transforme a sua música num vídeo com as fotos de vocês, pronto para postar.
      </p>
      <button type="button" onClick={onVideo} style={{ width: '100%', minHeight: '48px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '12px', border: 'none', background: '#fde047', color: '#3b2504', fontWeight: 900, fontSize: '0.98rem', cursor: 'pointer' }}>
        <Film size={18} aria-hidden="true" /> Quero o vídeo para postar · {formatBrl(getPriceForSku('video_addon'))}
      </button>
    </div>
  );
}

export default function CompartilharPresente({ order, orderId, temVideo = false, onVideo = null }) {
  const [msg, setMsg] = useState('');
  const targetId = orderId || order?.id || order?.orderNumber;
  if (!targetId) return null;

  const aviso = (texto) => { setMsg(texto); setTimeout(() => setMsg(''), 3500); };
  const url = () => buildGiftUrl(window.location.origin, order, targetId);
  const texto = buildGiftMessage(order);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(url()); aviso('Link copiado. É só colar onde quiser.'); }
    catch { aviso('Não deu para copiar. Tente pelo botão Mais opções.'); }
  };
  const menu = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `Uma homenagem para ${order?.honoreeName || 'alguém especial'}`, text: texto, url: url() });
      else await copiar();
    } catch (e) { if (e?.name !== 'AbortError') aviso('Não foi possível abrir o menu agora.'); }
  };
  const whatsappHref = () => `https://wa.me/?text=${encodeURIComponent(`${texto} ${url()}`)}`;

  return (
    <section className="nx-card" aria-label="Compartilhar presente" style={{ padding: '16px' }}>
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 4px' }}>Compartilhe esse presente</h2>
      <p className="nx-helper" style={{ margin: '0 0 12px' }}>Quem receber o link ouve a música direto no celular, sem cadastro.</p>
      <PostarNasRedes temVideo={temVideo} onVideo={onVideo} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        <a href="#whatsapp" style={botao} onClick={(e) => { e.preventDefault(); window.open(whatsappHref(), '_blank', 'noopener,noreferrer'); }}>
          <MessageCircle size={22} aria-hidden="true" style={{ color: '#16a34a' }} />
          <span>Enviar no WhatsApp</span>
        </a>
        <button type="button" style={botao} onClick={menu}>
          <Share2 size={22} aria-hidden="true" style={{ color: '#6d28d9' }} />
          <span>Mais opções</span>
        </button>
        <button type="button" style={botao} onClick={copiar}>
          {msg.startsWith('Link copiado') ? <Check size={22} aria-hidden="true" style={{ color: '#16a34a' }} /> : <Copy size={22} aria-hidden="true" style={{ color: '#475569' }} />}
          <span>Copiar link</span>
        </button>
        <QrCodeHomenagem url={typeof window !== 'undefined' ? url() : ''} honoreeName={order?.honoreeName} tipo="musica" buttonStyle={botao}>
          <QrCode size={22} aria-hidden="true" style={{ color: '#db2777' }} />
          <span>Gerar QR Code</span>
        </QrCodeHomenagem>
      </div>
      {msg && <p role="status" className="nx-helper" style={{ margin: '10px 0 0', fontWeight: 600 }}>{msg}</p>}
      <details style={{ marginTop: '12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>Como postar no Status do WhatsApp ou no Instagram</summary>
        <ol className="nx-helper" style={{ margin: '8px 0 0', paddingLeft: '18px', lineHeight: 1.6 }}>
          <li>Toque em <strong>Copiar link</strong>.</li>
          <li><strong>WhatsApp:</strong> abra Status, escolha o ícone de texto e cole o link.</li>
          <li><strong>Instagram:</strong> crie um Story, toque no adesivo de <strong>Link</strong> e cole. Também funciona na bio ou numa conversa direta.</li>
        </ol>
      </details>
    </section>
  );
}
