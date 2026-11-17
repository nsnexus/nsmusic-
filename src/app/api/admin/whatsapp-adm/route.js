import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import { carregarAdm, salvarAdm, gerarSegredo, estadoDaConexao, conectarInstancia } from '@/lib/whatsappAdm';
import { DOMINIO_CANONICO } from '@/lib/siteUrl';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function urlDoWebhook(config) {
  return `${DOMINIO_CANONICO}/api/whatsapp/adm/webhook/${config.segredo}`;
}

// A chave da instância nunca volta para o navegador.
function publico(ctx, estado) {
  return {
    ok: true,
    evolutionConfigurada: Boolean(ctx.evolution),
    ligada: ctx.config.ligada,
    instanceName: ctx.config.instanceName,
    estado,
    webhookUrl: ctx.config.segredo ? urlDoWebhook(ctx.config) : '',
    ultimasAcoes: ctx.config.ultimasAcoes,
  };
}

export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;
  try {
    const ctx = await carregarAdm(env);
    if (!ctx.supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    const estado = ctx.evolution ? await estadoDaConexao(ctx.evolution) : 'sem_evolution';
    return NextResponse.json(publico(ctx, estado));
  } catch (err) {
    console.error('[admin/whatsapp-adm] Erro ao ler:', err.message);
    return NextResponse.json({ error: 'Não foi possível carregar a configuração.' }, { status: 500 });
  }
}

export async function POST(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  const body = await req.json().catch(() => null);
  const acao = String(body?.action || '');
  if (!['salvar', 'conectar'].includes(acao)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  }

  try {
    const ctx = await carregarAdm(env);
    if (!ctx.supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    if (!ctx.evolution) return NextResponse.json({ error: 'A Evolution API não está configurada no site.' }, { status: 400 });

    if (!ctx.config.segredo) ctx.config = { ...ctx.config, segredo: gerarSegredo() };

    if (acao === 'salvar') {
      if (typeof body.ligada !== 'boolean') return NextResponse.json({ error: 'Informe se a automação fica ligada.' }, { status: 400 });
      ctx.config = { ...ctx.config, ligada: body.ligada };
      await salvarAdm(ctx.supabase, ctx.config);
      return NextResponse.json(publico(ctx, await estadoDaConexao(ctx.evolution)));
    }

    await salvarAdm(ctx.supabase, ctx.config);
    const r = await conectarInstancia(ctx, urlDoWebhook(ctx.config));
    if (!r.ok) return NextResponse.json({ ...publico(ctx, 'inexistente'), ok: false, error: r.erro }, { status: 502 });
    return NextResponse.json({ ...publico(ctx, r.estado), qr: r.qr, webhookOk: r.webhookOk });
  } catch (err) {
    console.error('[admin/whatsapp-adm] Erro:', err.message);
    return NextResponse.json({ error: 'Não foi possível concluir. Tente de novo.' }, { status: 500 });
  }
}
