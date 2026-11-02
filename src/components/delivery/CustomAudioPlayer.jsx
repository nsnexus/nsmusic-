'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';
import EqualizerWaveform from './EqualizerWaveform';
import AudioScrubber from './AudioScrubber';

export default function CustomAudioPlayer({
  source,
  reload = 0,
  paid = false,
  previewMaxDuration = 60,
  onPlayTrack,
  onErrorTrack,
  onCanPlayTrack,
  trackLabel = 'Música 1',
  onPlayingChange,
}) {
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const effectiveDuration = !paid && duration > 0 ? Math.min(previewMaxDuration, duration) : duration;

  // Notifica o componente pai sobre mudanças de reprodução (ex: girar o vinil)
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // Reseta ao trocar a música
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
      el.playbackRate = playbackRate;
    }
  }, [source, playbackRate]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      if (!paid && el.currentTime >= (effectiveDuration || previewMaxDuration)) {
        el.currentTime = 0;
      } else if (paid && el.currentTime >= el.duration) {
        el.currentTime = 0;
      }
      el.play().catch(() => {});
    }
  }, [isPlaying, paid, effectiveDuration, previewMaxDuration]);

  const seekRelative = useCallback((deltaSeconds) => {
    const el = audioRef.current;
    if (!el) return;
    const maxAllowed = !paid ? (effectiveDuration || previewMaxDuration) : (el.duration || 1000);
    const newTime = Math.max(0, Math.min(maxAllowed, el.currentTime + deltaSeconds));
    el.currentTime = newTime;
    setCurrentTime(newTime);
  }, [paid, effectiveDuration, previewMaxDuration]);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const next = !isMuted;
    el.muted = next;
    setIsMuted(next);
  }, [isMuted]);

  const cycleSpeed = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const speeds = [1, 1.25, 1.5];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    el.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
  }, [playbackRate]);

  const handleSliderChange = (e) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    const el = audioRef.current;
    if (el) {
      el.currentTime = val;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekRelative(-5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekRelative(5);
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMute();
    }
  };

  const progressPercent = effectiveDuration > 0
    ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))
    : 0;

  const audioSrc = source
    ? `${source}${source.includes('?') ? '&' : '?'}retry=${reload}`
    : '';

  return (
    <div
      role="region"
      aria-label={`Player de áudio personalizado: ${trackLabel}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '20px',
        padding: '18px 20px',
        boxShadow: '0 10px 28px -6px rgba(79, 70, 229, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.04)',
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        .impeccable-scrubber::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 6px rgba(79, 70, 229, 0.4);
          transition: transform 0.15s ease;
        }
        .impeccable-scrubber::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }
        .impeccable-scrubber::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 6px rgba(79, 70, 229, 0.4);
        }
      `}</style>

      {/* Áudio Nativo Oculto (Gerenciador do Fluxo de Mídia) */}
      <audio
        ref={audioRef}
        key={`${source}-${reload}`}
        src={audioSrc}
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          onPlayTrack?.();
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (!paid && t >= (effectiveDuration || previewMaxDuration)) {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
            setIsPlaying(false);
            setCurrentTime(0);
          } else {
            setCurrentTime(t);
          }
        }}
        onLoadedMetadata={(e) => {
          const rawDur = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0;
          setDuration(rawDur);
          onCanPlayTrack?.();
        }}
        onCanPlay={onCanPlayTrack}
        onError={onErrorTrack}
        onContextMenu={(e) => { if (!paid) e.preventDefault(); }}
        style={{ display: 'none' }}
      />

      {/* Topo do Player: Status e Badges de Estúdio */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '999px',
              backgroundColor: paid ? '#ecfdf5' : '#fef3c7',
              color: paid ? '#065f46' : '#92400e',
              border: `1px solid ${paid ? '#a7f3d0' : '#fde68a'}`,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isPlaying ? (paid ? '#10b981' : '#f59e0b') : '#94a3b8',
                display: 'inline-block',
                boxShadow: isPlaying ? `0 0 8px ${paid ? '#10b981' : '#f59e0b'}` : 'none',
              }}
            />
            {paid ? 'Áudio Completo Liberado' : 'Prévia Gratuita (60s)'}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
            {trackLabel}
          </span>
        </div>

        {/* Visualizador de Onda Estético */}
        <EqualizerWaveform isPlaying={isPlaying} currentTime={currentTime} barCount={18} />
      </div>

      {/* Barra de Progresso Deslizante Interativa */}
      <AudioScrubber
        currentTime={currentTime}
        effectiveDuration={effectiveDuration}
        previewMaxDuration={previewMaxDuration}
        progressPercent={progressPercent}
        isScrubbing={isScrubbing}
        setIsScrubbing={setIsScrubbing}
        handleSliderChange={handleSliderChange}
        progressBarRef={progressBarRef}
        trackLabel={trackLabel}
      />

      {/* Controles Principais de Reprodução */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
        {/* Controle de Volume */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? 'Ativar som' : 'Desativar som'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '1px solid #e2e8f0',
            backgroundColor: isMuted ? '#fef2f2' : '#f8fafc',
            color: isMuted ? '#ef4444' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        {/* Bloco Central: -10s, PLAY/PAUSE, +10s */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            onClick={() => seekRelative(-10)}
            aria-label="Voltar 10 segundos"
            title="Voltar 10 segundos"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              color: '#334155',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCcw size={18} />
          </button>

          {/* Botão Play / Pause de Destaque */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pausar música' : 'Tocar música'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              border: 'none',
              background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 8px 20px -2px rgba(79, 70, 229, 0.45), 0 2px 6px rgba(0, 0, 0, 0.1)',
              transform: isPlaying ? 'scale(1.03)' : 'scale(1)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {isPlaying ? (
              <Pause size={24} fill="#ffffff" strokeWidth={1.5} />
            ) : (
              <Play size={24} fill="#ffffff" strokeWidth={1.5} style={{ marginLeft: '3px' }} />
            )}
          </button>

          <button
            type="button"
            onClick={() => seekRelative(10)}
            aria-label="Avançar 10 segundos"
            title="Avançar 10 segundos"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              color: '#334155',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCw size={18} />
          </button>
        </div>

        {/* Seletor de Velocidade (1x / 1.25x / 1.5x) */}
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={`Velocidade de reprodução: ${playbackRate}x. Clique para alternar`}
          title="Alternar velocidade"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '40px',
            height: '34px',
            padding: '0 8px',
            borderRadius: '999px',
            border: '1px solid #e2e8f0',
            backgroundColor: playbackRate !== 1 ? '#eef2ff' : '#f8fafc',
            color: playbackRate !== 1 ? '#4f46e5' : '#475569',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
}
