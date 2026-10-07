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
  clipId,
  audioBuffer: initialBuffer = null,
  orderId = 'pedido',
  clipIndex = 1,
  nsmusicApiUrl = process.env.NSMUSIC_API_URL || 'https://nsmusic.nsnexus.com.br'
}) {
  const uuidMatch = String(audioUrl || clipId || '').match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  const uuid = clipId || (uuidMatch ? uuidMatch[1] : null);

  if (!audioUrl && !uuid && !initialBuffer) {
    return { ok: false, r2Url: '', error: 'URL ou ID do áudio inválido ou ausente.' };
  }

  console.log(`[R2Uploader] ⬇️ Processando áudio da Suno (Faixa ${clipIndex}): ${audioUrl || uuid}`);

  let audioBuffer = initialBuffer;
  let audioExt = 'm4a';
  let mimeType = 'audio/m4a';

  if (!audioBuffer) {
    // Monta lista de URLs candidatas priorizando a CDN CloudFront direta da Suno
    const candidates = [];
    if (uuid) {
      candidates.push(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${uuid}.m4a`);
    }
    if (audioUrl) {
      candidates.push(audioUrl);
    }
    if (uuid) {
      candidates.push(`https://cdn1.suno.ai/${uuid}.mp3`);
      candidates.push(`https://audiopipe.suno.ai/?item_id=${uuid}`);
    }

    const uniqueCandidates = [...new Set(candidates)];

    for (const url of uniqueCandidates) {
      for (let tentativa = 1; tentativa <= MAX_ATTEMPTS; tentativa++) {
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(30000)
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const buffer = await res.arrayBuffer();
          if (buffer.byteLength < MIN_AUDIO_BYTES) {
            throw new Error(`Buffer muito pequeno (${buffer.byteLength} bytes)`);
          }

          audioBuffer = buffer;
          const cType = res.headers.get('content-type') || '';
          if (url.endsWith('.m4a') || cType.includes('mp4') || cType.includes('m4a')) {
            audioExt = 'm4a';
            mimeType = 'audio/m4a';
          } else {
            audioExt = 'mp3';
            mimeType = 'audio/mpeg';
          }

          console.log(`[R2Uploader] ✅ Download concluído com sucesso via ${url} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB, .${audioExt})`);
          break;
        } catch (err) {
          if (tentativa === MAX_ATTEMPTS) {
            // Continua para o próximo candidato
          } else {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      if (audioBuffer) break;
    }
  }

  // Se não conseguiu baixar o buffer, devolve a URL original como fallback
  if (!audioBuffer) {
    const fallbackUrl = audioUrl || (uuid ? `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${uuid}.m4a` : '');
    console.warn('[R2Uploader] Não foi possível obter o buffer de áudio da CDN. Mantendo URL original como fallback.');
    return { ok: true, r2Url: fallbackUrl, fallback: true };
  }

  // 2. Upload para o Cloudflare R2 através da rota oficial do NSMusic
  console.log(`[R2Uploader] ☁️ Enviando áudio (.${audioExt}) para Cloudflare R2...`);

  try {
    const formData = new FormData();
    const fileName = `${orderId}_v${clipIndex}_${Date.now()}.${audioExt}`;
    const blob = new Blob([audioBuffer], { type: mimeType });
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
    const fallbackUrl = audioUrl || (uuid ? `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${uuid}.m4a` : '');
    console.warn(`[R2Uploader] Falha no upload para o R2: ${err.message}. Usando URL de contingência: ${fallbackUrl}`);
    return {
      ok: true,
      r2Url: fallbackUrl,
      fallback: true,
      error: err.message
    };
  }
}
