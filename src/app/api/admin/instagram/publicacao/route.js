import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import {
  carregarConfigPublicacao,
  salvarConfigPublicacao,
  lerEstadoPublicacao,
  lerPostDoDia,
  montarLinkDaMidia,
  executarPublicacao,
  liberarDia,
  agoraEmBrasilia,
  normalizarHorario,
  segredoDeAssinatura,
} from '@/lib/instagramPublicacao';
import { extrairIdDaPasta, lerContaDeServico, explicarErroDrive } from '@/lib/googleDrive';
import { carregarContexto } from '@/lib/instagramAutomacao';
import { verificarPermissoes } from '@/lib/instagramGraph';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// A chave privada da conta de serviço nunca volta para o navegador — só o e-mail dela, que é o que
// o dono precisa para compartilhar a pasta.
function configPublica(config) {
  return {
    ligada: config.ligada,
    horario: config.horario,
    pastaId: config.pastaId,
    emailDaContaDeServico: config.contaDeServico?.client_email || '',
  };
}

async function conferirHoje(config, env, data) {
  if (!config.contaDeServico || !config.pastaId) return { configurado: false };
  try {
    const post = await lerPostDoDia(config, data);
    // Sem CRON_SECRET não há como assinar o link da miniatura; a tela mostra o aviso próprio.
    const assinar = Boolean(segredoDeAssinatura(env));
    const imagens = await Promise.all(
      post.imagens.map(async (img) => ({ nome: img.nome, link: assinar ? await montarLinkDaMidia(img.id, env) : '' })),
    );
    return { configurado: true, existe: post.existe, imagens, legenda: post.legenda, problemas: post.problemas, proximas: post.proximas };
  } catch (err) {
    if (err?.name !== 'DriveError' && err?.name !== 'TimeoutError') throw err;
    console.warn('[admin/instagram/publicacao] Falha ao ler o Drive:', err.status || err.name);
    return { configurado: true, erro: explicarErroDrive(err) };
  }
}

async function podePublicar(env) {
  try {
    const ctx = await carregarContexto(env);
    if (!ctx.token) return false;
    return (await verificarPermissoes(ctx.token)).temPublicar;
  } catch (err) {
    console.warn('[admin/instagram/publicacao] Não foi possível conferir a permissão:', err.code || err.name);
    return null;
  }
}

export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  try {
    const { supabase, config } = await carregarConfigPublicacao(env);
    if (!supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });

    const { data, hora } = agoraEmBrasilia();
    const conferir = new URL(req.url).searchParams.get('conferir') === '1';
    const [estado, hoje, permissaoPublicar] = await Promise.all([
      lerEstadoPublicacao(supabase),
      conferir ? conferirHoje(config, env, data) : Promise.resolve(null),
      conferir ? podePublicar(env) : Promise.resolve(undefined),
    ]);

    const historico = Object.entries(estado.dias)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([dia, r]) => ({ data: dia, status: r.status, em: r.em, link: r.link || '', erro: r.erro || '', imagens: r.imagens || 0, tentativas: r.tentativas || 0 }));

    return NextResponse.json({
      ok: true,
      config: configPublica(config),
      dataDeHoje: data,
      horaAgora: hora,
      assinaturaConfigurada: Boolean(segredoDeAssinatura(env)),
      permissaoPublicar,
      hoje,
      historico,
    });
  } catch (err) {
    console.error('[admin/instagram/publicacao] Erro ao ler:', err.message);
    return NextResponse.json({ error: 'Não foi possível carregar as publicações.' }, { status: 500 });
  }
}

export async function POST(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  const body = await req.json().catch(() => ({}));

  try {
    const { supabase, config } = await carregarConfigPublicacao(env);
    if (!supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });

    if (body?.acao === 'publicar') {
      const resultado = await executarPublicacao({ env, manual: true });
      return NextResponse.json(resultado);
    }
    if (body?.acao === 'liberar') {
      const liberado = await liberarDia(supabase, body?.data);
      if (!liberado) return NextResponse.json({ error: 'Esse dia não pode ser liberado.' }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const nova = { ...config };

    if (body?.horario !== undefined) {
      const horario = normalizarHorario(body.horario);
      if (!horario) return NextResponse.json({ error: 'Horário inválido. Use o formato 09:00.' }, { status: 400 });
      nova.horario = horario;
    }
    if (body?.pasta !== undefined) {
      const pastaId = extrairIdDaPasta(body.pasta);
      if (!pastaId) return NextResponse.json({ error: 'Não reconheci esse link. Cole o link da pasta do Google Drive.' }, { status: 400 });
      nova.pastaId = pastaId;
    }
    if (body?.contaDeServico !== undefined) {
      const conta = lerContaDeServico(body.contaDeServico);
      if (!conta) {
        return NextResponse.json({ error: 'Esse não parece o arquivo JSON da conta de serviço. Cole o conteúdo inteiro do arquivo.' }, { status: 400 });
      }
      nova.contaDeServico = conta;
    }
    if (body?.ligada !== undefined) {
      nova.ligada = Boolean(body.ligada);
      if (nova.ligada && (!nova.contaDeServico || !nova.pastaId)) {
        return NextResponse.json({ error: 'Configure a pasta do Drive e a conta de serviço antes de ligar.' }, { status: 400 });
      }
      if (nova.ligada && !segredoDeAssinatura(env)) {
        return NextResponse.json({ error: 'CRON_SECRET não está configurado no servidor.' }, { status: 500 });
      }
    }

    await salvarConfigPublicacao(supabase, nova);
    const atual = await carregarConfigPublicacao(env);
    return NextResponse.json({ ok: true, config: configPublica(atual.config) });
  } catch (err) {
    console.error('[admin/instagram/publicacao] Erro ao salvar:', err.message);
    return NextResponse.json({ error: 'Não foi possível concluir.' }, { status: 500 });
  }
}
