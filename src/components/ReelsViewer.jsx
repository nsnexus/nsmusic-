'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Visualizador de Fotos no estilo Reels / Instagram Stories
 *
 * Características:
 * - Tela cheia imersiva com backdrop escuro e desfoque suave
 * - Fundo ambiente desfocado com a própria foto (evita bordas pretas secas em fotos horizontais/quadradas)
 * - Barrinhas de progresso no topo para cada foto com avanço automático configurável
 * - Suporte a toque (swipe para navegar ou arrastar para baixo para fechar)
 * - Toque/clique na esquerda para voltar e na direita para avançar
 * - Pausa automática ao segurar a tela (como no Instagram)
 * - Setas visíveis para computador e suporte ao teclado (setas e Esc)
 */
export default function ReelsViewer({
  fotos = [],
  indiceInicial = 0,
  onClose,
  titulo = 'Nossas Fotos',
}) {
  const [indice, setIndice] = useState(() => Math.max(0, Math.min(indiceInicial, fotos.length - 1)));
  const [pausado, setPausado] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const total = fotos.length;
  const DURACAO_MS = 5000; // 5 segundos por foto

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Funções de navegação
  const avancar = useCallback(() => {
    setIndice((atual) => (atual < total - 1 ? atual + 1 : atual));
    setProgresso(0);
  }, [total]);

  const voltar = useCallback(() => {
    setIndice((atual) => (atual > 0 ? atual - 1 : 0));
    setProgresso(0);
  }, []);

  const reiniciar = () => {
    setIndice(0);
    setProgresso(0);
  };

  // Timer com barra de progresso suave
  useEffect(() => {
    if (pausado || total === 0) return;

    const TICK_MS = 40;
    const incremento = (TICK_MS / DURACAO_MS) * 100;

    const timer = setInterval(() => {
      setProgresso((antigo) => {
        if (antigo + incremento >= 100) {
          if (indice < total - 1) {
            setIndice((i) => i + 1);
            return 0;
          } else {
            // Chegou ao final do álbum
            return 100;
          }
        }
        return antigo + incremento;
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [indice, pausado, total]);

  // Teclado (←, →, Espaço, Esc)
  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        avancar();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        voltar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [avancar, voltar]);

  // Gestos de toque (swipe)
  const handleTouchStart = (e) => {
    setPausado(true);
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e) => {
    setPausado(false);
    const t = e.changedTouches[0];
    const diffX = t.clientX - touchStartRef.current.x;
    const diffY = t.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    // Arrastar para baixo fecha (gesto comum em Reels/Stories)
    if (diffY > 90 && Math.abs(diffY) > Math.abs(diffX) * 1.4) {
      onClose?.();
      return;
    }

    // Swipe horizontal
    if (Math.abs(diffX) > 40) {
      if (diffX < 0) {
        avancar();
      } else {
        voltar();
      }
      return;
    }

    // Clique rápido: lado esquerdo volta, lado direito avança
    if (elapsed < 320 && Math.abs(diffX) < 15 && Math.abs(diffY) < 15) {
      const largura = window.innerWidth;
      if (t.clientX < largura * 0.35) {
        voltar();
      } else {
        avancar();
      }
    }
  };

  // Clique com mouse (desktop) nas laterais
  const handleClickFundo = (e) => {
    // Se o clique foi no botão de fechar ou controles, não faz nada
    if (e.target.closest('button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.35) {
      voltar();
    } else {
      avancar();
    }
  };

  if (total === 0) return null;

  const fotoAtual = fotos[indice];
  const ehUltima = indice === total - 1 && progresso >= 98;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de fotos em modo Reels"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(10, 4, 18, 0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={() => setPausado(true)}
      onMouseUp={() => setPausado(false)}
      onClick={handleClickFundo}
    >
      {/* Topo: Barrinhas de progresso estilo Instagram Stories */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '14px 16px 8px',
          zIndex: 20,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
        }}
      >
        <div style={{ display: 'flex', gap: '4px', maxWidth: '500px', margin: '0 auto 12px' }}>
          {fotos.map((_, i) => {
            let pct = 0;
            if (i < indice) pct = 100;
            else if (i === indice) pct = progresso;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: '3px',
                  borderRadius: '3px',
                  background: 'rgba(255,255,255,0.28)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #ec4899, #f472b6)',
                    width: `${pct}%`,
                    transition: i === indice ? 'width 40ms linear' : 'none',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Cabeçalho do Reels: Título, Contador e Botão Fechar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: '500px',
            margin: '0 auto',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.95rem',
                boxShadow: '0 0 12px rgba(236,72,153,0.6)',
              }}
            >
              📸
            </span>
            <div>
              <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: '700', color: '#fff', letterSpacing: '0.02em' }}>
                {titulo}
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>
                Foto {indice + 1} de {total}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPausado((p) => !p);
              }}
              aria-label={pausado ? 'Retomar' : 'Pausar'}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,0.14)',
                color: '#fff',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {pausado ? '▶' : '⏸'}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              aria-label="Fechar"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,0.18)',
                color: '#fff',
                fontSize: '1.05rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Cartão Central (formato 9:16 / Reels com fundo blur) */}
      <div
        style={{
          position: 'relative',
          width: '92vw',
          maxWidth: '440px',
          height: '75vh',
          maxHeight: '680px',
          borderRadius: '24px',
          overflow: 'hidden',
          background: '#160822',
          boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 35px rgba(236,72,153,0.35)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Fundo dinâmico desfocado com a própria imagem (efeito Stories/Reels) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotoAtual}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '-20px',
            width: 'calc(100% + 40px)',
            height: 'calc(100% + 40px)',
            objectFit: 'cover',
            filter: 'blur(32px) brightness(0.4)',
            opacity: 0.8,
            pointerEvents: 'none',
          }}
        />

        {/* Foto em destaque centralizada (preserva 100% da proporção sem cortes) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={fotoAtual}
          src={fotoAtual}
          alt={`Foto ${indice + 1}`}
          style={{
            position: 'relative',
            zIndex: 2,
            maxWidth: '92%',
            maxHeight: '84%',
            objectFit: 'contain',
            borderRadius: '14px',
            boxShadow: '0 12px 34px rgba(0,0,0,0.65)',
            display: 'block',
          }}
        />

        {/* Legenda Romântica no rodapé do cartão */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 5,
            padding: '24px 20px 16px',
            background: 'linear-gradient(0deg, rgba(16,6,28,0.92) 0%, rgba(16,6,28,0.65) 55%, transparent 100%)',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontFamily: "'Grand Hotel', cursive",
              fontSize: '1.7rem',
              color: '#fff',
              margin: 0,
              textShadow: '0 2px 14px rgba(236,72,153,0.85)',
            }}
          >
            nós dois <span style={{ color: '#f472b6' }}>♥</span>
          </p>

          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em' }}>
            Toque nos lados ou arraste para passar
          </p>
        </div>

        {/* Overlay caso tenha chegado à última foto */}
        {ehUltima && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              background: 'rgba(20, 8, 34, 0.88)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '3rem', marginBottom: '10px' }}>💖</span>
            <h3 style={{ color: '#fff', fontSize: '1.4rem', margin: '0 0 6px', fontWeight: '800' }}>
              Momentos Inesquecíveis!
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.88rem', margin: '0 0 22px', maxWidth: '260px' }}>
              Cada detalhe guardado com muito amor.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  reiniciar();
                }}
                style={{
                  padding: '11px 22px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  background: 'linear-gradient(90deg, #7c3aed, #ec4899)',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '0.9rem',
                  boxShadow: '0 4px 16px rgba(236,72,153,0.5)',
                }}
              >
                ↺ Rever Fotos
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.();
                }}
                style={{
                  padding: '11px 20px',
                  borderRadius: '999px',
                  border: '1px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                }}
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Setas de navegação para Desktop (flutuantes à esquerda e direita) */}
      {indice > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            voltar();
          }}
          aria-label="Foto anterior"
          style={{
            position: 'absolute',
            left: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 25,
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            fontSize: '1.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            transition: 'background 0.2s',
          }}
        >
          ‹
        </button>
      )}

      {indice < total - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            avancar();
          }}
          aria-label="Próxima foto"
          style={{
            position: 'absolute',
            right: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 25,
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            fontSize: '1.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            transition: 'background 0.2s',
          }}
        >
          ›
        </button>
      )}

      {/* Indicador sutil de pausa quando o usuário segura a tela */}
      {pausado && (
        <div
          style={{
            position: 'absolute',
            bottom: '18px',
            zIndex: 30,
            background: 'rgba(0,0,0,0.6)',
            padding: '6px 14px',
            borderRadius: '999px',
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: '600',
            letterSpacing: '0.04em',
            pointerEvents: 'none',
          }}
        >
          ⏸ Pausado
        </div>
      )}
    </div>
  );
}
