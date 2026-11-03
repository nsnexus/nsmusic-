'use client';

import React, { useState } from 'react';
import { MessageCircle, ExternalLink, Copy, Check, X, ShieldAlert } from 'lucide-react';

export default function DownloadHelpModal({
  isOpen,
  onClose,
  platform = 'ios',
  orderId,
  honoreeName,
  onSendWhatsApp,
  isSendingWhatsApp,
  sendSuccess,
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isApple = platform === 'ios';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = window.location.href;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch (_) {}
      document.body.removeChild(ta);
    }
  };

  const chromeIntentUrl = typeof window !== 'undefined' && !isApple
    ? `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end;`
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-help-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          maxWidth: '520px',
          width: '100%',
          padding: '24px 22px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Botão Fechar */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <X size={18} />
        </button>

        {/* Cabeçalho */}
        <div style={{ textAlign: 'left', paddingRight: '30px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#b45309', background: '#fef3c7', padding: '4px 10px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 700, marginBottom: '8px' }}>
            <ShieldAlert size={14} />
            <span>Navegador do WhatsApp detectado</span>
          </div>
          <h2 id="download-help-title" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px', lineHeight: 1.3 }}>
            Como salvar sua música no celular
          </h2>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.45 }}>
            O WhatsApp abre os links em um navegador interno que restringe downloads diretos para a memória do aparelho. Escolha a melhor opção abaixo:
          </p>
        </div>

        {/* Opção 1: Receber no WhatsApp (Mais fácil e garantido) */}
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageCircle size={18} />
            </div>
            <div>
              <strong style={{ fontSize: '0.94rem', color: '#065f46', display: 'block' }}>
                Opção 1: Receber arquivo no WhatsApp (Recomendado)
              </strong>
              <span style={{ fontSize: '0.76rem', color: '#047857' }}>
                Chega na hora direto na sua conversa. É só dar o play ou encaminhar!
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isSendingWhatsApp || sendSuccess}
            onClick={onSendWhatsApp}
            style={{
              width: '100%',
              padding: '13px 18px',
              borderRadius: '12px',
              border: 'none',
              background: sendSuccess ? '#047857' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.92rem',
              cursor: (isSendingWhatsApp || sendSuccess) ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            {sendSuccess ? (
              <>
                <Check size={18} />
                <span>Enviado! Verifique seu WhatsApp ✅</span>
              </>
            ) : isSendingWhatsApp ? (
              <span>Enviando para seu WhatsApp... ⏳</span>
            ) : (
              <>
                <MessageCircle size={18} />
                <span>Enviar para meu WhatsApp agora 📲</span>
              </>
            )}
          </button>
        </div>

        {/* Opção 2: Abrir no Navegador Real (Safari ou Chrome) */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#6366f1', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ExternalLink size={18} />
            </div>
            <div>
              <strong style={{ fontSize: '0.94rem', color: '#1e293b', display: 'block' }}>
                Opção 2: Abrir no {isApple ? 'Safari (iPhone)' : 'Google Chrome (Android)'}
              </strong>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                No navegador nativo, o download é salvo automaticamente nos seus arquivos.
              </span>
            </div>
          </div>

          <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, background: '#ffffff', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            {isApple ? (
              <>
                👉 No <strong>rodapé da tela</strong> do WhatsApp, procure o ícone de <strong>Bússola / Safari (🧭)</strong> ou <strong>Compartilhar (⎙)</strong> e toque em <strong>&quot;Abrir no Safari&quot;</strong>.
              </>
            ) : (
              <>
                👉 Toque nos <strong>três pontinhos (⋮)</strong> no topo superior direito e escolha <strong>&quot;Abrir no Chrome&quot;</strong>.
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!isApple && chromeIntentUrl && (
              <a
                href={chromeIntentUrl}
                style={{
                  flex: 1,
                  minWidth: '160px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>🌐 Abrir direto no Chrome</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleCopy}
              style={{
                flex: 1,
                minWidth: '160px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {copied ? (
                <>
                  <Check size={16} color="#059669" />
                  <span>Link copiado! Cole no {isApple ? 'Safari' : 'Chrome'}</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copiar link desta página</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

