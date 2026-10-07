import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';

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

    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    }

    const agora = new Date().toISOString();
    const orderId = `teste-robo-${Date.now()}`;
    const orderNumber = `TEST-${Math.floor(100000 + Math.random() * 900000)}`;

    const testOrder = {
      id: orderId,
      orderNumber,
      customerName: 'Teste Admin Robô',
      customerPhone: '5594991081351',
      recipientName: 'Teste Robô Suno Local',
      story: 'Música de teste criada para validar o robô local de automação Suno.com.',
      musicStyle: 'Acoustic Pop, Happy, Uplifting',
      lyrics: '[Verse 1]\nEsse é um teste do robô local\nCriando a música no Suno direto\nSem limites de download afinal\nCom o R2 tudo fica perfeito\n\n[Chorus]\nO robô funcionou!\nGerou a canção e salvou no R2!\nQualidade nota dez!\nTestado e aprovado agora mesmo!',
      sunoProvider: 'suno_local',
      status_robo: 'PENDENTE_ROBO',
      productionStatus: 'GERANDO_AUDIO',
      paymentStatus: 'PAGO',
      createdAt: agora,
      created_at: agora,
      updatedAt: agora,
      updated_at: agora
    };

    const { error: insertErr } = await supabase.from('orders').insert(testOrder);
    if (insertErr) {
      return NextResponse.json({ error: `Erro ao criar pedido de teste: ${insertErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      orderId,
      orderNumber,
      message: 'Pedido de teste criado. O robô local no seu PC irá capturar e processar.'
    });
  } catch (err) {
    console.error('[suno-local/test] Erro:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
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

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
    }

    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, orderNumber, status_robo, musicUrl, musicUrl2, robo_erro, robo_iniciado_em, updated_at')
      .eq('id', orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: 'Pedido de teste não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      order
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
