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

  // LID (identificador de privacidade do WhatsApp)
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
    lower.includes('#bot') ||
    /(criar|fazer|quero|queria|gostaria|preciso).{0,20}(musica|música)/i.test(lower)
  );
}

/**
 * Identifica se a mensagem enviada pelo cliente é apenas uma confirmação curta ou agradecimento
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
 * Busca pedido por ID do documento direto ou pelo orderNumber (ex: NS-...)
 */
export async function findOrderByIdOrNumber(candidate, env = {}) {
  if (!candidate) return null;
  const trimmed = String(candidate).trim();
  if (!trimmed) return null;

  const supabase = getSupabaseEdge(env);
  if (!supabase) return null;

  // "num:8337" — busca por bloco de 4 dígitos
  if (trimmed.startsWith('num:')) {
    const bloco = trimmed.slice(4);
    if (!/^\d{4}$/.test(bloco)) return null;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .like('order_number', `%-${bloco}-%`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(2);

      if (error || !Array.isArray(data) || data.length !== 1) return null;
      return mapSupabaseOrderToFirestore(data[0]);
    } catch (err) {
      console.warn('[OrderLookup] Falha na busca por bloco do número do pedido:', err.message);
      return null;
    }
  }

  // Busca direta por ID ou orderNumber no Supabase
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .or(`id.eq.${trimmed},order_number.eq.${trimmed}`)
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      return mapSupabaseOrderToFirestore(data[0]);
    }
  } catch (sbErr) {
    console.warn('[OrderLookup] Falha na busca Supabase por ID/número:', sbErr.message);
  }

  return null;
}

/**
 * Busca o pedido mais recente feito por um número de telefone no Supabase
 */
/**
 * TODOS os pedidos de um telefone, do mais recente para o mais antigo.
 *
 * findRecentOrderByPhone devolve só o último, e isso bastava enquanto o agente respondia sobre "o
 * pedido". Mas cliente que volta costuma ter mais de uma música — e mandar só a última é entregar
 * pela metade (pedido do dono do estúdio em 26/09/2026: "manda os links das músicas que ele tem
 * pago").
 */
export async function findOrdersByPhone(phone, env = {}, limite = 10) {
  const variants = generatePhoneVariants(phone);
  if (variants.length === 0) return [];

  const digitos = variants.map((v) => String(v).replace(/\D/g, '')).filter(Boolean);
  if (digitos.length === 0) return [];

  const supabase = getSupabaseEdge(env);
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('customer_phone_digits', digitos.slice(0, 25))
      .is('deleted_at', null)
      .neq('production_status', 'RASCUNHO')
      .neq('production_status', 'CONFIG')
      .order('created_at', { ascending: false })
      .limit(limite);

    if (error || !Array.isArray(data)) return [];
    return data.map(mapSupabaseOrderToFirestore).filter(Boolean);
  } catch (err) {
    console.warn('[OrderLookup] Falha ao listar pedidos do telefone:', err.message);
    return [];
  }
}

export async function findRecentOrderByPhone(phone, env = {}) {
  const variants = generatePhoneVariants(phone);
  if (variants.length === 0) return null;

  const searchVariants = variants.slice(0, 25);
  const supabase = getSupabaseEdge(env);
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('customer_phone', searchVariants)
      .is('deleted_at', null)
      .neq('production_status', 'RASCUNHO')
      .neq('production_status', 'CONFIG')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      return mapSupabaseOrderToFirestore(data[0]);
    }
  } catch (sbErr) {
    console.warn('[OrderLookup] Falha na busca Supabase por telefone:', sbErr.message);
  }

  return null;
}
