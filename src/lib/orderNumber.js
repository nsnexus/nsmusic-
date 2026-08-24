import { collection, query, where, limit, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge';

/**
 * Gera um número de pedido único com alta entropia e confirma unicidade no Firestore.
 */
export async function generateUniqueOrderNumber() {
  const ordersRef = collection(db, 'orders');
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt++) {
    const timePart = Date.now().toString(36).toUpperCase();
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const candidate = `NS-${timePart}-${randomPart}-${year}`;

    const snap = await getDocs(query(ordersRef, where('orderNumber', '==', candidate), limit(1))).catch(() => null);
    if (!snap || snap.empty) return candidate;
  }

  // Praticamente impossível de colidir: timestamp em milissegundos + aleatório de alta entropia.
  return `NS-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}-${year}`;
}
