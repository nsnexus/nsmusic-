import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from '@/lib/configSite';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { camposFidelidadeParaSalvar, fidelidadeDaConfig } from '@/lib/vozFidelidade';

export const runtime = 'edge';

// Escrita da configuração editável pelo painel (número de WhatsApp do suporte e master switch do agente).
// Salva exclusivamente na tabela `config` do Supabase (chave: 'site').
export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    }

    // Lê valor atual
    const { data: currentRecord, error: readError } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'site')
      .maybeSingle();
    if (readError) throw new Error(`Falha ao consultar configuração atual: ${readError.message}`);

    const currentValor = currentRecord?.valor || {};
    const updates = {};

    if (body?.whatsappSuporte !== undefined) {
      const numero = normalizarNumeroWhatsapp(body.whatsappSuporte);
      if (!numero) {
        return NextResponse.json(
          { error: 'Número inválido. Use DDD + número, por exemplo 94991064043.' },
          { status: 400 },
        );
      }
      updates.whatsappSuporte = numero;
      updates.whatsappSuporteAtualizadoEm = new Date().toISOString();
    }

    if (body?.agentEnabled !== undefined) {
      updates.agentEnabled = Boolean(body.agentEnabled);
      updates.agentEnabledAtualizadoEm = new Date().toISOString();
    }

    if (body?.sunoPrimaryProvider !== undefined) {
      const p = String(body.sunoPrimaryProvider).toLowerCase().trim();
      if (p === 'kie' || p === 'unifically' || p === 'suno_local') {
        updates.sunoPrimaryProvider = p;
        updates.sunoPrimaryProviderAtualizadoEm = new Date().toISOString();
      } else {
        return NextResponse.json(
          { error: 'Provedor inválido. Escolha "unifically", "kie" ou "suno_local".' },
          { status: 400 }
        );
      }
    }

    if (body?.contingencyMode !== undefined) {
      updates.contingencyMode = Boolean(body.contingencyMode);
      updates.contingencyModeAtualizadoEm = new Date().toISOString();
    }

    if (body?.abandonedPixRecoveryEnabled !== undefined) {
      updates.abandonedPixRecoveryEnabled = Boolean(body.abandonedPixRecoveryEnabled);
      updates.abandonedPixRecoveryEnabledAtualizadoEm = new Date().toISOString();
    }

    if (body?.abandonedPixRecoveryMaxPerHour !== undefined) {
      updates.abandonedPixRecoveryMaxPerHour = Math.max(1, Math.min(50, Number(body.abandonedPixRecoveryMaxPerHour) || 15));
      updates.abandonedPixRecoveryMaxPerHourAtualizadoEm = new Date().toISOString();
    }

    // Fidelidade da voz clonada (painel /admin/voz)
    const fidelidade = camposFidelidadeParaSalvar(body);
    if (Object.keys(fidelidade).length > 0) {
      Object.assign(updates, fidelidade, { vozFidelidadeAtualizadoEm: new Date().toISOString() });
    }

    const newValor = { ...currentValor, ...updates };

    const { data: savedRecords, error: saveError } = await supabase
      .from('config')
      .upsert({
        chave: 'site',
        valor: newValor,
        updated_at: new Date().toISOString()
      });
    if (saveError) throw new Error(`Falha ao gravar no Supabase: ${saveError.message}`);
    // A API Edge retorna representação do registro salvo. Nunca confirmar sucesso com persistência incerta.
    const savedRecord = Array.isArray(savedRecords) ? savedRecords[0] : savedRecords;
    if (!savedRecord || savedRecord.chave !== 'site' || !savedRecord.valor) {
      throw new Error('O banco não confirmou a gravação da configuração.');
    }
    const persistedValor = savedRecord.valor;

    return NextResponse.json({
      ok: true,
      whatsappSuporte: persistedValor.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO,
      agentEnabled: persistedValor.agentEnabled !== false,
      sunoPrimaryProvider: persistedValor.sunoPrimaryProvider || process.env.SUNO_PRIMARY_PROVIDER || 'unifically',
      contingencyMode: persistedValor.contingencyMode === true,
      abandonedPixRecoveryEnabled: persistedValor.abandonedPixRecoveryEnabled === true,
      abandonedPixRecoveryMaxPerHour: Number(persistedValor.abandonedPixRecoveryMaxPerHour) || 15,
      vozFidelidade: fidelidadeDaConfig(persistedValor),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[admin/config] falha ao salvar configuração:', err.message);
    return NextResponse.json({ error: 'Não foi possível salvar a configuração.' }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const supabase = getSupabaseEdge(env);
    if (!supabase) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    let configData = {};
    let workerHeartbeat = null;

    if (supabase) {
      const { data, error: readError } = await supabase
        .from('config')
        .select('valor')
        .eq('chave', 'site')
        .maybeSingle();
      if (readError) throw new Error(`Falha ao ler configurações: ${readError.message}`);
      if (data?.valor) {
        configData = data.valor;
      }

      // Consulta heartbeat do worker local se houver registro
      try {
        const { data: hb } = await supabase
          .from('config')
          .select('valor, updated_at')
          .eq('chave', 'suno_worker_heartbeat')
          .maybeSingle();
        if (hb?.valor) {
          workerHeartbeat = {
            ...hb.valor,
            updatedAt: hb.updated_at
          };
        }
      } catch (hbErr) {}
    }

    const defaultProvider = String(env?.SUNO_PRIMARY_PROVIDER || process.env.SUNO_PRIMARY_PROVIDER || 'unifically').toLowerCase().trim();

    return NextResponse.json(
      {
        ok: true,
        whatsappSuporte: configData.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO,
        agentEnabled: configData.agentEnabled !== false,
        sunoPrimaryProvider: configData.sunoPrimaryProvider || defaultProvider,
        contingencyMode: configData.contingencyMode === true,
        abandonedPixRecoveryEnabled: configData.abandonedPixRecoveryEnabled === true,
        abandonedPixRecoveryMaxPerHour: Number(configData.abandonedPixRecoveryMaxPerHour) || 15,
        vozFidelidade: fidelidadeDaConfig(configData),
        sunoWorkerHeartbeat: workerHeartbeat
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[admin/config] falha ao carregar configuração:', err?.message);
    return NextResponse.json({ error: 'Não foi possível carregar as configurações do banco.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
