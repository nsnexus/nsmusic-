import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getRegisteredWebhook } from '@/lib/efi';
import { DOMINIO_CANONICO } from '@/lib/siteUrl';

export const runtime = 'edge';

// Diagnóstico: a Efí está configurada para nos avisar quando um Pix cai?
//
// Criado em 21/09/2026, investigando pagamentos que o cliente faz e o sistema não identifica. O
// webhook é a via INSTANTÂNEA; o polling do navegador só funciona com a aba aberta e a
// reconciliação agendada leva até 5 minutos. Se o webhook não estiver registrado (ou estiver
// apontando para um endereço antigo), é exatamente esse o sintoma.
//
// Somente leitura: registrar ou apagar webhook continua fora da allowlist do relay e é feito pelo
// script dedicado (scripts/register-efi-webhook.mjs). Uma rota do site nunca deve poder mudar para
// onde o provedor de pagamento avisa.
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

    const webhook = await getRegisteredWebhook(env);

    if (!webhook) {
      return NextResponse.json({
        registrado: false,
        diagnostico: 'Nenhum webhook registrado nesta chave Pix. Enquanto isso, a confirmação de '
          + 'pagamento depende do polling do navegador (só com a aba aberta) e da reconciliação '
          + 'agendada, que roda a cada 5 minutos.',
      });
    }

    // A URL registrada carrega o `?secret=` na query — não devolver isso para o browser. O que
    // interessa no diagnóstico é o host e o caminho, e se batem com o domínio atual.
    const urlRegistrada = String(webhook.webhookUrl || webhook.webhook_url || '');
    let host = '';
    let caminho = '';
    let temSegredo = false;
    try {
      const u = new URL(urlRegistrada);
      host = u.host;
      caminho = u.pathname;
      temSegredo = u.searchParams.has('secret');
    } catch (e) { /* URL inesperada: os campos ficam vazios e o admin vê isso */ }

    const esperado = new URL(DOMINIO_CANONICO).host;

    return NextResponse.json({
      registrado: true,
      host,
      caminho,
      temSegredo,
      criadoEm: webhook.criacao || null,
      apontaParaODominioAtual: host === esperado,
      dominioEsperado: esperado,
      diagnostico: host === esperado
        ? 'Webhook registrado e apontando para o domínio atual.'
        : `Webhook aponta para "${host}", diferente do domínio atual "${esperado}". Continua `
          + 'funcionando enquanto o domínio antigo responder em /api/, mas vale reregistrar.',
    });
  } catch (err) {
    console.error('[admin/efi-webhook] falha ao consultar webhook:', err.message);
    return NextResponse.json(
      { error: 'Não foi possível consultar o webhook na Efí agora.' },
      { status: 502 },
    );
  }
}
