'use client';

import React, { useState } from 'react';

export default function IosInAppDownloadModal({ isOpen, onClose, downloadUrl, filename }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const url = downloadUrl || (typeof window !== 'undefined' ? window.location.href : '');
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch (err) {}
      document.body.removeChild(textArea);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          backgroundColor: '#170b29',
          border: '1.5px solid #a855f7',
          borderRadius: '20px',
          padding: '24px 20px',
          maxWidth: '440px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>📱</div>

        <h3 style={{ margin: '0 0 10px', fontSize: '1.15rem', color: '#f3e8ff', fontWeight: 800 }}>
          Como salvar sua música no iPhone
        </h3>

        <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5, textAlign: 'left' }}>
          O navegador do WhatsApp no iPhone bloqueia downloads automáticos para a memória do aparelho.
        </p>

        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: '14px',
            padding: '14px 16px',
            marginBottom: '18px',
            textAlign: 'left',
            fontSize: '0.84rem',
            lineHeight: 1.6,
            color: '#e2e8f0',
          }}
        >
          <div>
            <strong>1.</strong> Toque no ícone do <strong>Safari (🧭)</strong> ou no botão de <strong>Compartilhar</strong> no rodapé da tela do WhatsApp.
          </div>
          <div style={{ marginTop: '8px' }}>
            <strong>2.</strong> Escolha <strong>&quot;Abrir no Safari&quot;</strong>.
          </div>
          <div style={{ marginTop: '8px' }}>
            <strong>3.</strong> No Safari, o download funciona direto e o MP3 é salvo no seu aplicativo <strong>Arquivos</strong>!
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              width: '100%',
              minHeight: '46px',
              backgroundColor: '#9333ea',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxSizing: 'border-box',
            }}
          >
            {copied ? '✅ Link copiado! Cole no Safari' : '🔗 Copiar Link da Música para o Safari'}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              minHeight: '40px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#cbd5e1',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            Entendi, vou abrir no Safari
          </button>
        </div>
      </div>
    </div>
  );
}

