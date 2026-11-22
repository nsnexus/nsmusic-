import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { getPriceForSku, skuApprovesMusic } from '@/lib/pricing';
import { geracaoExtraJaLiberada } from '@/lib/geracoesExtrasRegras';
import { createPixCharge, getChargeStatus, generateTxid, getEfiMode } from '@/lib/efi';
import { cobrancaEfiAindaPagavel } from '@/lib/pixValidade';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { generateStaticPixPayload } from '@/lib/pixStatic';

export const runtime = 'edge';

const IMPACTO_MAX_AMOUNT = 1000;

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json();
    const { orderId, sku: rawSku, isSecondaryPayment, amount: rawAmount } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    const sku = rawSku || (isSecondaryPayment ? 'video_addon' : 'audio_only');

    let amount;
    if (sku === 'impacto') {
      const floor = getPriceForSku('audio_only');
      const requested = Number(rawAmount);
      if (!Number.isFinite(requested)) {
        amount = floor;
      } else if (requested < floor) {
        return NextResponse.json({ error: `O valor mínimo é R$ ${floor.toFixed(2)}.` }, { status: 400 });
      } else if (requested > IMPACTO_MAX_AMOUNT) {
        return NextResponse.json({ error: `Valor muito alto. Máximo R$ ${IMPACTO_MAX_AMOUNT.toFixed(2)}.` }, { status: 400 });
      } else {
        amount = Math.round(requested * 100) / 100;
      }
    } else {
      amount = getPriceForSku(sku);
      if (amount === null) {
        return NextResponse.json({ error: `SKU de produto inválido: ${sku}` }, { status: 400 });
      }
    }

    const existingOrderData = await getOrder(orderId, env);
    if (!existingOrderData) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }
    if (skuApprovesMusic(sku) && geracaoExtraJaLiberada(existingOrderData)) {
      return NextResponse.json({ error: 'Esta música já está liberada pelo seu Pacote Família. Acesse Minhas Músicas para ouvir e baixar.' }, { status: 409 });
    }
    if (skuApprovesMusic(sku) && existingOrderData.familiaRef) {
      return NextResponse.json({ error: 'Esta música foi iniciada pelo Pacote Família. Volte à página do pacote para conferir o saldo e o WhatsApp da compra.' }, { status: 409 });
    }

    // Atualiza IP e User-Agent do cliente no pedido caso ainda não estejam gravados (para Meta/TikTok CAPI)
    const clientIp = req.headers?.get?.('cf-connecting-ip') ||
      req.headers?.get?.('x-real-ip') ||
      req.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
      null;
    const clientUserAgent = req.headers?.get?.('user-agent') || null;

    if (clientIp || clientUserAgent) {
      const updates = {};
      if (clientIp && !existingOrderData.clientIp && !existingOrderData.extras?.clientIp) updates.clientIp = clientIp;
      if (clientUserAgent && !existingOrderData.clientUserAgent && !existingOrderData.extras?.clientUserAgent) updates.clientUserAgent = clientUserAgent;
      if (Object.keys(updates).length > 0) {
        updateOrder(existingOrderData.id, updates, env).catch(() => {});
      }
    }

    const supabase = getSupabaseEdge(env);
    if (!supabase) return NextResponse.json({ error: 'Pagamento indisponível no momento.' }, { status: 503 });
    const { data: intent, error: reservationError } = await supabase.rpc('reserve_order_payment', {
      p_order_id: existingOrderData.id, p_sku: sku, p_amount: amount,
      p_txid: generateTxid(existingOrderData.id),
    });
    if (reservationError || !intent) return NextResponse.json({ error: 'Não foi possível reservar seu PIX. Tente novamente.' }, { status: 503 });

    // Reutilização de cobrança: a função de reserva retorna o intent antigo do
    // mesmo pedido/SKU. Nunca confiar apenas em qr_code do banco: a Efí expira
    // em 1h e um QR expirado ainda pode estar persistido por dias.
    let provider = intent.provider || 'efi';
    let charge = null;
    const cachedInfinitePay = provider === 'infinitepay' &&
      /^https:\/\/checkout\.infinitepay\.io\//i.test(String(intent.qr_code || ''));
    if (cachedInfinitePay) {
      charge = { txid: intent.txid, checkoutUrl: intent.qr_code, isCheckoutRedirect: true };
    }

    if (!charge) {
      try {
        // Cobrança de homologação pode ser criada normalmente, mas NÃO pode ser
        // paga no app bancário. Nunca entregá-la no domínio público de produção.
        const publicHost = typeof req.url === 'string' &&
          /^(www\.)?nsmusic\.ia\.br$/i.test(new URL(req.url).hostname);
        if (publicHost && getEfiMode(env) !== 'production') {
          throw new Error('Efí está em homologação no domínio público. Recusando QR não pagável.');
        }

        const existing = await getChargeStatus(intent.txid, env);
        if (existing?.status === 'CONCLUIDA') {
          return NextResponse.json({
            error: 'Já existe um pagamento concluído para este pedido. Atualize a página para verificar a liberação.',
          }, { status: 409 });
        }
        if (existing) {
          // status ATIVA sozinho NÃO garante que o QR ainda é pagável:
          // calendario.criacao + expiracao pode ter vencido.
          if (!cobrancaEfiAindaPagavel(existing)) {
            throw new Error('Cobrança Efí vencida, removida ou sem payload válido.');
          }
          charge = { txid: existing.txid || intent.txid, pixCopiaECola: existing.pixCopiaECola, status: existing.status };
        } else {
          charge = await createPixCharge({
            orderId: existingOrderData.id, amount,
            description: `Pedido NS Music ${existingOrderData.id}`,
            txid: intent.txid,
          }, env);
          if (!charge?.pixCopiaECola || charge.status !== 'ATIVA') {
            throw new Error('A Efí não devolveu um Pix Copia e Cola ativo.');
          }
        }
        provider = 'efi';
      } catch (error) {
        console.warn('[payments/create] Não é possível entregar o PIX da Efí; tentando InfinitePay:', error.message);
        try {
          const { createInfinitePayCheckoutLink } = await import('@/lib/infinitepay');
          const infLink = await createInfinitePayCheckoutLink({
            orderId: existingOrderData.id, sku, amount,
            customerName: existingOrderData.customerName,
            customerPhone: existingOrderData.customerPhone,
            customerEmail: existingOrderData.customerEmail,
          }, env);
          provider = 'infinitepay';
          charge = {
            txid: `inf_${infLink.slug}`,
            checkoutUrl: infLink.url,
            isCheckoutRedirect: true,
          };
        } catch (infErr) {
          console.warn('[payments/create] Alternativa InfinitePay indisponível:', infErr.message);
          if (sku === 'video_addon') {
            // PIX estático não confirma o add-on automaticamente. Evitar entregar
            // uma cobrança não rastreável e prender a compra do cliente no polling.
            return NextResponse.json({
              error: 'O PIX do vídeo está indisponível neste momento. Tente gerar novamente. Nenhuma cobrança foi efetuada.',
            }, { status: 424 });
          }
          // Mantém a contingência estática dos demais produtos, sem alterar
          // o comportamento do checkout principal neste reparo do vídeo.
          charge = generateStaticPixPayload(amount, existingOrderData.id, undefined, intent.txid);
          provider = 'static';
        }
      }
      if (!charge?.pixCopiaECola && !charge?.checkoutUrl) {
        return NextResponse.json({ error: 'Não foi possível obter um PIX válido. Tente novamente.' }, { status: 503 });
      }
      const saved = await supabase.from('order_payment_intents').eq('id', intent.id).update({
        qr_code: charge.pixCopiaECola || charge.checkoutUrl,
        txid: charge.txid,
        provider,
      });
      if (saved.error) {
        return NextResponse.json({ error: 'Não foi possível registrar o PIX. Tente novamente para recuperar a cobrança.' }, { status: 503 });
      }
    }
    const recorded = await supabase.rpc('record_order_payment_intent', {
      p_order_id: existingOrderData.id, p_txid: charge.txid, p_sku: sku, p_amount: amount,
    });
    if (recorded.error || !recorded.data) return NextResponse.json({ error: 'Não foi possível associar o PIX ao pedido. Tente novamente.' }, { status: 503 });

    // O status pode ter mudado enquanto o provedor preparava a cobrança.
    const agora = new Date().toISOString();
    await updateOrder(existingOrderData.id, {
      pixGeneratedAt: agora,
      pixGeneratedLastAt: agora,
    }, env).catch((e) => {
      console.warn('[payments/create] Aviso ao carimbar pixGeneratedAt:', e?.message);
    });

    return NextResponse.json({
      paymentId: charge.txid,
      status: 'pending',
      qrCode: charge.pixCopiaECola || '',
      checkoutUrl: charge.checkoutUrl || '',
      qrCodeBase64: '',
      ticketUrl: charge.checkoutUrl || '',
      provider: provider
    });

  } catch (error) {
    console.error("Erro ao criar cobrança Pix:", error.message);
    return NextResponse.json({ error: 'Falha ao criar cobrança Pix.' }, { status: 500 });
  }
}
