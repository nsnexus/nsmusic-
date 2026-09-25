import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { calcularCota } from '@/lib/cotaGeracoes';
import { registrarResetDeCota, normalizarTelefone, idDoReset, lerTodosOsResets } from '@/lib/cotaReset';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Quem estourou a cota de gerações, e o botão para liberar.
//
// GET  → lista os telefones bloqueados no período recente, com quantas gerações usaram, quantas
//        compras têm e qual a cota atual.
// POST → registra o reset daquele telefone: os pedidos anteriores deixam de contar (ver
//        src/lib/cotaReset.js). Nenhum pedido é apagado.
//
// Só admin verificado no servidor (.claude/rules/security.md: identidade de admin nunca vem do
// cliente). O telefone aparece na resposta porque o painel já lista pedidos com telefone e é por
// ele que o estúdio identifica a pessoa — mas nunca vai para log nem para id de documento.

// Janela de varredura. Cota é acumulada sobre o histórico inteiro da pessoa, mas quem interessa ao
// estúdio é quem esbarrou no limite agora — e ler a coleção inteira custa uma leitura por documento.
import { getSupabaseEdge } from '@/lib/supabase-edge';

// 15 dias e o suficiente: quem estourou a cota gerou pelo menos 5 musicas em sequencia, e isso
// acontece em dias, nao em meses. Janela maior faz a rota ler milhares de documentos por abertura
// da aba — com ~145 pedidos criados por dia, 45 dias passavam de 6 mil.
const DIAS_DE_VARREDURA = 15;
const MAX_PEDIDOS = 2500;

async function carregarPedidos(env) {
  const desde = new Date(Date.now() - DIAS_DE_VARREDURA * 24 * 60 * 60 * 1000).toISOString();

  // 1. Tenta consulta direta no Supabase
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
        const porTelefone = new Map();
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
        return porTelefone;
      }
    } catch (e) {
      console.warn('[admin/cotas] Fallback para Firestore devido a erro no Supabase:', e.message);
    }
  }

  // 2. Fallback Firestore
  const snap = await getDocs(query(
    collection(db, 'orders'),
    where('createdAt', '>=', desde),
    orderBy('createdAt', 'desc'),
    limit(MAX_PEDIDOS)
  ));

  const porTelefone = new Map();
  snap.forEach((d) => {
    const data = d.data();
    if (data.deletedAt) return;
    if (d.id.startsWith('config_') || d.id.startsWith('session_')) return;
    if (data.productionStatus === 'CONFIG' || data.productionStatus === 'RASCUNHO') return;

    const telefone = normalizarTelefone(data.customerPhone);
    if (!telefone || telefone.length < 10) return;

    if (!porTelefone.has(telefone)) porTelefone.set(telefone, []);
    porTelefone.get(telefone).push({
      createdAt: data.createdAt || null,
      paymentStatus: data.paymentStatus || null,
      customerName: data.customerName || '',
    });
  });

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

    // Todos os resets numa consulta só. Ler documento por documento dentro do laço estourava o
    // limite de subrequests do Worker com algumas centenas de clientes, e a aba inteira falhava
    // (achado 25/09/2026, na primeira vez que foi aberta em produção).
    const resets = await lerTodosOsResets();

    for (const [telefone, pedidos] of porTelefone.entries()) {
      // Mesma conta do /api/orders/create — o painel não pode discordar da trava.
      const resetAt = resets.get(await idDoReset(telefone)) || '';
      const cota = calcularCota(pedidos, { resetAt });
      if (!cota.bloqueado) continue;

      const maisRecente = pedidos.reduce((a, b) => (
        (Date.parse(b.createdAt || '') || 0) > (Date.parse(a.createdAt || '') || 0) ? b : a
      ), pedidos[0]);

      bloqueados.push({
        telefone,
        nome: maisRecente?.customerName || '',
        usados: cota.usados,
        cota: cota.cota,
        pagos: cota.pagos,
        ultimoPedidoEm: maisRecente?.createdAt || null,
        resetAt: resetAt || null,
      });
    }

    bloqueados.sort((a, b) => (Date.parse(b.ultimoPedidoEm || '') || 0) - (Date.parse(a.ultimoPedidoEm || '') || 0));

    return NextResponse.json({ bloqueados, telefonesAnalisados: porTelefone.size, dias: DIAS_DE_VARREDURA });
  } catch (error) {
    console.error('[admin/cotas] Erro ao listar bloqueados:', error.message);
    // Mensagem com o motivo real: o generico "Falha na requisicao" na tela nao dizia nada e custou
    // uma ida e volta so para descobrir o que tinha quebrado (25/09/2026).
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
    console.error('[admin/cotas] Erro ao resetar cota:', error.message);
    return NextResponse.json({ error: 'Falha ao resetar o limite.' }, { status: 500 });
  }
}
