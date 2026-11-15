import { getSupabaseEdge } from './supabase-edge.js';
import { updateOrder } from './supabaseDb.js';

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
  // O telefone pode estar gravado como veio do painel (sem passar pelo sanitizePhone).
  const variantes = Array.from(new Set([cleanPhone, String(phone).trim(), String(phone).replace(/\D/g, '')].filter(Boolean)));
  const falhas = [];
  let afetados = 0;

  // O cliente supabase-edge não lança exceção em erro de banco: devolve { error }. Antes isso era engolido e a
  // tela mostrava "redefinido" sem nada ter mudado.
  try {
    const { data, error } = await supabase
      .from('customer_voices')
      .in('phone', variantes)
      .update({ status: 'redefinido', voice_id: '', voice_recording_id: null, updated_at: nowIso });
    if (error) falhas.push(`customer_voices: ${error.message || error.code || 'erro'}`);
    else afetados += (data || []).length;
  } catch (e) {
    falhas.push(`customer_voices: ${e?.message || 'erro'}`);
  }

  try {
    const chaves = variantes.map((v) => `voice_${v}`);
    const { data: cfgRows, error: cfgErr } = await supabase.from('config').select('chave, valor').in('chave', chaves);
    if (cfgErr) falhas.push(`config: ${cfgErr.message || cfgErr.code || 'erro'}`);
    for (const row of cfgRows || []) {
      const val = row.valor || {};
      // Neste cliente (supabase-edge) os filtros vêm ANTES do update, que é o passo final.
      const { error: upErr } = await supabase.from('config').eq('chave', row.chave).update({
        valor: { ...val, status: 'redefinido', voiceId: '', voice_id: '' },
        updated_at: nowIso,
      });
      if (upErr) falhas.push(`config: ${upErr.message || upErr.code || 'erro'}`);
      else afetados += 1;
    }
  } catch (e) {
    falhas.push(`config: ${e?.message || 'erro'}`);
  }

  if (afetados === 0) {
    return {
      ok: false,
      error: falhas.length
        ? `Não foi possível redefinir o timbre (${falhas.join('; ')}).`
        : 'Nenhum timbre encontrado para esse telefone.',
    };
  }
  if (falhas.length) console.warn('[customerVoices] reset parcial:', falhas.join('; '));

  // Sem isto o pedido continuava marcado como "cantado pela voz do cliente" e a página de entrega
  // seguia mostrando a música antiga, sem oferecer a regravação.
  let pedidosDesvinculados = 0;
  try {
    pedidosDesvinculados = await desvincularVozDosPedidos(supabase, cleanPhone, env);
  } catch (e) {
    console.warn('[customerVoices] falha ao desvincular voz dos pedidos:', e?.message);
    return { ok: true, phone: cleanPhone, status: 'redefinido', pedidosDesvinculados: 0, aviso: 'Timbre redefinido, mas não foi possível atualizar os pedidos do cliente.' };
  }
  return { ok: true, phone: cleanPhone, status: 'redefinido', pedidosDesvinculados };
}

function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

// Mesmo número com ou sem DDI 55 e com qualquer formatação.
function mesmoTelefone(a, b) {
  const x = soDigitos(a).replace(/^55(?=\d{10,11}$)/, '');
  const y = soDigitos(b).replace(/^55(?=\d{10,11}$)/, '');
  return x.length >= 10 && x === y;
}

function pedidoUsaVozClonada(row) {
  const ex = row?.extras && typeof row.extras === 'object' ? row.extras : {};
  return row?.voice_type === 'minha_voz' || ex.isCustomVoice === true || Boolean(ex.customVoiceId);
}

export async function desvincularVozDosPedidos(supabase, cleanPhone, env = {}) {
  const final = soDigitos(cleanPhone).slice(-4);
  if (final.length < 4) return 0;
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_phone, voice_type, extras')
    .like('customer_phone', `%${final}`)
    .is('deleted_at', null)
    .limit(200);
  if (error) throw new Error(error.message || 'erro ao buscar pedidos');
  const alvos = (data || []).filter((row) => mesmoTelefone(row.customer_phone, cleanPhone) && pedidoUsaVozClonada(row));
  for (const row of alvos) {
    const updates = { isCustomVoice: false, customVoiceId: null, customVoiceAudioUrl: null };
    if (row.voice_type === 'minha_voz') updates.voiceType = 'feminina';
    await updateOrder(row.id, updates, env);
  }
  return alvos.length;
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
