import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Baixa os assets (imagens e música MP3) para uma pasta de trabalho temporária.
 *
 * @param {string} orderId - ID do pedido
 * @param {string[]} imageUrls - URLs das fotos
 * @param {string} audioUrl - URL da música MP3
 * @param {string} [baseTmpDir] - Diretório base para arquivos temporários
 * @returns {Promise<{ workDir: string, imageFiles: string[], audioFile: string, cleanup: () => Promise<void> }>}
 */
export async function downloadJobAssets(orderId, imageUrls, audioUrl, baseTmpDir = null) {
  if (!orderId) {
    throw new Error('ID do pedido é obrigatório');
  }
  if (!audioUrl) {
    throw new Error('URL de áudio obrigatória para gerar o vídeo');
  }
  const cleanImageUrls = (imageUrls || []).filter(u => typeof u === 'string' && u.trim().startsWith('http'));
  if (cleanImageUrls.length === 0) {
    throw new Error('Nenhuma imagem válida fornecida para o slideshow');
  }

  const rootDir = baseTmpDir || process.env.TEMP_DIR || path.join(os.tmpdir(), 'video-jobs');
  const jobFolder = `${orderId}-${Date.now()}`;
  const workDir = path.join(rootDir, jobFolder);

  await fs.mkdir(workDir, { recursive: true });

  const cleanup = async () => {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[Downloader] Falha ao limpar diretório ${workDir}:`, err?.message);
    }
  };

  try {
    // 1. Download do áudio MP3
    const audioFile = path.join(workDir, 'audio.mp3');
    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(60000) });
    if (!audioRes.ok) {
      throw new Error(`Falha ao baixar áudio: HTTP ${audioRes.status}`);
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    if (audioBuffer.length === 0) {
      throw new Error('Arquivo de áudio vazio');
    }
    await fs.writeFile(audioFile, audioBuffer);

    // 2. Download das imagens em paralelo
    const imageFiles = [];
    await Promise.all(
      cleanImageUrls.map(async (url, idx) => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (!res.ok) {
            console.warn(`[Downloader] Imagem ${idx} respondeu HTTP ${res.status}: ${url}`);
            return;
          }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 500) {
            console.warn(`[Downloader] Imagem ${idx} muito pequena ou vazia (${buf.length} bytes)`);
            return;
          }

          // Formata nome com zeros à esquerda (ex: img_001.jpg)
          const filename = `img_${String(idx + 1).padStart(3, '0')}.jpg`;
          const filePath = path.join(workDir, filename);
          await fs.writeFile(filePath, buf);
          imageFiles.push(filePath);
        } catch (imgErr) {
          console.warn(`[Downloader] Erro ao baixar imagem ${idx} (${url}):`, imgErr?.message);
        }
      })
    );

    // Ordena as imagens numericamente
    imageFiles.sort();

    if (imageFiles.length === 0) {
      throw new Error('Nenhuma imagem pôde ser baixada com sucesso');
    }

    return {
      workDir,
      imageFiles,
      audioFile,
      cleanup,
    };
  } catch (err) {
    // Em caso de falha durante o download, limpa a pasta de trabalho
    await cleanup();
    throw err;
  }
}
