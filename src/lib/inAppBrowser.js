// Detecta navegador EMBUTIDO de app (WhatsApp, Instagram, Facebook, Messenger, TikTok...).
//
// Por que isso importa aqui (relato de clientes, 20/09/2026: "não consigo baixar as músicas"): o
// link de entrega chega pelo WhatsApp, o cliente abre ali mesmo, e o navegador embutido desses apps
// bloqueia ou esconde download de arquivo — o toque em "Baixar MP3" simplesmente não faz nada
// visível, sem erro nenhum na página. O servidor está correto (Content-Disposition: attachment,
// verificado em produção); o que falta é avisar o cliente para abrir no navegador de verdade.
//
// Só roda no browser. Em SSR devolve false — o aviso aparece depois da hidratação.
const PADROES = [
  'FBAN', 'FBAV', 'FB_IAB', 'FBIOS',      // Facebook / Messenger
  'Instagram',
  'WhatsApp',
  'WA4A',                                  // WhatsApp for Android WebView
  '; wv)',                                 // Android System WebView indicator
  'Line/',
  'MicroMessenger',                        // WeChat
  'TikTok', 'BytedanceWebview',
  'Twitter',
  'Snapchat',
];

export function isInAppBrowser(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return false;
  return PADROES.some((p) => ua.includes(p));
}

// iOS é o caso mais grave: no Android o Chrome embutido ainda costuma salvar o arquivo, mas o
// WebView do iOS não tem gerenciador de download nenhum — nada acontece, sem exceção nem aviso.
export function isIOS(userAgent) {
  if (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /iPad|iPhone|iPod/.test(ua);
}

export function isAndroid(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /Android/i.test(ua);
}

/**
 * Monta a URI de Android Intent para abrir a URL no Google Chrome nativo externo.
 * Permite que clientes no WhatsApp/Instagram rompam a WebView e façam download sem bloqueio.
 */
export function getChromeIntentUrl(targetUrl) {
  if (typeof window === 'undefined' && !targetUrl) return '';
  const url = targetUrl || (typeof window !== 'undefined' ? window.location.href : '');
  if (!url) return '';
  const cleanHostAndPath = url.replace(/^https?:\/\//, '');
  const fullUrl = url.startsWith('http') ? url : `https://${cleanHostAndPath}`;
  return `intent://${cleanHostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fullUrl)};end;`;
}

