import { collection, query, where, limit, getDocs, doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { getSupabaseEdge } from './supabase-edge.js';
import { mapSupabaseOrderToFirestore } from './supabaseSync.js';

/**
 * Gera todas as variações possíveis de um número de telefone brasileiro
 * (com/sem 55, com/sem o 9º dígito) para busca precisa no banco de dados.
 */
export function generatePhoneVariants(phone) {
  const rawInput = String(phone || '').trim();
  const digits = rawInput.replace(/\D/g, '');
  if (!digits || digits.length < 8) return [];

  const variants = new Set();
  variants.add(digits);
  variants.add(rawInput);

  // LID (identificador de privacidade do WhatsApp — ver route.js:extractSenderPhone, achado
  // 28/08/2026) não é telefone: nenhuma variante de DDI/9º dígito faz sentido pra ele. Inclui as duas
  // formas que podem estar salvas em whatsappSenderPhone (com e sem o sufixo "@lid" — pedidos antigos
  // gravaram sem, a partir de agora grava com) pra achar o pedido de qualquer jeito nessa busca.
  const looksLikeLid = rawInput.includes('@lid')
    || (digits.length !== 10 && digits.length !== 11 && !(digits.startsWith('55') && digits.length >= 12 && digits.length <= 13));
  if (looksLikeLid) {
    variants.add(`${digits}@lid`);
    return Array.from(variants);
  }

  // Identifica DDD e número local (sem DDI 55)
  let localDigits = digits;
  if (digits.startsWith('55') && digits.length >= 12) {
    localDigits = digits.substring(2);
    variants.add(localDigits);
    variants.add(`55${localDigits}`);
  } else if (digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
  }

  // Formata variações de 10 e 11 dígitos (DDD + 8 ou 9 dígitos)
  if (localDigits.length === 11 || localDigits.length === 10) {
    const ddd = localDigits.substring(0, 2);
    let num9 = '';
    let num8 = '';

    if (localDigits.length === 11 && localDigits[2] === '9') {
      num9 = localDigits.substring(2);
      num8 = localDigits.substring(3);
    } else if (localDigits.length === 10) {
      num8 = localDigits.substring(2);
      num9 = '9' + num8;
    }

    if (num9 && num9.length === 9) {
      const p1 = num9.substring(0, 5);
      const p2 = num9.substring(5);
      // Padrão exato salvo pelo formulário do site: '(XX) XXXXX-XXXX'
      variants.add(`(${ddd}) ${p1}-${p2}`);
      variants.add(`(${ddd}) ${num9}`);
      variants.add(`${ddd} ${p1}-${p2}`);
      variants.add(`${ddd}${num9}`);
      variants.add(`55${ddd}${num9}`);
      variants.add(`+55 (${ddd}) ${p1}-${p2}`);
    }

    if (num8 && num8.length === 8) {
      const p1 = num8.substring(0, 4);
      const p2 = num8.substring(4);
      variants.add(`(${ddd}) ${p1}-${p2}`);
      variants.add(`(${ddd}) ${num8}`);
      variants.add(`${ddd} ${p1}-${p2}`);
      variants.add(`${ddd}${num8}`);
      variants.add(`55${ddd}${num8}`);
      variants.add(`+55 (${ddd}) ${p1}-${p2}`);
    }
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
 * Identifica se a mensagem enviada pelo cliente é apenas uma confirmação curta ou agradecimento
 * (ex: "ok", "obrigado", "beleza", "show", "valeu", "ta bom", etc.) que não requer reenvio de templates.
 */
export function isShortAckMessage(text) {
  if (!text) return false;
  const clean = String(text)
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:\-_~*#👍👏❤️😊🙏🎧🎶🎉]/g, '')
    .trim();

  if (!clean) return true; // Mensagem com apenas emojis ou pontuação

  const acks = new Set([
    'ok',
    'okay',
    'okey',
    'blz',
    'beleza',
    'obrigado',
    'obrigada',
    'obg',
    'brigado',
    'brigada',
    'valeu',
    'vlw',
    'show',
    'top',
    'joia',
    'jóia',
    'legal',
    'ta bom',
    'tá bom',
    'tabom',
    'certo',
    'combinado',
    'entendido',
    'perfeito',
    'tudo bem',
    'tmj',
    'aguardo',
    'aguardando',
    'no aguardo',
    'blzinha',
    'belezinha',
    'sim',
    's',
    'joinha',
    'combinadissimo',
    'combinadíssimo',
    'maravilha',
    'otimo',
    'ótimo',
    'mto obrigado',
    'muito obrigado',
    'mto obrigada',
    'muito obrigada',
  ]);

  return acks.has(clean);
}

/**
 * Busca pedido no Firestore por ID do documento direto ou pelo orderNumber (ex: NS-...)
 */
export async function findOrderByIdOrNumber(candidate, env = {}) {
  if (!candidate) return null;
  const trimmed = String(candidate).trim();
  if (!trimmed) return null;

  // "num:8337" — o cliente mandou só o bloco de 4 dígitos do número do pedido, que é o pedaço que
  // ele decora ("NS-MUHEKI5D-8337-2026"). Sozinho ele NÃO identifica o pedido com certeza: o mesmo
  // bloco pode se repetir entre pedidos. Por isso a busca exige resultado único — com mais de um,
  // devolve null e quem chama pede o número completo, em vez de mandar a música de outro cliente
  // (dado pessoal de terceiro, .claude/rules/security.md).
  if (trimmed.startsWith('num:')) {
    const bloco = trimmed.slice(4);
    if (!/^\d{4}$/.test(bloco)) return null;

    try {
      const supabase = getSupabaseEdge(env);
      if (!supabase) return null;

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .like('order_number', `%-${bloco}-%`)
        .is('deleted_at', 'null')
        .order('created_at', { ascending: false })
        .limit(2);

      if (error || !Array.isArray(data) || data.length !== 1) return null;
      return mapSupabaseOrderToFirestore(data[0]);
    } catch (err) {
      console.warn('[OrderLookup] Falha na busca por bloco do número do pedido:', err.message);
      return null;
    }
  }

  // 1. Tenta consulta direta no Supabase (Postgres)
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .or(`id.eq.${trimmed},order_number.eq.${trimmed}`)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        return mapSupabaseOrderToFirestore(data[0]);
      }
    }
  } catch (sbErr) {
    console.warn('[OrderLookup] Falha na busca Supabase por ID/número:', sbErr.message);
  }

  // 2. Fallback resiliente no Firestore
  try {
    // 1. Tenta buscar por ID de documento direto
    const docSnap = await getDoc(doc(db, 'orders', trimmed)).catch(() => null);
    if (docSnap && docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }

    // 2. Tenta buscar por orderNumber
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('orderNumber', '==', trimmed), limit(1));
    const snap = await getDocs(q).catch(() => null);
    if (snap && !snap.empty) {
      const first = snap.docs[0];
      return { id: first.id, ...first.data() };
    }
  } catch (err) {
    console.warn('[OrderLookup] Erro ao buscar por ID/orderNumber:', err.message);
  }

  return null;
}

/**
 * Busca o pedido mais recente feito por um número de telefone no Firestore
 */
export async function findRecentOrderByPhone(phone, env = {}) {
  const variants = generatePhoneVariants(phone);
  if (variants.length === 0) return null;

  const searchVariants = variants.slice(0, 25);

  // 1. Tenta consulta direta no Supabase (Postgres indexado)
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('customer_phone', searchVariants)
        .is('deleted_at', 'null')
        .neq('production_status', 'RASCUNHO')
        .neq('production_status', 'CONFIG')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        return mapSupabaseOrderToFirestore(data[0]);
      }
    }
  } catch (sbErr) {
    console.warn('[OrderLookup] Falha na busca Supabase por telefone:', sbErr.message);
  }

  // 2. Fallback resiliente no Firestore
  try {
    const ordersRef = collection(db, 'orders');
    const candidates = [];

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
