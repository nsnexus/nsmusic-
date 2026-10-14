import { getSupabaseEdge } from './supabase-edge.js';
import { sanitizePhone, saveCustomerVoice } from './customerVoices.js';

/**
 * Gera um token único e limpo para o link temporário de gravação de voz.
 */
export function generateInviteToken() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `v_${timestamp}_${random}`;
}

/**
 * Cria um novo convite/link de clonagem de voz para um contato.
 */
export async function createVoiceInvite({ customerName, phone, notes }, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    throw new Error('Banco de dados indisponível.');
  }

  const token = generateInviteToken();
  const cleanPhone = sanitizePhone(phone);
  const nowIso = new Date().toISOString();

  const invite = {
    token,
    customerName: (customerName || '').trim() || 'Convidado',
    phone: cleanPhone || '',
    notes: (notes || '').trim(),
    active: true, // Por padrão ativo; o admin desabilita manualmente
    status: 'pendente', // 'pendente' | 'concluido' | 'desativado'
    voiceId: null,
    voiceRecordingId: null,
    sampleAudioUrl: null,
    verifyAudioUrl: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  // 1. Tenta salvar na tabela dedicada voice_invites se existir
  try {
    await supabase.from('voice_invites').insert({
      token,
      customer_name: invite.customerName,
      phone: invite.phone,
      notes: invite.notes,
      active: invite.active,
      status: invite.status,
      created_at: nowIso,
      updated_at: nowIso
    });
  } catch (e) {
    // Tabela opcional; segue com o armazenamento resiliente na tabela config
  }

  // 2. Armazena de forma garantida na tabela config
  const upsertRes = await supabase.from('config').upsert({
    chave: `voiceinvite_${token}`,
    valor: invite,
    updated_at: nowIso
  });

  if (upsertRes?.error) {
    throw new Error(upsertRes.error.message || 'Falha ao salvar convite no banco de dados.');
  }

  return { ok: true, invite };
}

/**
 * Busca um convite de voz pelo token.
 */
export async function getVoiceInvite(token, env = {}) {
  if (!token || typeof token !== 'string') return null;

  const supabase = getSupabaseEdge(env);
  if (!supabase) return null;

  try {
    const res = await supabase
      .from('config')
      .select('chave, valor, updated_at')
      .eq('chave', `voiceinvite_${token}`)
      .limit(1);

    if (res?.data && res.data.length > 0 && res.data[0].valor) {
      return res.data[0].valor;
    }
  } catch (err) {
    console.error('[voiceInvites] Erro ao buscar convite na tabela config:', err?.message);
  }

  return null;
}

/**
 * Lista todos os convites de gravação de voz gerados.
 */
export async function listVoiceInvites(env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return [];

  try {
    const res = await supabase
      .from('config')
      .select('chave, valor, updated_at')
      .like('chave', 'voiceinvite_%')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (res?.data && Array.isArray(res.data)) {
      return res.data
        .map(item => item.valor)
        .filter(Boolean)
        .sort((a, b) => {
          const tA = new Date(a.createdAt || a.updatedAt || 0).getTime();
          const tB = new Date(b.createdAt || b.updatedAt || 0).getTime();
          return tB - tA;
        });
    }
  } catch (err) {
    console.error('[voiceInvites] Erro ao listar convites na tabela config:', err?.message);
  }

  return [];
}

/**
 * Ativa ou desativa manualmente um convite de voz.
 */
export async function toggleVoiceInvite(token, active, env = {}) {
  const invite = await getVoiceInvite(token, env);
  if (!invite) {
    return { ok: false, error: 'Convite não encontrado.' };
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, error: 'Banco indisponível.' };

  const nowIso = new Date().toISOString();
  const isNowActive = Boolean(active);

  const updatedInvite = {
    ...invite,
    active: isNowActive,
    status: !isNowActive && invite.status === 'pendente' ? 'desativado' : (isNowActive && invite.status === 'desativado' ? 'pendente' : invite.status),
    updatedAt: nowIso
  };

  await supabase.from('config').upsert({
    chave: `voiceinvite_${token}`,
    valor: updatedInvite,
    updated_at: nowIso
  });

  return { ok: true, invite: updatedInvite };
}

/**
 * Atualiza o convite com novos dados (ex: conclusão de gravação, vinculação a contato).
 */
export async function updateVoiceInvite(token, updates = {}, env = {}) {
  const invite = await getVoiceInvite(token, env);
  if (!invite) {
    return { ok: false, error: 'Convite não encontrado.' };
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, error: 'Banco indisponível.' };

  const nowIso = new Date().toISOString();
  const phone = updates.phone ? sanitizePhone(updates.phone) : invite.phone;

  const updatedInvite = {
    ...invite,
    ...updates,
    phone,
    customerName: updates.customerName !== undefined ? (updates.customerName || 'Convidado') : invite.customerName,
    updatedAt: nowIso
  };

  await supabase.from('config').upsert({
    chave: `voiceinvite_${token}`,
    valor: updatedInvite,
    updated_at: nowIso
  });

  // Se já tiver voiceId e telefone associado, vincula/salva na tabela oficial de customer_voices
  if (updatedInvite.voiceId && updatedInvite.phone) {
    try {
      await saveCustomerVoice({
        phone: updatedInvite.phone,
        customerName: updatedInvite.customerName,
        voiceId: updatedInvite.voiceId,
        voiceRecordingId: updatedInvite.voiceRecordingId,
        sampleAudioUrl: updatedInvite.sampleAudioUrl,
        verifyAudioUrl: updatedInvite.verifyAudioUrl,
        status: 'ativo'
      }, env);
    } catch (saveErr) {
      console.warn('[voiceInvites] Falha ao sincronizar customer_voices:', saveErr?.message);
    }
  }

  return { ok: true, invite: updatedInvite };
}

/**
 * Exclui um convite de gravação de voz.
 */
export async function deleteVoiceInvite(token, env = {}) {
  if (!token) return { ok: false, error: 'Token obrigatório.' };

  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, error: 'Banco indisponível.' };

  await supabase.from('config').delete().eq('chave', `voiceinvite_${token}`);

  return { ok: true };
}
