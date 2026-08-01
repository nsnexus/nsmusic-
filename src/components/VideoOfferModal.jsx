'use client';

import React, { useState, useEffect } from 'react';

export default function VideoOfferModal({ isOpen, onClose, onSelectVideoOption, honoreeName = 'alguém especial' }) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  // Fotos de demonstração de exemplo de alto impacto visual (Unsplash HD)
  const samplePhotos = [
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=600&auto=format&fit=crop'
  ];

  // Alterna as fotos de exemplo automaticamente para simular a apresentação de vídeo
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setActivePhotoIndex((prev) => (prev + 1) % samplePhotos.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [isOpen, samplePhotos.length]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: 'rgba(2, 6, 23, 0.88)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '480px',
        overflow: 'hidden',
        borderRadius: '24px',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(236, 72, 153, 0.1)',
        color: '#fff',
        padding: '28px',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        
        {/* Luz de Fundo e Efeitos de Brilho */}
        <div style={{ position: 'absolute', top: '-96px', left: '-96px', width: '240px', height: '240px', background: 'rgba(236, 72, 153, 0.15)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-96px', right: '-96px', width: '240px', height: '240px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />

        {/* Botão Fechar */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(51, 65, 85, 0.9)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)'; e.currentTarget.style.color = '#94a3b8'; }}
        >
          ✕
        </button>

        {/* Badge de Destaque */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '20px',
          background: 'rgba(236, 72, 153, 0.1)',
          border: '1px solid rgba(236, 72, 153, 0.3)',
          color: '#f9a8d4',
          fontSize: '0.75rem',
          fontWeight: '800',
          marginBottom: '16px'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ec4899', animation: 'pulse 2s ease-in-out infinite' }} />
          ✨ OFERTA ESPECIAL EXCLUSIVA
        </div>

        {/* Título Principal */}
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '900',
          background: 'linear-gradient(to right, #f9a8d4, #e9d5ff, #ffffff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '8px',
          lineHeight: '1.3'
        }}>
          Transforme sua Música em um <span style={{ WebkitTextFillColor: '#f472b6' }}>Vídeo Inesquecível! 🎬</span>
        </h2>

        <p style={{ color: '#cbd5e1', fontSize: '0.88rem', marginBottom: '20px', lineHeight: '1.6' }}>
          Crie um clipe emocionante com <strong>10 a 20 fotos</strong> de <strong style={{ color: '#f9a8d4' }}>{honoreeName}</strong> sincronizadas com a sua nova música por apenas <strong style={{ color: '#34d399', fontSize: '1rem' }}>+ R$ 6,90!</strong>
        </p>

        {/* DEMONSTRAÇÃO EXEMPLO EM VÍDEO SLIDESHOW (ANIMAÇÃO AO VIVO) */}
        <div style={{
          position: 'relative',
          marginBottom: '20px',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          background: '#020617',
          aspectRatio: '16 / 9',
          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
        }}>
          {/* Foto de Demonstração com efeito Ken Burns / Zoom */}
          <img
            src={samplePhotos[activePhotoIndex]}
            alt="Exemplo de Vídeo Homenagem"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'all 1s ease',
              transform: 'scale(1.05)'
            }}
          />

          {/* Sombra e Gradiente de Legibilidade */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #020617 0%, rgba(2, 6, 23, 0.2) 40%, transparent 100%)' }} />

          {/* Marcador de Exemplo de Vídeo */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.72rem',
            fontWeight: '800',
            color: '#f9a8d4',
            border: '1px solid rgba(236, 72, 153, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>🎥</span> Veja como fica o seu Vídeo
          </div>

          {/* Título do Exemplo */}
          <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px', textAlign: 'center' }}>
            <p style={{ color: '#fff', fontSize: '0.88rem', fontWeight: '700' }}>
              Homenagem para {honoreeName} ❤️
            </p>
            <p style={{ color: '#f472b6', fontSize: '0.72rem', fontWeight: '600' }}>
              🎵 Música + 10 a 20 Fotos Sincronizadas
            </p>
          </div>

          {/* Ícone de Play decorativo */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(236, 72, 153, 0.8)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(236, 72, 153, 0.4)',
              animation: 'pulse 2s ease-in-out infinite',
              fontSize: '1.1rem'
            }}>
              ▶
            </div>
          </div>
        </div>

        {/* Benefícios em lista */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', fontSize: '0.85rem', color: '#cbd5e1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#34d399', fontWeight: '800' }}>✓</span>
            <span>Fotos animadas com efeito de transição em HD (1080p)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#34d399', fontWeight: '800' }}>✓</span>
            <span>Página exclusiva para enviar no WhatsApp do homenageado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#34d399', fontWeight: '800' }}>✓</span>
            <span>Download liberado do vídeo em formato .mp4</span>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => onSelectVideoOption(true)}
            style={{
              width: '100%',
              padding: '16px 24px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
              color: '#fff',
              fontWeight: '900',
              fontSize: '1rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 10px 25px rgba(236, 72, 153, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              transform: 'scale(1)'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(236, 72, 153, 0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(236, 72, 153, 0.3)'; }}
          >
            <span>✨ Sim! Adicionar Vídeo por + R$ 6,90</span>
          </button>

          <button
            onClick={() => onSelectVideoOption(false)}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              textAlign: 'center'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
          >
            Não, quero apenas ouvir as prévias em áudio
          </button>
        </div>

      </div>

      {/* CSS keyframes para animações */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
