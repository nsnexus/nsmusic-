/**
 * Utilitário para verificar o status de aprovação dos modelos de mensagem da Meta (WhatsApp Cloud API).
 *
 * Uso:
 *   node scripts/check-whatsapp-templates.mjs
 */

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
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_PHONE_NUMBER_ID || '1266330313237394';

  if (!token) {
    console.error('❌ ERRO: WHATSAPP_ACCESS_TOKEN não encontrado em .env.local nem no ambiente.');
    process.exit(1);
  }

  console.log('🔍 Consultando WhatsApp Cloud API (Meta)...');
  console.log(`📱 Conta WABA: ${WABA_ID}`);
  console.log(`📞 Phone Number ID: ${phoneId}\n`);

  try {
    // 1. Status do número de telefone
    const phoneRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=id,verified_name,display_phone_number,code_verification_status,quality_rating`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (phoneRes.ok) {
      const phoneData = await phoneRes.json();
      console.log('✅ STATUS DO NÚMERO:');
      console.log(`   Número: ${phoneData.display_phone_number}`);
      console.log(`   Nome Verificado: ${phoneData.verified_name}`);
      console.log(`   Verificação: ${phoneData.code_verification_status}`);
      console.log(`   Qualidade: ${phoneData.quality_rating}\n`);
    } else {
      const err = await phoneRes.json().catch(() => ({}));
      console.warn('⚠️ Não foi possível ler detalhes do telefone:', err?.error?.message || phoneRes.statusText);
    }

    // 2. Consulta dos Modelos de Mensagem (Templates)
    const tplRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WABA_ID}/message_templates?fields=id,name,status,category,language&limit=100`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!tplRes.ok) {
      const err = await tplRes.json().catch(() => ({}));
      console.error('❌ Erro ao consultar templates:', err?.error?.message || tplRes.statusText);
      process.exit(1);
    }

    const tplData = await tplRes.json();
    const templates = tplData.data || [];

    console.log(`📋 MODELOS CADASTRADOS (${templates.length}):`);
    console.log(''.padEnd(70, '-'));

    let readyCount = 0;
    for (const t of templates) {
      let icon = '⏳';
      if (t.status === 'APPROVED') {
        icon = '✅';
        readyCount++;
      } else if (t.status === 'REJECTED') {
        icon = '❌';
      }

      console.log(`${icon} [${t.status}] ${t.name} (ID: ${t.id})`);
      console.log(`   Categoria: ${t.category} | Idioma: ${t.language}`);
      console.log(''.padEnd(70, '-'));
    }

    console.log(`\nResumo: ${readyCount}/${templates.length} modelos aprovados.`);

    if (readyCount >= 2) {
      console.log('🎉 Os modelos oficiais estão APROVADOS e prontos para uso em produção!');
    } else {
      console.log('⏳ Alguns modelos ainda estão em análise (PENDING) pela Meta.');
      console.log('   O robô da Meta costuma concluir a análise em alguns minutos.');
    }

  } catch (err) {
    console.error('❌ Falha na conexão com a Graph API:', err.message);
  }
}

main();
