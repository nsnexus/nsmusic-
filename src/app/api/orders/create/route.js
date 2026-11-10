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

// Cota de gerações por telefone/e-mail: 5 músicas grátis. A cada compra paga, acrescenta mais 5 à cota
// (ver src/lib/cotaGeracoes.js). Se o cliente gerou 5 músicas e não pagou nenhuma, o bloqueio automático
// é acionado para impedir abuso e custos desnecessários com a API Suno/Kie.ai.
export async function isBlockedByFreeLimit(phone, email, env = {}) {
  const digits = phone ? phone.replace(/\D/g, '') : '';
  const hasEmail = Boolean(email && email.includes('@'));

  if (digits.length < 10 && !hasEmail) {
    return false;
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) return false;

  try {
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
    if (hasEmail) {
      orParts.push(`customer_email.eq.${email.trim().toLowerCase()}`);
    }

    if (orParts.length > 0) {
      const { data, error } = await supabase
        .from('orders')
        .select('order_number, payment_status, created_at, deleted_at, is_second_generation, paid_sku')
        .is('deleted_at', null)
        .or(orParts.join(','));

      if (!error && Array.isArray(data)) {
        // Ignora cortesias de segunda geração vinculadas a pedidos pagos
        const matches = data
          .filter((o) => !o.is_second_generation && o.paid_sku !== 'segunda_geracao_bonus')
          .map((o) => ({
            orderNumber: o.order_number,
            paymentStatus: o.payment_status,
            createdAt: o.created_at,
          }));
        const resetAt = phone ? await lerResetDeCota(phone, env) : '';
        return Boolean(calcularCota(matches, { resetAt }).bloqueado);
      }
      if (error) {
        console.warn('[isBlockedByFreeLimit] Erro ao consultar cota no Supabase:', error.message);
      }
    }
  } catch (e) {
    console.warn('[isBlockedByFreeLimit] Exceção ao verificar cota:', e.message);
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

    // Trava de cota automática (5 músicas sem pagamento -> bloqueio automático)
    const isSecondGenRequested = Boolean(
      formData.origem === 'segunda_geracao' ||
      formData.origem === 'segunda_musica' ||
      formData.isSecondGeneration
    );
    if (!isSecondGenRequested) {
      const isFreeLimitBlocked = await isBlockedByFreeLimit(formData.customerPhone, formData.customerEmail, env);
      if (isFreeLimitBlocked) {
        return NextResponse.json(
          {
            error: 'Você atingiu o limite de 5 músicas geradas sem pagamento. Para liberar novas músicas, finalize o pagamento de uma das suas criações.',
            blocked: true,
            reason: 'cota_excedida'
          },
          { status: 403 }
        );
      }
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
    let resolvedParentOrderId = formData.orderRef || formData.parentOrderId || null;
    let inheritedAddons = {};
    const wantsSecondGen = Boolean(
      formData.origem === 'segunda_geracao' ||
      formData.origem === 'segunda_musica' ||
      formData.isSecondGeneration
    );

    if (resolvedParentOrderId && wantsSecondGen) {
      try {
        const { getOrder, updateOrder } = await import('@/lib/supabaseDb');
        const parentOrder = await getOrder(resolvedParentOrderId, env);
        if (parentOrder && (parentOrder.paymentStatus === 'PAGO' || parentOrder.paymentStatus === 'PAGAMENTO_APROVADO')) {
          resolvedParentOrderId = parentOrder.id || resolvedParentOrderId;
          isSecondGenApproved = true;
          inheritedAddons = {
            hasVideoAccess: Boolean(parentOrder.hasVideoAccess || parentOrder.videoAddonPaid),
            hasCartaAccess: Boolean(parentOrder.hasCartaAccess || parentOrder.cartaAddonPaid),
            hasRetrospectivaAccess: Boolean(parentOrder.hasRetrospectivaAccess || parentOrder.retrospectivaAddonPaid),
          };
          // O consumo da 2ª geração (segundaGeracaoUsada: true) NÃO é marcado aqui na criação.
          // Só é concluído quando a música for de fato gerada na IA (updateTaskResult).
        }
      } catch (err) {
        console.warn('[orders/create] Falha ao verificar bônus de 2ª geração:', err?.message);
      }
    }

    // Se o cliente tem telefone cadastrado e solicitou a 2ª geração sem orderRef na URL,
    // busca pedido pai pago com 2ª geração disponível do mesmo cliente.
    if (!isSecondGenApproved && formData.customerPhone && wantsSecondGen) {
      try {
        const { findOrdersByPhone } = await import('@/lib/orderLookup');
        const { updateOrder } = await import('@/lib/supabaseDb');
        const recentOrders = await findOrdersByPhone(formData.customerPhone, env, 10);
        const eligibleParent = recentOrders.find(o =>
          (o.paymentStatus === 'PAGO' || o.paymentStatus === 'PAGAMENTO_APROVADO') &&
          !o.parentOrderId &&
          !o.extras?.parentOrderId &&
          !o.isSecondGeneration &&
          !o.extras?.isSecondGeneration &&
          !o.segundaGeracaoUsada &&
          !o.extras?.segundaGeracaoUsada
        );
        if (eligibleParent) {
          resolvedParentOrderId = eligibleParent.id;
          isSecondGenApproved = true;
          inheritedAddons = {
            hasVideoAccess: Boolean(eligibleParent.hasVideoAccess || eligibleParent.videoAddonPaid),
            hasCartaAccess: Boolean(eligibleParent.hasCartaAccess || eligibleParent.cartaAddonPaid),
            hasRetrospectivaAccess: Boolean(eligibleParent.hasRetrospectivaAccess || eligibleParent.retrospectivaAddonPaid),
          };
          // O consumo da 2ª geração só é concluído quando a música for de fato gerada na IA.
        }
      } catch (phoneErr) {
        console.warn('[orders/create] Falha ao auto-vincular 2ª geração por telefone:', phoneErr?.message);
      }
    }

    // -------------------------------------------------------------------------
    // Atribuição de Tráfego e Plataforma (TikTok, Meta, Google, etc.)
    // Se o pedido não veio com tracking de anúncio pago inequívoco no request,
    // herda a atribuição de campanha do pedido pai ou do histórico recente do cliente (30 dias).
    // Evita que recriações de versão (versão 2) sejam marcadas como "Direto / Outros".
    // -------------------------------------------------------------------------
    let finalTrafficSource = formData.trafficSource || formData.platform || null;
    let finalUtmSource = formData.utmSource || null;
    let finalUtmMedium = formData.utmMedium || null;
    let finalUtmCampaign = formData.utmCampaign || null;
    let finalUtmContent = formData.utmContent || null;
    let finalUtmTerm = formData.utmTerm || null;
    let finalFbclid = formData.fbclid || null;
    let finalTtclid = formData.ttclid || null;
    let finalGclid = formData.gclid || null;
    let finalReferrer = formData.referrer || null;
    let attributionInheritedFrom = null;
    let inheritedOrderId = null;

    const hasExplicitPaidTracking = Boolean(
      finalTtclid ||
      finalFbclid ||
      finalGclid ||
      finalTrafficSource === 'tiktok_ads' ||
      finalTrafficSource === 'facebook_ads' ||
      finalTrafficSource === 'google_ads' ||
      /tiktok|bytedance|\btt\b|tt_/i.test(finalUtmSource || '') ||
      /tiktok|bytedance/i.test(finalUtmCampaign || '') ||
      /facebook|meta|\bfb\b|instagram|\big\b|ig_/i.test(finalUtmSource || '') ||
      /facebook|instagram/i.test(finalUtmCampaign || '') ||
      /google|adwords|\bgads\b/i.test(finalUtmSource || '') ||
      /google_ads|gads/i.test(finalUtmCampaign || '')
    );

    if (!hasExplicitPaidTracking) {
      // 1. Tenta herdar do pedido pai (se fornecido orderRef / parentOrderId)
      const parentIdToInspect = resolvedParentOrderId || formData.orderRef || formData.parentOrderId;
      let inheritedPaidOrder = null;

      if (parentIdToInspect) {
        try {
          const { getOrder } = await import('@/lib/supabaseDb');
          const pOrder = await getOrder(parentIdToInspect, env);
          if (pOrder) {
            const pSource = pOrder.trafficSource || pOrder.extras?.trafficSource || pOrder.extras?.platform;
            const pTtclid = pOrder.ttclid || pOrder.extras?.ttclid;
            const pFbclid = pOrder.fbclid || pOrder.extras?.fbclid;
            const pGclid = pOrder.gclid || pOrder.extras?.gclid;
            const pUtmSource = pOrder.utmSource || pOrder.extras?.utmSource || pOrder.extras?.utm_source;
            const pUtmCampaign = pOrder.utmCampaign || pOrder.extras?.utmCampaign || pOrder.extras?.utm_campaign;

            const isParentPaid = Boolean(
              pTtclid || pFbclid || pGclid ||
              pSource === 'tiktok_ads' || pSource === 'facebook_ads' || pSource === 'google_ads' ||
              /tiktok|bytedance|\btt\b|tt_/i.test(pUtmSource || '') ||
              /tiktok|bytedance/i.test(pUtmCampaign || '') ||
              /facebook|meta|\bfb\b|instagram|\big\b|ig_/i.test(pUtmSource || '') ||
              /google|adwords|\bgads\b/i.test(pUtmSource || '')
            );

            if (isParentPaid) {
              inheritedPaidOrder = pOrder;
              attributionInheritedFrom = 'parent_order';
              inheritedOrderId = pOrder.id;
            }
          }
        } catch (pErr) {
          console.warn('[orders/create] Falha ao inspecionar atribuição do pedido pai:', pErr?.message);
        }
      }

      // 2. Se não encontrou no pedido pai, busca pedidos recentes do mesmo telefone nos últimos 30 dias
      if (!inheritedPaidOrder && formData.customerPhone) {
        try {
          const { findOrdersByPhone } = await import('@/lib/orderLookup');
          const recentOrders = await findOrdersByPhone(formData.customerPhone, env, 10);
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

          for (const cand of recentOrders) {
            const candTime = cand.createdAt ? new Date(cand.createdAt).getTime() : 0;
            if (candTime > 0 && candTime < thirtyDaysAgo) continue;

            const cSource = cand.trafficSource || cand.extras?.trafficSource || cand.extras?.platform;
            const cTtclid = cand.ttclid || cand.extras?.ttclid;
            const cFbclid = cand.fbclid || cand.extras?.fbclid;
            const cGclid = cand.gclid || cand.extras?.gclid;
            const cUtmSource = cand.utmSource || cand.extras?.utmSource || cand.extras?.utm_source;
            const cUtmCampaign = cand.utmCampaign || cand.extras?.utmCampaign || cand.extras?.utm_campaign;

            const isCandPaid = Boolean(
              cTtclid || cFbclid || cGclid ||
              cSource === 'tiktok_ads' || cSource === 'facebook_ads' || cSource === 'google_ads' ||
              /tiktok|bytedance|\btt\b|tt_/i.test(cUtmSource || '') ||
              /tiktok|bytedance/i.test(cUtmCampaign || '') ||
              /facebook|meta|\bfb\b|instagram|\big\b|ig_/i.test(cUtmSource || '') ||
              /google|adwords|\bgads\b/i.test(cUtmSource || '')
            );

            if (isCandPaid) {
              inheritedPaidOrder = cand;
              attributionInheritedFrom = 'customer_history';
              inheritedOrderId = cand.id;
              break;
            }
          }
        } catch (phoneErr) {
          console.warn('[orders/create] Falha ao inspecionar atribuição por telefone do cliente:', phoneErr?.message);
        }
      }

      // 3. Aplica os dados herdados se localizados
      if (inheritedPaidOrder) {
        const iExtras = (inheritedPaidOrder.extras && typeof inheritedPaidOrder.extras === 'object') ? inheritedPaidOrder.extras : {};
        if (
          inheritedPaidOrder.ttclid ||
          iExtras.ttclid ||
          /tiktok|bytedance|\btt\b|tt_/i.test(inheritedPaidOrder.utmSource || iExtras.utmSource || iExtras.utm_source || '') ||
          /tiktok|bytedance/i.test(inheritedPaidOrder.utmCampaign || iExtras.utmCampaign || iExtras.utm_campaign || '')
        ) {
          finalTrafficSource = 'tiktok_ads';
        } else if (
          inheritedPaidOrder.fbclid ||
          iExtras.fbclid ||
          /facebook|meta|\bfb\b|instagram|\big\b|ig_/i.test(inheritedPaidOrder.utmSource || iExtras.utmSource || iExtras.utm_source || '')
        ) {
          finalTrafficSource = 'facebook_ads';
        } else if (
          inheritedPaidOrder.gclid ||
          iExtras.gclid ||
          /google|adwords|\bgads\b/i.test(inheritedPaidOrder.utmSource || iExtras.utmSource || iExtras.utm_source || '')
        ) {
          finalTrafficSource = 'google_ads';
        } else {
          finalTrafficSource = inheritedPaidOrder.trafficSource || iExtras.trafficSource || iExtras.platform || 'facebook_ads';
        }

        finalUtmSource = inheritedPaidOrder.utmSource || iExtras.utmSource || iExtras.utm_source || finalUtmSource;
        finalUtmMedium = inheritedPaidOrder.utmMedium || iExtras.utmMedium || iExtras.utm_medium || finalUtmMedium;
        finalUtmCampaign = inheritedPaidOrder.utmCampaign || iExtras.utmCampaign || iExtras.utm_campaign || finalUtmCampaign;
        finalUtmContent = inheritedPaidOrder.utmContent || iExtras.utmContent || iExtras.utm_content || finalUtmContent;
        finalUtmTerm = inheritedPaidOrder.utmTerm || iExtras.utmTerm || iExtras.utm_term || finalUtmTerm;
        finalFbclid = inheritedPaidOrder.fbclid || iExtras.fbclid || finalFbclid;
        finalTtclid = inheritedPaidOrder.ttclid || iExtras.ttclid || finalTtclid;
        finalGclid = inheritedPaidOrder.gclid || iExtras.gclid || finalGclid;
        finalReferrer = inheritedPaidOrder.referrer || iExtras.referrer || finalReferrer;
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
      parentOrderId: resolvedParentOrderId || null,
      isSecondGeneration: isSecondGenApproved,
      ...inheritedAddons,
      productionStatus: formData.productionStatus || (formData.lyrics ? 'LETRA_CRIADA' : 'EM_PRODUCAO'),
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
      // Atribuição de plataforma de aquisição e tráfego
      trafficSource: finalTrafficSource || 'direto',
      utmSource: finalUtmSource,
      utmMedium: finalUtmMedium,
      utmCampaign: finalUtmCampaign,
      utmContent: finalUtmContent,
      utmTerm: finalUtmTerm,
      fbclid: finalFbclid,
      ttclid: finalTtclid,
      gclid: finalGclid,
      referrer: finalReferrer,
      attributionInheritedFrom: attributionInheritedFrom || null,
      inheritedOrderId: inheritedOrderId || null,
    };

    const created = await createOrder(orderPayload, env);

    if (resolvedParentOrderId && isSecondGenApproved) {
      try {
        const { updateOrder } = await import('@/lib/supabaseDb');
        await updateOrder(resolvedParentOrderId, {
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
      orderNumber: created.orderNumber,
      isSecondGeneration: isSecondGenApproved,
      paymentStatus: isSecondGenApproved ? 'PAGAMENTO_APROVADO' : 'AGUARDANDO_PAGAMENTO',
      parentOrderId: resolvedParentOrderId || null
    }, { status: 200 });
    response.cookies.set(claimCookieName(created.id), claimToken, { httpOnly: true, secure: new URL(req.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    return response;

  } catch (error) {
    console.error("Erro na API /api/orders/create:", error);
    return NextResponse.json({ error: error.message || 'Erro ao criar pedido no banco de dados' }, { status: 500 });
  }
}
