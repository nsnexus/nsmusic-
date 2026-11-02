'use client';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AudioScrubber({
  currentTime,
  effectiveDuration,
  previewMaxDuration,
  progressPercent,
  isScrubbing,
  setIsScrubbing,
  handleSliderChange,
  progressBarRef,
  trackLabel,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ position: 'relative', width: '100%', height: '16px', display: 'flex', alignItems: 'center' }}>
        {/* Fundo da trilha */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '6px',
            borderRadius: '999px',
            backgroundColor: '#e2e8f0',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {/* Trilha preenchida */}
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #4f46e5 0%, #8b5cf6 50%, #ec4899 100%)',
              transition: isScrubbing ? 'none' : 'width 0.1s linear',
            }}
          />
        </div>

        {/* Input range invisível mas acessível para interação tátil e de teclado */}
        <input
          ref={progressBarRef}
          type="range"
          className="impeccable-scrubber"
          min={0}
          max={effectiveDuration || previewMaxDuration || 60}
          step={0.1}
          value={currentTime}
          onChange={handleSliderChange}
          onMouseDown={() => setIsScrubbing(true)}
          onMouseUp={() => setIsScrubbing(false)}
          onTouchStart={() => setIsScrubbing(true)}
          onTouchEnd={() => setIsScrubbing(false)}
          aria-label={`Posição da reprodução de ${trackLabel}`}
          aria-valuemin={0}
          aria-valuemax={effectiveDuration || 60}
          aria-valuenow={Math.round(currentTime)}
          style={{
            position: 'relative',
            width: '100%',
            height: '24px',
            margin: 0,
            background: 'transparent',
            WebkitAppearance: 'none',
            cursor: 'pointer',
            zIndex: 2,
          }}
        />
      </div>

      {/* Marcadores de Tempo */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          color: '#64748b',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(effectiveDuration || previewMaxDuration)}</span>
      </div>
    </div>
  );
}

