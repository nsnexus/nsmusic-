'use client';

import { useState, useEffect, useRef } from 'react';

// Player de prévia de 60s usado na tela de geração de áudio — extraído de page.jsx (M-20 no
// AUDIT_REPORT.md). Componente autocontido: só depende das props recebidas.
export default function CustomAudioPreview({ src, label, badge, isBonus }) {
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

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    if (curr >= 60) {
      audioRef.current.pause();
      audioRef.current.currentTime = 60;
      setIsPlaying(false);
      setShowEndedNotice(true);
    } else {
      if (showEndedNotice) setShowEndedNotice(false);
    }
    setCurrentTime(Math.min(curr, 60));
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(Math.min(audioRef.current.duration || 60, 60));
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
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: isBonus ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid rgba(255,255,255,0.1)', backgroundColor: isBonus ? 'rgba(236, 72, 153, 0.03)' : 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ background: isBonus ? 'rgba(236, 72, 153, 0.2)' : 'rgba(124, 58, 237, 0.2)', color: isBonus ? '#ec4899' : 'var(--secondary)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
            {badge}
          </span>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginTop: '6px' }}>🎵 {label}</h3>
        </div>
        <span style={{ fontSize: '0.85rem', color: isBonus ? '#ec4899' : '#34d399', fontWeight: 'bold' }}>
          {isBonus ? 'Bônus Grátis Incluso ✓' : 'Incluso no Pacote ✓'}
        </span>
      </div>

      {src ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px', background: 'rgba(0, 0, 0, 0.3)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <audio
            ref={audioRef}
            src={`${src}${src.includes('?') ? '&' : '?'}retry=${retryCount}`}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
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
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                flexShrink: 0
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <input
                type="range"
                min="0"
                max={duration || 60}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                style={{
                  width: '100%',
                  accentColor: isBonus ? '#ec4899' : 'var(--primary)',
                  cursor: 'pointer'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>{formatTime(currentTime)}</span>
                <span>0:60 (Prévia Protegida)</span>
              </div>
            </div>
          </div>

          {showEndedNotice && (
            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontSize: '0.8rem', color: '#fca5a5', fontWeight: 'bold' }}>
              🔒 Prévia de 60s finalizada. Avance para liberar o download da versão completa MP3 HD!
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
          ⏳ Sintetizando áudio do estúdio...
        </div>
      )}

      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        🔒 Prévia de 60s. O áudio completo em MP3 HD sem restrições será liberado imediatamente após o pagamento.
      </span>
    </div>
  );
}
