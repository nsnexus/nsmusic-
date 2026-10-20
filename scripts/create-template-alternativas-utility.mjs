import fs from 'fs';
import path from 'path';

const WABA_ID = '2160994021495241';
const APP_ID = '1663535488712112';
const GRAPH_VERSION = 'v21.0';
const SAMPLE_VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return env;
}

async function uploadVideoHandle(token) {
  const videoBuffer = await fetch(SAMPLE_VIDEO_URL).then((r) => r.arrayBuffer());
  const fileLen = videoBuffer.byteLength;

  const sessRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${APP_ID}/uploads?file_length=${fileLen}&file_type=video%2Fmp4&access_token=${token}`,
    { method: 'POST' }
  );
  const sessData = await sessRes.json();

  const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${sessData.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: videoBuffer,
  });

  const uploadData = await uploadRes.json();
  return uploadData.h;
}

async function createTemplate(token, payload) {
  console.log(`🚀 Enviando modelo "${payload.name}" (${payload.category})...`);
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WABA_ID}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (res.ok) {
    console.log(`✅ SUCESSO [${payload.name}]: ID ${data.id} (${data.status})`);
    return { success: true, id: data.id };
  } else {
    console.error(`❌ Erro em [${payload.name}]:`, JSON.stringify(data?.error || data, null, 2));
    return { success: false, error: data?.error?.message };
  }
}

async function main() {
  const env = loadEnvLocal();
  const token = process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;

  const videoHandle = await uploadVideoHandle(token);

  const templates = [
    {
      name: 'notificacao_pedido_pronto',
      category: 'UTILITY',
      language: 'pt_BR',
      components: [
        {
          type: 'HEADER',
          format: 'VIDEO',
          example: { header_handle: [videoHandle] },
        },
        {
          type: 'BODY',
          text:
            'Olá, {{1}}. Seu pedido de música para {{2}} já está disponível para consulta.\n\n' +
            'Acompanhe a reprodução no vídeo acima. Para acessar o seu pedido completo, toque no botão abaixo:\n\n' +
            'Suporte: {{3}}\n' +
            '⚠️ Mensagem automática do NS Music.',
          example: {
            body_text: [['Narciso', 'Maria', 'https://wa.me/5594991081351']],
          },
        },
        {
          type: 'FOOTER',
          text: 'NS Music — Status do Pedido',
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Consultar Pedido',
              url: 'https://nsmusic.nsnexus.com.br/entrega?orderId={{1}}',
              example: ['https://nsmusic.nsnexus.com.br/entrega?orderId=NS-exemplo-123'],
            },
          ],
        },
      ],
    },
    {
      name: 'entrega_pedido_musica_video',
      category: 'UTILITY',
      language: 'pt_BR',
      components: [
        {
          type: 'HEADER',
          format: 'VIDEO',
          example: { header_handle: [videoHandle] },
        },
        {
          type: 'BODY',
          text:
            'Olá, {{1}}. Confirmamos que a criação da música para {{2}} foi concluída com sucesso.\n\n' +
            'Veja a gravação no vídeo acima. Para visualizar e gerenciar o seu pedido, clique no botão:\n\n' +
            'Suporte: {{3}}\n' +
            '⚠️ Notificação do sistema NS Music.',
          example: {
            body_text: [['Narciso', 'Maria', 'https://wa.me/5594991081351']],
          },
        },
        {
          type: 'FOOTER',
          text: 'NS Music — Pedido Concluído',
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Acessar Pedido',
              url: 'https://nsmusic.nsnexus.com.br/entrega?orderId={{1}}',
              example: ['https://nsmusic.nsnexus.com.br/entrega?orderId=NS-exemplo-123'],
            },
          ],
        },
      ],
    },
  ];

  for (const t of templates) {
    await createTemplate(token, t);
  }
}

main().catch(console.error);
