import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import { listarConversas, lerAtendimentoDoCliente, agruparPorCliente } from '@/lib/suporteHistorico';

export const runtime = 'edge';

// Aba "Atendimentos" do painel: conversas do chat de suporte do site (/suporte).
// GET ?id=<uuid> → o atendimento completo do cliente dessa conversa (todas as vezes que ele abriu o
// chat, pelo WhatsApp); sem id → lista com um item por cliente (busca ?telefone=, paginação ?antes=).
export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (id) {
    const r = await lerAtendimentoDoCliente(id, env);
    if (!r.ok) return NextResponse.json({ error: r.motivo === 'nao_encontrada' ? 'Conversa não encontrada.' : 'Não foi possível ler a conversa.' }, { status: r.motivo === 'nao_encontrada' ? 404 : 400 });
    return NextResponse.json({ conversa: r.conversa });
  }

  const telefone = String(searchParams.get('telefone') || '').replace(/\D/g, '').slice(0, 13);
  // Busca 3x mais conversas e junta por cliente, para a página ainda ter ~`limite` clientes.
  const limite = Math.min(Math.max(Number(searchParams.get('limite')) || 40, 1), 100);
  const r = await listarConversas({ telefone, antes: searchParams.get('antes') || '', limite: Math.min(limite * 3, 100) }, env);
  if (!r.ok) {
    // Tabela ainda não criada no Supabase: avisa em vez de mostrar lista vazia sem explicação.
    const semTabela = /suporte_conversas|does not exist|42P01/i.test(r.erro || '');
    return NextResponse.json({ error: semTabela ? 'A tabela de atendimentos ainda não foi criada no Supabase (rode supabase/migrations/20261125_suporte_conversas.sql).' : 'Não foi possível listar os atendimentos.' }, { status: semTabela ? 503 : 500 });
  }
  // `antes` da próxima página: a conversa mais antiga lida (não a do último cliente agrupado).
  const maisAntiga = r.conversas.length ? r.conversas[r.conversas.length - 1].atualizado_em : null;
  return NextResponse.json({
    conversas: agruparPorCliente(r.conversas).slice(0, limite),
    proximaPagina: maisAntiga,
    temMais: r.conversas.length >= Math.min(limite * 3, 100),
  });
}
