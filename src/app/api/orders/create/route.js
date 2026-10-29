import { NextResponse } from 'next/server';
import { calcularCota } from '@/lib/cotaGeracoes';
import { lerResetDeCota } from '@/lib/cotaReset';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { createOrder } from '@/lib/supabaseDb';
import { isContactBlocked } from '@/lib/blocklist';
import { generateUniqueOrderNumber } from '@/lib/orderNumber';
import { generatePhoneVariants } from '@/lib/orderLookup';
import { getCustomer } from '@/lib/auth';
import { claimCookieName, hashOrderClaim } from '@/lib/orderClaim';

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
    const authenticatedCustomer = await getCustomer(req, env);

    // O aceite dos termos é implícito ao avançar na criação
    const isWizardStep = typeof formData.productionStatus === 'string' && formData.productionStatus.startsWith('ETAPA_');

    // A história só é estritamente obrigatória quando avançando para a geração de letra (Etapa 5)
    const hasStory = Boolean(formData.story && formData.story.trim().length >= 10);
    const hasCustomLyrics = Boolean(formData.lyrics && formData.lyrics.trim().length >= 20);
    if (!isWizardStep && !hasStory && !hasCustomLyrics) {
      return NextResponse.json({ error: 'A história da homenagem é obrigatória para a criação do pedido.' }, { status: 400 });
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
    const claimToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const referralCode = typeof formData.referralCode === 'string' && /^[a-z0-9]{6,32}$/.test(formData.referralCode.trim().toLowerCase())
      ? formData.referralCode.trim().toLowerCase() : null;

    // Suporte a voz personalizada do cliente (timbre clonado)
    let customVoiceId = formData.customVoiceId || formData.custom_voice_id || null;
    let isCustomVoice = Boolean(formData.isCustomVoice || formData.is_custom_voice || formData.voiceType === 'minha_voz');
    if ((isCustomVoice || formData.voiceType === 'minha_voz') && !customVoiceId && formData.customerPhone) {
      try {
        const { findCustomerVoice } = await import('@/lib/customerVoices');
        const v = await findCustomerVoice(formData.customerPhone, env);
        if (v && v.status === 'ativo' && v.voiceId) {
          customVoiceId = v.voiceId;
          isCustomVoice = true;
        }
      } catch (e) {}
    }

    // Suporte ao bônus da 2ª geração de músicas (4 músicas = 2 gerações pagas)
    let isSecondGenApproved = false;
    const parentOrderId = formData.orderRef || formData.parentOrderId || null;
    let inheritedAddons = {};
    if (parentOrderId && (formData.origem === 'segunda_geracao' || formData.origem === 'segunda_musica' || formData.isSecondGeneration)) {
      try {
        const { getOrder, updateOrder } = await import('@/lib/supabaseDb');
        const parentOrder = await getOrder(parentOrderId, env);
        if (parentOrder && (parentOrder.paymentStatus === 'PAGO' || parentOrder.paymentStatus === 'PAGAMENTO_APROVADO')) {
          const isEligible = (parentOrder.segundaGeracaoDisponivel || parentOrder.hasSecondSongAccess || Number(parentOrder.paidAmount) >= 9) && !parentOrder.segundaGeracaoUsada;
          if (isEligible) {
            isSecondGenApproved = true;
            inheritedAddons = {
              hasVideoAccess: Boolean(parentOrder.hasVideoAccess || parentOrder.videoAddonPaid),
              hasCartaAccess: Boolean(parentOrder.hasCartaAccess || parentOrder.cartaAddonPaid),
              hasRetrospectivaAccess: Boolean(parentOrder.hasRetrospectivaAccess || parentOrder.retrospectivaAddonPaid),
            };
            // Consome a geração bônus no pedido pai
            await updateOrder(parentOrderId, {
              segundaGeracaoUsada: true,
              segundaGeracaoUsadaAt: createdAtIso,
            }, env);
          }
        }
      } catch (err) {
        console.warn('[orders/create] Falha ao verificar bônus de 2ª geração:', err?.message);
      }
    }

    const orderPayload = {
      orderNumber,
      // Nunca vincule o pedido a um userId fornecido pelo navegador. Se houver
      // sessão válida, a conta vem do token confirmado pelo Supabase.
      userId: authenticatedCustomer?.uid || null,
      ownerClaimHash: await hashOrderClaim(claimToken),
      referralCode,
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
      customVoiceId: customVoiceId || null,
      isCustomVoice: Boolean(isCustomVoice && customVoiceId),
      coverUrl: formData.coverUrl || '',
      lyrics: formData.lyrics || '',
      termsAccepted: true,
      termsAcceptedAt: createdAtIso,
      whatsappRequested: Boolean(formData.customerPhone),
      paymentStatus: isSecondGenApproved ? 'PAGAMENTO_APROVADO' : 'AGUARDANDO_PAGAMENTO',
      paidAmount: isSecondGenApproved ? 0 : 0,
      paidSku: isSecondGenApproved ? 'segunda_geracao_bonus' : null,
      parentOrderId: parentOrderId || null,
      isSecondGeneration: isSecondGenApproved,
      ...inheritedAddons,
      productionStatus: formData.productionStatus || (formData.lyrics ? 'LETRA_CRIADA' : 'EM_PRODUCAO'),
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

    if (parentOrderId && isSecondGenApproved) {
      try {
        const { updateOrder } = await import('@/lib/supabaseDb');
        await updateOrder(parentOrderId, {
          secondGenerationOrderId: created.id,
          segundaGeracaoOrderId: created.id,
        }, env);
      } catch (linkErr) {
        console.warn('[orders/create] Falha ao vincular secondGenerationOrderId no pedido pai:', linkErr?.message);
      }
    }

    // A indicação é opcional, mas só pode ser registrada para uma conta autenticada.
    // O crédito em si continua bloqueado até o pagamento confirmado no servidor.
    if (authenticatedCustomer?.uid && typeof formData.referralCode === 'string') {
      const code = formData.referralCode.trim().toLowerCase();
      if (code) {
        const { getSupabaseEdge } = await import('@/lib/supabase-edge');
        const supabase = getSupabaseEdge(env);
        const { data: referrer } = await supabase.from('credit_accounts').select('user_id').eq('referral_code', code).maybeSingle();
        if (referrer?.user_id && referrer.user_id !== authenticatedCustomer.uid) {
          const { error } = await supabase.rpc('attach_referral_to_customer', { p_user_id: authenticatedCustomer.uid, p_code: code });
          if (error) console.warn('[orders/create] Indicação aguardando conciliação.');
        }
      }
    }

    console.log(`[API /orders/create] Pedido criado com sucesso! ID: ${created.id}, Número: ${created.orderNumber}`);

    const response = NextResponse.json({
      success: true,
      orderId: created.id,
      orderNumber: created.orderNumber
    }, { status: 200 });
    response.cookies.set(claimCookieName(created.id), claimToken, { httpOnly: true, secure: new URL(req.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    return response;

  } catch (error) {
    console.error("Erro na API /api/orders/create:", error);
    return NextResponse.json({ error: error.message || 'Erro ao criar pedido no banco de dados' }, { status: 500 });
  }
}
