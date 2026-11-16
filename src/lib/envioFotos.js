// Envio das fotos do vídeo/retrospectiva, uma a uma, pensado para celular com conexão ruim e para
// o navegador embutido do WhatsApp/Instagram:
//   - nada fica esperando para sempre: compressão e upload têm prazo;
//   - cada foto é tentada de novo uma vez antes de ser dada como perdida;
//   - uma foto que falha não derruba as que já subiram (antes era tudo ou nada, e o cliente só via
//     alguma foto na tela depois que TODAS terminavam).

import { compressImage } from './imageCompress.js';

const PRAZO_COMPRESSAO_MS = 15000;
const PRAZO_UPLOAD_MS = 90000;

/** Resolve com `reserva` se a promessa não terminar no prazo (ou falhar). */
export function comPrazo(promessa, ms, reserva) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(reserva), ms);
    Promise.resolve(promessa).then(
      (valor) => { clearTimeout(timer); resolve(valor); },
      () => { clearTimeout(timer); resolve(reserva); },
    );
  });
}

/** Sobe uma foto para /api/media/upload e devolve a URL pública. */
export async function enviarUmaFoto(file, { orderId, indice = 0, folder = 'slideshow' } = {}) {
  // Compressão travada (acontece em WebView com foto grande/HEIC) não pode segurar o envio:
  // passado o prazo, vai o arquivo original mesmo.
  const arquivo = await comPrazo(compressImage(file), PRAZO_COMPRESSAO_MS, file);
  const ext = file.name?.match(/\.(png|webp|gif|heic|heif)$/i) && arquivo === file ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const dados = new FormData();
  dados.append('file', arquivo, `photo_${Date.now()}_${indice}.${ext}`);

  const res = await fetch(`/api/media/upload?folder=${encodeURIComponent(folder)}&orderId=${encodeURIComponent(orderId)}`, {
    method: 'POST',
    body: dados,
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(PRAZO_UPLOAD_MS) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Falha no envio da foto.');
  if (!json.url) throw new Error('O servidor não devolveu o endereço da foto.');
  return json.url;
}

/**
 * Envia os arquivos em série. `enviarUma(file, indice)` devolve a URL; `aoSucesso(url)` é chamado a
 * cada foto que sobe (para a tela mostrar na hora). Nunca lança: devolve o que subiu e o que falhou.
 */
export async function enviarFotosEmSerie(arquivos, enviarUma, { aoProgresso, aoSucesso, tentativas = 2 } = {}) {
  const urls = [];
  const falhas = [];
  for (let i = 0; i < arquivos.length; i++) {
    aoProgresso?.(i + 1, arquivos.length);
    let ultimoErro = null;
    let url = '';
    for (let t = 0; t < tentativas && !url; t++) {
      try {
        url = await enviarUma(arquivos[i], i);
      } catch (err) {
        ultimoErro = err;
      }
    }
    if (url) {
      urls.push(url);
      await aoSucesso?.(url);
    } else {
      falhas.push({ indice: i, motivo: ultimoErro?.name === 'TimeoutError' ? 'A conexão demorou demais.' : (ultimoErro?.message || 'Falha no envio.') });
    }
  }
  return { urls, falhas };
}
