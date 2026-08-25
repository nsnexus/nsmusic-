import { collection, query, where, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';

/**
 * Gera todas as variações possíveis de um número de telefone brasileiro
 * (com/sem 55, com/sem o 9º dígito) para busca precisa no banco de dados.
 */
export function generatePhoneVariants(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits || digits.length < 8) return [];

  const variants = new Set();
  variants.add(digits);

  // Se começa com DDI 55
  if (digits.startsWith('55') && digits.length >= 12) {
    const without55 = digits.substring(2);
    variants.add(without55);

    // DDD + 9 dígitos (ex: 94 9 91064043)
    if (without55.length === 11 && without55[2] === '9') {
      const withoutNine = without55.substring(0, 2) + without55.substring(3);
      variants.add(withoutNine);
      variants.add('55' + withoutNine);
    } else if (without55.length === 10) {
      // DDD + 8 dígitos (ex: 94 91064043)
      const withNine = without55.substring(0, 2) + '9' + without55.substring(2);
      variants.add(withNine);
      variants.add('55' + withNine);
    }
  } else if (digits.length === 11 && digits[2] === '9') {
    variants.add('55' + digits);
    const withoutNine = digits.substring(0, 2) + digits.substring(3);
    variants.add(withoutNine);
    variants.add('55' + withoutNine);
  } else if (digits.length === 10) {
    variants.add('55' + digits);
    const withNine = digits.substring(0, 2) + '9' + digits.substring(2);
    variants.add(withNine);
    variants.add('55' + withNine);
  }

  return Array.from(variants);
}

/**
 * Identifica se a mensagem enviada pelo cliente é uma intenção explícita de criar uma nova música
 */
export function isNewSongIntent(text) {
  const lower = String(text || '').toLowerCase().trim();
  return (
    lower.includes('novo pedido') ||
    lower.includes('nova musica') ||
    lower.includes('nova música') ||
    lower.includes('criar outra') ||
    lower.includes('fazer outra') ||
    lower.includes('outra musica') ||
    lower.includes('outra música') ||
    lower.includes('mais uma musica') ||
    lower.includes('mais uma música') ||
    lower.includes('reiniciar') ||
    lower.includes('começar de novo') ||
    lower.includes('comecar de novo') ||
    lower.includes('#ia') ||
    lower.includes('#bot')
  );
}

/**
 * Busca o pedido mais recente feito por um número de telefone no Firestore
 */
export async function findRecentOrderByPhone(phone) {
  const variants = generatePhoneVariants(phone);
  if (variants.length === 0) return null;

  try {
    const ordersRef = collection(db, 'orders');
    const candidates = [];
    const searchVariants = variants.slice(0, 10);

    // 1. Busca por customerPhone
    const q1 = query(ordersRef, where('customerPhone', 'in', searchVariants));
    const snap1 = await getDocs(q1).catch(() => null);
    if (snap1 && !snap1.empty) {
      snap1.forEach((d) => candidates.push({ id: d.id, ...d.data() }));
    }

    // 2. Busca por whatsappSenderPhone
    const q2 = query(ordersRef, where('whatsappSenderPhone', 'in', searchVariants));
    const snap2 = await getDocs(q2).catch(() => null);
    if (snap2 && !snap2.empty) {
      snap2.forEach((d) => {
        if (!candidates.some((c) => c.id === d.id)) {
          candidates.push({ id: d.id, ...d.data() });
        }
      });
    }

    // Filtra documentos de sessão temporária, rascunhos e configs do sistema
    const validOrders = candidates.filter(
      (o) => !o.id.startsWith('session_') && !o.id.startsWith('config_') && o.productionStatus !== 'RASCUNHO' && o.productionStatus !== 'CONFIG' && (o.orderNumber || o.lyrics || o.audioUrl)
    );

    if (validOrders.length === 0) return null;

    // Ordena do mais recente para o mais antigo
    validOrders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return validOrders[0];
  } catch (err) {
    console.warn('[OrderLookup] Erro ao buscar pedido por telefone:', err.message);
    return null;
  }
}
