if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocketPolyfill {};
}
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { AsyncQueue } from './src/queue.js';
import { downloadJobAssets } from './src/downloader.js';
import { renderSlideshowVideo } from './src/ffmpegRunner.js';
import { uploadVideoToR2 } from './src/r2Uploader.js';
import { updateOrderStatus } from './src/orderUpdater.js';

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
