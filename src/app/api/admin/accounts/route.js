import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';

function getSupabaseAdminConfig(env) {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return {
    url,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    }
  };
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

    const conf = getSupabaseAdminConfig(env);
    if (!conf) {
      return NextResponse.json({ error: 'Configuração do Supabase indisponível no servidor' }, { status: 500 });
    }

    const { url, headers } = conf;

    // 1. Busca usuários criados via Supabase GoTrue Admin
    const resUsers = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=100`, {
      headers,
      signal: AbortSignal.timeout(10000)
    });
    if (!resUsers.ok) {
      const errTxt = await resUsers.text().catch(() => '');
      return NextResponse.json({ error: `Falha ao listar usuários no GoTrue: ${errTxt}` }, { status: 500 });
    }
    const usersData = await resUsers.json();
    const rawUsers = usersData?.users || [];

    // 2. Busca histórico do livro-razão de créditos para calcular saldos
    const resLedger = await fetch(`${url}/rest/v1/credit_ledger?select=user_id,amount,reason,created_at`, {
      headers,
      signal: AbortSignal.timeout(10000)
    });
    const ledgerEntries = resLedger.ok ? await resLedger.json().catch(() => []) : [];
    const balances = {};
    for (const entry of ledgerEntries) {
      if (!entry.user_id) continue;
      balances[entry.user_id] = (balances[entry.user_id] || 0) + Number(entry.amount || 0);
    }

    // 3. Busca pedidos para associar às contas
    const resOrders = await fetch(
      `${url}/rest/v1/orders?select=id,order_number,user_id,customer_name,customer_email,customer_phone,honoree_name,music_style,payment_status,production_status,audio_files,created_at&order=created_at.desc&limit=500`,
      { headers, signal: AbortSignal.timeout(10000) }
    );
    const ordersList = resOrders.ok ? await resOrders.json().catch(() => []) : [];

    // 4. Mapeia dados finais
    const users = rawUsers.map((u) => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const userOrders = ordersList.filter((ord) => {
        if (ord.user_id && ord.user_id === u.id) return true;
        if (uEmail && ord.customer_email && ord.customer_email.toLowerCase().trim() === uEmail) return true;
        return false;
      });

      return {
        id: u.id,
        email: u.email,
        phone: u.phone || u.user_metadata?.phone || '',
        name: u.user_metadata?.name || u.user_metadata?.full_name || '',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        balance: Math.round((balances[u.id] || 0) * 10) / 10,
        orders: userOrders.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          userId: o.user_id,
          isExplicitlyLinked: Boolean(o.user_id && o.user_id === u.id),
          honoreeName: o.honoree_name,
          customerName: o.customer_name,
          musicStyle: o.music_style,
          paymentStatus: o.payment_status,
          productionStatus: o.production_status,
          hasAudio: Boolean(o.audio_files && o.audio_files.length > 0),
          createdAt: o.created_at
        }))
      };
    });

    return NextResponse.json({ ok: true, users });
  } catch (err) {
    console.error('[admin/accounts] Erro ao carregar contas:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao listar contas' }, { status: 500 });
  }
}

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

    const conf = getSupabaseAdminConfig(env);
    if (!conf) {
      return NextResponse.json({ error: 'Configuração do Supabase indisponível no servidor' }, { status: 500 });
    }

    const { url, headers } = conf;
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Ação 1: Conceder créditos
    if (action === 'grant_credits') {
      const { userId, amount, note } = body;
      const numAmount = Number(amount);
      if (!userId || !numAmount || numAmount <= 0) {
        return NextResponse.json({ error: 'Informe um usuário e uma quantidade válida de créditos (> 0).' }, { status: 400 });
      }

      // Garante conta em credit_accounts
      await fetch(`${url}/rest/v1/credit_accounts`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({
          user_id: userId,
          referral_code: Math.random().toString(36).substring(2, 12)
        })
      });

      // Lança crédito no livro-razão
      const resLedger = await fetch(`${url}/rest/v1/credit_ledger`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: userId,
          amount: numAmount,
          reason: 'bonus_indicacoes',
          sku: `bonus_admin_${Date.now()}`
        })
      });

      if (!resLedger.ok) {
        const errTxt = await resLedger.text().catch(() => '');
        return NextResponse.json({ error: `Falha ao lançar créditos: ${errTxt}` }, { status: 500 });
      }

      // Calcula novo saldo
      const resSum = await fetch(`${url}/rest/v1/credit_ledger?user_id=eq.${userId}&select=amount`, { headers });
      const sumData = await resSum.json().catch(() => []);
      const newBalance = (sumData || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);

      return NextResponse.json({
        ok: true,
        balance: Math.round(newBalance * 10) / 10,
        message: `${numAmount} crédito(s) concedido(s) com sucesso!`
      });
    }

    // Ação 2: Gerar link de redefinição de senha
    if (action === 'recovery_link') {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ error: 'E-mail é obrigatório para gerar o link de redefinição.' }, { status: 400 });
      }

      const resLink = await fetch(`${url}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'recovery',
          email: email.trim().toLowerCase()
        })
      });

      if (!resLink.ok) {
        const errTxt = await resLink.text().catch(() => '');
        return NextResponse.json({ error: `Falha ao gerar link no GoTrue: ${errTxt}` }, { status: 500 });
      }

      const linkData = await resLink.json();
      return NextResponse.json({
        ok: true,
        actionLink: linkData.action_link || linkData.properties?.action_link || ''
      });
    }

    // Ação 3: Vincular pedido a uma conta de usuário
    if (action === 'link_order') {
      const { userId } = body;
      const orderIdentifier = String(body.orderId || body.orderNumber || body.orderIdentifier || '').trim();

      if (!userId) {
        return NextResponse.json({ error: 'Informe a conta de usuário (userId).' }, { status: 400 });
      }
      if (!orderIdentifier) {
        return NextResponse.json({ error: 'Informe o ID ou número do pedido (NS-...).' }, { status: 400 });
      }

      const resOrder = await fetch(
        `${url}/rest/v1/orders?or=(id.eq.${encodeURIComponent(orderIdentifier)},order_number.eq.${encodeURIComponent(orderIdentifier)})&select=id,order_number,user_id,customer_name,customer_email,honoree_name`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      const ordersFound = resOrder.ok ? await resOrder.json().catch(() => []) : [];
      if (!Array.isArray(ordersFound) || ordersFound.length === 0) {
        return NextResponse.json({ error: `Pedido "${orderIdentifier}" não foi encontrado.` }, { status: 404 });
      }
      const targetOrder = ordersFound[0];

      const nowIso = new Date().toISOString();
      const resUpdate = await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(targetOrder.id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: userId,
          updated_at: nowIso
        })
      });

      if (!resUpdate.ok) {
        const errTxt = await resUpdate.text().catch(() => '');
        return NextResponse.json({ error: `Falha ao vincular pedido: ${errTxt}` }, { status: 500 });
      }

      const updatedRows = await resUpdate.json().catch(() => []);
      const updatedOrder = updatedRows[0] || { ...targetOrder, user_id: userId };

      return NextResponse.json({
        ok: true,
        message: `Pedido ${targetOrder.order_number || targetOrder.id} vinculado com sucesso!`,
        order: {
          id: updatedOrder.id,
          orderNumber: updatedOrder.order_number,
          userId: updatedOrder.user_id,
          customerName: updatedOrder.customer_name,
          honoreeName: updatedOrder.honoree_name
        }
      });
    }

    // Ação 4: Desvincular pedido de uma conta de usuário
    if (action === 'unlink_order') {
      const orderIdentifier = String(body.orderId || body.orderNumber || body.orderIdentifier || '').trim();
      if (!orderIdentifier) {
        return NextResponse.json({ error: 'Informe o ID ou número do pedido para desvincular.' }, { status: 400 });
      }

      const resOrder = await fetch(
        `${url}/rest/v1/orders?or=(id.eq.${encodeURIComponent(orderIdentifier)},order_number.eq.${encodeURIComponent(orderIdentifier)})&select=id,order_number,user_id`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      const ordersFound = resOrder.ok ? await resOrder.json().catch(() => []) : [];
      if (!Array.isArray(ordersFound) || ordersFound.length === 0) {
        return NextResponse.json({ error: `Pedido "${orderIdentifier}" não foi encontrado.` }, { status: 404 });
      }
      const targetOrder = ordersFound[0];

      const nowIso = new Date().toISOString();
      const resUpdate = await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(targetOrder.id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: null,
          updated_at: nowIso
        })
      });

      if (!resUpdate.ok) {
        const errTxt = await resUpdate.text().catch(() => '');
        return NextResponse.json({ error: `Falha ao desvincular pedido: ${errTxt}` }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `Pedido ${targetOrder.order_number || targetOrder.id} desvinculado com sucesso!`
      });
    }

    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (err) {
    console.error('[admin/accounts] Erro na rota POST:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao processar requisição' }, { status: 500 });
  }
}
