// Compressão das fotos ANTES do upload (pedido do dono do estúdio, 03/09/2026: "mandei uma imagem
// de 2 MB, eu comprimo pra ficar 100 KB").
//
// O que isso resolve de verdade — e o que NÃO resolve:
//   - resolve: upload muito mais rápido no 4G do cliente, menos memória no navegador durante a
//     renderização do vídeo (20 fotos de 2 MB são 40 MB só de origem) e menos custo de Storage,
//     que passou a importar mais desde que a Retrospectiva guarda as fotos permanentemente;
//   - NÃO resolve: o tamanho do vídeo final. As fotos são redesenhadas num canvas 720x1280, então
//     o peso do arquivo original não entra na conta — o que manda ali é o bitrate/FPS da gravação
//     (ver src/lib/videoGenerator.js).
//
// Só roda no navegador (usa canvas e createImageBitmap).

const MAX_DIMENSION = 1600; // suficiente para o canvas 720x1280 do vídeo e para exibir na retrospectiva
const JPEG_QUALITY = 0.82;
const SKIP_BELOW_BYTES = 300 * 1024; // abaixo disso comprimir não compensa o custo de processar

/**
 * Reduz e recomprime uma imagem, preservando a proporção.
 *
 * Nunca lança: se algo falhar (formato exótico, canvas indisponível, imagem corrompida), devolve o
 * arquivo ORIGINAL. Perder a foto do cliente por causa de uma otimização seria péssimo negócio.
 *
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function compressImage(file) {
  try {
    if (!file || !file.type?.startsWith('image/')) return file;
    if (file.size <= SKIP_BELOW_BYTES) return file;
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const maior = Math.max(width, height);
    const escala = maior > MAX_DIMENSION ? MAX_DIMENSION / maior : 1;

    const novaLargura = Math.round(width * escala);
    const novaAltura = Math.round(height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = novaLargura;
    canvas.height = novaAltura;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, novaLargura, novaAltura);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;

    // Se a "compressão" engordou o arquivo (acontece com PNG de pouca cor, por exemplo), fica o original.
    if (blob.size >= file.size) return file;

    const novoNome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], novoNome, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    console.warn('[imageCompress] Falha ao comprimir, usando o arquivo original:', e?.message);
    return file;
  }
}
