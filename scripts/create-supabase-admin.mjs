#!/usr/bin/env node
/**
 * Cria ou atualiza um usuário administrador no Supabase Auth usando a Service Role Key.
 *
 * Uso:
 *   node scripts/create-supabase-admin.mjs <email> <senha>
 */
import fs from 'fs';
import path from 'path';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2] || 'narcisofelizardo@gmail.com';
const password = process.argv[3];

if (!url || !serviceKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados no .env.local.');
  process.exit(1);
}

if (!password) {
  console.error('Uso: node scripts/create-supabase-admin.mjs <email> <senha>');
  process.exit(1);
}

async function main() {
  console.log(`Verificando usuário ${email} no Supabase Auth...`);

  const listRes = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  if (!listRes.ok) {
    const txt = await listRes.text();
    throw new Error(`Falha ao listar usuários (HTTP ${listRes.status}): ${txt}`);
  }

  const listData = await listRes.json();
  const existing = listData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    console.log(`Usuário encontrado (ID: ${existing.id}). Atualizando senha e metadados admin...`);
    const updateRes = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password,
        email_confirm: true,
        app_metadata: { role: 'admin' },
        user_metadata: { role: 'admin' }
      })
    });

    if (!updateRes.ok) {
      const txt = await updateRes.text();
      throw new Error(`Falha ao atualizar usuário (HTTP ${updateRes.status}): ${txt}`);
    }

    console.log(`✅ Senha atualizada com sucesso para ${email}!`);
  } else {
    console.log(`Criando novo usuário ${email}...`);
    const createRes = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'admin' },
        user_metadata: { role: 'admin' }
      })
    });

    if (!createRes.ok) {
      const txt = await createRes.text();
      throw new Error(`Falha ao criar usuário (HTTP ${createRes.status}): ${txt}`);
    }

    const created = await createRes.json();
    console.log(`✅ Usuário ${email} criado com sucesso (ID: ${created.id}) com papel admin!`);
  }
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
