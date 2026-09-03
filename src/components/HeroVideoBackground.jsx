'use client';

import { useEffect, useRef, useState } from 'react';

// Vídeo de fundo da hero da home (pedido do dono do estúdio, 03/09/2026).
//
// Decisões que não são óbvias:
//
// 1. UM vídeo por dispositivo, escolhido em JS. Os dois arquivos somam ~11 MB; deixar os dois no
//    HTML faria todo visitante baixar o dobro do necessário na PRIMEIRA tela do site. `<source
//    media>` resolveria em navegador moderno, mas o comportamento varia — decidir aqui é previsível.
// 2. Velocidade normal, em loop (a câmera lenta de 1/3 chegou a ser usada e foi descartada em
//    03/09/2026 — o dono do estúdio preferiu o ritmo original da animação).
// 3. autoplay só funciona com `muted` + `playsInline`. Sem os dois, o iOS bloqueia e a hero fica
//    num quadro parado — por isso são obrigatórios aqui, não opcionais.
// 4. Respeita `prefers-reduced-motion`: quem pediu menos animação no sistema não vê o vídeo.
//    Vale também para quem tem enjoo com movimento.

// 767px, não 768: o vídeo vertical (9:16) só serve pra celular. No tablet em retrato (768px+, mais
// próximo de 3:4) ele é cortado demais nas laterais e fica pobre — lá o horizontal fica melhor
// (achado do dono do estúdio, 03/09/2026).
const MOBILE_QUERY = '(max-width: 767px)';

export default function HeroVideoBackground({ posterSrc = '' }) {
  const videoRef = useRef(null);
  const [src, setSrc] = useState('');
  const [semMovimento, setSemMovimento] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const prefereMenosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefereMenosMovimento) {
      setSemMovimento(true);
      return;
    }

    const ehMobile = window.matchMedia(MOBILE_QUERY).matches;
    setSrc(ehMobile ? '/hero/hero-mobile.mp4' : '/hero/hero-desktop.mp4');
    // Sem listener de resize de propósito: trocar o arquivo no meio da navegação faria o visitante
    // baixar o segundo vídeo (mais ~5 MB) só por ter girado o celular.
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;

    // play() pode ser rejeitado (política de autoplay, aba em segundo plano). Silencioso de
    // propósito: o fundo escuro da hero continua no lugar e o texto segue legível — não é erro
    // para o cliente ver.
    el.play?.().catch(() => {});
  }, [src]);

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>
      {!semMovimento && src && (
        <video
          ref={videoRef}
          src={src}
          poster={posterSrc || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}

      {/* Escurecimento por cima do vídeo, em duas camadas.
          O vídeo já é escuro por natureza, então a camada geral é leve — escurecer demais apagava a
          arte inteira, que é justamente o motivo de ter vídeo aqui. A legibilidade do texto vem da
          segunda camada: um foco radial no centro, onde o título e os botões ficam. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(10, 6, 26, 0.45) 0%, rgba(10, 6, 26, 0.28) 40%, rgba(10, 6, 26, 0.72) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 70% 55% at 50% 45%, rgba(10, 6, 26, 0.62) 0%, rgba(10, 6, 26, 0) 70%)',
        }}
      />
    </div>
  );
}
