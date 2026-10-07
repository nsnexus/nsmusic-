/**
 * Módulo de download do áudio bruto da CDN da Suno e upload
 * direto para o Cloudflare R2 do NSMusic.
 */

const MIN_AUDIO_BYTES = 100 * 1024; // 100 KB mínimo para garantir que é áudio real
const MAX_ATTEMPTS = 3;

/**
 * Baixa o MP3 da CDN da Suno e sobe para o bucket Cloudflare R2 via API do NSMusic.
 * 
 * @param {Object} params
 * @param {string} params.audioUrl - URL direta do MP3 (ex: https://cdn1.suno.ai/[id].mp3)
 * @param {string} params.orderId - ID do pedido no NSMusic
 * @param {number} params.clipIndex - 1 ou 2 (primeira ou segunda versão)
 * @param {string} [params.nsmusicApiUrl] - URL base da API do NSMusic
 * @returns {Promise<{ ok: boolean, r2Url: string, error?: string }>}
 */
export async function uploadAudioParaR2({
  audioUrl,
  orderId = 'pedido',
  clipIndex = 1,
  nsmusicApiUrl = process.env.NSMUSIC_API_URL || 'https://nsmusic.nsnexus.com.br'
}) {
  if (!audioUrl || typeof audioUrl !== 'string') {
    return { ok: false, r2Url: '', error: 'URL de áudio inválida ou ausente.' };
  }

  console.log(`[R2Uploader] ⬇️ Baixando MP3 da CDN da Suno (Faixa ${clipIndex}): ${audioUrl}`);

  let audioBuffer = null;

  // 1. Download do áudio bruto da CDN com retentativas
  for (let tentativa = 1; tentativa <= MAX_ATTEMPTS; tentativa++) {
    try {
      const res = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!res.ok) {
        throw new Error(`CDN Suno respondeu com HTTP ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < MIN_AUDIO_BYTES) {
        throw new Error(`Áudio recebido muito pequeno (${buffer.byteLength} bytes)`);
      }

      audioBuffer = buffer;
      console.log(`[R2Uploader] ✅ Download concluído: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      break;
    } catch (err) {
      console.warn(`[R2Uploader] Tentativa ${tentativa}/${MAX_ATTEMPTS} de download falhou: ${err.message}`);
      if (tentativa < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // Se não conseguiu baixar o buffer, devolve a URL original da CDN como fallback seguro
  if (!audioBuffer) {
    console.warn('[R2Uploader] Não foi possível obter o buffer da CDN. Mantendo URL original do Suno.');
    return { ok: true, r2Url: audioUrl, fallback: true };
  }

  // 2. Upload para o Cloudflare R2 através da rota do NSMusic
  console.log(`[R2Uploader] ☁️ Enviando áudio para Cloudflare R2...`);

  try {
    const formData = new FormData();
    const fileName = `${orderId}_v${clipIndex}_${Date.now()}.mp3`;
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, fileName);
    formData.append('folder', 'audios-suno-local');

    const uploadUrl = `${nsmusicApiUrl.replace(/\/+$/, '')}/api/admin/voice/upload`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(45000)
    });

    const uploadData = await uploadRes.json().catch(() => ({}));

    if (!uploadRes.ok || !uploadData.url) {
      throw new Error(uploadData.error || `Erro HTTP ${uploadRes.status} no upload para o R2`);
    }

    console.log(`[R2Uploader] 🚀 Áudio salvo permanentemente no R2: ${uploadData.url}`);
    return {
      ok: true,
      r2Url: uploadData.url
    };
  } catch (err) {
    console.warn(`[R2Uploader] Falha no upload para o R2: ${err.message}. Usando URL da CDN como contingência.`);
    // Fallback: se o R2 estiver fora, a URL da CDN garante que o cliente receba a música
    return {
      ok: true,
      r2Url: audioUrl,
      fallback: true,
      error: err.message
    };
  }
}
