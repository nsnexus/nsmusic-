import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import { getCloudApiConfig, modeloEntregaParaMeta } from '@/lib/whatsappCloudApi';
import { resolverSiteUrl } from '@/lib/siteUrl';

export const runtime = 'edge';

// Painel → Atendimentos → "Músicas pelo WhatsApp": situação do modelo `entrega_musicas_nsmusic` na
// Meta (GET) e envio dele para aprovação (POST), usando o token do servidor. Ver
// src/lib/entregaMusicasWhatsapp.js.

const WABA_PADRAO = '2160994021495241';
const GRAPH = 'https://graph.facebook.com/v21.0';

function contexto(env) {
  const config = getCloudApiConfig(env);
  return { config, wabaId: String(env.WHATSAPP_WABA_ID || process.env.WHATSAPP_WABA_ID || WABA_PADRAO).trim() };
}

async function situacao(config, wabaId) {
  const url = `${GRAPH}/${wabaId}/message_templates?name=${encodeURIComponent(config.templateEntrega)}&fields=name,status,category,rejected_reason`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(8000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { erro: 'A Meta não respondeu à consulta do modelo.' };
  const m = (j?.data || []).find((t) => t?.name === config.templateEntrega);
  return m ? { existe: true, status: m.status, categoria: m.category, motivo: m.rejected_reason && m.rejected_reason !== 'NONE' ? m.rejected_reason : '' } : { existe: false };
}

export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;
  const { config, wabaId } = contexto(env);
  if (!config.enabled) return NextResponse.json({ error: 'WhatsApp oficial não configurado (WHATSAPP_ACCESS_TOKEN).' }, { status: 500 });
  try {
    const s = await situacao(config, wabaId);
    if (s.erro) return NextResponse.json({ error: s.erro }, { status: 502 });
    return NextResponse.json({ nome: config.templateEntrega, ...s });
  } catch (err) {
    console.warn('[modelo-entrega] Falha ao consultar a Meta:', err?.message);
    return NextResponse.json({ error: 'Não foi possível consultar a Meta agora.' }, { status: 502 });
  }
}

export async function POST(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;
  const { config, wabaId } = contexto(env);
  if (!config.enabled) return NextResponse.json({ error: 'WhatsApp oficial não configurado (WHATSAPP_ACCESS_TOKEN).' }, { status: 500 });
  try {
    const atual = await situacao(config, wabaId);
    if (atual.existe) return NextResponse.json({ nome: config.templateEntrega, ...atual, jaExistia: true });

    const modelo = modeloEntregaParaMeta(config.templateEntrega, resolverSiteUrl(env.NEXT_PUBLIC_SITE_URL));
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(modelo),
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[modelo-entrega] Meta recusou a criação do modelo:', j?.error?.code, j?.error?.error_subcode);
      const detalhe = String(j?.error?.error_user_msg || '').slice(0, 300);
      return NextResponse.json({ error: `A Meta recusou o modelo.${detalhe ? ` ${detalhe}` : ''}` }, { status: 502 });
    }
    return NextResponse.json({ nome: config.templateEntrega, existe: true, status: j?.status || 'PENDING', categoria: j?.category || 'UTILITY' });
  } catch (err) {
    console.warn('[modelo-entrega] Falha ao criar o modelo:', err?.message);
    return NextResponse.json({ error: 'Não foi possível falar com a Meta agora.' }, { status: 502 });
  }
}
