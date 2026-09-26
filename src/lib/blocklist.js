import { doc, getDoc, setDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { getSupabaseEdge } from './supabase-edge.js';

export const BLOCKLIST_DOC_ID = 'config_blocklist';

/**
 * Normaliza telefone para apenas dígitos.
 */
export function normalizarTelefoneParaBloqueio(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Retorna as variações possíveis de um número de telefone no Brasil
 * (com ou sem 55, apenas DDD + número de 10 ou 11 dígitos).
 */
export function obterVariacoesTelefone(telefone) {
  const digitos = normalizarTelefoneParaBloqueio(telefone);
  if (!digitos || digitos.length < 8) return [];

  const variacoes = new Set();
  variacoes.add(digitos);

  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    const sem55 = digitos.slice(2);
    variacoes.add(sem55);
  } else if (digitos.length === 10 || digitos.length === 11) {
    variacoes.add(`55${digitos}`);
  }

  // Variação dos últimos 8 ou 9 dígitos (número sem DDD) para matching defensivo
  if (digitos.length >= 10) {
    variacoes.add(digitos.slice(-9));
    variacoes.add(digitos.slice(-8));
  }

  return Array.from(variacoes);
}

/**
 * Normaliza e-mail para comparação (minúsculas sem espaços).
 */
export function normalizarEmailParaBloqueio(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Gera um ID consistente para o registro de bloqueio.
 */
export function gerarIdBloqueio(tipo, valor) {
  if (tipo === 'phone') {
    return `phone_${normalizarTelefoneParaBloqueio(valor)}`;
  }
  return `email_${normalizarEmailParaBloqueio(valor)}`;
}

/**
 * Lê a lista completa de bloqueados (com fallback entre Supabase e Firestore).
 * @returns {Promise<Array<{id: string, type: 'phone'|'email', value: string, displayValue?: string, name?: string, reason?: string, blockedAt: string, blockedBy?: string}>>}
 */
export async function getBlocklist(env = {}) {
  // 1. Tenta Supabase
  const supabase = getSupabaseEdge(env);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('extras, updated_at')
        .eq('id', BLOCKLIST_DOC_ID)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        const rawBlocked = data[0]?.extras?.blockedContacts;
        if (Array.isArray(rawBlocked)) {
          return rawBlocked;
        }
      }
    } catch (e) {
      console.warn('[blocklist] Falha ao ler do Supabase, tentando Firestore:', e.message);
    }
  }

  // 2. Fallback Firestore
  try {
    const snap = await getDoc(doc(db, 'orders', BLOCKLIST_DOC_ID));
    if (snap.exists()) {
      const rawBlocked = snap.data()?.blockedContacts;
      if (Array.isArray(rawBlocked)) {
        return rawBlocked;
      }
    }
  } catch (err) {
    console.warn('[blocklist] Falha ao ler do Firestore:', err.message);
  }

  return [];
}

/**
 * Salva a lista de bloqueados atualizada no Firestore e Supabase.
 */
async function salvarBlocklist(blockedContacts, env = {}) {
  const agora = new Date().toISOString();
  let salvouEmAlgumLugar = false;

  // 1. Grava no Supabase
  const supabase = getSupabaseEdge(env);
  if (supabase) {
    try {
      await supabase.from('orders').upsert({
        id: BLOCKLIST_DOC_ID,
        order_number: 'CONFIG-BLOCKLIST',
        production_status: 'CONFIG',
        extras: { blockedContacts },
        updated_at: agora,
      }, { onConflict: 'id' });
      salvouEmAlgumLugar = true;
    } catch (e) {
      console.warn('[blocklist] Falha ao salvar no Supabase:', e.message);
    }
  }

  // 2. Grava no Firestore
  try {
    await setDoc(doc(db, 'orders', BLOCKLIST_DOC_ID), {
      productionStatus: 'CONFIG',
      orderNumber: 'CONFIG-BLOCKLIST',
      blockedContacts,
      updatedAt: agora,
    }, { merge: true });
    salvouEmAlgumLugar = true;
  } catch (err) {
    console.warn('[blocklist] Falha ao salvar no Firestore:', err.message);
  }

  return salvouEmAlgumLugar;
}

/**
 * Verifica se um telefone ou e-mail está bloqueado na plataforma.
 * @param {string} phone
 * @param {string} email
 * @param {object} env
 * @returns {Promise<{blocked: boolean, reason?: string, blockedAt?: string, item?: object}>}
 */
export async function isContactBlocked(phone, email, env = {}) {
  const list = await getBlocklist(env);
  if (!Array.isArray(list) || list.length === 0) {
    return { blocked: false };
  }

  const phoneVariations = obterVariacoesTelefone(phone);
  const normalizedEmail = normalizarEmailParaBloqueio(email);

  for (const item of list) {
    if (item.type === 'phone' && phoneVariations.length > 0) {
      const itemVariations = obterVariacoesTelefone(item.value);
      const bateu = phoneVariations.some((v) => itemVariations.includes(v));
      if (bateu) {
        return {
          blocked: true,
          reason: item.reason || 'Contato bloqueado pelo administrador',
          blockedAt: item.blockedAt,
          item,
        };
      }
    }

    if (item.type === 'email' && normalizedEmail) {
      if (normalizarEmailParaBloqueio(item.value) === normalizedEmail) {
        return {
          blocked: true,
          reason: item.reason || 'Contato bloqueado pelo administrador',
          blockedAt: item.blockedAt,
          item,
        };
      }
    }
  }

  return { blocked: false };
}

/**
 * Adiciona um contato à lista de bloqueados.
 */
export async function addBlockContact({ phone, email, name = '', reason = '', blockedBy = '' }, env = {}) {
  const phoneDigits = normalizarTelefoneParaBloqueio(phone);
  const emailNorm = normalizarEmailParaBloqueio(email);

  if (!phoneDigits && !emailNorm) {
    throw new Error('Informe ao menos um telefone ou e-mail válido para bloquear.');
  }

  const list = await getBlocklist(env);
  const agora = new Date().toISOString();
  const novaLista = [...list];

  if (phoneDigits) {
    const id = gerarIdBloqueio('phone', phoneDigits);
    const index = novaLista.findIndex((i) => i.id === id);
    const item = {
      id,
      type: 'phone',
      value: phoneDigits,
      displayValue: String(phone).trim(),
      name: name ? String(name).trim() : '',
      reason: reason ? String(reason).trim() : 'Bloqueio manual de geração excessiva',
      blockedAt: agora,
      blockedBy: blockedBy || 'admin',
    };
    if (index >= 0) {
      novaLista[index] = item;
    } else {
      novaLista.unshift(item);
    }
  }

  if (emailNorm) {
    const id = gerarIdBloqueio('email', emailNorm);
    const index = novaLista.findIndex((i) => i.id === id);
    const item = {
      id,
      type: 'email',
      value: emailNorm,
      displayValue: emailNorm,
      name: name ? String(name).trim() : '',
      reason: reason ? String(reason).trim() : 'Bloqueio manual de geração excessiva',
      blockedAt: agora,
      blockedBy: blockedBy || 'admin',
    };
    if (index >= 0) {
      novaLista[index] = item;
    } else {
      novaLista.unshift(item);
    }
  }

  await salvarBlocklist(novaLista, env);
  return { ok: true, blocklist: novaLista };
}

/**
 * Remove um contato da lista de bloqueados por ID ou valor (telefone/e-mail).
 */
export async function removeBlockContact(idOuValor, env = {}) {
  if (!idOuValor) {
    throw new Error('Identificador de bloqueio obrigatório.');
  }

  const list = await getBlocklist(env);
  const raw = String(idOuValor).trim();
  const digits = normalizarTelefoneParaBloqueio(raw);
  const emailNorm = normalizarEmailParaBloqueio(raw);

  const novaLista = list.filter((item) => {
    if (item.id === raw) return false;
    if (item.type === 'phone' && digits && (item.value === digits || item.id === `phone_${digits}`)) {
      return false;
    }
    if (item.type === 'email' && emailNorm && (item.value === emailNorm || item.id === `email_${emailNorm}`)) {
      return false;
    }
    return true;
  });

  await salvarBlocklist(novaLista, env);
  return { ok: true, blocklist: novaLista };
}
