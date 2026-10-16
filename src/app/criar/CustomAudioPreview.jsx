'use client';

import { useState, useEffect, useRef } from 'react';
import { markPreviewListened } from '@/lib/previewTracking';

// Player de prévia de 60s usado na tela de geração de áudio — extraído de page.jsx (M-20 no
// AUDIT_REPORT.md). Componente autocontido: só depende das props recebidas.
export default function CustomAudioPreview({ src, label, badge, isBonus, orderId, onPreviaEncerrada }) {
  const audioRef = useRef(null);
  const retryTimerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showEndedNotice, setShowEndedNotice] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Limpa o timer de retry na desmontagem (ver B-01 no AUDIT_REPORT.md).
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn(e));
    }
  };

  // Versão 1 toca completa sem corte de 60s
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    setCurrentTime(curr);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration || 0);
  };

  const handleSeek = (e) => {
    if (!audioRef.current) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleError = () => {
    // CDN ainda propagando o arquivo (ex: erro 502/404 da proxy). Tentar de novo.
    if (retryCount < 10) {
      retryTimerRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        if (audioRef.current) {
          audioRef.current.load();
        }
      }, 3000);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        padding: '26px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        border: isBonus ? '1.5px solid #fbcfe8' : '1px solid #eef2f6',
        boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: isBonus ? '#fff1f2' : '#f5f3ff',
              border: isBonus ? '1px solid #fecdd3' : '1px solid #ddd6fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0,
            }}
          >
            {isBonus ? '🎁' : '🎧'}
          </div>
          <div>
            <span
              style={{
                background: isBonus ? '#fdf2f8' : '#eef2ff',
                border: isBonus ? '1px solid #fbcfe8' : '1px solid #c7d2fe',
                color: isBonus ? '#db2777' : '#4338ca',
                padding: '3px 10px',
                borderRadius: '8px',
                fontSize: '0.74rem',
                fontWeight: '800',
                letterSpacing: '0.04em',
              }}
            >
              {badge}
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: '4px 0 0 0', color: '#0f172a' }}>
              {label}
            </h3>
          </div>
        </div>
        <span
          style={{
            fontSize: '0.82rem',
            color: isBonus ? '#db2777' : '#059669',
            fontWeight: '700',
            backgroundColor: isBonus ? '#fff1f2' : '#ecfdf5',
            padding: '4px 12px',
            borderRadius: '999px',
            border: isBonus ? '1px solid #fecdd3' : '1px solid #a7f3d0',
          }}
        >
          {isBonus ? 'Bônus Grátis Incluso ✓' : 'Incluso no Pacote ✓'}
        </span>
      </div>

      {src ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: '4px',
            background: '#f8fafc',
            padding: '16px 20px',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
          }}
        >
          <audio
            ref={audioRef}
            src={`${src}${src.includes('?') ? '&' : '?'}retry=${retryCount}`}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            onEnded={() => {
              setIsPlaying(false);
              onPreviaEncerrada?.();
            }}
            onPause={() => setIsPlaying(false)}
            onPlay={() => { setIsPlaying(true); markPreviewListened(orderId); }}
            controlsList="nodownload noplaybackrate"
            onContextMenu={(e) => e.preventDefault()}
            style={{ display: 'none' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={togglePlay}
              type="button"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                border: 'none',
                background: isBonus ? 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                color: '#fff',
                fontSize: '1.2rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(79, 70, 229, 0.25)',
                flexShrink: 0,
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                style={{
                  width: '100%',
                  accentColor: isBonus ? '#ec4899' : 'var(--primary)',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic', padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          ⏳ Sintetizando áudio do estúdio...
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#64748b' }}>
        <span>🎧</span>
        <span>Prévia da Versão 1 completa. O download em MP3 HD e a Versão 2 são liberados após o pagamento.</span>
      </div>
    </div>
  );
}
