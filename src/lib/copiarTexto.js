// Copia texto para a área de transferência de um jeito que funcione também no navegador interno
// do WhatsApp/Instagram (WebView), onde navigator.clipboard costuma falhar.
//
// Por que existe (24/11/2026): clientes relatavam "não consigo copiar o código do PIX". Os botões
// chamavam navigator.clipboard.writeText sem esperar a Promise e já mostravam "Copiado!". No WebView
// a Promise rejeita em silêncio: o cliente via "Copiado", colava no banco e não vinha nada.
//
// Ordem: 1) execCommand('copy') síncrono, ainda dentro do toque do usuário (é o que funciona nos
// WebViews); 2) navigator.clipboard, com await de verdade. Devolve true só se copiou mesmo.

function copiarPorSelecao(texto) {
  if (typeof document === 'undefined' || !document.body) return false;
  let area = null;
  try {
    area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    // fixed + opacity 0: não rola a página; font-size 16px evita zoom no iOS.
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
    document.body.appendChild(area);
    area.focus();
    area.select();
    try { area.setSelectionRange(0, texto.length); } catch (_) {}
    return document.execCommand('copy') === true;
  } catch (_) {
    return false;
  } finally {
    try { if (area) document.body.removeChild(area); } catch (_) {}
  }
}

export async function copiarTexto(texto) {
  if (!texto) return false;
  if (copiarPorSelecao(texto)) return true;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (_) {}
  return false;
}

// Quando nada funcionou: deixa o código selecionado na caixa visível, para o cliente só tocar em
// "Copiar" no menu do celular.
export function selecionarCampo(el) {
  try {
    if (!el) return;
    el.focus?.();
    el.select?.();
    el.setSelectionRange?.(0, String(el.value || '').length);
  } catch (_) {}
}
