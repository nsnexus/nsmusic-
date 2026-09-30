'use client';

import React from 'react';

/**
 * Animação fluida e nativa para o Estúdio de Composição (Geração de Letra)
 * Substitui iframes externos instáveis por gráficos SVG e animações CSS 60fps ultraleves.
 */
export function StudioLyricsAnimation() {
  return (
    <div style={styles.container}>
      <style>{`
        @keyframes quillFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(-3deg); }
        }
        @keyframes sparkleFade {
          0% { transform: scale(0.6) translateY(0); opacity: 0.2; }
          50% { transform: scale(1.2) translateY(-14px); opacity: 0.9; }
          100% { transform: scale(0.8) translateY(-28px); opacity: 0; }
        }
        @keyframes lineGlow {
          0%, 100% { stroke-dashoffset: 120; opacity: 0.4; }
          50% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes floatNote {
          0% { transform: translate(0, 0) scale(0.8); opacity: 0; }
          40% { opacity: 0.9; }
          100% { transform: translate(-18px, -45px) scale(1.1); opacity: 0; }
        }
        @keyframes floatNoteRight {
          0% { transform: translate(0, 0) scale(0.8); opacity: 0; }
          40% { opacity: 0.9; }
          100% { transform: translate(22px, -48px) scale(1.1); opacity: 0; }
        }
        @keyframes pulseHalo {
          0%, 100% { transform: scale(0.95); opacity: 0.35; }
          50% { transform: scale(1.08); opacity: 0.65; }
        }
      `}</style>

      {/* Halo de luz ambiente */}
      <div style={{
        position: 'absolute',
        width: '180px',
        height: '180px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.25) 0%, rgba(236, 72, 153, 0.12) 50%, transparent 70%)',
        filter: 'blur(16px)',
        animation: 'pulseHalo 3s ease-in-out infinite',
        pointerEvents: 'none'
      }} />

      {/* SVG com o Caderno Poético & Pena Estilizada */}
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', zIndex: 1, overflow: 'visible' }}>
        <defs>
          <linearGradient id="sheetGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>
          <linearGradient id="purpleGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#7c3aed" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Folha de papel / Partitura estilizada */}
        <g filter="url(#cardShadow)">
          <rect x="45" y="24" width="130" height="135" rx="16" fill="url(#sheetGrad)" stroke="rgba(226, 232, 240, 0.9)" strokeWidth="2" />
          
          {/* Marcador decorativo de cabeçalho */}
          <rect x="62" y="40" width="36" height="6" rx="3" fill="url(#purpleGrad)" />

          {/* Linhas poéticas iluminadas com efeito de escrita */}
          <line x1="62" y1="62" x2="150" y2="62" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeDasharray="120" style={{ animation: 'lineGlow 3s ease-in-out infinite' }} />
          <line x1="62" y1="78" x2="135" y2="78" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" strokeDasharray="120" style={{ animation: 'lineGlow 3s ease-in-out infinite 0.6s' }} />
          <line x1="62" y1="94" x2="145" y2="94" stroke="#c084fc" strokeWidth="3" strokeLinecap="round" strokeDasharray="120" style={{ animation: 'lineGlow 3s ease-in-out infinite 1.2s' }} />
          <line x1="62" y1="110" x2="120" y2="110" stroke="#ec4899" strokeWidth="3" strokeLinecap="round" strokeDasharray="120" style={{ animation: 'lineGlow 3s ease-in-out infinite 1.8s' }} />
          <line x1="62" y1="126" x2="140" y2="126" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" strokeDasharray="120" style={{ animation: 'lineGlow 3s ease-in-out infinite 2.4s' }} />
        </g>

        {/* Notas Musicais Flutuantes com animação */}
        <g style={{ animation: 'floatNote 2.4s ease-out infinite' }}>
          <text x="36" y="70" fontSize="20" fill="#ec4899" fontFamily="system-ui">♪</text>
        </g>
        <g style={{ animation: 'floatNoteRight 2.8s ease-out infinite 0.7s' }}>
          <text x="165" y="85" fontSize="24" fill="#8b5cf6" fontFamily="system-ui">♫</text>
        </g>
        <g style={{ animation: 'floatNote 3.2s ease-out infinite 1.4s' }}>
          <text x="48" y="135" fontSize="18" fill="#a855f7" fontFamily="system-ui">♩</text>
        </g>
        <g style={{ animation: 'floatNoteRight 2.5s ease-out infinite 1.1s' }}>
          <text x="175" y="55" fontSize="22" fill="#f59e0b" fontFamily="system-ui">✨</text>
        </g>

        {/* Pena de Composição Dourada e Flutuante */}
        <g style={{ animation: 'quillFloat 2.6s ease-in-out infinite', transformOrigin: '150px 100px' }}>
          <path d="M165 30 C165 30 185 55 170 85 C162 101 146 112 140 120 L135 125 L138 118 C144 110 152 95 152 82 C152 58 165 30 165 30Z" fill="url(#goldGrad)" />
          <path d="M165 30 L135 125" stroke="#fef08a" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="135" cy="125" r="2.5" fill="#f59e0b" />
          
          {/* Brilho da ponta da pena */}
          <circle cx="134" cy="126" r="5" fill="#fef08a" opacity="0.6" style={{ animation: 'sparkleFade 1.4s ease-in-out infinite' }} />
        </g>
      </svg>
    </div>
  );
}

/**
 * Animação fluida e nativa para a Produção dos Arranjos Musicais
 * Equilíbrio de estúdio de música, equalizador rítmico, vinil giratório e ondas sonoras.
 */
export function StudioAudioAnimation() {
  return (
    <div style={styles.container}>
      <style>{`
        @keyframes vinylSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes soundWavePulse {
          0% { transform: scale(0.85); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 0.15; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes eqBounce1 { 0%, 100% { height: 12px; } 50% { height: 38px; } }
        @keyframes eqBounce2 { 0%, 100% { height: 36px; } 50% { height: 16px; } }
        @keyframes eqBounce3 { 0%, 100% { height: 20px; } 50% { height: 46px; } }
        @keyframes eqBounce4 { 0%, 100% { height: 42px; } 50% { height: 18px; } }
        @keyframes eqBounce5 { 0%, 100% { height: 16px; } 50% { height: 34px; } }
        @keyframes floatMusicNote {
          0% { transform: translate(0, 0) scale(0.7); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translate(-25px, -50px) scale(1.15); opacity: 0; }
        }
        @keyframes floatMusicNoteR {
          0% { transform: translate(0, 0) scale(0.7); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translate(25px, -55px) scale(1.2); opacity: 0; }
        }
        @keyframes headphoneHover {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
      `}</style>

      {/* Ondas sonoras concêntricas pulsando */}
      <div style={{
        position: 'absolute',
        width: '160px',
        height: '160px',
        borderRadius: '50%',
        border: '2px solid rgba(139, 92, 246, 0.4)',
        animation: 'soundWavePulse 2.2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        width: '160px',
        height: '160px',
        borderRadius: '50%',
        border: '2px solid rgba(236, 72, 153, 0.35)',
        animation: 'soundWavePulse 2.2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite 0.7s',
        pointerEvents: 'none'
      }} />

      {/* SVG Central do Vinil de Estúdio & Headphone */}
      <svg width="240" height="175" viewBox="0 0 240 175" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', zIndex: 1, overflow: 'visible' }}>
        <defs>
          <linearGradient id="vinylShine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="50%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
          <linearGradient id="centerBadge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="headphoneGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <filter id="vinylGlow" x="-20" y="-20" width="280" height="215" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="#8b5cf6" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Disco de Vinil com rotação contínua */}
        <g filter="url(#vinylGlow)">
          <g style={{ transformOrigin: '120px 80px', animation: 'vinylSpin 6s linear infinite' }}>
            {/* Base do disco */}
            <circle cx="120" cy="80" r="58" fill="url(#vinylShine)" stroke="#334155" strokeWidth="1.5" />
            {/* Ranhuras de áudio do vinil */}
            <circle cx="120" cy="80" r="50" stroke="#334155" strokeWidth="0.8" strokeDasharray="6 3" opacity="0.6" />
            <circle cx="120" cy="80" r="42" stroke="#475569" strokeWidth="0.8" strokeDasharray="8 4" opacity="0.5" />
            <circle cx="120" cy="80" r="34" stroke="#334155" strokeWidth="0.8" strokeDasharray="5 2" opacity="0.6" />
            
            {/* Selo central com gradiente vibrant */}
            <circle cx="120" cy="80" r="22" fill="url(#centerBadge)" />
            {/* Furo central do disco */}
            <circle cx="120" cy="80" r="5" fill="#f8fafc" />
            <circle cx="120" cy="80" r="2.5" fill="#0f172a" />
          </g>
        </g>

        {/* Headphone de Estúdio envolvendo o disco com leve flutuação */}
        <g style={{ animation: 'headphoneHover 3s ease-in-out infinite', transformOrigin: '120px 80px' }}>
          {/* Arco do headphone */}
          <path d="M55 82 C55 42 84 22 120 22 C156 22 185 42 185 82" stroke="url(#headphoneGrad)" strokeWidth="6" strokeLinecap="round" />
          <path d="M58 82 C58 45 86 27 120 27 C154 27 182 45 182 82" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
          
          {/* Almofadas auriculares do fone */}
          <rect x="46" y="70" width="16" height="30" rx="8" fill="#1e1b4b" stroke="#7c3aed" strokeWidth="2" />
          <rect x="178" y="70" width="16" height="30" rx="8" fill="#1e1b4b" stroke="#ec4899" strokeWidth="2" />
        </g>

        {/* Notas Musicais Flutuantes com balanço rítmico */}
        <g style={{ animation: 'floatMusicNote 2.4s ease-out infinite' }}>
          <text x="32" y="65" fontSize="22" fill="#a855f7" fontFamily="system-ui">♪</text>
        </g>
        <g style={{ animation: 'floatMusicNoteR 2.6s ease-out infinite 0.6s' }}>
          <text x="195" y="70" fontSize="24" fill="#ec4899" fontFamily="system-ui">♫</text>
        </g>
        <g style={{ animation: 'floatMusicNote 2.8s ease-out infinite 1.2s' }}>
          <text x="45" y="130" fontSize="20" fill="#3b82f6" fontFamily="system-ui">♬</text>
        </g>
        <g style={{ animation: 'floatMusicNoteR 3.0s ease-out infinite 1.5s' }}>
          <text x="185" y="130" fontSize="20" fill="#f59e0b" fontFamily="system-ui">♩</text>
        </g>
      </svg>

      {/* Equalizador de Barras de Frequência Rítmicas */}
      <div style={styles.equalizerWrapper}>
        <div style={{ ...styles.eqBar, background: '#8b5cf6', animation: 'eqBounce1 0.8s ease-in-out infinite' }} />
        <div style={{ ...styles.eqBar, background: '#a855f7', animation: 'eqBounce3 0.65s ease-in-out infinite 0.15s' }} />
        <div style={{ ...styles.eqBar, background: '#c084fc', animation: 'eqBounce2 0.75s ease-in-out infinite 0.3s' }} />
        <div style={{ ...styles.eqBar, background: '#ec4899', animation: 'eqBounce4 0.6s ease-in-out infinite 0.1s' }} />
        <div style={{ ...styles.eqBar, background: '#f472b6', animation: 'eqBounce1 0.9s ease-in-out infinite 0.25s' }} />
        <div style={{ ...styles.eqBar, background: '#38bdf8', animation: 'eqBounce3 0.7s ease-in-out infinite 0.4s' }} />
        <div style={{ ...styles.eqBar, background: '#818cf8', animation: 'eqBounce5 0.85s ease-in-out infinite 0.2s' }} />
        <div style={{ ...styles.eqBar, background: '#a855f7', animation: 'eqBounce2 0.7s ease-in-out infinite 0.35s' }} />
        <div style={{ ...styles.eqBar, background: '#ec4899', animation: 'eqBounce4 0.6s ease-in-out infinite 0.05s' }} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '260px',
    height: '210px',
    margin: '0 auto 12px auto',
    overflow: 'visible',
  },
  equalizerWrapper: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: '5px',
    height: '46px',
    marginTop: '-8px',
    zIndex: 2,
  },
  eqBar: {
    width: '5px',
    borderRadius: '4px',
    minHeight: '8px',
  },
};
