'use client';

import { useState, useEffect } from 'react';
import { isInAppBrowser, isIOS, isAndroid, getChromeIntentUrl } from '@/lib/inAppBrowser';

export default function InAppBrowserBanner() {
  const [inApp, setInApp] = useState(false);
  const [ios, setIos] = useState(false);
  const [android, setAndroid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [chromeIntentUrl, setChromeIntentUrl] = useState('');

  useEffect(() => {
    const isApp = isInAppBrowser();
    setInApp(isApp);
    const isApple = isIOS();
    setIos(isApple);
    const isDroid = isAndroid();
    setAndroid(isDroid);

    if (typeof window !== 'undefined' && !isApple) {
      setChromeIntentUrl(getChromeIntentUrl(window.location.href));
    }
  }, []);

  if (!inApp || dismissed) return null;

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback para webviews que bloqueiam clipboard moderno
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
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
    <aside
      role="alert"
      aria-live="polite"
      style={{
        backgroundColor: '#160b28',
        borderBottom: '2px solid #a855f7',
        color: '#f8fafc',
        padding: '14px 16px',
        position: 'relative',
        zIndex: 9999,
        fontSize: '0.88rem',
        lineHeight: 1.5,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div
        style={{
          maxWidth: '680px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                border: '1px solid rgba(245, 158, 11, 0.4)',
              }}
            >
              ⚠️ {ios ? 'IPHONE / WHATSAPP' : 'WHATSAPP DETECTADO'}
            </span>
            <span style={{ fontWeight: 700, color: '#f3e8ff', fontSize: '0.92rem' }}>
              Para baixar sem erro no celular:
            </span>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Fechar aviso"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#d8b4fe',
              fontSize: '1.2rem',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.85rem' }}>
          {ios ? (
            <>
              O navegador interno do WhatsApp no iPhone bloqueia o download direto de MP3. Para salvar na sua pasta <strong>Arquivos</strong>, toque no ícone do <strong>Safari (🧭)</strong> ou no botão <strong>Compartilhar</strong> no rodapé da tela e escolha <strong>&quot;Abrir no Safari&quot;</strong>.
            </>
          ) : (
            <>
              O navegador interno do WhatsApp bloqueia downloads de arquivos. Toque no botão verde abaixo para <strong>abrir no Google Chrome</strong> e salvar seus MP3s direto na pasta Downloads:
            </>
          )}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          {!ios && chromeIntentUrl && (
            <a
              href={chromeIntentUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                minHeight: '48px',
                backgroundColor: '#10b981',
                color: '#064e3b',
                borderRadius: '12px',
                textDecoration: 'none',
                fontWeight: 800,
                fontSize: '0.92rem',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                padding: '10px 16px',
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            >
              🌐 Abrir no Google Chrome para Baixar
            </a>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              minHeight: '40px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
              boxSizing: 'border-box',
            }}
          >
            {copied ? '✅ Link copiado! Cole no navegador' : (ios ? '🔗 Copiar link para colar no Safari' : '🔗 Copiar link para o navegador')}
          </button>
        </div>
      </div>
    </aside>
  );
}
