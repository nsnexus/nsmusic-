'use client';

import { useState } from 'react';
import Image from 'next/image';
import { markPreviewListened } from '@/lib/previewTracking';
import CustomAudioPlayer from '@/components/delivery/CustomAudioPlayer';

export default function CustomAudioPreview({
  src,
  label,
  badge,
  isBonus = false,
  orderId,
  onPreviaEncerrada,
  isSecondGen = false,
  isPaid = false,
  coverUrl,
}) {
  const isFullAudioUnlocked = Boolean(isSecondGen || isPaid);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [showEndedNotice, setShowEndedNotice] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handlePlay = () => {
    if (orderId) markPreviewListened(orderId);
  };

  const handlePreviewEnded = () => {
    setShowEndedNotice(true);
    onPreviaEncerrada?.();
  };

  const handleError = () => {
    // Tentativa automática se CDN ainda estiver propagando o áudio
    setTimeout(() => {
      setReloadKey(prev => prev + 1);
    }, 3000);
  };

  return (
    <article
      className="nx-card"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        padding: '22px 20px',
        border: isBonus ? '1.5px solid #fbcfe8' : '1px solid #e2e8f0',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes spinVinylCriar {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Topo: Vinil Rotativo + Capa + Título e Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* Bloco do Disco de Vinil com Capa */}
        <div style={{ position: 'relative', width: '108px', height: '108px', flexShrink: 0 }}>
          {/* Vinil estilizado que projeta para o lado e gira quando toca */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '4px',
              right: isAudioPlaying ? '-18px' : '0px',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, #0f172a 32%, #1e293b 33%, #0f172a 46%, #1e293b 47%, #0f172a 62%, #334155 63%, #0f172a 64%)',
              boxShadow: isAudioPlaying ? '0 8px 20px rgba(15, 23, 42, 0.35)' : '0 4px 10px rgba(0,0,0,0.12)',
              transition: 'right 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 0,
              animation: isAudioPlaying ? 'spinVinylCriar 5.5s linear infinite' : 'none',
            }}
          >
            {/* Miolo central do vinil */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isBonus ? 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                border: '2.5px solid #0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0f172a' }} />
            </div>
          </div>

          {/* Capa em primeiro plano */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              width: '108px',
              height: '108px',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 20px -3px rgba(79, 70, 229, 0.16)',
              border: '2px solid rgba(255, 255, 255, 0.95)',
              backgroundColor: '#f1f5f9',
            }}
          >
            <Image
              src={coverUrl || '/experiencia/familia.webp'}
              alt={label || 'Capa da sua música'}
              width={108}
              height={108}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              unoptimized={Boolean(coverUrl)}
            />
            {isAudioPlaying && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '5px',
                  left: '5px',
                  backgroundColor: 'rgba(15, 23, 42, 0.88)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: '999px',
                  padding: '2px 7px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#ffffff',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                <span
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                TOCANDO
              </div>
            )}
          </div>
        </div>

        {/* Informações da Versão e Título */}
        <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: isBonus ? '#fdf2f8' : '#eef2ff',
                border: isBonus ? '1px solid #fbcfe8' : '1px solid #c7d2fe',
                color: isBonus ? '#db2777' : '#4338ca',
                padding: '3px 9px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.03em',
              }}
            >
              {badge}
            </span>

            <span
              style={{
                fontSize: '0.74rem',
                color: isFullAudioUnlocked ? '#059669' : isBonus ? '#db2777' : '#4f46e5',
                fontWeight: 700,
                backgroundColor: isFullAudioUnlocked ? '#ecfdf5' : isBonus ? '#fff1f2' : '#f5f3ff',
                padding: '3px 9px',
                borderRadius: '999px',
                border: isFullAudioUnlocked ? '1px solid #a7f3d0' : isBonus ? '1px solid #fecdd3' : '1px solid #ddd6fe',
              }}
            >
              {isSecondGen ? '✨ 2ª Geração Liberada ✓' : isBonus ? 'Bônus Grátis Incluso ✓' : 'Incluso no Pacote ✓'}
            </span>
          </div>

          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#0f172a', lineHeight: 1.3 }}>
            {label}
          </h3>

          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
            {isFullAudioUnlocked
              ? 'Áudio completo em alta definição liberado para ouvir e baixar.'
              : 'Ouça 60 segundos de prévia para conferir a melodia e arranjo.'}
          </p>
        </div>
      </div>

      {/* Player de Alta Fidelidade (mesmo padrão de /entrega) */}
      {src ? (
        <div style={{ width: '100%', marginTop: '2px' }}>
          <CustomAudioPlayer
            source={src}
            reload={reloadKey}
            paid={isFullAudioUnlocked}
            previewMaxDuration={60}
            trackLabel={label}
            onPlayTrack={handlePlay}
            onErrorTrack={handleError}
            onPlayingChange={setIsAudioPlaying}
            onPreviewEnded={handlePreviewEnded}
          />

          {showEndedNotice && !isFullAudioUnlocked && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '14px',
                fontSize: '0.82rem',
                color: '#b91c1c',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>🔒</span>
              <span>Prévia de 60s finalizada. Avance para liberar as 2 versões completas em MP3 HD!</span>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            fontSize: '0.88rem',
            color: '#64748b',
            fontStyle: 'italic',
            padding: '16px',
            background: '#f8fafc',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
            textAlign: 'center',
          }}
        >
          ⏳ Sintetizando áudio do estúdio... aguarde um instante.
        </div>
      )}
    </article>
  );
}
