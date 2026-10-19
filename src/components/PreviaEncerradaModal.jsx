'use client';

import { useEffect } from 'react';

// Pop-up que aparece no segundo em que a prévia de 60s termina.
//
// Motivo (21/09/2026): a prévia parava no meio e o único sinal disso era uma linha de texto
// pequena abaixo do player. Muita gente achava que a música tinha falhado, não que faltava pagar.
// O corte é justamente o momento de maior interesse — é onde a oferta tem que aparecer.
//
// Não cobra nada e não decide nada: só chama `onPagar`, que a página dona do fluxo implementa
// (rolar até o bloco do PIX em /entrega, avançar para o passo de pagamento em /criar).
export default function PreviaEncerradaModal({
  isOpen,
  onClose,
  onPagar,
  honoreeName = '',
  precoTexto = '',
  ctaLabel = 'Liberar a música completa',
}) {
  // Esc fecha, e a página atrás não rola enquanto o pop-up está aberto (senão o dedo no celular
  // arrasta o fundo em vez do card).
  useEffect(() => {
    if (!isOpen) return;
    const aoTeclar = (e) => { if (e.key === 'Escape') onClose?.(); };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const nome = honoreeName?.trim();

  const beneficios = [
    ['🎵', <>As <strong>2 versões completas</strong>, do começo ao fim</>],
    ['⬇️', <>Download em <strong>MP3 HD</strong>, para sempre</>],
    ['🎁', <>Página de presente para <strong>enviar no WhatsApp</strong></>],
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 8, 24, 0.78)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1200,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="A prévia terminou"
    >
      <div
        className="animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '400px',
          maxHeight: '92vh',
          borderRadius: '22px',
          padding: '26px 22px 22px',
          textAlign: 'center',
          color: '#fff',
          background: 'linear-gradient(160deg, #1b1233 0%, #2a1247 55%, #3d1236 100%)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        {/* Brilho de fundo, só decorativo. */}
        <div aria-hidden="true" style={{ position: 'absolute', top: '-70px', left: '50%', transform: 'translateX(-50%)', width: '260px', height: '160px', background: 'radial-gradient(circle, rgba(236,72,153,0.45) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{ position: 'absolute', top: '10px', right: '12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: '1.3rem', lineHeight: 1, cursor: 'pointer', padding: '4px 6px' }}
        >
          ×
        </button>

        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '2rem', marginBottom: '6px' }}>🔒</div>

          {/* `color` explícito: a regra global de h1..h6 em globals.css usa var(--text-primary),
              que é escuro — sem isto o título some no fundo escuro deste card. */}
          <h3 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.45rem', fontWeight: '800', margin: '0 0 8px', lineHeight: 1.25, color: '#fff' }}>
            A música não acaba aqui
          </h3>

          <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.78)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Você ouviu os primeiros <strong style={{ color: '#fff' }}>60 segundos</strong>
            {nome ? <> da homenagem para <strong style={{ color: '#fff' }}>{nome}</strong></> : null}.
            O resto já está gravado, esperando você.
          </p>

          {/* Barra: o trecho ouvido contra a música inteira. Mostra em um olhar o que falta. */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
              <div style={{ width: '32%', height: '100%', borderRadius: '999px', background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', fontWeight: '600' }}>
              <span>0:60 — prévia</span>
              <span>música completa 🔒</span>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: '9px', textAlign: 'left' }}>
            {beneficios.map(([icone, texto], i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.86rem', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '9px 12px' }}>
                <span aria-hidden="true" style={{ fontSize: '1rem' }}>{icone}</span>
                <span>{texto}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onPagar}
            style={{
              width: '100%',
              padding: '15px 16px',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 10px 26px rgba(16, 185, 129, 0.35)',
            }}
          >
            {ctaLabel}{precoTexto ? ` — ${precoTexto}` : ''}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{ marginTop: '10px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline', padding: '6px' }}
          >
            Ouvir a prévia de novo
          </button>

          <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', margin: '10px 0 0' }}>
            Pagamento por Pix · liberação na hora
          </p>
        </div>
      </div>
    </div>
  );
}
