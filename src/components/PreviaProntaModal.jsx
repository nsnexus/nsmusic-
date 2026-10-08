'use client';

import React, { useEffect } from 'react';

export default function PreviaProntaModal({
  isOpen,
  onClose,
  onPlayPreview,
  onQueroMinhaVoz,
  honoreeName = 'Pessoa Especial',
  customerName = '',
}) {
  useEffect(() => {
    if (!isOpen) return;
    const aoTeclar = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const nome = honoreeName?.trim() || 'alguém especial';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 15, 0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1300,
        animation: 'fadeIn 0.25s ease-out',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'linear-gradient(165deg, #181d2f 0%, #0d111d 100%)',
          border: '1.5px solid rgba(124, 58, 237, 0.35)',
          borderRadius: '24px',
          padding: '28px 24px 22px 24px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(124, 58, 237, 0.25)',
          color: '#f8fafc',
          position: 'relative',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        {/* Botão Fechar */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar modal"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#94a3b8',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            transition: 'all 0.2s',
          }}
        >
          ×
        </button>

        {/* Ícone Animado de Fone de Ouvido */}
        <div style={{
          width: '68px',
          height: '68px',
          margin: '0 auto 16px auto',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          boxShadow: '0 8px 24px rgba(124, 58, 237, 0.4)',
        }}>
          🎧
        </div>

        {/* Título de Impacto Emocional */}
        <h2 style={{
          fontSize: '1.35rem',
          fontWeight: '900',
          margin: '0 0 8px 0',
          color: '#ffffff',
          lineHeight: '1.3',
          fontFamily: 'var(--font-family-title, inherit)',
        }}>
          A música para {nome} está pronta!
        </h2>

        {/* Mensagem de Fones de Ouvido */}
        <p style={{
          fontSize: '0.88rem',
          color: '#cbd5e1',
          margin: '0 0 20px 0',
          lineHeight: '1.5',
        }}>
          Preparamos <strong>2 versões exclusivas em estúdio</strong>. Recomendamos colocar <strong>fones de ouvido</strong> para sentir toda a qualidade dos arranjos e a emoção da letra.
        </p>

        {/* Bloco Dourado de Destaque: Cantar com a Própria Voz (Upsell) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.06) 100%)',
          border: '1.5px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '16px',
          padding: '14px 16px',
          marginBottom: '22px',
          textAlign: 'left',
          boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <span style={{ fontSize: '0.86rem', fontWeight: '800', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Novidade no Estúdio
            </span>
          </div>
          <p style={{
            margin: '0 0 10px 0',
            fontSize: '0.82rem',
            color: '#fef3c7',
            lineHeight: '1.45',
          }}>
            Quer que essa música seja cantada com a <strong>SUA PRÓPRIA VOZ</strong>? Agora você pode clonar o seu timbre de voz por apenas <strong>+ R$ 24,90</strong>!
          </p>
          <button
            type="button"
            onClick={() => {
              onClose?.();
              onQueroMinhaVoz?.();
            }}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#000000',
              fontWeight: '800',
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
            }}
          >
            <span>🎤</span>
            <span>Quero Cantar com Minha Voz (+ R$ 24,90)</span>
          </button>
        </div>

        {/* Botão Principal de Ouvir a Prévia Agora */}
        <button
          type="button"
          onClick={() => {
            onClose?.();
            onPlayPreview?.();
          }}
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: '14px',
            border: 'none',
            background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            color: '#ffffff',
            fontWeight: '800',
            fontSize: '0.96rem',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(124, 58, 237, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '10px',
          }}
        >
          <span>▶️</span>
          <span>Ouvir Prévia da Música Agora</span>
        </button>

        <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>
          🔒 Prévia gratuita de 60 segundos com as 2 versões completas disponíveis.
        </span>
      </div>
    </div>
  );
}
