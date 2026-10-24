'use client';

import { useState, useEffect } from 'react';
import { isInAppBrowser, isIOS } from '@/lib/inAppBrowser';

export default function InAppBrowserBanner() {
  const [inApp, setInApp] = useState(false);
  const [ios, setIos] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [chromeIntentUrl, setChromeIntentUrl] = useState('');

  useEffect(() => {
    const isApp = isInAppBrowser();
    setInApp(isApp);
    const isApple = isIOS();
    setIos(isApple);

    if (typeof window !== 'undefined' && !isApple) {
      const cleanHost = window.location.host;
      const cleanPath = window.location.pathname;
      const cleanSearch = window.location.search;
      setChromeIntentUrl(`intent://${cleanHost}${cleanPath}${cleanSearch}#Intent;scheme=https;package=com.android.chrome;end;`);
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
      // Fallback para aparelhos que barram navigator.clipboard em webviews
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
      style={{
        backgroundColor: '#1e142e',
        borderBottom: '1px solid #7c3aed',
        color: '#f3e8ff',
        padding: '12px 16px',
        position: 'relative',
        zIndex: 9998,
        fontSize: '0.86rem',
        lineHeight: 1.45,
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#fbcfe8', fontSize: '0.92rem' }}>
            <span>⚠️</span>
            <span>Dica importante para baixar sua música e vídeo</span>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Fechar aviso"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#d8b4fe',
              fontSize: '1.2rem',
              lineHeight: 1,
              cursor: 'pointer',
              padding: '2px 6px',
            }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: 0, color: '#e9d5ff' }}>
          Você está navegando dentro do aplicativo (WhatsApp / Instagram). Esse navegador costuma bloquear o download de arquivos no celular.
          Para baixar seus MP3s e vídeos sem travar: toque nos <strong>três pontinhos ({ios ? '⋯' : '⋮'})</strong> no topo e escolha <strong>&quot;Abrir no {ios ? 'Safari' : 'Chrome / Navegador'}&quot;</strong>.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          {!ios && chromeIntentUrl && (
            <a
              href={chromeIntentUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                backgroundColor: '#9333ea',
                color: '#ffffff',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.82rem',
              }}
            >
              🌐 Abrir direto no Chrome
            </a>
          )}
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#ffffff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
            }}
          >
            {copied ? '✅ Link copiado! Cole no navegador' : '🔗 Copiar link para o navegador'}
          </button>
        </div>
      </div>
    </aside>
  );
}
