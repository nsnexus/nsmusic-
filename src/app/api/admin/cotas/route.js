import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { calcularCota } from '@/lib/cotaGeracoes';
import { lerResetDeCota, registrarResetDeCota, normalizarTelefone } from '@/lib/cotaReset';

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
const DIAS_DE_VARREDURA = 45;
const MAX_PEDIDOS = 4000;

async function carregarPedidos() {
  const desde = new Date(Date.now() - DIAS_DE_VARREDURA * 24 * 60 * 60 * 1000).toISOString();
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
    const porTelefone = await carregarPedidos();
    const bloqueados = [];

    for (const [telefone, pedidos] of porTelefone.entries()) {
      // Sem reset, a conta é a mesma do /api/orders/create — o painel não pode discordar da trava.
      const resetAt = await lerResetDeCota(telefone);
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
    return NextResponse.json({ error: 'Falha ao listar os limites.' }, { status: 500 });
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
