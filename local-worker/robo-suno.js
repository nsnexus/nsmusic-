import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { initSunoBrowser, gerarMusicaNoSuno, closeSunoBrowser } from './suno-automator.js';
import { uploadAudioParaR2 } from './r2-uploader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis de ambiente (.env local ou ../.env.local do projeto)
if (fs.existsSync(path.resolve(__dirname, '.env'))) {
  dotenv.config({ path: path.resolve(__dirname, '.env') });
} else if (fs.existsSync(path.resolve(__dirname, '../.env.local'))) {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const POLLING_INTERVAL_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 30000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[RobôSuno] ❌ ERRO: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

let isProcessing = false;
let isRunning = true;

/**
 * Envia pulso de presença (heartbeat) ao Supabase para o painel admin saber que o robô está ativo.
 */
async function enviarHeartbeat() {
  try {
    const agora = new Date().toISOString();
    // Salva ou atualiza chave de heartbeat na tabela config
    await supabase.from('config').upsert({
      chave: 'suno_worker_heartbeat',
      valor: {
        last_seen: agora,
        status: isProcessing ? 'busy' : 'idle',
        machine: process.env.COMPUTERNAME || 'pc-local'
      },
      updated_at: agora
    });
  } catch (err) {
    // Falha silenciosa de heartbeat para não interromper fluxo principal
  }
}

/**
 * Processa um único pedido pendente.
 */
async function processarPedido(pedido) {
  const orderId = pedido.id;
  const clienteNome = pedido.customer_name || pedido.customerName || 'Cliente';
  const homenageadoNome = pedido.honoree_name || pedido.recipientName || 'Homenageado';

  console.log(`\n=============================================================`);
  console.log(`[RobôSuno] 📥 NOVO PEDIDO DETECTADO: #${orderId.substring(0, 8)}`);
  console.log(`Cliente: ${clienteNome}`);
  console.log(`Homenageado: ${homenageadoNome}`);
  console.log(`=============================================================`);

  // 1. Bloqueia o pedido atômico para evitar que outro ciclo tente processar
  const currentExtras = (pedido.extras && typeof pedido.extras === 'object') ? pedido.extras : {};
  await supabase.from('orders').update({
    production_status: 'GERANDO_AUDIO',
    extras: {
      ...currentExtras,
      status_robo: 'PROCESSANDO',
      robo_iniciado_em: new Date().toISOString()
    }
  }).eq('id', orderId);

  try {
    const prompt = pedido.lyrics || pedido.story || '';
    const style = pedido.music_style || pedido.musicStyle || pedido.occasion || 'Acoustic Pop';
    const title = homenageadoNome || `Pedido ${orderId.substring(0, 8)}`;

    if (!prompt.trim()) {
      throw new Error('Pedido não possui letra cadastrada para geração.');
    }

    // 2. Executa a geração no Suno via Playwright
    const resultado = await gerarMusicaNoSuno({
      prompt,
      style,
      title,
      onProgress: (status) => console.log(`[RobôSuno] ⏳ [Pedido #${orderId.substring(0, 8)}] ${status}`)
    });

    if (!resultado || !resultado.clips || resultado.clips.length === 0) {
      throw new Error('Nenhum clipe de áudio retornado pelo Suno.');
    }

    const clip1 = resultado.clips[0];
    const clip2 = resultado.clips[1] || resultado.clips[0];

    // 3. Download da CDN e Upload seguro para o Cloudflare R2
    console.log(`[RobôSuno] 📤 Realizando upload das faixas para o Cloudflare R2...`);
    const [upload1, upload2] = await Promise.all([
      uploadAudioParaR2({ audioUrl: clip1.audioUrl, clipId: clip1.id, orderId, clipIndex: 1 }),
      uploadAudioParaR2({ audioUrl: clip2.audioUrl, clipId: clip2.id, orderId, clipIndex: 2 })
    ]);

    const finalUrl1 = upload1.r2Url || clip1.audioUrl;
    const finalUrl2 = upload2.r2Url || clip2.audioUrl;

    // 4. Atualiza o pedido no Supabase como CONCLUÍDO
    const agora = new Date().toISOString();
    const updatePayload = {
      audio_url: finalUrl1,
      audio_files: [finalUrl1, finalUrl2],
      audio_ids: [clip1.id, clip2.id],
      production_status: 'CONCLUIDO',
      updated_at: agora,
      extras: {
        ...currentExtras,
        musicUrl: finalUrl1,
        musicUrl2: finalUrl2,
        status_robo: 'CONCLUIDO',
        status_geracao: 'CONCLUIDO'
      }
    };

    const { error: updateErr } = await supabase.from('orders').update(updatePayload).eq('id', orderId);
    if (updateErr) {
      throw new Error(`Falha ao salvar conclusão no Supabase: ${updateErr.message}`);
    }

    console.log(`[RobôSuno] 🎉 PEDIDO #${orderId.substring(0, 8)} CONCLUÍDO COM SUCESSO!`);
    console.log(`Faixa 1: ${finalUrl1}`);
    console.log(`Faixa 2: ${finalUrl2}`);
    console.log(`=============================================================\n`);

    // Notifica opcionalmente o servidor do NSMusic para disparo do WhatsApp oficial
    const nsmusicUrl = process.env.NSMUSIC_API_URL || 'https://nsmusic.nsnexus.com.br';
    fetch(`${nsmusicUrl.replace(/\/+$/, '')}/api/admin/notify-music-ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    }).catch(() => {});

  } catch (err) {
    console.error(`[RobôSuno] ❌ ERRO AO PROCESSAR PEDIDO #${orderId.substring(0, 8)}:`, err.message);

    // Marca falha local no pedido para permitir que o failover do Next.js assuma
    await supabase.from('orders').update({
      extras: {
        ...currentExtras,
        status_robo: 'FALHA_LOCAL',
        robo_erro: err.message
      },
      updated_at: new Date().toISOString()
    }).eq('id', orderId).catch(() => {});
  }
}

/**
 * Loop principal de polling no Supabase.
 */
async function loopPrincipal() {
  console.log('\n=============================================================');
  console.log('🤖 ROBÔ LOCAL SUNO AI INICIADO');
  console.log(`Conectado ao Supabase: ${SUPABASE_URL}`);
  console.log(`Verificando novos pedidos a cada ${POLLING_INTERVAL_MS / 1000}s...`);
  console.log('=============================================================\n');

  // Inicializa o navegador e valida login
  try {
    await initSunoBrowser();
  } catch (err) {
    console.error('[RobôSuno] ⚠️ Erro ao inicializar navegador:', err.message);
  }

  // Heartbeat em segundo plano
  setInterval(enviarHeartbeat, HEARTBEAT_INTERVAL_MS);
  enviarHeartbeat();

  while (isRunning) {
    if (!isProcessing) {
      try {
        // Busca pedidos pendentes onde suno_provider = 'suno_local' e ainda sem áudio finalizado
        const { data: pedidos, error } = await supabase
          .from('orders')
          .select('*')
          .eq('suno_provider', 'suno_local')
          .is('audio_url', null)
          .order('created_at', { ascending: true })
          .limit(5);

        if (!error && pedidos && pedidos.length > 0) {
          const elegivel = pedidos.find(p => {
            const ext = p.extras || {};
            return ext.status_robo !== 'PROCESSANDO' && ext.status_robo !== 'FALHA_LOCAL';
          });

          if (elegivel) {
            isProcessing = true;
            await processarPedido(elegivel);
            isProcessing = false;
          }
        }
      } catch (loopErr) {
        console.warn('[RobôSuno] Aviso no ciclo de polling:', loopErr.message);
        isProcessing = false;
      }
    }

    await new Promise(r => setTimeout(r, POLLING_INTERVAL_MS));
  }
}

// Finalização graciosa com Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n[RobôSuno] ⏹️ Encerrando robô local...');
  isRunning = false;
  await closeSunoBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  isRunning = false;
  await closeSunoBrowser();
  process.exit(0);
});

// Inicia execução
loopPrincipal();
