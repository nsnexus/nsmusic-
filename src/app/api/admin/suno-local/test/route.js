import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { mapFirestoreOrderToSupabase } from '@/lib/supabaseSync';

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
      updatedAt: agora
    };

    const mapped = mapFirestoreOrderToSupabase(orderId, testOrder);
    const { error: insertErr } = await supabase.from('orders').insert(mapped);
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
      .select('id, order_number, audio_url, audio_files, production_status, extras, updated_at')
      .eq('id', orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: 'Pedido de teste não encontrado' }, { status: 404 });
    }

    const extras = (order.extras && typeof order.extras === 'object') ? order.extras : {};
    const audioUrl = order.audio_url || extras.musicUrl || null;
    const audioUrl2 = order.audio_files?.[1] || extras.musicUrl2 || null;
    const statusRobo = extras.status_robo || (audioUrl ? 'CONCLUIDO' : 'PROCESSANDO');

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status_robo: statusRobo,
        musicUrl: audioUrl,
        musicUrl2: audioUrl2,
        robo_erro: extras.robo_erro || null,
        robo_iniciado_em: extras.robo_iniciado_em || null,
        updated_at: order.updated_at
      }
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
