// Read-only deployment preflight. Prints schema names only, never credentials/customer rows.
import fs from 'node:fs';
const env = { ...process.env };
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Configuracao do servidor Supabase ausente.');
try {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Schema HTTP ${response.status}`);
  const schema = await response.json();
  const functions = ['customer_credit_summary', 'customer_second_song_offer', 'reserve_credit_purchase',
    'reserve_order_payment', 'record_order_payment_intent', 'claim_order_for_customer',
    'reserve_order_claim_code', 'verify_order_claim_code', 'reconcile_pending_referrals'];
  const missing = functions.filter(name => !schema.paths?.[`/rpc/${name}`]);
  for (const column of ['source_order_id', 'request_key', 'qr_code']) {
    if (!schema.definitions?.credit_purchases?.properties?.[column]) missing.push(`credit_purchases.${column}`);
  }
  for (const table of ['order_payment_intents', 'order_claim_codes']) {
    if (!schema.paths?.[`/${table}`]) missing.push(table);
  }
  if (missing.length) throw new Error(`Estrutura ausente: ${missing.join(', ')}`);
  console.log('EXPERIENCE_SCHEMA_PRESENT: funcoes, tabelas e colunas disponiveis. Nenhum dado alterado.');
} catch (error) {
  console.error(error.cause?.code || error.message);
  process.exitCode = 1;
}
