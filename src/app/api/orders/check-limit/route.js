import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { calcularCota } from '@/lib/cotaGeracoes';
import { lerResetDeCota } from '@/lib/cotaReset';
import { isContactBlocked } from '@/lib/blocklist';
import { obterIpDoCliente } from '@/lib/cotaPorIp';
import { buscarPedidosDaPessoa } from '@/lib/cotaConsulta';

export const runtime = 'edge';

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { searchParams } = new URL(req.url);
    const phone = (searchParams.get('phone') || '').trim();
    const email = (searchParams.get('email') || '').trim();

    const digits = phone ? phone.replace(/\D/g, '') : '';
    const hasValidEmail = email && email.includes('@');

    // Se o cliente ainda não informou telefone nem e-mail, ele está apenas rascunhando.
    // Nunca bloqueia um usuário anônimo antes da identificação.
    if (digits.length < 10 && !hasValidEmail) {
      return NextResponse.json({
        isBlocked: false,
        totalCount: 0,
        cota: 5,
        pagos: 0,
        restantes: 5,
        manualBlock: false,
      });
    }

    // 1. Checa se o contato está na lista manual de bloqueio (blacklist)
    const manualBlock = await isContactBlocked(phone, email, env, obterIpDoCliente(req));
    if (manualBlock?.blocked) {
      return NextResponse.json({
        isBlocked: true,
        manualBlock: true,
        reason: manualBlock.reason || 'manual_block',
        totalCount: 0,
        cota: 0,
        pagos: 0,
        restantes: 0,
      });
    }

    // 2. Consulta pedidos no Supabase para calcular a cota real
    const supabase = getSupabaseEdge(env);
    let matches = [];
    let consulta = 'sem_banco';

    if (supabase) {
      const resultado = await buscarPedidosDaPessoa(supabase, {
        phone: digits.length >= 10 ? phone : '',
        email: hasValidEmail ? email : '',
      });
      matches = resultado.pedidos;
      // Só o código HTTP (sem mensagem do banco nem dado de cliente): mostra se a trava está
      // consultando de verdade. Em 23/11/2026 ela contava 0 para todo mundo sem dar sinal.
      consulta = resultado.erro
        ? `erro_${(String(resultado.erro).match(/HTTP (\d{3})/) || [])[1] || 'rede'}`
        : (resultado.planoB ? 'ok_plano_b' : 'ok');
      if (resultado.erro) {
        console.warn('[check-limit] Erro ao consultar pedidos no Supabase:', resultado.erro);
      }
    }

    const resetAt = phone ? await lerResetDeCota(phone, env) : '';
    const cota = calcularCota(matches, { resetAt });

    return NextResponse.json({
      isBlocked: Boolean(cota.bloqueado),
      totalCount: cota.usados,
      cota: cota.cota,
      pagos: cota.pagos,
      restantes: cota.restantes,
      manualBlock: false,
      reason: cota.bloqueado ? 'cota_excedida' : null,
      consulta,
    });
  } catch (error) {
    console.error('[check-limit] Falha ao verificar cota:', error.message);
    return NextResponse.json({
      isBlocked: false,
      totalCount: 0,
      cota: 999,
      pagos: 0,
      restantes: 999,
      manualBlock: false,
    });
  }
}
