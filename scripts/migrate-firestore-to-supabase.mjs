#!/usr/bin/env node
/**
 * Script de Migração Histórica: Firestore -> Supabase (PostgreSQL)
 * 
 * Migra os ~3.200 pedidos e suno_tasks do Firestore para as tabelas do Supabase.
 * - Suporta --dry-run (padrão) para simular sem gravar nada no Supabase.
 * - Suporta --apply para efetivar a gravação.
 * - Suporta --limit <n> para testar com uma amostra menor (ex: --limit 10).
 * - Totalmente idempotente (usa upsert por id).
 * 
 * Uso:
 *   node scripts/migrate-firestore-to-supabase.mjs              # Simulação (dry-run)
 *   node scripts/migrate-firestore-to-supabase.mjs --limit 10   # Simula com 10 pedidos
 *   node scripts/migrate-firestore-to-supabase.mjs --apply      # Executa a migração real
 */

import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { NativeSupabaseClient } from '../src/lib/supabase-edge.js';
import { mapFirestoreOrderToSupabase } from '../src/lib/supabaseSync.js';

function toIsoDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') {
    try { return val.toDate().toISOString(); } catch { return null; }
  }
  if (val instanceof Date) return val.toISOString();
  return null;
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

const isDryRun = !process.argv.includes('--apply');
const limitArgIdx = process.argv.indexOf('--limit');
const customLimit = limitArgIdx !== -1 ? parseInt(process.argv[limitArgIdx + 1], 10) : null;

async function run() {
  console.log('='.repeat(70));
  console.log(` MIGRAÇÃO HISTÓRICA: FIRESTORE -> SUPABASE [${isDryRun ? 'DRY-RUN / SIMULAÇÃO' : 'APLICAÇÃO REAL'}]`);
  console.log('='.repeat(70));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERRO: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env.local.');
    console.error('Configure as credenciais do Supabase antes de rodar o script.');
    process.exit(1);
  }

  const supabase = new NativeSupabaseClient(supabaseUrl, supabaseKey);

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!firebaseConfig.projectId) {
    console.error('ERRO: Configuração do Firebase incompleta no .env.local.');
    process.exit(1);
  }

  const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  const db = getFirestore(fbApp);

  console.log(`- Supabase URL: ${supabaseUrl}`);
  console.log(`- Firebase Project: ${firebaseConfig.projectId}`);
  console.log(`- Modo: ${isDryRun ? 'Dry-run (nenhum dado será alterado)' : 'REAL (--apply ativado)'}`);
  if (customLimit) console.log(`- Limite: ${customLimit} documentos`);
  console.log('-'.repeat(70));

  // 1. Migração de Orders
  console.log('\n[1/2] Lendo pedidos do Firestore...');
  const ordersRef = collection(db, 'orders');
  const ordersQuery = customLimit 
    ? query(ordersRef, orderBy('createdAt', 'desc'), firestoreLimit(customLimit))
    : query(ordersRef, orderBy('createdAt', 'desc'));

  let ordersSnap;
  try {
    ordersSnap = await getDocs(ordersQuery);
  } catch (err) {
    console.error('Erro ao ler pedidos do Firestore:', err.message);
    process.exit(1);
  }

  console.log(`-> ${ordersSnap.size} pedidos encontrados no Firestore.`);

  let ordersSuccess = 0;
  let ordersErrors = 0;
  let paymentsExtracted = 0;

  const ordersBatch = [];
  const paymentsBatch = [];

  for (const docSnap of ordersSnap.docs) {
    const data = docSnap.data();
    const orderId = docSnap.id;
    const mappedOrder = mapFirestoreOrderToSupabase(orderId, data);
    ordersBatch.push(mappedOrder);

    // Extrai pagamentos históricos APENAS para pedidos que foram realmente pagos
    const isPaid = (data.paymentStatus === 'PAGO' || data.paymentStatus === 'PAGAMENTO_APROVADO' || data.paymentStatus === 'approved');

    if (isPaid) {
      const confirmedTxid = String(data.paymentId || data.mpPaymentId || data.paymentIntentId || `legacy_${orderId}`);
      const skuByTxid = data.paymentIntentSkuByTxid || {};
      const amountByTxid = data.paymentIntentAmountByTxid || {};
      const sku = data.paidSku 
        || skuByTxid[confirmedTxid] 
        || data.paymentIntentSku 
        || 'audio_only';

      let kind = 'musica';
      if (sku.includes('video') && !sku.includes('combo')) kind = 'video';
      else if (sku.includes('carta')) kind = 'carta';
      else if (sku.includes('retrospectiva')) kind = 'retrospectiva';
      else if (sku.includes('playback')) kind = 'playback';

      const amount = Number(data.paidAmount) 
        || Number(amountByTxid[confirmedTxid]) 
        || (sku === 'combo' ? 16.89 : (Number(data.total) || 9.99));

      const paidAt = mappedOrder.paid_at || toIsoDate(data.paidAt) || mappedOrder.created_at;

      paymentsBatch.push({
        order_id: orderId,
        kind,
        sku,
        txid: confirmedTxid,
        amount,
        paid_at: paidAt
      });
    }

    // Addons comprados separadamente (avulsos após a compra da música)
    const confirmedMusicTxid = String(data.paymentId || data.mpPaymentId || data.paymentIntentId || '');
    const addons = [
      { key: 'video', flag: Boolean(data.videoAddonPaid || data.hasVideoAccess), id: data.videoPaymentId, amount: data.videoPaidAmount || 6.90, at: data.videoPaidAt },
      { key: 'playback', flag: Boolean(data.playbackAddonPaid || data.hasPlaybackAccess), id: data.playbackPaymentId, amount: data.playbackPaidAmount || 6.90, at: data.playbackPaidAt },
      { key: 'carta', flag: Boolean(data.cartaAddonPaid || data.hasCartaAccess), id: data.cartaPaymentId, amount: data.cartaPaidAmount || 6.90, at: data.cartaPaidAt },
      { key: 'retrospectiva', flag: Boolean(data.retrospectivaAddonPaid || data.hasRetrospectivaAccess), id: data.retrospectivaPaymentId, amount: data.retrospectivaPaidAmount || 6.90, at: data.retrospectivaPaidAt },
    ];

    for (const a of addons) {
      if (a.flag && a.id && String(a.id) !== confirmedMusicTxid) {
        paymentsBatch.push({
          order_id: orderId,
          kind: a.key,
          sku: `${a.key}_addon`,
          txid: String(a.id),
          amount: Number(a.amount) || 6.90,
          paid_at: toIsoDate(a.at) || mappedOrder.paid_at || mappedOrder.created_at
        });
      }
    }
  }

  // Deduplicação estrita de pagamentos por (txid, kind)
  const seenPayments = new Set();
  const dedupedPaymentsBatch = [];
  for (const p of paymentsBatch) {
    if (!p.txid || !p.paid_at) continue;
    const key = `${p.txid}:${p.kind}`;
    if (seenPayments.has(key)) continue;
    seenPayments.add(key);
    dedupedPaymentsBatch.push(p);
  }

  console.log(`-> Mapeados ${ordersBatch.length} pedidos e ${dedupedPaymentsBatch.length} transações pagas confirmadas.`);

  // Gravação em lotes (chunks de 50)
  const CHUNK_SIZE = 50;

  if (!isDryRun) {
    console.log('\nGravando pedidos no Supabase...');
    for (let i = 0; i < ordersBatch.length; i += CHUNK_SIZE) {
      const chunk = ordersBatch.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from('orders').upsert(chunk, { onConflict: 'id' });
      if (error) {
        console.error(`Erro no lote ${i} a ${i + chunk.length}:`, error.message);
        ordersErrors += chunk.length;
      } else {
        ordersSuccess += chunk.length;
        process.stdout.write(`\rPedidos gravados: ${ordersSuccess}/${ordersBatch.length}`);
      }
    }
    console.log('\nPedidos concluídos!');

    if (dedupedPaymentsBatch.length > 0) {
      console.log('\nGravando pagamentos no Supabase...');
      let paymentsSuccess = 0;
      for (let i = 0; i < dedupedPaymentsBatch.length; i += CHUNK_SIZE) {
        const chunk = dedupedPaymentsBatch.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('payments').upsert(chunk, { onConflict: 'txid,kind' });
        if (error) {
          console.warn(`Aviso no lote de pagamentos ${i}:`, error.message);
        } else {
          paymentsSuccess += chunk.length;
          process.stdout.write(`\rPagamentos gravados: ${paymentsSuccess}/${dedupedPaymentsBatch.length}`);
        }
      }
      console.log('\nPagamentos concluídos!');
    }
  } else {
    console.log(`[DRY-RUN] Simulação concluída com sucesso para os pedidos. Nenhum dado gravado.`);
  }

  // 2. Migração de Suno Tasks
  console.log('\n[2/2] Lendo suno_tasks do Firestore...');
  const tasksRef = collection(db, 'suno_tasks');
  const tasksQuery = customLimit
    ? query(tasksRef, firestoreLimit(customLimit))
    : query(tasksRef);

  let tasksSnap;
  try {
    tasksSnap = await getDocs(tasksQuery);
    console.log(`-> ${tasksSnap.size} tasks encontradas no Firestore.`);
  } catch (err) {
    console.warn('Aviso: Não foi possível listar suno_tasks completas:', err.message);
  }

  if (tasksSnap && tasksSnap.size > 0) {
    const knownOrderIds = new Set(ordersBatch.map(o => o.id));
    const tasksBatch = [];
    for (const docSnap of tasksSnap.docs) {
      const data = docSnap.data();
      const hasValidOrder = data.orderId && knownOrderIds.has(data.orderId);
      tasksBatch.push({
        id: docSnap.id,
        order_id: hasValidOrder ? data.orderId : null,
        status: data.status || 'PENDING',
        provider: data.provider || null,
        clip_ids: Array.isArray(data.clipIds) ? data.clipIds : [],
        result: (data.result && typeof data.result === 'object') ? data.result : null,
        retry_task_id: data.retryTaskId || null,
        updated_at: data.updatedAt || new Date().toISOString()
      });
    }

    if (!isDryRun) {
      console.log('Gravando suno_tasks no Supabase...');
      let tasksSuccess = 0;
      for (let i = 0; i < tasksBatch.length; i += CHUNK_SIZE) {
        const chunk = tasksBatch.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('suno_tasks').upsert(chunk, { onConflict: 'id' });
        if (error) {
          console.warn(`Aviso no lote de tasks ${i}:`, error.message);
        } else {
          tasksSuccess += chunk.length;
          process.stdout.write(`\rTasks gravadas: ${tasksSuccess}/${tasksBatch.length}`);
        }
      }
      console.log('\nTasks concluídas!');
    } else {
      console.log(`[DRY-RUN] Simulação concluída com sucesso para as ${tasksBatch.length} tasks.`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(' RESUMO DA OPERAÇÃO');
  console.log('='.repeat(70));
  console.log(`- Total de pedidos processados: ${ordersBatch.length}`);
  console.log(`- Total de pagamentos identificados: ${paymentsBatch.length}`);
  console.log(`- Status: ${isDryRun ? 'SIMULAÇÃO OK' : (ordersErrors === 0 ? 'SUCESSO TOTAL' : 'CONCLUÍDO COM ERROS')}`);
  console.log('='.repeat(70));
}

run().catch((err) => {
  console.error('Falha fatal na execução da migração:', err);
  process.exit(1);
});
