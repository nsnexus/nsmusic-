// Navegador embutido de app no iPhone/iPad (WhatsApp, Instagram, Facebook...): é um WebView, que
// não tem "Safari/" no User-Agent (o Safari de verdade e o Chrome/Firefox do iOS têm). Esses
// WebViews não sabem tratar uma resposta "attachment" (download) — mostram "Site indisponível".
// Para eles o servidor entrega o áudio inline, e o player nativo toca/oferece salvar.
export function isIosWebView(userAgent) {
  const ua = String(userAgent || '');
  if (!/iPhone|iPad|iPod/i.test(ua)) return false;
  if (!/AppleWebKit/i.test(ua)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false;
  return !/Safari\//i.test(ua);
}
