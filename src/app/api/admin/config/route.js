import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, setDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { CONFIG_DOC, normalizarNumeroWhatsapp } from '@/lib/configSite';

export const runtime = 'edge';

// Escrita da configuração editável pelo painel (hoje só o número de WhatsApp do suporte).
//
// Passa por aqui, e não direto do browser, porque para onde o cliente é mandado ao pedir ajuda é
// decisão de negócio: escrever isso a partir de código 'use client' seria confiar no navegador
// (.claude/rules/security.md). requireAdmin verifica o ID token no servidor.
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
    const numero = normalizarNumeroWhatsapp(body?.whatsappSuporte);
    if (!numero) {
      return NextResponse.json(
        { error: 'Número inválido. Use DDD + número, por exemplo 94991064043.' },
        { status: 400 },
      );
    }

    await setDoc(
      doc(db, CONFIG_DOC.colecao, CONFIG_DOC.id),
      { whatsappSuporte: numero, whatsappSuporteAtualizadoEm: new Date().toISOString() },
      { merge: true },
    );

    return NextResponse.json({ ok: true, whatsappSuporte: numero });
  } catch (err) {
    console.error('[admin/config] falha ao salvar configuração:', err.message);
    return NextResponse.json({ error: 'Não foi possível salvar a configuração.' }, { status: 500 });
  }
}
