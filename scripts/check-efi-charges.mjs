#!/usr/bin/env node
// Diagnóstico pontual (somente leitura) — consulta o status real de um ou mais txids direto na
// Efí, para investigar um caso de suporte sem confiar em nenhum campo do Firestore.
//
// IMPORTANTE: usa as credenciais EFI_* do .env.local (sandbox, por padrão neste repo). Um txid de
// pedido REAL de cliente foi cobrado em PRODUÇÃO — consultar com credenciais de sandbox sempre
// retorna "cobranca_nao_encontrada", mesmo a cobrança sendo real e paga (ambientes são bancos de
// dados completamente separados na Efí). Pra pedidos reais, prefira consultar via
// /api/payments/status do site publicado (usa as credenciais de produção configuradas no Cloudflare
// Pages, sem expor nenhum segredo aqui) — ver scripts/investigate-order.mjs pra achar o pedido e os
// txids primeiro. Só use este script com credenciais de produção no ambiente se precisar consultar
// (não aprovar) um txid fora do fluxo normal do site.
//
// Uso:
//   node scripts/check-efi-charges.mjs TXID1 TXID2 TXID3

import { readFileSync, existsSync } from 'node:fs';

// Reimplementação mínima de getChargeStatus (src/lib/efi.js) — o original não roda em Node puro
// porque seus imports relativos (ex: './httpRetry') não têm extensão .js, exigida pela resolução
// ESM nativa do Node fora de bundlers como o do Next.js.
function readEnvValue(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

function getBaseUrl(env) {
  const mode = readEnvValue(env, 'EFI_ENV') || 'sandbox';
  return mode === 'production' ? 'https://pix.api.efipay.com.br' : 'https://pix-h.api.efipay.com.br';
}

function getRelayFetch(env) {
  const proxyUrl = readEnvValue(env, 'EFI_PROXY_URL');
  const proxySecret = readEnvValue(env, 'EFI_PROXY_SECRET');
  if (!proxyUrl || !proxySecret) {
    throw new Error('EFI_PROXY_URL/EFI_PROXY_SECRET não configurados neste ambiente.');
  }
  const efiEnv = readEnvValue(env, 'EFI_ENV') || 'sandbox';
  return async (efiUrl, options = {}) => {
    const path = new URL(efiUrl).pathname;
    return fetch(`${proxyUrl}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Efi-Proxy-Secret': proxySecret },
      body: JSON.stringify({ env: efiEnv, path, method: options.method || 'GET', headers: options.headers || {}, body: options.body || null }),
      signal: options.signal,
    });
  };
}

async function getAccessToken(env) {
  const clientId = readEnvValue(env, 'EFI_CLIENT_ID');
  const clientSecret = readEnvValue(env, 'EFI_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('EFI_CLIENT_ID/EFI_CLIENT_SECRET não configurados.');
  const relayFetch = getRelayFetch(env);
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await relayFetch(`${getBaseUrl(env)}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Falha ao autenticar na Efí (HTTP ${res.status}): ${await res.text().catch(() => '')}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('Resposta de autenticação da Efí sem access_token.');
  return data.access_token;
}

async function getChargeStatus(txid, env) {
  if (!txid) return null;
  const accessToken = await getAccessToken(env);
  const relayFetch = getRelayFetch(env);
  const res = await relayFetch(`${getBaseUrl(env)}/v2/cob/${txid}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Falha ao consultar cobrança Pix na Efí (HTTP ${res.status}): ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

function loadEnvLocal() {
  const path = '.env.local';
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const txids = process.argv.slice(2);
if (txids.length === 0) {
  console.error('Uso: node scripts/check-efi-charges.mjs TXID1 [TXID2 ...]');
  process.exit(1);
}

async function main() {
  for (const txid of txids) {
    try {
      const charge = await getChargeStatus(txid, process.env);
      if (!charge) {
        console.log(`${txid}: NAO ENCONTRADO na Efi`);
        continue;
      }
      console.log(`${txid}: status=${charge.status} valor=${charge.valor?.original} criacao=${charge.calendario?.criacao}`);
    } catch (err) {
      console.log(`${txid}: ERRO - ${err.message}`);
    }
  }
}

main();
