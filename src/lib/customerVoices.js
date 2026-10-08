import { getSupabaseEdge } from './supabase-edge.js';

/**
 * Sanitiza o número de telefone/WhatsApp para um padrão numérico único (ex: 5511999999999).
 */
export function sanitizePhone(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';

  // Se já tem DDI 55
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // Se tem DDD + número (10 ou 11 dígitos), prefixa com 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Busca o timbre cadastrado de um cliente a partir do telefone/WhatsApp.
 */
export async function findCustomerVoice(phone, env = {}) {
  const cleanPhone = sanitizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 10) return null;

  const supabase = getSupabaseEdge(env);
  if (!supabase) return null;

  // 1. Tenta buscar na tabela customer_voices
  try {
    const res = await supabase
      .from('customer_voices')
      .select('*')
      .eq('phone', cleanPhone)
      .limit(1);

    if (res?.data && res.data.length > 0) {
      const v = res.data[0];
      return {
        id: v.id,
        phone: v.phone,
        customerName: v.customer_name,
        voiceId: v.voice_id,
        voiceRecordingId: v.voice_recording_id,
        sampleAudioUrl: v.sample_audio_url,
        verifyAudioUrl: v.verify_audio_url,
        status: v.status || 'ativo',
        pedidosCount: v.pedidos_count || 1,
        createdAt: v.created_at,
        updatedAt: v.updated_at
      };
    }
  } catch (err) {
    // Se a tabela customer_voices ainda não foi criada, segue para o fallback
  }

  // 2. Fallback resiliente na tabela config (chave voice_[phone])
  try {
    const cfgRes = await supabase
      .from('config')
      .select('chave, valor, updated_at')
      .eq('chave', `voice_${cleanPhone}`)
      .limit(1);

    if (cfgRes?.data && cfgRes.data.length > 0) {
      const v = cfgRes.data[0].valor || {};
      return {
        id: v.id || `voice_${cleanPhone}`,
        phone: cleanPhone,
        customerName: v.customerName || v.customer_name || 'Cliente',
        voiceId: v.voiceId || v.voice_id,
        voiceRecordingId: v.voiceRecordingId || v.voice_recording_id,
        sampleAudioUrl: v.sampleAudioUrl || v.sample_audio_url,
        verifyAudioUrl: v.verifyAudioUrl || v.verify_audio_url,
        status: v.status || 'ativo',
        pedidosCount: v.pedidosCount || 1,
        createdAt: v.createdAt || cfgRes.data[0].updated_at,
        updatedAt: cfgRes.data[0].updated_at
      };
    }
  } catch (err) {}

  return null;
}

/**
 * Salva ou atualiza a voz clonada de um cliente no banco de dados.
 */
export async function saveCustomerVoice(data = {}, env = {}) {
  const cleanPhone = sanitizePhone(data.phone);
  if (!cleanPhone || !data.voiceId) {
    throw new Error('Telefone e voiceId são obrigatórios para salvar a voz do cliente.');
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    throw new Error('Banco de dados indisponível.');
  }

  const nowIso = new Date().toISOString();
  const payload = {
    phone: cleanPhone,
    customer_name: data.customerName || data.customer_name || 'Cliente',
    voice_id: data.voiceId || data.voice_id,
    voice_recording_id: data.voiceRecordingId || data.voice_recording_id || null,
    sample_audio_url: data.sampleAudioUrl || data.sample_audio_url || null,
    verify_audio_url: data.verifyAudioUrl || data.verify_audio_url || null,
    status: data.status || 'ativo',
    updated_at: nowIso
  };

  // 1. Tenta salvar na tabela customer_voices
  let savedInTable = false;
  try {
    const upsertRes = await supabase
      .from('customer_voices')
      .upsert(payload, { onConflict: 'phone' });

    if (!upsertRes?.error) {
      savedInTable = true;
    }
  } catch (err) {}

  // 2. Garante persistência também na tabela config (como garantia de redundância)
  try {
    await supabase.from('config').upsert({
      chave: `voice_${cleanPhone}`,
      valor: {
        ...payload,
        createdAt: data.createdAt || nowIso
      },
      updated_at: nowIso
    });
  } catch (err) {}

  return {
    ok: true,
    phone: cleanPhone,
    voiceId: payload.voice_id,
    status: payload.status
  };
}

/**
 * Redefine o timbre do cliente (para permitir que ele regrave sem pagar novamente).
 */
export async function resetCustomerVoice(phone, env = {}) {
  const cleanPhone = sanitizePhone(phone);
  if (!cleanPhone) return { ok: false, error: 'Telefone inválido' };

  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, error: 'Banco indisponível' };

  const nowIso = new Date().toISOString();

  try {
    await supabase
      .from('customer_voices')
      .update({
        status: 'redefinido',
        voice_id: '',
        voice_recording_id: null,
        updated_at: nowIso
      })
      .eq('phone', cleanPhone);
  } catch (e) {}

  try {
    const cfgRes = await supabase.from('config').select('*').eq('chave', `voice_${cleanPhone}`).limit(1);
    if (cfgRes?.data?.[0]) {
      const val = cfgRes.data[0].valor || {};
      await supabase.from('config').update({
        valor: { ...val, status: 'redefinido', voiceId: '', voice_id: '' },
        updated_at: nowIso
      }).eq('chave', `voice_${cleanPhone}`);
    }
  } catch (e) {}

  return { ok: true, phone: cleanPhone, status: 'redefinido' };
}

/**
 * Lista todas as vozes de clientes cadastradas (para o Painel Admin).
 */
export async function listAllCustomerVoices(env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return [];

  // Tenta da tabela customer_voices
  try {
    const res = await supabase
      .from('customer_voices')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (res?.data && res.data.length > 0) {
      return res.data.map(v => ({
        id: v.id,
        phone: v.phone,
        customerName: v.customer_name,
        voiceId: v.voice_id,
        voiceRecordingId: v.voice_recording_id,
        sampleAudioUrl: v.sample_audio_url,
        verifyAudioUrl: v.verify_audio_url,
        status: v.status || 'ativo',
        pedidosCount: v.pedidos_count || 1,
        createdAt: v.created_at,
        updatedAt: v.updated_at
      }));
    }
  } catch (e) {}

  // Fallback: busca registros prefixados com voice_ na tabela config
  try {
    const cfgRes = await supabase
      .from('config')
      .select('chave, valor, updated_at')
      .like('chave', 'voice_%')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (cfgRes?.data && cfgRes.data.length > 0) {
      return cfgRes.data.map(item => {
        const v = item.valor || {};
        const p = item.chave.replace('voice_', '');
        return {
          id: v.id || item.chave,
          phone: v.phone || p,
          customerName: v.customerName || v.customer_name || 'Cliente',
          voiceId: v.voiceId || v.voice_id || '',
          voiceRecordingId: v.voiceRecordingId || v.voice_recording_id || '',
          sampleAudioUrl: v.sampleAudioUrl || v.sample_audio_url || '',
          verifyAudioUrl: v.verifyAudioUrl || v.verify_audio_url || '',
          status: v.status || 'ativo',
          pedidosCount: v.pedidosCount || 1,
          createdAt: v.createdAt || item.updated_at,
          updatedAt: item.updated_at
        };
      });
    }
  } catch (e) {}

  return [];
}
