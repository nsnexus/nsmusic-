import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import { carregarContexto, salvarConfig, lerEstado, normalizarConfig } from '@/lib/instagramAutomacao';
import { verificarPermissoes, listarContasInstagram, explicarErroMeta, PERMISSOES_COMENTARIOS, PERMISSAO_ANUNCIOS, PERMISSAO_PUBLICAR } from '@/lib/instagramGraph';
import { listarPaginas, PERMISSOES_FACEBOOK } from '@/lib/facebookGraph';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// O token nunca volta para o navegador: o painel só fica sabendo se existe um salvo.
function configPublica(ctx) {
  const { accessToken, ...resto } = ctx.config;
  return {
    ...resto,
    temToken: Boolean(ctx.token),
    tokenProprio: ctx.tokenProprio,
    temContaDeAnuncios: Boolean(ctx.adAccountId),
  };
}

async function diagnosticar(ctx) {
  if (!ctx.token) return { ok: false, motivo: 'sem_token', faltando: PERMISSOES_COMENTARIOS, faltandoFacebook: PERMISSOES_FACEBOOK, contas: [], paginas: [] };
  try {
    const [perms, contas, paginas] = await Promise.all([
      verificarPermissoes(ctx.token),
      listarContasInstagram(ctx.token).catch(() => []),
      // O token de cada Página nunca sai daqui: o painel só recebe ID e nome.
      listarPaginas(ctx.token).then((lista) => lista.map(({ pageId, nome }) => ({ pageId, nome }))).catch(() => []),
    ]);
    return {
      ok: perms.faltando.length === 0 && contas.length > 0,
      faltando: perms.faltando,
      faltandoFacebook: PERMISSOES_FACEBOOK.filter((p) => !perms.concedidas.includes(p)),
      paginas,
      temAnuncios: perms.temAnuncios,
      temPublicar: perms.temPublicar,
      contas,
      motivo: perms.faltando.length > 0 ? 'permissoes' : contas.length === 0 ? 'sem_conta_instagram' : null,
    };
  } catch (err) {
    console.warn('[admin/instagram/config] Diagnóstico falhou:', err.code || err.name);
    return { ok: false, motivo: 'meta_erro', aviso: explicarErroMeta(err), faltando: [], faltandoFacebook: [], contas: [], paginas: [] };
  }
}

export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  try {
    const ctx = await carregarContexto(env);
    if (!ctx.supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });

    const comDiagnostico = new URL(req.url).searchParams.get('diagnostico') === '1';
    const [estado, diagnostico] = await Promise.all([
      lerEstado(ctx.supabase),
      comDiagnostico ? diagnosticar(ctx) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ok: true,
      config: configPublica(ctx),
      diagnostico,
      permissoesNecessarias: [...PERMISSOES_COMENTARIOS, PERMISSAO_ANUNCIOS, PERMISSAO_PUBLICAR],
      permissoesFacebook: PERMISSOES_FACEBOOK,
      historico: estado.historico,
      ultimaExecucao: estado.ultimaExecucao,
    });
  } catch (err) {
    console.error('[admin/instagram/config] Erro ao ler:', err.message);
    return NextResponse.json({ error: 'Não foi possível carregar a configuração.' }, { status: 500 });
  }
}

export async function POST(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  const body = await req.json().catch(() => ({}));

  try {
    const ctx = await carregarContexto(env);
    if (!ctx.supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });

    const nova = { ...ctx.config };

    if (body?.accessToken !== undefined) {
      const token = String(body.accessToken || '').trim();
      if (token && (token.length < 40 || /\s/.test(token))) {
        return NextResponse.json({ error: 'Esse token não parece válido. Cole o token inteiro, sem espaços.' }, { status: 400 });
      }
      nova.accessToken = token;
      // Token novo pode ser de outra conta: a conta é redescoberta na próxima leitura.
      nova.igUserId = '';
      nova.igUsername = '';
      nova.fbPageId = '';
      nova.fbPageName = '';
    }
    if (body?.fbPageId !== undefined) {
      nova.fbPageId = String(body.fbPageId || '');
      nova.fbPageName = String(body.fbPageName || '');
    }
    if (body?.igUserId !== undefined) {
      nova.igUserId = String(body.igUserId || '');
      nova.igUsername = String(body.igUsername || '');
    }
    if (body?.instrucoes !== undefined) nova.instrucoes = String(body.instrucoes || '');
    if (body?.ocultarOfensivos !== undefined) nova.ocultarOfensivos = Boolean(body.ocultarOfensivos);
    if (body?.ocultarReclamacoes !== undefined) nova.ocultarReclamacoes = Boolean(body.ocultarReclamacoes);
    if (body?.incluirAnuncios !== undefined) nova.incluirAnuncios = Boolean(body.incluirAnuncios);
    if (body?.maxPorExecucao !== undefined) nova.maxPorExecucao = Number(body.maxPorExecucao);

    if (body?.ligada !== undefined) {
      const ligar = Boolean(body.ligada);
      // O relógio começa a contar no momento em que liga: comentário anterior a isso nunca recebe
      // resposta automática.
      if (ligar && !ctx.config.ligada) nova.ligadaEm = new Date().toISOString();
      nova.ligada = ligar;
    }

    if (body?.facebookLigado !== undefined) {
      const ligarFb = Boolean(body.facebookLigado);
      // Mesmo relógio do Instagram: comentário anterior ao momento em que ligou fica como está.
      if (ligarFb && !ctx.config.facebookLigado) nova.facebookLigadoEm = new Date().toISOString();
      nova.facebookLigado = ligarFb;
    }

    const normalizada = normalizarConfig(nova);
    if ((normalizada.ligada || normalizada.facebookLigado) && !(normalizada.accessToken || ctx.token)) {
      return NextResponse.json({ error: 'Conecte o token da Meta antes de ligar a automação.' }, { status: 400 });
    }

    await salvarConfig(ctx.supabase, normalizada);
    const ctxNovo = await carregarContexto(env);
    return NextResponse.json({ ok: true, config: configPublica(ctxNovo) });
  } catch (err) {
    console.error('[admin/instagram/config] Erro ao salvar:', err.message);
    return NextResponse.json({ error: 'Não foi possível salvar a configuração.' }, { status: 500 });
  }
}
