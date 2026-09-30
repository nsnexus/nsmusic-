import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { calcularCota } from '@/lib/cotaGeracoes';
import { lerResetDeCota } from '@/lib/cotaReset';
import { isContactBlocked } from '@/lib/blocklist';
import { generatePhoneVariants } from '@/lib/orderLookup';

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
    const manualBlock = await isContactBlocked(phone, email, env);
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

    if (supabase) {
      const orParts = [];
      if (digits.length >= 10) {
        const variants = generatePhoneVariants(phone);
        if (variants.length > 0) {
          const inList = variants.map((v) => `"${v}"`).join(',');
          orParts.push(`customer_phone.in.(${inList})`);
        } else {
          orParts.push(`customer_phone.eq.${phone}`);
        }
      }
      if (hasValidEmail) {
        orParts.push(`customer_email.eq.${email.trim().toLowerCase()}`);
      }

      if (orParts.length > 0) {
        const { data, error } = await supabase
          .from('orders')
          .select('order_number, payment_status, created_at, deleted_at')
          .is('deleted_at', null)
          .or(orParts.join(','));

        if (!error && Array.isArray(data)) {
          matches = data.map((o) => ({
            orderNumber: o.order_number,
            paymentStatus: o.payment_status,
            createdAt: o.created_at,
          }));
        } else if (error) {
          console.warn('[check-limit] Erro ao consultar pedidos no Supabase:', error.message);
        }
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
    });
  } catch (error) {
    console.error('[check-limit] Falha ao verificar cota:', error.message);
    // Em caso de falha não esperada, retorna desbloqueado para não travar indevidamente
    // clientes válidos (a trava oficial final em /api/orders/create continuará avaliando).
    return NextResponse.json({
      isBlocked: false,
      totalCount: 0,
      cota: 5,
      pagos: 0,
      restantes: 5,
      manualBlock: false,
    });
  }
}
