import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { updateOrder } from '@/lib/supabaseDb';
import { formatarTelefoneBr, telefoneBrCompleto } from '@/lib/telefoneBr';

export const runtime = 'edge';

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

    const body = await req.json();
    const { orderId, ...fields } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const updateData = { updatedAt: new Date().toISOString() };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        // Proteção contra corrupção: nunca permitir gravar URL de proxy interno no banco
        if (key === 'audioUrl' && typeof val === 'string' && val.includes('/api/audio/proxy')) {
          continue;
        }
        // Telefone corrigido pelo admin: só aceita DDD + 8/9 dígitos e grava sempre na mesma máscara
        // do /criar. A coluna customer_phone_digits (gerada no Postgres) acompanha sozinha.
        if (key === 'customerPhone') {
          if (!telefoneBrCompleto(val)) {
            return NextResponse.json({ error: 'Telefone inválido. Use DDD + número, ex.: (31) 98241-4961.' }, { status: 400 });
          }
          updateData.customerPhone = formatarTelefoneBr(val);
          continue;
        }
        if (key === 'audioFiles' && Array.isArray(val)) {
          const cleanFiles = val.filter(f => typeof f === 'string' && !f.includes('/api/audio/proxy'));
          if (cleanFiles.length === 0) continue;
          updateData[key] = cleanFiles;
          continue;
        }
        updateData[key] = val;
      }
    }

    await updateOrder(orderId, updateData, env);

    return NextResponse.json({ success: true, orderId, updated: updateData }, { status: 200 });

  } catch (error) {
    console.error("Erro na API /api/orders/update:", error);
    return NextResponse.json({ error: error.message || 'Erro ao atualizar pedido' }, { status: 500 });
  }
}

