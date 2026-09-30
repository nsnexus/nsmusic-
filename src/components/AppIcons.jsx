import React from 'react';

// Ícones desenhados em SVG para os pontos da tela onde o emoji quebrava o visual.
//
// Emoji é renderizado pela fonte do sistema: o mesmo caractere sai colorido e arredondado no
// iPhone, chapado no Android e em preto e branco em parte dos Windows. Numa lista de preços, onde
// os quatro ícones aparecem lado a lado, essa variação faz o bloco parecer desalinhado em alguns
// aparelhos e some com a cor que separa um pacote do outro.
//
// Cada ícone herda o tamanho por `size` e a cor por `color`, então quem chama controla os dois sem
// precisar mexer aqui.

/** Nota musical dupla — pacote "só a música". */
export function IconeMusica({ size = 20, color = '#16a34a' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18V5l11-2v13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.6" fill={color} />
      <circle cx="17.5" cy="16" r="2.6" fill={color} />
    </svg>
  );
}

/** Folha escrita — pacote com Carta Virtual. */
export function IconeCarta({ size = 20, color = '#ec4899' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 3v5h4" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M8.5 12.5h7M8.5 16h4.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Play dentro de moldura — pacote com Vídeo Homenagem. */
export function IconeVideo({ size = 20, color = '#8b5cf6' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="3.5" stroke={color} strokeWidth="2" />
      <path d="M10.5 9.2l4.8 2.8-4.8 2.8V9.2z" fill={color} />
    </svg>
  );
}

/** Rolo de filme — pacote com Retrospectiva. */
export function IconeRetrospectiva({ size = 20, color = '#f59e0b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="7.2" r="1.9" fill={color} />
      <circle cx="12" cy="16.8" r="1.9" fill={color} />
      <circle cx="7.2" cy="12" r="1.9" fill={color} />
      <circle cx="16.8" cy="12" r="1.9" fill={color} />
    </svg>
  );
}

/** Logo do WhatsApp. Usado nos cards e botões de atendimento. */
export function IconeWhatsApp({ size = 20, color = '#ffffff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.14-.14.3-.36.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.23 8.23z" />
    </svg>
  );
}

/** Celular com balão do WhatsApp — aviso de "o link chega no seu WhatsApp". */
export function IconeCelularWhatsApp({ size = 42 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="12" y="4" width="24" height="40" rx="5" fill="#0f172a" />
      <rect x="14.5" y="7.5" width="19" height="33" rx="3" fill="#f0fdf4" />
      <circle cx="24" cy="24" r="8.5" fill="#25D366" />
      <g transform="translate(17.6 17.6) scale(0.53)">
        <path
          d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.14-.14.3-.36.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"
          fill="#ffffff"
        />
      </g>
      <path d="M36 12l2.4 1.2L37.2 15l3.4-.6-1 2.6" stroke="#22c55e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

/**
 * Notas musicais soltas atrás do cabeçalho do bloco de pagamento, como no layout aprovado.
 * Puramente decorativas: ficam fora do fluxo e não recebem clique.
 */
export function NotasDecorativas() {
  const notas = [
    { c: '♪', left: '6%', top: '4%', size: '1.5rem', color: '#c4b5fd', rot: '-14deg' },
    { c: '♫', left: '20%', top: '30%', size: '1.05rem', color: '#a5b4fc', rot: '10deg' },
    { c: '♬', left: '78%', top: '6%', size: '1.35rem', color: '#93c5fd', rot: '12deg' },
    { c: '♪', left: '91%', top: '34%', size: '1.05rem', color: '#c4b5fd', rot: '-8deg' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
      {notas.map((n) => (
        <span
          key={`${n.left}-${n.top}`}
          style={{
            position: 'absolute',
            left: n.left,
            top: n.top,
            fontSize: n.size,
            color: n.color,
            transform: `rotate(${n.rot})`,
            lineHeight: 1,
          }}
        >
          {n.c}
        </span>
      ))}
    </div>
  );
}

/** Claquete de cinema — Vídeo Homenagem no pop-up de extras. */
export function IconeClaquete({ size = 20, color = '#ec4899' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="9" width="19" height="11.5" rx="2.5" stroke={color} strokeWidth="2" />
      <path d="M3.4 8.6L20 5.2l.7 3.4M7.8 8.1l-1-3.4M12.4 7.2l-1-3.4M17 6.3l-1-3.4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Livro aberto — Retrospectiva. */
export function IconeLivro({ size = 20, color = '#8b5cf6' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 6.8C10.4 5.3 8.2 4.6 5 4.6a1 1 0 0 0-1 1v11.6a1 1 0 0 0 1 1c3.2 0 5.4.7 7 2.2 1.6-1.5 3.8-2.2 7-2.2a1 1 0 0 0 1-1V5.6a1 1 0 0 0-1-1c-3.2 0-5.4.7-7 2.2z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 6.8v13.6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Envelope com coração — Carta Virtual. */
export function IconeEnvelope({ size = 20, color = '#ec4899' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke={color} strokeWidth="2" />
      <path d="M3.4 6.6l8.6 6 8.6-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
