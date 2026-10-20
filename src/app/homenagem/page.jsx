'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Film, Music, Download, Mail, BookOpen, Share2, Heart, Lock, Check } from 'lucide-react';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';

export function HomenagemView({ orderId: propOrderId }) {
  const searchParams = useSearchParams();
  const orderId = propOrderId || searchParams?.get('orderId') || searchParams?.get('id');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeAudioIndex, setActiveAudioIndex] = useState(0);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json?.order) setOrder(json.order);
        }
      } catch (err) {
        console.error('Erro ao carregar homenagem:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: `Uma homenagem para ${order?.honoreeName || 'alguém especial'}`,
        text: `Preparei uma homenagem especial com música para ${order?.honoreeName || 'você'}! ❤️`,
        url,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#08060f', color: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid rgba(244, 114, 182, 0.2)', borderTopColor: '#f472b6', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '20px', color: '#cbd5e1', fontSize: '1rem', fontWeight: '500', letterSpacing: '0.02em' }}>Carregando sua homenagem especial…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#08060f', color: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(244, 114, 182, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: '#f472b6' }}>
          <Music size={32} />
        </div>
        <h1 style={{ fontFamily: "var(--font-family-gala, 'Cinzel', Georgia, serif)", fontSize: '1.8rem', fontWeight: '700', marginBottom: '8px', color: '#ffffff' }}>Homenagem não encontrada</h1>
        <p style={{ color: '#94a3b8', maxWidth: '420px', fontSize: '0.92rem', lineHeight: 1.6 }}>O link que você acessou pode estar incorreto ou o pedido ainda não foi concluído.</p>
      </div>
    );
  }

  const honoreeName = order.honoreeName || 'Alguém Especial';
  const customerName = order.customerName || 'Alguém que te ama muito';
  const songStyle = order.style || order.genre || 'Personalizada';
  const lyrics = order.lyrics || order.generatedLyrics || '';

  const isPaid = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO';
  const hasVideo = isPaid && Boolean(order.videoUrl);

  const todasAsFaixas = isPaid
    ? (order.audioFiles && order.audioFiles.length > 0 ? order.audioFiles : (order.audioUrl ? [order.audioUrl] : []))
    : [];
  const escolhida = order.homenagemMusicaUrl;
  const faixaCorrespondente = escolhida
    ? (todasAsFaixas.includes(escolhida) ? escolhida : (todasAsFaixas.find((f) => f.includes(escolhida) || escolhida.includes(f)) || escolhida))
    : null;
  const audioList = faixaCorrespondente
    ? [faixaCorrespondente]
    : (todasAsFaixas.length > 0 ? [todasAsFaixas[0]] : []);

  const videoUrl = hasVideo ? order.videoUrl : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#08060f', color: '#ffffff', position: 'relative', overflowX: 'hidden', fontFamily: 'var(--font-family-body, -apple-system, sans-serif)', paddingBottom: '70px' }}>
      
      {/* Luzes de Fundo Atmosféricas e Suaves */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '1200px', height: '500px', background: 'radial-gradient(ellipse at 50% 10%, rgba(244, 114, 182, 0.15) 0%, rgba(147, 51, 234, 0.08) 50%, transparent 75%)', pointerEvents: 'none' }} />

      {/* Conteúdo Principal */}
      <main style={{ maxWidth: '840px', margin: '0 auto', padding: '44px 20px', position: 'relative', zIndex: 10 }}>

        {/* Cabeçalho Emocionante com Tipografia de Gala */}
        <header style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '999px', backgroundColor: 'rgba(244, 114, 182, 0.1)', border: '1px solid rgba(244, 114, 182, 0.28)', color: '#f472b6', fontSize: '0.78rem', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '18px' }}>
            <Sparkles size={13} aria-hidden="true" />
            <span>Uma surpresa inesquecível para você</span>
          </div>

          <h1 style={{ fontFamily: "var(--font-family-gala, 'Cinzel', Georgia, serif)", fontSize: 'clamp(2rem, 4vw, 2.85rem)', fontWeight: '700', color: '#ffffff', marginBottom: '12px', lineHeight: '1.2', letterSpacing: '-0.02em', textWrap: 'balance' }}>
            Uma Canção para <span style={{ color: '#f472b6', textDecoration: 'underline', textDecorationColor: 'rgba(244, 114, 182, 0.4)', textUnderlineOffset: '6px' }}>{honoreeName}</span>
          </h1>

          <p style={{ color: '#cbd5e1', fontSize: '1.05rem', maxWidth: '560px', margin: '0 auto', lineHeight: 1.6 }}>
            De <strong style={{ color: '#ffffff', fontWeight: '700' }}>{customerName}</strong> com todo amor{' '}
            <Heart size={15} style={{ fill: '#f43f5e', color: '#f43f5e', display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} aria-hidden="true" />
          </p>
        </header>

        {/* CARD PRINCIPAL (VÍDEO OU ÁUDIO) */}
        <section
          aria-label="Reprodução da homenagem"
          style={{
            backgroundColor: 'rgba(20, 14, 32, 0.78)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '24px',
            padding: '28px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
            marginBottom: '28px',
          }}
        >
          {videoUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: '700', color: '#f472b6' }}>
                  <Film size={16} aria-hidden="true" />
                  <span>Vídeo Homenagem com Fotos</span>
                </span>
                <span style={{ fontSize: '0.75rem', color: '#cbd5e1', backgroundColor: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', fontWeight: '600' }}>
                  HD 1080p
                </span>
              </div>
              
              <div style={{ width: '100%', borderRadius: '18px', overflow: 'hidden', backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '480px', display: 'flex', justifyContent: 'center' }}>
                <video
                  src={videoUrl}
                  controls
                  controlsList="nodownload"
                  poster={order.slideshowImages && order.slideshowImages[0]}
                  style={{ width: '100%', maxHeight: '480px', objectFit: 'contain' }}
                >
                  Seu navegador não suporta a exibição de vídeos.
                </video>
              </div>

              {/* Botão de Download do Vídeo */}
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                <a
                  href={`/api/image-proxy?url=${encodeURIComponent(videoUrl)}`}
                  download={`Homenagem_${honoreeName}.${videoUrl.split('?')[0].split('.').pop().toLowerCase() === 'webm' ? 'webm' : 'mp4'}`}
                  rel="noopener noreferrer"
                  style={{
                    width: '100%',
                    maxWidth: '360px',
                    minHeight: '48px',
                    padding: '14px 24px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    textAlign: 'center',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 8px 24px rgba(236, 72, 153, 0.35)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <Download size={18} aria-hidden="true" />
                  <span>Baixar Vídeo MP4 HD</span>
                </a>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div style={{ textAlign: 'center', padding: '12px 0 6px' }}>
                {order.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.coverUrl}
                    alt={`Capa da homenagem para ${honoreeName}`}
                    style={{
                      width: '140px',
                      height: '140px',
                      objectFit: 'cover',
                      borderRadius: '50%',
                      margin: '0 auto 16px auto',
                      display: 'block',
                      border: '3px solid rgba(244, 114, 182, 0.6)',
                      boxShadow: '0 0 32px rgba(244, 114, 182, 0.35), 0 8px 24px rgba(0,0,0,0.5)',
                    }}
                  />
                ) : (
                  <div style={{ width: '74px', height: '74px', background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px auto', boxShadow: '0 8px 24px rgba(236, 72, 153, 0.3)' }}>
                    <Music size={32} color="#ffffff" aria-hidden="true" />
                  </div>
                )}
                <h2 style={{ fontFamily: "var(--font-family-gala, 'Cinzel', Georgia, serif)", fontSize: '1.45rem', fontWeight: '700', color: '#ffffff', margin: '0 0 6px 0' }}>
                  Canção Personalizada
                </h2>
                <p style={{ fontSize: '0.86rem', color: '#94a3b8', margin: 0 }}>Estilo: {songStyle}</p>
              </div>

              {!isPaid && (
                <div style={{ textAlign: 'center', padding: '22px', borderRadius: '16px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Lock size={24} style={{ color: '#f472b6', margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '0.9rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
                    A homenagem ainda está sendo finalizada. O áudio estará disponível assim que a liberação for confirmada.
                  </p>
                </div>
              )}

              {audioList.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {audioList.map((url, idx) => (
                    <div 
                      key={idx}
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: activeAudioIndex === idx ? '1.5px solid #f472b6' : '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: activeAudioIndex === idx ? 'rgba(244, 114, 182, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: '700', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Music size={15} style={{ color: '#f472b6' }} aria-hidden="true" />
                          <span>{audioList.length > 1 ? `Versão ${idx + 1}` : 'Gravação Original em Alta Definição'}</span>
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#f472b6', backgroundColor: 'rgba(244, 114, 182, 0.12)', padding: '3px 9px', borderRadius: '8px', border: '1px solid rgba(244, 114, 182, 0.3)', fontWeight: '600' }}>
                          NS Music Studio
                        </span>
                      </div>
                      <audio 
                        src={typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('/api/')) ? url : `/api/audio/proxy?url=${encodeURIComponent(url)}&v=${AUDIO_CACHE_VERSION}`}
                        controls 
                        style={{ width: '100%', borderRadius: '8px', minHeight: '44px' }} 
                        onPlay={() => setActiveAudioIndex(idx)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* LETRA DA MÚSICA — Apresentação poética da composição */}
        {lyrics && (
          <section
            style={{
              backgroundColor: 'rgba(20, 14, 32, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              padding: '28px',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)',
              marginBottom: '28px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Sparkles size={16} style={{ color: '#f472b6' }} aria-hidden="true" />
              <h2 style={{ fontFamily: "var(--font-family-gala, 'Cinzel', Georgia, serif)", fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                Letra da Canção
              </h2>
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: '0.96rem',
              lineHeight: 1.85,
              color: '#cbd5e1',
              maxHeight: '340px',
              overflowY: 'auto',
              paddingRight: '10px',
            }}>
              {lyrics}
            </pre>
          </section>
        )}

        {/* BOTÕES DE COMPLEMENTOS (CARTA E RETROSPECTIVA) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', margin: '28px 0' }}>
          {isPaid && order.hasCartaAccess && order.cartaTexto && (
            <a
              href={`/c/${orderId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '48px',
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #f472b6 0%, #9d174d 100%)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.95rem',
                borderRadius: '14px',
                textDecoration: 'none',
                boxShadow: '0 8px 24px rgba(157, 23, 77, 0.35)',
                transition: 'transform 0.2s ease',
              }}
            >
              <Mail size={18} aria-hidden="true" />
              <span>Abrir sua Carta Virtual</span>
            </a>
          )}

          {isPaid && order.hasRetrospectivaAccess && (
            <a
              href={`/r/${orderId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '48px',
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.95rem',
                borderRadius: '14px',
                textDecoration: 'none',
                boxShadow: '0 8px 24px rgba(168, 85, 247, 0.35)',
                transition: 'transform 0.2s ease',
              }}
            >
              <BookOpen size={18} aria-hidden="true" />
              <span>Ver nossa Linha do Tempo e Retrospectiva</span>
            </a>
          )}

          {/* Botão de Compartilhar Presente */}
          <button
            type="button"
            onClick={handleShare}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '46px',
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              color: '#ffffff',
              fontWeight: '600',
              fontSize: '0.9rem',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            {copied ? (
              <>
                <Check size={16} style={{ color: '#10b981' }} aria-hidden="true" />
                <span>Link da homenagem copiado!</span>
              </>
            ) : (
              <>
                <Share2 size={16} aria-hidden="true" />
                <span>Compartilhar esta homenagem</span>
              </>
            )}
          </button>
        </div>

        {/* Rodapé e Assinatura */}
        <footer style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem', paddingTop: '28px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <p style={{ margin: '0 0 4px 0' }}>Feito com amor e carinho no <strong style={{ color: '#cbd5e1' }}>NS Music Studio</strong></p>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} NS Music. Todos os direitos reservados.</p>
        </footer>

      </main>
    </div>
  );
}

export default function HomenagemPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#08060f', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid rgba(244, 114, 182, 0.2)', borderTopColor: '#f472b6', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <HomenagemView />
    </Suspense>
  );
}
