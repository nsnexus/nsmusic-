// Página de download aberta pelos botões "Baixar versão 1/2" da mensagem de WhatsApp.
//
// Antes, o botão levava direto ao arquivo MP3 (resposta "attachment"). O navegador embutido do
// WhatsApp/Instagram e as abas abertas pelo app não sabem tratar isso: mostram "site não
// encontrado" / página em branco, e qualquer falha do áudio aparecia como JSON cru. Agora o botão
// abre uma página de verdade — player + botão de baixar + caminho alternativo — e o download só
// começa com o toque do cliente, que é o que todos os navegadores aceitam.
//
// HTML puro montado no servidor, sem depender de JavaScript para funcionar.

import { DOMINIO_CANONICO } from './siteUrl.js';

export function idDePedidoValido(id) {
  return /^[A-Za-z0-9_-]{4,80}$/.test(String(id || ''));
}

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * @param {object} p
 * @param {string} p.orderId     ID do pedido (já validado)
 * @param {number} p.faixa       0 ou 1
 * @param {number} p.totalFaixas quantas versões o pedido tem (0 = áudio ainda não disponível)
 * @param {string} p.homenageado nome para o título (opcional)
 * @param {string} p.suporte     número do WhatsApp de suporte, só dígitos (opcional)
 */
export function montarPaginaDownload({ orderId, faixa = 0, totalFaixas = 0, homenageado = '', suporte = '' }) {
  const id = encodeURIComponent(orderId);
  const entrega = `${DOMINIO_CANONICO}/entrega?orderId=${id}`;
  const linkSuporte = suporte ? `https://wa.me/${esc(suporte)}` : '';
  const titulo = homenageado ? `Música de ${esc(homenageado)}` : 'Sua música está pronta';

  const urlTocar = (i) => `/api/audio/proxy?orderId=${id}&faixa=${i}`;
  const urlBaixar = (i) => `${urlTocar(i)}&download=NS-Music-Versao-${i + 1}.mp3`;

  const indices = [];
  for (let i = 0; i < Math.min(totalFaixas, 4); i++) indices.push(i);
  // A versão do botão tocado vem primeiro.
  indices.sort((a, b) => (a === faixa ? -1 : b === faixa ? 1 : a - b));

  const cartoes = indices.map((i) => `
    <section class="cartao">
      <h2>Versão ${i + 1}</h2>
      <audio controls preload="none" src="${urlTocar(i)}"></audio>
      <a class="btn" href="${urlBaixar(i)}" download="NS-Music-Versao-${i + 1}.mp3">⬇️ Baixar versão ${i + 1}</a>
    </section>`).join('');

  const corpo = indices.length > 0
    ? `${cartoes}
    <p class="dica">Não baixou? Segure o dedo no botão e escolha <b>“Baixar link”</b>, ou toque nos <b>três pontinhos</b> do topo e em <b>“Abrir no navegador”</b>.</p>
    <a class="btn sec" id="abrir-chrome" hidden>Abrir no Chrome</a>`
    : `<section class="cartao">
      <p>Não encontramos o áudio deste pedido por aqui. Abra a página do seu pedido para ouvir e baixar:</p>
    </section>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${titulo} · NS Music</title>
<style>
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0d0a1a;color:#f4f1ff;min-height:100vh;display:flex;justify-content:center}
main{width:100%;max-width:460px;padding:28px 18px 40px}
h1{font-size:1.45rem;margin:0 0 6px;text-align:center}
.sub{text-align:center;color:#b9b0d6;margin:0 0 22px;font-size:.95rem}
.cartao{background:#1a1430;border:1px solid #33285a;border-radius:16px;padding:16px;margin-bottom:14px}
.cartao h2{font-size:1rem;margin:0 0 10px;color:#d9ceff}
.cartao p{margin:0;line-height:1.5}
audio{width:100%;margin-bottom:12px}
.btn{display:block;text-align:center;text-decoration:none;font-weight:700;font-size:1.05rem;padding:15px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff}
.btn.sec{background:#241b45;border:1px solid #4a3b85;margin-bottom:10px}
.dica{font-size:.88rem;color:#b9b0d6;line-height:1.5;margin:6px 4px 16px}
.rodape{margin-top:18px;text-align:center;font-size:.88rem}
.rodape a{color:#c4b5fd}
</style>
</head>
<body>
<main>
  <h1>🎵 ${titulo}</h1>
  <p class="sub">Toque para ouvir ou baixar o MP3.</p>
  ${corpo}
  <a class="btn sec" href="${entrega}">Abrir a página completa do pedido</a>
  ${linkSuporte ? `<p class="rodape">Precisa de ajuda? <a href="${linkSuporte}">Fale com o suporte no WhatsApp</a></p>` : ''}
</main>
<script>
(function(){try{
  var ua=navigator.userAgent||'';
  var emApp=/FBAN|FBAV|Instagram|; wv\\)|WhatsApp/i.test(ua)||/^android-app:\\/\\/(?!com\\.android\\.chrome)/.test(document.referrer||'');
  var a=document.getElementById('abrir-chrome');
  if(a&&emApp&&/Android/i.test(ua)){
    a.href='intent://'+location.host+location.pathname+location.search+'#Intent;scheme=https;package=com.android.chrome;end';
    a.hidden=false;
  }
}catch(e){}})();
</script>
</body>
</html>`;
}
