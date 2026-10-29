import fs from 'fs';
import path from 'path';

const WABA_ID = '2160994021495241';
const APP_ID = '1663535488712112';
const GRAPH_VERSION = 'v21.0';
const TEMPLATE_NAME = 'previa_musica_com_video';
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
  console.log('📥 Baixando vídeo de exemplo...');
  const videoBuffer = await fetch(SAMPLE_VIDEO_URL).then(r => r.arrayBuffer());
  const fileLen = videoBuffer.byteLength;
  console.log(`✅ Vídeo baixado (${fileLen} bytes). Criando sessão de upload na Meta...`);

  const sessRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${APP_ID}/uploads?file_length=${fileLen}&file_type=video%2Fmp4&access_token=${token}`,
    { method: 'POST' }
  );
  const sessData = await sessRes.json();
  if (!sessData.id) {
    throw new Error(`Falha ao iniciar sessão de upload: ${JSON.stringify(sessData)}`);
  }

  console.log(`📤 Enviando vídeo para a sessão ${sessData.id}...`);
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
  if (!uploadData.h) {
    throw new Error(`Falha no upload do vídeo: ${JSON.stringify(uploadData)}`);
  }

  console.log(`✅ Video handle obtido: ${uploadData.h.slice(0, 30)}...`);
  return uploadData.h;
}

async function main() {
  const env = loadEnvLocal();
  const token = process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;

  if (!token) {
    console.error('❌ ERRO: WHATSAPP_ACCESS_TOKEN não encontrado.');
    process.exit(1);
  }

  // 1. Obter handle do vídeo de exemplo
  const videoHandle = await uploadVideoHandle(token);

  // 2. Montar texto do BODY (categoria UTILITY)
  // Regras da Meta para UTILITY:
  // - Não usar termos de marketing apelativos.
  // - Notificação de atualização transacional do pedido.
  const bodyText =
    '🎵 Olá, {{1}}! Sua música personalizada para {{2}} acabou de ficar pronta!\n\n' +
    'Dá o play no vídeo acima para ouvir a prévia de 60 segundos com a capa oficial. Ficou emocionante demais! 🎶\n\n' +
    'Toque no botão abaixo para ouvir as versões completas e liberar o seu pedido.\n\n' +
    'Suporte: {{3}}\n' +
    '⚠️ Esta é uma mensagem automática do NS Music.';

  const templatePayload = {
    name: TEMPLATE_NAME,
    category: 'UTILITY',
    language: 'pt_BR',
    components: [
      {
        type: 'HEADER',
        format: 'VIDEO',
        example: {
          header_handle: [videoHandle],
        },
      },
      {
        type: 'BODY',
        text: bodyText,
        example: {
          body_text: [
            ['Narciso', 'Maria', 'https://wa.me/5594991081351'],
          ],
        },
      },
      {
        type: 'FOOTER',
        text: 'NS Music — Músicas Personalizadas com IA',
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Liberar Música Completa',
            url: 'https://nsmusic.ia.br/entrega?orderId={{1}}',
            example: ['https://nsmusic.ia.br/entrega?orderId=NS-exemplo-123'],
          },
        ],
      },
    ],
  };

  console.log(`🚀 Enviando modelo "${TEMPLATE_NAME}" (UTILITY) com BOTÃO e VÍDEO para a Meta...`);

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${WABA_ID}/message_templates`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templatePayload),
    }
  );

  const data = await res.json();

  if (res.ok) {
    console.log('✅ SUCESSO! Modelo UTILITY com BOTÃO criado e enviado para análise:');
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error('❌ Erro da Meta ao criar modelo:');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
