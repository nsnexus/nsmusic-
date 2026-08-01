#!/usr/bin/env node
/**
 * Reverte a migração de scripts/migrate-payment-status.mjs, usando o log de IDs gerado por ela.
 *
 * ⚠️ GRAVA EM PRODUÇÃO. NÃO EXECUTE SEM AUTORIZAÇÃO EXPLÍCITA.
 *
 * Uso:
 *   node scripts/revert-payment-status-migration.mjs scripts/migration-logs/migrate-payment-status-<ts>.json
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

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

const logPath = process.argv[2];
if (!logPath || !existsSync(logPath)) {
  console.error('Uso: node scripts/revert-payment-status-migration.mjs <caminho-do-log.json>');
  process.exit(1);
}

async function main() {
  const { orderIds } = JSON.parse(readFileSync(logPath, 'utf-8'));
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    console.log('Nenhum orderId no log. Nada a reverter.');
    return;
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  for (const id of orderIds) {
    await updateDoc(doc(db, 'orders', id), {
      paymentStatus: 'PAGO',
      updatedAt: new Date().toISOString(),
    });
    console.log(` - ${id} revertido para PAGO`);
  }

  console.log(`\n${orderIds.length} pedido(s) revertido(s).`);
}

main().catch((err) => {
  console.error('Falha ao reverter:', err);
  process.exit(1);
});
