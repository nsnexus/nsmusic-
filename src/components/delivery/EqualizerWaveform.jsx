'use client';

/**
 * Visualizador de frequência estético em ondas para o CustomAudioPlayer
 */
export default function EqualizerWaveform({ isPlaying = false, currentTime = 0, barCount = 18 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2.5px',
        height: '24px',
        padding: '0 4px',
      }}
    >
      {Array.from({ length: barCount }).map((_, i) => {
        const h = isPlaying
          ? Math.max(4, Math.sin((i / barCount) * Math.PI * 3 + currentTime * 2) * 14 + 10)
          : 4;
        return (
          <div
            key={i}
            style={{
              width: '2.5px',
              borderRadius: '2px',
              backgroundColor: isPlaying ? (i % 2 === 0 ? '#4f46e5' : '#ec4899') : '#cbd5e1',
              height: `${h}px`,
              transition: 'height 0.15s ease, background-color 0.2s',
            }}
          />
        );
      })}
    </div>
  );
}

