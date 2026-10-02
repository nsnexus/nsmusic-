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

// Cota automática desativada a pedido do administrador: bloqueio agora é 100% manual via blacklist do painel admin.
export async function isBlockedByFreeLimit(phone, email, env = {}) {
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

    // Trava de bloqueio manual (Blacklist do administrador)
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
      updatedAt: createdAtIso,
      // Atribuição de plataforma de aquisição e tráfego
      trafficSource: formData.trafficSource || formData.platform || null,
      utmSource: formData.utmSource || null,
      utmMedium: formData.utmMedium || null,
      utmCampaign: formData.utmCampaign || null,
      utmContent: formData.utmContent || null,
      utmTerm: formData.utmTerm || null,
      fbclid: formData.fbclid || null,
      ttclid: formData.ttclid || null,
      gclid: formData.gclid || null,
      referrer: formData.referrer || null,
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
