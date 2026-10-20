import fs from 'fs';
import path from 'path';

const WABA_ID = '2160994021495241';
const APP_ID = '1663535488712112';
const GRAPH_VERSION = 'v21.0';
const TEMPLATE_NAME = 'confirmacao_pagamento_v2';
const BANNER_IMAGE_PATH = path.resolve(process.cwd(), 'public/banner-whatsapp.jpg');

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

async function uploadImageHandle(token) {
  console.log('📥 Lendo imagem do banner local...');
  const imageBuffer = fs.readFileSync(BANNER_IMAGE_PATH);
  const fileLen = imageBuffer.byteLength;
  console.log(`✅ Imagem carregada (${fileLen} bytes). Criando sessão de upload na Meta...`);

  const sessRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${APP_ID}/uploads?file_length=${fileLen}&file_type=image%2Fjpeg&access_token=${token}`,
    { method: 'POST' }
  );
  const sessData = await sessRes.json();
  if (!sessData.id) {
    throw new Error(`Falha ao iniciar sessão de upload da imagem: ${JSON.stringify(sessData)}`);
  }

  console.log(`📤 Enviando imagem para a sessão ${sessData.id}...`);
  const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${sessData.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'image/jpeg',
    },
    body: imageBuffer,
  });

  const uploadData = await uploadRes.json();
  if (!uploadData.h) {
    throw new Error(`Falha no upload da imagem: ${JSON.stringify(uploadData)}`);
  }

  console.log(`✅ Image handle obtido: ${uploadData.h.slice(0, 30)}...`);
  return uploadData.h;
}

async function main() {
  const env = loadEnvLocal();
  const token = process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;

  if (!token) {
    console.error('❌ ERRO: WHATSAPP_ACCESS_TOKEN não encontrado.');
    process.exit(1);
  }

  // 1. Upload do banner para obter o handle de exemplo
  const imageHandle = await uploadImageHandle(token);

  // 2. Montar texto do corpo
  // {{1}} = nome do cliente
  // {{2}} = nome do homenageado
  // {{3}} = link da entrega / pedido
  const bodyText =
    '🎉 Olá, {{1}}! Confirmamos o pagamento do seu pedido referente à música de {{2}}.\n\n' +
    'Gravei 2 versões completas em alta qualidade para você escolher sua preferida. ' +
    'Toque nos botões abaixo para baixar os áudios diretamente no seu celular.\n\n' +
    '📱 Página completa do pedido:\n' +
    '{{3}}\n\n' +
    'Muito obrigado pela confiança! Esperamos que a música emocione a todos. 🎶✨';

  // Testando os botões com as 2 URLs dinâmicas e Quick Replies
  const templatePayload = {
    name: TEMPLATE_NAME,
    category: 'UTILITY',
    language: 'pt_BR',
    components: [
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: {
          header_handle: [imageHandle],
        },
      },
      {
        type: 'BODY',
        text: bodyText,
        example: {
          body_text: [
            [
              'Narciso',
              'Maria',
              'https://nsmusic.nsnexus.com.br/entrega?orderId=NS-exemplo-123',
            ],
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
            text: 'Baixar Versão 1',
            url: 'https://nsmusic.nsnexus.com.br/api/audio/v1/{{1}}',
            example: ['https://nsmusic.nsnexus.com.br/api/audio/v1/NS-exemplo-123'],
          },
          {
            type: 'URL',
            text: 'Baixar Versão 2',
            url: 'https://nsmusic.nsnexus.com.br/api/audio/v2/{{1}}',
            example: ['https://nsmusic.nsnexus.com.br/api/audio/v2/NS-exemplo-123'],
          },
          {
            type: 'QUICK_REPLY',
            text: 'Suporte',
          },
          {
            type: 'QUICK_REPLY',
            text: 'Link de Indicação',
          },
        ],
      },
    ],
  };

  console.log(`🚀 Enviando modelo "${TEMPLATE_NAME}" (UTILITY) com BANNER e BOTÕES para a Meta...`);

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
    console.log('✅ SUCESSO! Modelo criado com sucesso na Meta:');
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error('❌ Erro da Meta ao criar modelo:');
    console.error(JSON.stringify(data, null, 2));
    
    // Se o erro for de mixed buttons, testamos apenas com os 2 botões de download
    if (data?.error?.error_user_msg?.includes('botão') || data?.error?.message?.includes('button')) {
      console.log('\n🔄 Tentando envio apenas com os 2 botões de URL (Download Versão 1 e Versão 2)...');
      templatePayload.components[3].buttons = [
        {
          type: 'URL',
          text: 'Baixar Versão 1',
          url: 'https://nsmusic.nsnexus.com.br/api/audio/v1/{{1}}',
          example: ['https://nsmusic.nsnexus.com.br/api/audio/v1/NS-exemplo-123'],
        },
        {
          type: 'URL',
          text: 'Baixar Versão 2',
          url: 'https://nsmusic.nsnexus.com.br/api/audio/v2/{{1}}',
          example: ['https://nsmusic.nsnexus.com.br/api/audio/v2/NS-exemplo-123'],
        },
      ];
      
      const retryRes = await fetch(
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
      const retryData = await retryRes.json();
      console.log('Resultado do retry:', JSON.stringify(retryData, null, 2));
    }
  }
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
