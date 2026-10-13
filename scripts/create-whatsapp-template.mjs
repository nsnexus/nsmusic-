import fs from 'fs';
import path from 'path';

const WABA_ID = '2160994021495241';
const GRAPH_VERSION = 'v21.0';

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
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const token = process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;

  if (!token) {
    console.error('❌ ERRO: WHATSAPP_ACCESS_TOKEN não encontrado.');
    process.exit(1);
  }

  const templatePayload = {
    name: 'confirmacao_pagamento_downloads',
    category: 'UTILITY',
    language: 'pt_BR',
    components: [
      {
        type: 'BODY',
        text: 'Olá, {{1}}. Confirmamos o pagamento do seu pedido referente à música de {{2}}.\n\nBaixe suas versões completas nos links abaixo:\nVersão 1: {{3}}\nVersão 2: {{4}}\n\nAcesse a página completa do seu pedido:\n{{5}}\n\nCaso precise de suporte no WhatsApp, acesse o link {{6}} para falar com nossa equipe.',
        example: {
          body_text: [
            [
              'Narciso',
              'Maria',
              'https://nsmusic.ia.br/api/audio/proxy?url=https%3A%2F%2Fcdn.nsmusic.ia.br%2Fmusica1.mp3&download=musica1.mp3',
              'https://nsmusic.ia.br/api/audio/proxy?url=https%3A%2F%2Fcdn.nsmusic.ia.br%2Fmusica2.mp3&download=musica2.mp3',
              'https://nsmusic.ia.br/entrega?orderId=NS-1234',
              'https://wa.me/5594991081351'
            ]
          ]
        }
      }
    ]
  };

  console.log(`🚀 Enviando criação do modelo para a Meta (WABA: ${WABA_ID})...`);
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WABA_ID}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(templatePayload)
  });

  const data = await res.json();

  if (res.ok) {
    console.log('✅ SUCESSO! Modelo criado na Meta:');
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error('❌ Erro da Meta ao criar modelo:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
}

main();
