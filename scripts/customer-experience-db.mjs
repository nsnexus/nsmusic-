// Schema-only diagnostics and additive migration via Supabase Management API.
// No customer rows are printed. --validate always rolls back the complete migration.
import fs from 'node:fs';

const mode = process.argv[2] || '--check';
if (!['--check', '--validate', '--apply'].includes(mode)) throw new Error('Modo inválido.');
const env = { ...process.env };
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
if (!env.SUPABASE_ACCESS_TOKEN || !env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Credenciais de administração do banco indisponíveis.');
const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
let query = "select table_name,column_name,data_type from information_schema.columns where table_schema='public' and ((table_name='orders' and column_name in ('user_id','paid_at','has_karaoke_access')) or table_name in ('credit_accounts','credit_purchases','credit_ledger','referrals','payments')) order by table_name,ordinal_position";
if (mode !== '--check') {
  const migration = fs.readFileSync('supabase/migrations/20261019_customer_experience.sql', 'utf8').replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, '');
  query = `begin;\n${migration}\n${mode === '--apply' ? 'commit' : 'rollback'};`;
}
try {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error(`Schema check HTTP ${response.status}: ${body.message || 'consulta recusada'}`);
    process.exitCode = 1;
  } else {
    if (mode === '--check') console.log(JSON.stringify(await response.json()));
    else console.log(mode === '--validate' ? 'MIGRATION_VALIDATED_AND_ROLLED_BACK' : 'MIGRATION_APPLIED');
  }
} catch (error) {
  console.error(`Schema connection failed: ${error.cause?.code || error.message}`);
  process.exitCode = 1;
}
