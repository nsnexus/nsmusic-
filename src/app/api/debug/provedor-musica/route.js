import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { readEnvValue } from '@/lib/envValue';
import { provedorPrimario } from '@/lib/suno';
import { lerConfigVps, configVpsUtilizavel, consultarSaldoVps } from '@/lib/sunoVps';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Diagnóstico do roteamento de geração de música (VPS própria x Kie.ai).
//
// Existe porque os dois modos de falha gravam exatamente a mesma coisa no pedido
// (`sunoProvider: "kie"`) e não dá para distinguir de fora: ou as variáveis da VPS não chegaram ao
// runtime do Pages — e ela nem foi tentada —, ou ela foi tentada e recusou. Sem isto, a única saída
// era adivinhar (aconteceu em 24/09/2026, no primeiro pedido real depois da integração).
//
// Nunca devolve valor de segredo: só se a variável existe, o tamanho da chave, e o host da VPS
// (host não é segredo — a chave é). Protegida pelo RECONCILE_SECRET, o mesmo dos crons.
export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const esperado = readEnvValue(env, 'RECONCILE_SECRET');
  const { searchParams } = new URL(req.url);
  if (!esperado || searchParams.get('secret') !== esperado) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const config = lerConfigVps(env);
  const chaveVps = readEnvValue(env, 'SUNO_VPS_API_KEY');

  const resultado = {
    provedorPrimario: provedorPrimario(env),
    vps: {
      url: config.baseUrl || null,
      chavePresente: Boolean(chaveVps),
      chaveTamanho: chaveVps.length,
      utilizavel: configVpsUtilizavel(config),
      // A configuração pode estar completa e a VPS ainda assim recusar — é o caso quando a sessão
      // dela com o Suno expira. Por isso o teste ao vivo vem junto.
      aoVivo: null,
    },
    kie: {
      chavePresente: Boolean(readEnvValue(env, 'KIE_API_KEY')),
    },
    webhookSecretPresente: Boolean(readEnvValue(env, 'KIE_WEBHOOK_SECRET')),
    siteUrl: readEnvValue(env, 'NEXT_PUBLIC_SITE_URL') || null,
    providerPrimarioConfigurado: readEnvValue(env, 'MUSIC_PROVIDER_PRIMARY') || null,
  };

  if (configVpsUtilizavel(config)) {
    resultado.vps.aoVivo = await consultarSaldoVps(env);
  }

  return NextResponse.json(resultado);
}
