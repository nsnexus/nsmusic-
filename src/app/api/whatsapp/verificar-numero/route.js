import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getEvolutionConfig } from '@/lib/whatsapp';
import { normalizeBrazilPhoneDigits } from '@/lib/telefoneBr';
import { obterIpDoCliente } from '@/lib/cotaPorIp';
import { verificarWhatsapp, telefoneValidoParaConsulta, RESULTADO } from '@/lib/verificaWhatsapp';

export const runtime = 'edge';

// POST { telefone } → { resultado: 'tem' | 'nao_tem' | 'desconhecido' }
// Usado pelo /criar para avisar "esse número não tem WhatsApp". Nunca bloqueia nada: em qualquer
// problema responde "desconhecido". Telefone no corpo (nunca na URL) e fora dos logs.
export async function POST(req) {
  let env = {};
  try {
    env = getRequestContext()?.env || {};
  } catch {
    env = {};
  }
  const lerEnv = (nome) => env?.[nome] || process.env?.[nome] || '';

  let body = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }
  const digitos = normalizeBrazilPhoneDigits(body?.telefone).slice(0, 11);
  if (!telefoneValidoParaConsulta(digitos)) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });
  }

  const semCache = { headers: { 'Cache-Control': 'no-store' } };
  if (lerEnv('WHATSAPP_CHECK_ENABLED') === 'false') {
    return NextResponse.json({ resultado: RESULTADO.DESCONHECIDO }, semCache);
  }

  let evo = null;
  try {
    const cfg = await getEvolutionConfig(env);
    if (cfg?.enabled) {
      // Instância própria para a consulta (chip separado), se configurada.
      evo = { baseUrl: cfg.baseUrl, token: cfg.token, instanceName: lerEnv('EVOLUTION_CHECK_INSTANCE') || cfg.instanceName };
    }
  } catch (err) {
    console.warn('[verificar-numero] Falha ao ler a configuração da Evolution:', err?.message);
  }

  const { resultado } = await verificarWhatsapp(digitos, { ip: obterIpDoCliente(req), evo });
  return NextResponse.json({ resultado }, semCache);
}
