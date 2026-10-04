import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from '@/lib/configSite';
import { getSupabaseEdge } from '@/lib/supabase-edge';

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
    const { data: currentRecord } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'site')
      .maybeSingle();

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
      if (p === 'kie' || p === 'unifically') {
        updates.sunoPrimaryProvider = p;
        updates.sunoPrimaryProviderAtualizadoEm = new Date().toISOString();
      } else {
        return NextResponse.json(
          { error: 'Provedor inválido. Escolha "unifically" ou "kie".' },
          { status: 400 }
        );
      }
    }

    const newValor = { ...currentValor, ...updates };

    await supabase
      .from('config')
      .upsert({
        chave: 'site',
        valor: newValor,
        updated_at: new Date().toISOString()
      });

    return NextResponse.json({
      ok: true,
      whatsappSuporte: newValor.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO,
      agentEnabled: newValor.agentEnabled !== false,
      sunoPrimaryProvider: newValor.sunoPrimaryProvider || process.env.SUNO_PRIMARY_PROVIDER || 'unifically'
    });
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
    let configData = {};
    if (supabase) {
      const { data } = await supabase
        .from('config')
        .select('valor')
        .eq('chave', 'site')
        .maybeSingle();
      if (data?.valor) {
        configData = data.valor;
      }
    }

    const defaultProvider = String(env?.SUNO_PRIMARY_PROVIDER || process.env.SUNO_PRIMARY_PROVIDER || 'unifically').toLowerCase().trim();

    return NextResponse.json(
      {
        ok: true,
        whatsappSuporte: configData.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO,
        agentEnabled: configData.agentEnabled !== false,
        sunoPrimaryProvider: configData.sunoPrimaryProvider || defaultProvider
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (err) {
    return NextResponse.json({
      ok: true,
      whatsappSuporte: WHATSAPP_SUPORTE_PADRAO,
      agentEnabled: true,
      sunoPrimaryProvider: 'unifically'
    });
  }
}
