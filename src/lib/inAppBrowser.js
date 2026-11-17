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
  'Telegram',                              // Telegram In-App Browser
  '; wv)',                                 // Android System WebView indicator
  'Line/',
  'MicroMessenger',                        // WeChat
  'TikTok', 'BytedanceWebview',
  'Twitter',
  'Snapchat',
];

// Aba aberta POR um app no Android (Chrome Custom Tab — a barra de cima mostra "WhatsApp").
//
// Achado 16/11/2026: é assim que o WhatsApp abre o link de entrega no Android, e o User-Agent é
// idêntico ao do Chrome normal, então a lista acima não pega. O único sinal é o `document.referrer`,
// que vem como "android-app://com.whatsapp/". Nessa aba o envio de fotos e o download falham; o
// cliente que tocou em ⋮ → "Abrir no Chrome" conseguiu fazer tudo.
//
// O referrer só existe na primeira página aberta, então o resultado é guardado na sessão.
const CHAVE_SESSAO = 'ns_aberto_por_app';

export function appQueAbriuAPagina(referrer) {
  const ref = referrer !== undefined ? referrer : (typeof document !== 'undefined' ? document.referrer : '');
  const m = String(ref || '').match(/^android-app:\/\/([a-zA-Z0-9._]+)/);
  if (!m) return '';
  const pacote = m[1].toLowerCase();
  // Aberto pelo próprio navegador ou pela busca do Google não é "dentro de um app".
  if (/chrome|browser|firefox|opera|edge|googlequicksearchbox|brave|duckduckgo/.test(pacote)) return '';
  return pacote;
}

export function isAbaAbertaPorApp(referrer) {
  if (appQueAbriuAPagina(referrer)) {
    try { sessionStorage.setItem(CHAVE_SESSAO, '1'); } catch (e) { /* sessão indisponível: segue só com o referrer */ }
    return true;
  }
  if (referrer !== undefined) return false;
  try { return sessionStorage.getItem(CHAVE_SESSAO) === '1'; } catch (e) { return false; }
}

export function isInAppBrowser(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (ua && PADROES.some((p) => ua.includes(p))) return true;
  // Só consulta o referrer quando está olhando o navegador atual (sem UA passado por parâmetro).
  if (!userAgent && typeof document !== 'undefined') return isAbaAbertaPorApp();
  return false;
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

