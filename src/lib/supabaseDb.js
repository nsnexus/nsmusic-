import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge } from './firebase-edge.js';
import { getSupabaseEdge } from './supabase-edge.js';
import {
  mapFirestoreOrderToSupabase,
  mapSupabaseOrderToFirestore,
  mapOrderUpdatesToSupabase,
  mapSupabaseTaskToFirestore
} from './supabaseSync.js';
import { findOrderByIdOrNumber } from './orderLookup.js';
import { generateUniqueOrderNumber } from './orderNumber.js';

/**
 * Gera um ID de 20 caracteres alfanuméricos com alta entropia
 * idêntico ao formato padrão de IDs do Firestore, sem depender de nenhum SDK externo.
 */
export function generateOrderId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 20; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Busca um pedido por ID do documento ou por orderNumber (ex: NS-...).
 * Consulta primeiro o Supabase (Postgres) e usa Firestore como fallback resiliente.
 */
export async function getOrder(idOrNumber, env = {}) {
  return findOrderByIdOrNumber(idOrNumber, env);
}

/**
 * Cria um novo pedido persistindo primeiramente no Supabase (Postgres)
 * e realizando dual-write para o Firestore durante o período de transição.
 */
export async function createOrder(orderData = {}, env = {}) {
  const orderId = orderData.id || generateOrderId();
  const orderNumber = orderData.orderNumber || await generateUniqueOrderNumber(env);
  const nowIso = new Date().toISOString();

  const fullOrder = {
    ...orderData,
    id: orderId,
    orderNumber,
    createdAt: orderData.createdAt || nowIso,
    updatedAt: orderData.updatedAt || nowIso
  };

  // 1. Gravação primária no Supabase (Postgres)
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const mapped = mapFirestoreOrderToSupabase(orderId, fullOrder);
      const { error } = await supabase.from('orders').upsert(mapped, { onConflict: 'id' });
      if (error) {
        console.warn(`[supabaseDb] Erro ao gravar pedido ${orderId} no Supabase:`, error.message);
      }
    }
  } catch (sbErr) {
    console.warn(`[supabaseDb] Exceção ao gravar no Supabase para pedido ${orderId}:`, sbErr.message);
  }

  // 2. Dual-write resiliente no Firestore
  try {
    const orderRef = doc(dbEdge, 'orders', orderId);
    await setDoc(orderRef, fullOrder, { merge: true });
  } catch (fsErr) {
    console.warn(`[supabaseDb] Aviso no dual-write do Firestore para pedido ${orderId}:`, fsErr.message);
  }

  return fullOrder;
}

/**
 * Atualiza campos específicos de um pedido existente no Supabase (Postgres)
 * e realiza dual-write para o Firestore.
 */
export async function updateOrder(orderId, updates = {}, env = {}) {
  if (!orderId) {
    throw new Error('orderId é obrigatório para atualização');
  }

  const nowIso = new Date().toISOString();
  const normalizedUpdates = {
    ...updates,
    updatedAt: updates.updatedAt || nowIso
  };

  // 1. Atualização primária no Supabase (Postgres)
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const sbUpdates = mapOrderUpdatesToSupabase(normalizedUpdates);
      const { error } = await supabase.from('orders').eq('id', orderId).update(sbUpdates);
      if (error) {
        console.warn(`[supabaseDb] Erro ao atualizar pedido ${orderId} no Supabase:`, error.message);
      }
    }
  } catch (sbErr) {
    console.warn(`[supabaseDb] Exceção ao atualizar Supabase para pedido ${orderId}:`, sbErr.message);
  }

  // 2. Dual-write no Firestore
  try {
    const orderRef = doc(dbEdge, 'orders', orderId);
    await updateDoc(orderRef, normalizedUpdates);
  } catch (fsErr) {
    try {
      await setDoc(doc(dbEdge, 'orders', orderId), normalizedUpdates, { merge: true });
    } catch (e2) {
      console.warn(`[supabaseDb] Aviso no dual-write do Firestore ao atualizar ${orderId}:`, e2.message);
    }
  }

  return { success: true, orderId, updated: normalizedUpdates };
}

/**
 * Marca exclusão lógica de um pedido e suas tarefas associadas.
 */
export async function softDeleteOrder(orderId, env = {}) {
  if (!orderId) return { success: false, error: 'orderId_obrigatorio' };
  const nowIso = new Date().toISOString();

  // 1. Marca exclusão no Supabase
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      await supabase.from('orders').eq('id', orderId).update({
        deleted_at: nowIso,
        updated_at: nowIso
      });
      await supabase.from('suno_tasks').eq('order_id', orderId).update({
        status: 'DELETED',
        updated_at: nowIso
      });
    }
  } catch (sbErr) {
    console.warn(`[supabaseDb] Erro ao marcar exclusão no Supabase:`, sbErr.message);
  }

  // 2. Marca exclusão no Firestore
  try {
    await updateDoc(doc(dbEdge, 'orders', orderId), {
      deletedAt: nowIso,
      updatedAt: nowIso
    });
  } catch (fsErr) {
    console.warn(`[supabaseDb] Erro ao marcar exclusão no Firestore:`, fsErr.message);
  }

  return { success: true, orderId, deletedAt: nowIso };
}

/**
 * Busca uma tarefa da Suno/Kie no banco (Supabase primário, Firestore fallback).
 */
export async function getSunoTask(taskId, env = {}) {
  if (!taskId) return null;

  // 1. Supabase como primário
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data, error } = await supabase
        .from('suno_tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      if (!error && data) {
        return mapSupabaseTaskToFirestore(data);
      }
    }
  } catch (sbErr) {
    console.warn(`[supabaseDb] Falha ao consultar task no Supabase:`, sbErr.message);
  }

  // 2. Fallback no Firestore
  try {
    const docRef = doc(dbEdge, 'suno_tasks', taskId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (err) {
    console.error(`[supabaseDb] Erro ao buscar task no Firestore:`, err.message);
    return null;
  }
}

/**
 * Salva ou atualiza uma tarefa da Suno/Kie no Supabase (primário) e Firestore (dual-write).
 */
export async function saveSunoTask(taskId, status, result = null, orderId = null, extra = {}, env = {}) {
  if (!taskId) return false;
  const nowIso = new Date().toISOString();

  // 1. Persistência primária no Supabase
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const payload = {
        id: taskId,
        order_id: orderId || null,
        status: status || 'PENDING',
        provider: extra.provider || null,
        result: (result && typeof result === 'object') ? result : null,
        updated_at: nowIso
      };
      await supabase.from('suno_tasks').upsert(payload, { onConflict: 'id' });
    }
  } catch (sbErr) {
    console.warn(`[supabaseDb] Aviso ao salvar task no Supabase:`, sbErr.message);
  }

  // 2. Dual-write no Firestore
  try {
    const docRef = doc(dbEdge, 'suno_tasks', taskId);
    await setDoc(docRef, {
      status,
      result,
      orderId,
      ...(extra.provider ? { provider: extra.provider } : {}),
      updatedAt: nowIso
    }, { merge: true });
    return true;
  } catch (err) {
    console.error(`[supabaseDb] Erro ao salvar task no Firestore:`, err.message);
    return false;
  }
}

// Aliases para retrocompatibilidade com db.js
export const getTask = getSunoTask;
export const saveTask = saveSunoTask;
