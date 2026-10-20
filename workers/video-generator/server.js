if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocketPolyfill {};
}
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { AsyncQueue } from './src/queue.js';
import { downloadJobAssets } from './src/downloader.js';
import { renderSlideshowVideo, renderPreviewVideo } from './src/ffmpegRunner.js';
import { uploadVideoToR2 } from './src/r2Uploader.js';
import { updateOrderStatus } from './src/orderUpdater.js';
import { alignLyricsWithWhisper, generateAssKaraokeFile, renderKaraokeVideo } from './src/karaokeGenerator.js';

export function createApp(config = process.env) {
  const app = express();
  const maxConcurrency = parseInt(config.MAX_CONCURRENT_JOBS || '2', 10);
  const queue = new AsyncQueue(maxConcurrency);
  const secretToken = config.VPS_VIDEO_SECRET;

  app.use(express.json({ limit: '10mb' }));

  // Middleware de log simples
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[HTTP] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  // Health check público (para monitoramento, docker compose e balancer)
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'nsmusic-video-generator',
      queue: queue.getStats(),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Middleware de autenticação por token secreto
  const authMiddleware = (req, res, next) => {
    if (!secretToken) {
      console.warn('[Security] AVISO: VPS_VIDEO_SECRET não configurado. Bloqueando requisição.');
      return res.status(500).json({ error: 'Configuração de segurança pendente no servidor.' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token || token !== secretToken) {
      return res.status(401).json({ error: 'Token de autorização inválido ou ausente.' });
    }
    next();
  };

  // Endpoint de solicitação de renderização
  app.post('/render', authMiddleware, async (req, res) => {
    const { orderId, imageUrls, audioUrl, title } = req.body || {};

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }
    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl é obrigatório' });
    }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: 'imageUrls deve ser um array com pelo menos 1 foto' });
    }

    if (queue.isOrderProcessing(orderId)) {
      return res.status(409).json({
        error: 'Este pedido já está sendo processado na fila de renderização.',
        orderId,
      });
    }

    // Responde 202 Accepted imediatamente para liberar o cliente/Next.js
    res.status(202).json({
      success: true,
      message: 'Geração de vídeo enfileirada com sucesso',
      orderId,
      queue: queue.getStats(),
    });

    // Processamento assíncrono na fila da VPS
    queue.enqueue(orderId, async () => {
      console.log(`[Job:${orderId}] 🎬 Iniciando processamento do vídeo para "${title || orderId}"...`);
      let assetContext = null;

      try {
        // 1. Marca status GERANDO no Supabase
        await updateOrderStatus(orderId, { status: 'GERANDO', progress: 10 }, config);

        // 2. Download dos assets (fotos e MP3)
        console.log(`[Job:${orderId}] Baixando ${imageUrls.length} fotos e o áudio...`);
        assetContext = await downloadJobAssets(orderId, imageUrls, audioUrl);
        await updateOrderStatus(orderId, { status: 'GERANDO', progress: 30 }, config);

        // 3. Renderização com FFmpeg
        const outputMp4Path = path.join(assetContext.workDir, `video_${orderId}.mp4`);
        console.log(`[Job:${orderId}] Iniciando renderização FFmpeg...`);

        await renderSlideshowVideo({
          imageFiles: assetContext.imageFiles,
          audioFile: assetContext.audioFile,
          outputFilePath: outputMp4Path,
          onProgress: async (percent) => {
            // Converte progresso do FFmpeg (0-100) para escala global (30% - 85%)
            const scaledProgress = 30 + Math.round((percent * 55) / 100);
            await updateOrderStatus(orderId, { status: 'GERANDO', progress: scaledProgress }, config).catch(() => {});
          },
        });

        // 4. Upload para o Cloudflare R2
        console.log(`[Job:${orderId}] Fazendo upload do MP4 gerado para o Cloudflare R2...`);
        await updateOrderStatus(orderId, { status: 'GERANDO', progress: 90 }, config);
        const videoUrl = await uploadVideoToR2(outputMp4Path, orderId, config);

        // 5. Conclui com sucesso no Supabase
        await updateOrderStatus(orderId, {
          status: 'CONCLUIDO',
          progress: 100,
          videoUrl,
        }, config);

        console.log(`[Job:${orderId}] ✅ Vídeo finalizado com sucesso! URL: ${videoUrl}`);

      } catch (jobErr) {
        console.error(`[Job:${orderId}] ❌ Erro durante a renderização:`, jobErr);
        await updateOrderStatus(orderId, {
          status: 'ERRO',
          error: jobErr?.message || 'Falha na renderização do vídeo',
        }, config).catch(() => {});
      } finally {
        // 6. Limpeza dos arquivos temporários locais
        if (assetContext?.cleanup) {
          await assetContext.cleanup();
        }
      }
    }).catch(err => {
      console.error(`[Job:${orderId}] Erro geral na execução da fila:`, err?.message);
    });
  });

  // Endpoint de renderização do Vídeo Karaokê
  app.post('/render-karaoke', authMiddleware, async (req, res) => {
    const { orderId, audioUrl, playbackUrl, coverUrl, lyrics, title } = req.body || {};

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }
    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl é obrigatório' });
    }

    if (queue.isOrderProcessing(`karaoke_${orderId}`)) {
      return res.status(409).json({
        error: 'O karaokê deste pedido já está sendo processado na fila.',
        orderId,
      });
    }

    res.status(202).json({
      success: true,
      message: 'Renderização do karaokê enfileirada com sucesso',
      orderId,
      queue: queue.getStats(),
    });

    queue.enqueue(`karaoke_${orderId}`, async () => {
      console.log(`[Karaoke:${orderId}] 🎤 Iniciando renderização do Karaokê para "${title || orderId}"...`);
      let assetContext = null;

      try {
        await updateOrderStatus(orderId, { karaokeStatus: 'GERANDO', karaokeProgress: 10 }, config);

        // Imagem da capa (ou fallback padrão)
        const imageList = coverUrl ? [coverUrl] : [];
        // Se temos playbackUrl (instrumental já separado), baixamos o playback para a trilha final
        const effectiveAudioUrl = playbackUrl || audioUrl;

        assetContext = await downloadJobAssets(orderId, imageList.length ? imageList : ['https://nsmusic.pages.dev/icon.png'], effectiveAudioUrl);
        await updateOrderStatus(orderId, { karaokeStatus: 'GERANDO', karaokeProgress: 25 }, config);

        // Baixa o áudio original com voz para o Whisper alinhar a letra
        let origAudioPath = assetContext.audioFile;
        if (playbackUrl && playbackUrl !== audioUrl) {
          const dlRes = await fetch(audioUrl);
          if (dlRes.ok) {
            const buf = Buffer.from(await dlRes.arrayBuffer());
            const origPath = path.join(assetContext.workDir, 'original_vocals.mp3');
            await (await import('node:fs/promises')).writeFile(origPath, buf);
            origAudioPath = origPath;
          }
        }

        console.log(`[Karaoke:${orderId}] Alinhando letra e timestamps com Whisper...`);
        const openAiKey = config.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        const whisperData = await alignLyricsWithWhisper(origAudioPath, lyrics || '', openAiKey);
        await updateOrderStatus(orderId, { karaokeStatus: 'GERANDO', karaokeProgress: 50 }, config);

        // Gera o arquivo .ass com efeito de karaokê
        const assPath = path.join(assetContext.workDir, 'karaoke.ass');
        const assContent = generateAssKaraokeFile(whisperData, title || 'Karaokê');
        await (await import('node:fs/promises')).writeFile(assPath, assContent, 'utf8');

        // Renderiza o vídeo com FFmpeg
        const outputMp4Path = path.join(assetContext.workDir, `karaoke_${orderId}.mp4`);
        console.log(`[Karaoke:${orderId}] Renderizando MP4 16:9 no FFmpeg com legenda ASS...`);

        await renderKaraokeVideo({
          imageFilePath: assetContext.imageFiles[0],
          audioFilePath: assetContext.audioFile,
          assSubtitleFilePath: assPath,
          outputFilePath: outputMp4Path,
          onProgress: async (percent) => {
            const scaled = 50 + Math.round((percent * 35) / 100);
            await updateOrderStatus(orderId, { karaokeStatus: 'GERANDO', karaokeProgress: scaled }, config).catch(() => {});
          },
        });

        // Upload para o Cloudflare R2
        console.log(`[Karaoke:${orderId}] Fazendo upload do Karaokê para o Cloudflare R2...`);
        await updateOrderStatus(orderId, { karaokeStatus: 'GERANDO', karaokeProgress: 90 }, config);
        const karaokeUrl = await uploadVideoToR2(outputMp4Path, `karaoke_${orderId}`, config);

        // Atualização final no Supabase
        await updateOrderStatus(orderId, {
          karaokeStatus: 'CONCLUIDO',
          karaokeProgress: 100,
          karaokeUrl,
          hasKaraokeAccess: true,
        }, config);

        console.log(`[Karaoke:${orderId}] ✅ Vídeo Karaokê concluído com sucesso! URL: ${karaokeUrl}`);

      } catch (err) {
        console.error(`[Karaoke:${orderId}] ❌ Erro ao renderizar karaokê:`, err);
        await updateOrderStatus(orderId, {
          karaokeStatus: 'ERRO',
          karaokeError: err?.message || 'Falha ao gerar o karaokê',
        }, config).catch(() => {});
      } finally {
        if (assetContext?.cleanup) {
          await assetContext.cleanup();
        }
      }
    }).catch(err => {
      console.error(`[Karaoke:${orderId}] Erro na fila do karaokê:`, err?.message);
    });
  });

  // Endpoint de solicitação de renderização de prévia de 60s leve para WhatsApp
  app.post('/render-preview', authMiddleware, async (req, res) => {
    const { orderId, coverUrl, audioUrl, duration = 60, title, sync = false } = req.body || {};

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }
    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl é obrigatório' });
    }
    if (!coverUrl) {
      return res.status(400).json({ error: 'coverUrl é obrigatório' });
    }

    const jobKey = `preview_${orderId}`;
    if (queue.isOrderProcessing(jobKey)) {
      return res.status(409).json({
        error: 'A prévia deste pedido já está sendo processada.',
        orderId,
      });
    }

    const runPreviewJob = async () => {
      console.log(`[Preview:${orderId}] 🎵 Iniciando renderização da prévia de ${duration}s para "${title || orderId}"...`);
      let assetContext = null;

      try {
        await updateOrderStatus(orderId, { previewVideoStatus: 'GERANDO' }, config).catch(() => {});

        // Baixa a imagem da capa e o áudio
        assetContext = await downloadJobAssets(orderId, [coverUrl], audioUrl);

        const outputMp4Path = path.join(assetContext.workDir, `preview_${orderId}.mp4`);

        await renderPreviewVideo({
          coverFile: assetContext.imageFiles[0],
          audioFile: assetContext.audioFile,
          outputFilePath: outputMp4Path,
          duration: Math.min(Math.max(Number(duration) || 60, 15), 90),
          width: 540,
          height: 540,
        });

        // Checa tamanho gerado
        const fsPromises = await import('node:fs/promises');
        const stat = await fsPromises.stat(outputMp4Path);
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
        console.log(`[Preview:${orderId}] 📦 Tamanho final da prévia: ${sizeMb} MB`);

        // Upload para o Cloudflare R2
        const previewUrl = await uploadVideoToR2(outputMp4Path, `preview_${orderId}`, config);

        // Atualiza pedido no Supabase
        await updateOrderStatus(orderId, {
          previewVideoUrl: previewUrl,
          previewVideoStatus: 'CONCLUIDO',
        }, config).catch(() => {});

        console.log(`[Preview:${orderId}] ✅ Prévia pronta (${sizeMb} MB)! URL: ${previewUrl}`);
        return { success: true, previewUrl, sizeMb, duration };

      } catch (err) {
        console.error(`[Preview:${orderId}] ❌ Erro ao gerar prévia:`, err);
        await updateOrderStatus(orderId, {
          previewVideoStatus: 'ERRO',
        }, config).catch(() => {});
        throw err;
      } finally {
        if (assetContext?.cleanup) {
          await assetContext.cleanup();
        }
      }
    };

    if (sync) {
      try {
        const result = await runPreviewJob();
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Erro ao renderizar prévia' });
      }
    }

    res.status(202).json({
      success: true,
      message: 'Renderização de prévia enfileirada com sucesso',
      orderId,
      queue: queue.getStats(),
    });

    queue.enqueue(jobKey, runPreviewJob).catch(err => {
      console.error(`[Preview:${orderId}] Erro geral na fila:`, err?.message);
    });
  });

  return { app, queue };
}

// Inicia o servidor se executado diretamente
const isDirectRun = process.argv[1] && (process.argv[1].endsWith('server.js') || process.argv[1].includes('server.js'));
if (isDirectRun) {
  const PORT = process.env.PORT || 3100;
  const { app } = createApp(process.env);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [NSMusic Video Generator] Servidor rodando na porta ${PORT}`);
    console.log(`📡 Healthcheck: http://localhost:${PORT}/health`);
  });
}
