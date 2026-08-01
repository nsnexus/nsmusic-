#!/usr/bin/env node
/**
 * Migração M-01 — normaliza `paymentStatus` para os dois valores oficiais
 * (AGUARDANDO_PAGAMENTO, PAGAMENTO_APROVADO), convertendo os registros que hoje têm 'PAGO'
 * (valor que só era gravado pelo cliente — ver C-01 no AUDIT_REPORT.md, removido no Lote 2).
 *
 * ⚠️ GRAVA EM PRODUÇÃO. NÃO EXECUTE SEM AUTORIZAÇÃO EXPLÍCITA DO RESPONSÁVEL PELO PROJETO.
 * ⚠️ Rode ANTES de publicar o firestore.rules restritivo do Lote 3 — regras restritas podem impedir
 *    este script (que usa o SDK cliente, sem Admin SDK) de escrever.
 *
 * Uso:
 *   node scripts/migrate-payment-status.mjs            # dry-run — só lista, não grava nada
 *   node scripts/migrate-payment-status.mjs --apply     # grava de verdade
 *
 * Requer as variáveis NEXT_PUBLIC_FIREBASE_* em .env.local (ou no ambiente) apontando para o
 * projeto Firebase real — NÃO rode isso com as credenciais fictícias de build local.
 *
 * Gera um log em scripts/migration-logs/ com os IDs alterados, para permitir reverter com
 * scripts/revert-payment-status-migration.mjs.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

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

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes('local')) {
    console.error('NEXT_PUBLIC_FIREBASE_PROJECT_ID ausente ou aponta para o projeto fictício de build local.');
    console.error('Configure as variáveis do projeto Firebase REAL antes de rodar esta migração.');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const ordersRef = collection(db, 'orders');
  const snap = await getDocs(query(ordersRef, where('paymentStatus', '==', 'PAGO')));

  console.log(`Encontrados ${snap.size} pedido(s) com paymentStatus === 'PAGO'.`);

  if (snap.size === 0) {
    console.log('Nada a migrar.');
    return;
  }

  const ids = snap.docs.map((d) => d.id);
  ids.forEach((id) => console.log(` - ${id}`));

  if (DRY_RUN) {
    console.log('\nDRY RUN — nada foi gravado. Rode com --apply para migrar de verdade.');
    return;
  }

  let updated = 0;
  for (const id of ids) {
    await updateDoc(doc(db, 'orders', id), {
      paymentStatus: 'PAGAMENTO_APROVADO',
      updatedAt: new Date().toISOString(),
    });
    updated++;
  }

  const logDir = 'scripts/migration-logs';
  mkdirSync(logDir, { recursive: true });
  const logPath = `${logDir}/migrate-payment-status-${Date.now()}.json`;
  writeFileSync(logPath, JSON.stringify({ migratedAt: new Date().toISOString(), orderIds: ids }, null, 2));

  console.log(`\n${updated} pedido(s) migrado(s) de PAGO para PAGAMENTO_APROVADO.`);
  console.log(`Log salvo em ${logPath} — use-o com revert-payment-status-migration.mjs para reverter.`);
}

main().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
