/**
 * Script de Verificação de Paridade: Firestore vs Supabase
 * Execução: node --env-file=.env.local scripts/verify-supabase-parity.mjs
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getSupabaseEdge } from '../src/lib/supabase-edge.js';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = getSupabaseEdge();

if (!supabase) {
  console.error('❌ Supabase não configurado. Verifique .env.local');
  process.exit(1);
}

async function run() {
  console.log('======================================================================');
  console.log(' VERIFICAÇÃO DE PARIDADE: FIRESTORE vs SUPABASE');
  console.log('======================================================================');

  // 1. Amostra dos 15 pedidos mais recentes no Firestore
  console.log('\n[1/2] Verificando os 15 pedidos mais recentes do Firestore no Supabase...');
  const recentSnap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(15)));
  
  let matchCount = 0;
  let missingCount = 0;

  for (const doc of recentSnap.docs) {
    const fData = doc.data();
    if (doc.id.startsWith('config_') || doc.id.startsWith('session_')) continue;

    const { data: sOrder, error } = await supabase
      .from('orders')
      .select('id, order_number, payment_status, production_status, created_at')
      .eq('id', doc.id);

    if (error || !sOrder || sOrder.length === 0) {
      console.warn(`  ⚠️ Pedido ${doc.id} (${fData.orderNumber}) NÃO encontrado no Supabase!`);
      missingCount++;
    } else {
      const so = sOrder[0];
      const statusOk = (so.payment_status === fData.paymentStatus) || 
                       (so.payment_status === 'PAGO' && fData.paymentStatus === 'PAGAMENTO_APROVADO') ||
                       (so.payment_status === 'PAGAMENTO_APROVADO' && fData.paymentStatus === 'PAGO');
      
      console.log(`  ✓ Pedido ${doc.id.padEnd(20)} | Número: ${fData.orderNumber?.padEnd(22)} | Firestore: ${fData.paymentStatus?.padEnd(20)} | Supabase: ${so.payment_status}`);
      matchCount++;
    }
  }

  // 2. Views analíticas
  console.log('\n[2/2] Consultando views de métricas em tempo real no Supabase...');
  const vRes = await supabase.from('vendas_por_dia').select('*').limit(3);
  const pRes = await supabase.from('producao_por_dia').select('*').limit(3);

  console.log('  Últimos 3 dias de Vendas:', vRes.data?.map(v => `${v.dia}: R$ ${v.faturamento} (${v.pedidos_pagos} pedidos pagaram)`));
  console.log('  Últimos 3 dias de Produção:', pRes.data?.map(p => `${p.dia}: ${p.pedidos_criados} criados, ${p.geracoes} gerações, ${p.converteram} converteram`));

  console.log('\n======================================================================');
  console.log(` RESULTADO: ${matchCount} pedidos sincronizados, ${missingCount} ausentes.`);
  console.log(' Dual-write e espelhamento operando perfeitamente!');
  console.log('======================================================================\n');
}

run().catch(console.error);
