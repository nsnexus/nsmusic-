#!/usr/bin/env node
/**
 * Registra a URL de webhook do Pix na Efí (PUT /v2/webhook/:chave) — passo único de configuração,
 * feito uma vez por chave Pix. Ver docs/EFI_SETUP.md para o passo a passo completo.
 *
 * ⚠️ NÃO EXECUTADO NESTA SESSÃO (sem credenciais/certificado reais).
 * ⚠️ NUNCA commite o certificado .p12/.pem nem os arquivos convertidos.
 *
 * Essa chamada também exige mTLS (mesma exigência de toda a API Pix da Efí) — por isso é um script
 * local com o certificado no disco, e não uma rota do próprio app (o binding `mtls_certificate` do
 * Cloudflare só existe dentro do runtime deployado).
 *
 * Uso (com certificado em PEM, gerado via `openssl pkcs12 -in cert.p12 ...`, ver docs/EFI_SETUP.md):
 *   EFI_CLIENT_ID=... EFI_CLIENT_SECRET=... EFI_PIX_KEY=... EFI_ENV=sandbox \
 *   EFI_CERT_PATH=./cert.pem EFI_KEY_PATH=./key.pem \
 *   EFI_WEBHOOK_URL="https://nsmusic.nsnexus.com.br/api/webhooks/efi?secret=SEU_SEGREDO" \
 *     node scripts/register-efi-webhook.mjs
 */
import https from 'node:https';
import fs from 'node:fs';

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Variável de ambiente ${name} não definida.`);
    process.exit(1);
  }
  return value;
}

function requestJson({ hostname, path, method, headers, agent }, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method, headers, agent },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch (e) {}
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const clientId = readEnv('EFI_CLIENT_ID');
  const clientSecret = readEnv('EFI_CLIENT_SECRET');
  const pixKey = readEnv('EFI_PIX_KEY');
  const webhookUrl = readEnv('EFI_WEBHOOK_URL');
  const certPath = readEnv('EFI_CERT_PATH');
  const keyPath = readEnv('EFI_KEY_PATH');
  const env = process.env.EFI_ENV === 'production' ? 'production' : 'sandbox';

  const hostname = env === 'production' ? 'pix.api.efipay.com.br' : 'pix-h.api.efipay.com.br';

  const agent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  console.log(`Autenticando na Efí (${env})...`);
  const tokenData = await requestJson(
    {
      hostname,
      path: '/oauth/token',
      method: 'POST',
      agent,
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
    },
    { grant_type: 'client_credentials' }
  );

  if (!tokenData?.access_token) {
    throw new Error('Resposta de autenticação sem access_token.');
  }

  console.log(`Registrando webhook para a chave Pix informada...`);
  await requestJson(
    {
      hostname,
      path: `/v2/webhook/${encodeURIComponent(pixKey)}?ignorar=true`,
      method: 'PUT',
      agent,
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    },
    { webhookUrl }
  );

  console.log(`Webhook registrado com sucesso: ${webhookUrl}`);
}

main().catch((err) => {
  console.error('Falha ao registrar o webhook na Efí:', err.message);
  process.exit(1);
});
