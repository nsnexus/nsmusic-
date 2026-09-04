'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';

function HomenagemContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id');

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
        const docRef = doc(db, 'orders', orderId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setOrder(docSnap.data());
        }
      } catch (err) {
        console.error("Erro ao carregar homenagem:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Homenagem para ${order?.honoreeName || 'alguém especial'}`,
        text: `Assista a essa linda homenagem de música e vídeo preparada especialmente para ${order?.honoreeName || 'você'}! ❤️`,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '50px', height: '50px', borderRadius: '50%', border: '4px solid #ec4899', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '20px', color: '#cbd5e1', fontSize: '1.1rem', fontWeight: '500' }}>Carregando a sua homenagem especial...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎵</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '8px' }}>Homenagem não encontrada</h1>
        <p style={{ color: '#94a3b8', maxWidth: '400px' }}>O link que você acessou pode estar incorreto ou o pedido ainda não foi concluído.</p>
      </div>
    );
  }

  const honoreeName = order.honoreeName || 'Alguém Especial';
  const customerName = order.customerName || 'Alguém que te ama muito';
  const songStyle = order.style || order.genre || 'Personalizada';
  const lyrics = order.lyrics || order.generatedLyrics || 'Esta música foi criada com todo o carinho e emoção para eternizar momentos inesquecíveis.';

  // Liberação SOMENTE por paymentStatus vindo do Firestore — nunca por parâmetro de URL
  // (ver C-07/C-01 no AUDIT_REPORT.md: esta rota já foi exploitável via /homenagem?orderId=X).
  const isPaid = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO';
  const hasVideo = isPaid && !!order.videoUrl;

  const audioList = isPaid
    ? (order.audioFiles && order.audioFiles.length > 0 ? order.audioFiles : (order.audioUrl ? [order.audioUrl] : []))
    : [];

  const videoUrl = hasVideo ? order.videoUrl : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#ffffff', position: 'relative', overflowX: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: '60px' }}>
      
      {/* Luzes de Fundo e Brilhos Elegantes */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '1200px', height: '400px', background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, rgba(168,85,247,0.1) 50%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />

      {/* Conteúdo Principal */}
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 16px', position: 'relative', zIndex: 10 }}>

        {/* Cabeçalho Emocionante */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '30px', backgroundColor: 'rgba(236, 72, 153, 0.12)', border: '1px solid rgba(236, 72, 153, 0.3)', color: '#f472b6', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '20px' }}>
            <span>✨ Uma surpresa inesquecível para você</span>
          </div>

          <h1 style={{ fontSize: '2.4rem', fontWeight: '900', color: '#ffffff', marginBottom: '12px', lineHeight: '1.2' }}>
            Uma Homenagem Especial para <span style={{ color: '#ec4899', textDecoration: 'underline', textDecorationColor: 'rgba(236, 72, 153, 0.4)' }}>{honoreeName}</span>
          </h1>

          <p style={{ color: '#cbd5e1', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto', fontWeight: '300' }}>
            De <strong style={{ color: '#ffffff', fontWeight: '700' }}>{customerName}</strong> com todo carinho e amor ❤️
          </p>
        </div>

        {/* PLAYER DE VÍDEO OU ÁUDIO EM DESTAQUE */}
        <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1.5px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '24px', backdropFilter: 'blur(16px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', marginBottom: '32px' }}>
          
          {videoUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.92rem', fontWeight: 'bold', color: '#ec4899' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ec4899' }} />
                  🎬 Vídeo Homenagem com Fotos
                </span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>HD 1080p</span>
              </div>
              
              <div style={{ width: '100%', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '480px', display: 'flex', justifyContent: 'center' }}>
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
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                {/* Capa personalizada do pedido — antes só existia o ícone genérico de nota musical
                    aqui, e a foto que o cliente escolheu não aparecia em lugar nenhum desta página
                    (achado 04/09/2026). Sem capa, mantém o ícone de sempre. */}
                {order.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.coverUrl}
                    alt={`Capa da homenagem para ${honoreeName}`}
                    style={{ width: '132px', height: '132px', objectFit: 'cover', borderRadius: '50%', margin: '0 auto 14px auto', display: 'block', border: '3px solid rgba(236, 72, 153, 0.55)', boxShadow: '0 0 32px rgba(236, 72, 153, 0.45), 0 8px 24px rgba(0,0,0,0.5)' }}
                  />
                ) : (
                  <div style={{ width: '70px', height: '70px', background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto', boxShadow: '0 8px 24px rgba(236, 72, 153, 0.3)' }}>
                    <span style={{ fontSize: '2rem' }}>🎵</span>
                  </div>
                )}
                <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ffffff', margin: '0 0 4px 0' }}>Música Personalizada Exclusiva</h3>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>Estilo: {songStyle}</p>
              </div>

              {!isPaid && (
                <div style={{ textAlign: 'center', padding: '20px', borderRadius: '16px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '1.8rem' }}>🔒</span>
                  <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '8px' }}>
                    A homenagem ainda está sendo finalizada. As músicas ficarão disponíveis assim que o pagamento for confirmado.
                  </p>
                </div>
              )}

              {audioList.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {audioList.map((url, idx) => (
                    <div 
                      key={idx}
                      style={{
                        padding: '16px',
                        borderRadius: '16px',
                        border: activeAudioIndex === idx ? '1.5px solid #ec4899' : '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: activeAudioIndex === idx ? 'rgba(236, 72, 153, 0.1)' : 'rgba(0, 0, 0, 0.3)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f1f5f9' }}>
                          {audioList.length > 1 ? `Versão ${idx + 1}` : 'Áudio em Alta Qualidade (MP3 HD)'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.12)', padding: '3px 8px', borderRadius: '10px', border: '1px solid rgba(236, 72, 153, 0.3)' }}>
                          Estúdio NSMusic
                        </span>
                      </div>
                      <audio 
                        src={typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('/api/')) ? url : `/api/audio/proxy?url=${encodeURIComponent(url)}&v=${AUDIO_CACHE_VERSION}`}
                        controls 
                        style={{ width: '100%', borderRadius: '8px' }} 
                        onPlay={() => setActiveAudioIndex(idx)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botão de Download do Vídeo — o atributo `download` do <a> é ignorado pelo navegador
              para URLs de outra origem (caso do Firebase Storage), então ele só abria o vídeo numa
              nova aba em vez de baixar. Passando pelo /api/image-proxy (mesma origem), o download
              funciona de verdade; a extensão também precisa bater com o container real do arquivo
              (mp4 ou webm — ver src/lib/videoGenerator.js). */}
          {videoUrl && (
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'center' }}>
              <a
                href={`/api/image-proxy?url=${encodeURIComponent(videoUrl)}`}
                download={`Homenagem_${honoreeName}.${videoUrl.split('?')[0].split('.').pop().toLowerCase() === 'webm' ? 'webm' : 'mp4'}`}
                rel="noopener noreferrer"
                style={{
                  width: '100%',
                  maxWidth: '350px',
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '0.95rem',
                  borderRadius: '12px',
                  border: 'none',
                  textDecoration: 'none',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(236, 72, 153, 0.4)'
                }}
              >
                <span>⬇</span> Baixar Vídeo MP4 HD
              </a>
            </div>
          )}
        </div>

        {/* CARTA VIRTUAL — link pra página própria (/carta), separada desta (achado 04/09/2026: cada
            add-on precisa da sua própria página compartilhável — música/vídeo aqui, carta com
            música própria tocando sozinha em /carta, histórico em /retrospectiva). */}
        {isPaid && order.hasCartaAccess && order.cartaTexto && (
          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            <a
              href={`/c/${orderId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 24px',
                background: 'linear-gradient(135deg, #f472b6 0%, #9d174d 100%)',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                borderRadius: '12px',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(157, 23, 77, 0.4)',
              }}
            >
              💌 Ver sua Carta
            </a>
          </div>
        )}

        {/* RETROSPECTIVA — link pra página própria, quando o pedido tem essa página liberada. */}
        {isPaid && order.hasRetrospectivaAccess && (
          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            <a
              href={`/retrospectiva?orderId=${orderId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 24px',
                background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                borderRadius: '12px',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(168, 85, 247, 0.4)',
              }}
            >
              📖 Ver nossa Retrospectiva completa
            </a>
          </div>
        )}

        {/* RODAPÉ E CRÉDITOS */}
        <footer style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem', paddingTop: '20px' }}>
          <p style={{ margin: '0 0 4px 0' }}>Feito com amor e carinho por <strong style={{ color: '#cbd5e1' }}>NSMusic Studio</strong> 🎵</p>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} NSMusic. Todos os direitos reservados.</p>
        </footer>

      </main>
    </div>
  );
}

export default function HomenagemPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid #ec4899', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <HomenagemContent />
    </Suspense>
  );
}
