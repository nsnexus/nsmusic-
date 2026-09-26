import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { calcularCota } from '@/lib/cotaGeracoes';
import { registrarResetDeCota, normalizarTelefone, idDoReset, lerTodosOsResets } from '@/lib/cotaReset';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getBlocklist, addBlockContact, removeBlockContact, obterVariacoesTelefone } from '@/lib/blocklist';

export const runtime = 'edge';

// Janela de varredura.
const DIAS_DE_VARREDURA = 15;
const MAX_PEDIDOS = 2500;

async function carregarPedidos(env) {
  const desde = new Date(Date.now() - DIAS_DE_VARREDURA * 24 * 60 * 60 * 1000).toISOString();
  const porTelefone = new Map();

  const supabase = getSupabaseEdge(env);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_phone, customer_name, payment_status, created_at, deleted_at, production_status')
        .gte('created_at', desde)
        .is('deleted_at', 'null')
        .order('created_at', { ascending: false })
        .limit(MAX_PEDIDOS);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.production_status === 'CONFIG' || row.production_status === 'RASCUNHO') continue;
          const telefone = normalizarTelefone(row.customer_phone);
          if (!telefone || telefone.length < 10) continue;

          if (!porTelefone.has(telefone)) porTelefone.set(telefone, []);
          porTelefone.get(telefone).push({
            createdAt: row.created_at || null,
            paymentStatus: row.payment_status || null,
            customerName: row.customer_name || '',
          });
        }
      }
    } catch (e) {
      console.warn('[admin/cotas] Erro na consulta do Supabase:', e.message);
    }
  }

  return porTelefone;
}


export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  try {
    const porTelefone = await carregarPedidos(env);
    const bloqueados = [];
    const topGeradores = [];

    // Todos os resets e a lista de bloqueados manuais numa tacada só
    const [resets, blocklist] = await Promise.all([
      lerTodosOsResets(),
      getBlocklist(env).catch(() => []),
    ]);

    for (const [telefone, pedidos] of porTelefone.entries()) {
      // Mesma conta do /api/orders/create — o painel não pode discordar da trava.
      const resetAt = resets.get(await idDoReset(telefone)) || '';
      const cota = calcularCota(pedidos, { resetAt });

      const maisRecente = pedidos.reduce((a, b) => (
        (Date.parse(b.createdAt || '') || 0) > (Date.parse(a.createdAt || '') || 0) ? b : a
      ), pedidos[0]);

      // Verifica se este telefone está manualmente bloqueado
      const phoneVars = obterVariacoesTelefone(telefone);
      const manualItem = blocklist.find(
        (b) => b.type === 'phone' && phoneVars.some((v) => obterVariacoesTelefone(b.value).includes(v))
      );

      const clienteInfo = {
        telefone,
        nome: maisRecente?.customerName || '',
        usados: cota.usados,
        cota: cota.cota,
        pagos: cota.pagos,
        ultimoPedidoEm: maisRecente?.createdAt || null,
        resetAt: resetAt || null,
        bloqueadoCota: cota.bloqueado,
        bloqueadoManual: Boolean(manualItem),
        motivoBloqueio: manualItem?.reason || null,
        bloqueadoEm: manualItem?.blockedAt || null,
      };

      if (cota.bloqueado) {
        bloqueados.push(clienteInfo);
      }

      // Quem gerou 2 ou mais músicas (ou já está bloqueado) entra no ranking de maiores geradores
      if (cota.usados >= 2 || manualItem) {
        topGeradores.push(clienteInfo);
      }
    }

    bloqueados.sort((a, b) => (Date.parse(b.ultimoPedidoEm || '') || 0) - (Date.parse(a.ultimoPedidoEm || '') || 0));
    topGeradores.sort((a, b) => b.usados - a.usados);

    return NextResponse.json({
      bloqueados,
      topGeradores: topGeradores.slice(0, 50),
      blocklist,
      telefonesAnalisados: porTelefone.size,
      dias: DIAS_DE_VARREDURA,
    });
  } catch (error) {
    console.error('[admin/cotas] Erro ao listar bloqueados:', error.message);
    return NextResponse.json({ error: `Falha ao listar os limites: ${error.message}` }, { status: 500 });
  }
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'reset';

    // Ação: Bloquear pessoa manualmente
    if (action === 'block') {
      const res = await addBlockContact({
        phone: body?.telefone,
        email: body?.email,
        name: body?.nome || body?.name || '',
        reason: body?.motivo || body?.reason || 'Bloqueio manual de geração excessiva',
        blockedBy: auth.email || auth.uid || 'admin',
      }, env);
      return NextResponse.json(res);
    }

    // Ação: Desbloquear pessoa
    if (action === 'unblock') {
      const idOuValor = body?.id || body?.telefone || body?.email;
      const res = await removeBlockContact(idOuValor, env);
      return NextResponse.json(res);
    }

    // Ação padrão: Resetar cota automática do telefone
    const telefone = normalizarTelefone(body?.telefone);
    if (!telefone || telefone.length < 10) {
      return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });
    }

    const resultado = await registrarResetDeCota(telefone, { porQuem: auth.email || auth.uid || '' });
    if (!resultado.ok) {
      return NextResponse.json({ error: 'Não foi possível registrar o reset.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, resetAt: resultado.resetAt });
  } catch (error) {
    console.error('[admin/cotas] Erro ao processar limite/bloqueio:', error.message);
    return NextResponse.json({ error: error.message || 'Falha ao processar solicitação.' }, { status: 500 });
  }
}
