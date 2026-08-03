#!/usr/bin/env node
// Diagnóstico pontual (somente leitura) — busca pedidos pelo telefone do cliente e mostra o estado
// de pagamento/liberação do vídeo. Não grava nada.
//
// Uso:
//   GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json node investigate-order.mjs "(19) 99826-2405"

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const phoneArg = process.argv[2];
if (!phoneArg) {
  console.error('Uso: node investigate-order.mjs "(19) 99826-2405"');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main() {
  const snap = await db.collection('orders').where('customerPhone', '==', phoneArg).get();

  if (snap.empty) {
    console.log(`Nenhum pedido encontrado com customerPhone === "${phoneArg}".`);
    console.log('Tentando variações de formatação...');
    const digits = phoneArg.replace(/\D/g, '');
    const variants = new Set([
      digits,
      `55${digits}`,
      digits.length === 11 ? `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}` : null,
      digits.length === 10 ? `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}` : null,
    ].filter(Boolean));
    for (const v of variants) {
      const s2 = await db.collection('orders').where('customerPhone', '==', v).get();
      if (!s2.empty) {
        console.log(`Encontrado com a variação "${v}":`);
        printOrders(s2);
        return;
      }
    }
    console.log('Nada encontrado nas variações testadas. Pode ser necessário buscar por e-mail ou nome.');
    return;
  }

  printOrders(snap);
}

function printOrders(snap) {
  snap.forEach((doc) => {
    const o = doc.data();
    console.log('\n=== Pedido', doc.id, '===');
    console.log('honoreeName:', o.honoreeName);
    console.log('createdAt:', o.createdAt);
    console.log('deletedAt:', o.deletedAt || '(nao excluido)');
    console.log('--- Pagamento música ---');
    console.log('paymentStatus:', o.paymentStatus);
    console.log('paymentId:', o.paymentId);
    console.log('paymentIntentId:', o.paymentIntentId);
    console.log('paymentIntentSku:', o.paymentIntentSku);
    console.log('expectedAmount:', o.expectedAmount);
    console.log('previousPaymentIntentIds:', o.previousPaymentIntentIds);
    console.log('total:', o.total, '| package:', o.package);
    console.log('--- Video ---');
    console.log('hasVideoAccess:', o.hasVideoAccess);
    console.log('videoAddonPaid:', o.videoAddonPaid);
    console.log('videoPaymentId:', o.videoPaymentId);
    console.log('videoStatus:', o.videoStatus);
    console.log('videoUrl:', o.videoUrl ? '(presente)' : '(ausente)');
  });
}

main().catch((err) => {
  console.error('Erro na consulta:', err.message);
  process.exit(1);
});
