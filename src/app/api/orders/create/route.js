import { NextResponse } from 'next/server';
import { calcularCota } from '@/lib/cotaGeracoes';
import { lerResetDeCota } from '@/lib/cotaReset';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { createOrder } from '@/lib/supabaseDb';
import { isContactBlocked } from '@/lib/blocklist';
import { generateUniqueOrderNumber } from '@/lib/orderNumber';
import { generatePhoneVariants } from '@/lib/orderLookup';

export const runtime = 'edge';
export { generateUniqueOrderNumber };

// Cota de gerações por telefone/e-mail: 5 grátis, mais 5 a cada compra paga (ver
// src/lib/cotaGeracoes.js). Até 25/09/2026 a regra era outra — quem pagasse UMA vez passava a
// gerar sem limite nenhum, e a geração é justamente o que custa, porque acontece antes do
// pagamento.
//
// A trava tem que viver aqui: só existia no cliente (criar/page.jsx:checkUserLimit) e chamar esta
// rota direto a ignorava (ver A-11 no AUDIT_REPORT.md). O localStorage do navegador é contador de
// conveniência de tela, nunca a trava.
export async function isBlockedByFreeLimit(phone, email, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return false;

  try {
    const orParts = [];
    const digits = phone ? phone.replace(/\D/g, '') : '';
    if (digits.length >= 10) {
      const variants = generatePhoneVariants(phone);
      if (variants.length > 0) {
        const inList = variants.map((v) => `"${v}"`).join(',');
        orParts.push(`customer_phone.in.(${inList})`);
      } else {
        orParts.push(`customer_phone.eq.${phone}`);
      }
    }
    if (email && email.includes('@')) {
      orParts.push(`customer_email.eq.${email.trim().toLowerCase()}`);
    }

    if (orParts.length > 0) {
      const { data, error } = await supabase
        .from('orders')
        .select('order_number, payment_status, created_at, deleted_at')
        .is('deleted_at', null)
        .or(orParts.join(','));

      if (!error && Array.isArray(data)) {
        const matches = data.map((o) => ({
          orderNumber: o.order_number,
          paymentStatus: o.payment_status,
          createdAt: o.created_at,
        }));
        const resetAt = phone ? await lerResetDeCota(phone, env) : '';
        return calcularCota(matches, { resetAt }).bloqueado;
      }
    }
  } catch (e) {
    console.warn('[isBlockedByFreeLimit] Erro ao verificar cota no Supabase:', e.message);
  }

  return false;
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const formData = await req.json();

    // M-13 no AUDIT_REPORT.md: o consentimento aos termos precisa ser real (checkbox marcado pelo
    // cliente), verificado no servidor — nunca aceito por padrão.
    if (formData.termsAccepted !== true) {
      return NextResponse.json({ error: 'É necessário aceitar os Termos de Uso para continuar.' }, { status: 400 });
    }

    // 1. Trava de bloqueio manual (Blacklist do administrador)
    const manualBlock = await isContactBlocked(formData.customerPhone, formData.customerEmail, env);
    if (manualBlock.blocked) {
      return NextResponse.json(
        {
          error: 'Este contato foi bloqueado para novas gerações na plataforma. Entre em contato com o suporte para mais informações.',
          blocked: true,
          reason: manualBlock.reason || 'manual_block'
        },
        { status: 403 }
      );
    }

    // 2. Trava de cota automática (5 grátis + 5 por compra)
    if (await isBlockedByFreeLimit(formData.customerPhone, formData.customerEmail, env)) {
      return NextResponse.json(
        { error: 'Você já usou todas as suas gerações. Finalize o pagamento de uma das músicas para liberar mais 5.' },
        { status: 403 }
      );
    }

    const orderNumber = await generateUniqueOrderNumber(env);
    const createdAtIso = new Date().toISOString();

    const orderPayload = {
      orderNumber,
      userId: formData.userId || null,
      customerName: formData.customerName || 'Cliente',
      customerPhone: formData.customerPhone || '',
      customerEmail: formData.customerEmail || '',
      honoreeName: formData.honoreeName || '',
      recipientType: formData.recipientType || '',
      relationship: formData.relationship || '',
      occasion: formData.occasion || '',
      story: formData.story || '',
      importantMoments: formData.importantMoments || '',
      musicStyle: formData.musicStyle || '',
      musicMood: formData.musicMood || '',
      voiceType: formData.voiceType || '',
      coverUrl: formData.coverUrl || '',
      lyrics: formData.lyrics || '',
      termsAccepted: true,
      termsAcceptedAt: createdAtIso,
      whatsappRequested: Boolean(formData.customerPhone),
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      productionStatus: formData.lyrics ? 'LETRA_CRIADA' : 'EM_PRODUCAO',
      createdAt: createdAtIso,
      updatedAt: createdAtIso
    };

    const created = await createOrder(orderPayload, env);

    console.log(`[API /orders/create] Pedido criado com sucesso! ID: ${created.id}, Número: ${created.orderNumber}`);

    return NextResponse.json({
      success: true,
      orderId: created.id,
      orderNumber: created.orderNumber
    }, { status: 200 });

  } catch (error) {
    console.error("Erro na API /api/orders/create:", error);
    return NextResponse.json({ error: error.message || 'Erro ao criar pedido no banco de dados' }, { status: 500 });
  }
}
