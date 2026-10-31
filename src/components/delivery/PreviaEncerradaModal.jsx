'use client';

import React, { useEffect } from 'react';
import { Sparkles, Music, ArrowRight, X, CheckCircle2, Zap, Download, Gift } from 'lucide-react';

export default function PreviaEncerradaModal({
  isOpen,
  onClose,
  onGoToPix,
  honoreeName
}) {
  // Fecha ao pressionar ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const nomeFormatado = (honoreeName || '').trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="previa-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.25s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          padding: '28px 22px 22px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          textAlign: 'center',
          position: 'relative',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Glow decorativo de topo */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '130px',
            background: 'radial-gradient(ellipse at top, rgba(236, 72, 153, 0.18), rgba(139, 92, 246, 0.12), transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Botão Fechar X */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: '#f1f5f9',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
            transition: 'background-color 0.2s',
            zIndex: 2,
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>

        {/* Ícone Estilizado Central */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #f43f5e 0%, #a855f7 50%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 10px 22px -4px rgba(168, 85, 247, 0.45)',
            position: 'relative',
          }}
        >
          <Music size={30} color="#ffffff" aria-hidden="true" />
        </div>

        {/* Badge Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 12px',
            borderRadius: '999px',
            backgroundColor: '#fdf2f8',
            color: '#db2777',
            border: '1px solid #fbcfe8',
            fontSize: '0.72rem',
            fontWeight: '800',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '10px',
          }}
        >
          <Sparkles size={12} aria-hidden="true" />
          Prévia Concluída
        </div>

        {/* Título Principal */}
        <h3
          id="previa-modal-title"
          style={{
            fontSize: '1.24rem',
            fontWeight: '900',
            color: '#0f172a',
            lineHeight: 1.25,
            margin: '0 0 8px',
          }}
        >
          {nomeFormatado ? `Gostou da música de ${nomeFormatado}?` : 'Gostou da sua música personalizada?'}
        </h3>

        {/* Subtítulo persuasivo */}
        <p
          style={{
            fontSize: '0.86rem',
            color: '#64748b',
            lineHeight: 1.45,
            margin: '0 0 16px',
          }}
        >
          A prévia encerrou, mas as <strong>2 versões completas sem corte</strong> em qualidade de estúdio (MP3 HD) já estão prontas para você ouvir e baixar!
        </p>

        {/* Destaque do Bônus de Geração Grátis */}
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            borderRadius: '14px',
            padding: '11px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#ffffff',
            }}
          >
            <Gift size={20} aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#065f46', letterSpacing: '0.01em' }}>
              BÔNUS ESPECIAL INCLUSO 🎁
            </div>
            <div style={{ fontSize: '0.78rem', color: '#047857', lineHeight: 1.35, marginTop: '2px' }}>
              Ao liberar sua música agora, você ganha <strong>+1 geração grátis</strong> para criar novos arranjos de presente!
            </div>
          </div>
        </div>

        {/* Benefícios / Checklist */}
        <div
          style={{
            backgroundColor: '#faf5ff',
            borderRadius: '16px',
            padding: '12px 16px',
            border: '1.5px solid #ede9fe',
            marginBottom: '20px',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#1e293b', fontWeight: '600' }}>
            <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0 }} aria-hidden="true" />
            <span><strong>2 versões completas</strong> (todos os versos e refrão)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#1e293b', fontWeight: '600' }}>
            <Download size={16} color="#7c3aed" style={{ flexShrink: 0 }} aria-hidden="true" />
            <span>Download imediato dos arquivos em <strong>MP3 HD</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#1e293b', fontWeight: '600' }}>
            <Zap size={16} color="#059669" style={{ flexShrink: 0 }} aria-hidden="true" />
            <span>Liberação instantânea com <strong>PIX automático</strong></span>
          </div>
        </div>

        {/* Botão de Ação Principal (Sem valor numérico, direciona ao PIX) */}
        <button
          type="button"
          onClick={onGoToPix}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '15px 18px',
            borderRadius: '14px',
            border: 'none',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#ffffff',
            fontWeight: '800',
            fontSize: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 6px 20px rgba(5, 150, 105, 0.35)',
          }}
        >
          <span>Liberar música completa agora</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>

        {/* Link Secundário de Fechar */}
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '0.78rem',
            cursor: 'pointer',
            marginTop: '12px',
            fontWeight: '600',
            padding: '6px',
          }}
        >
          Continuar ouvindo a prévia
        </button>
      </div>
    </div>
  );
}
