import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getVoiceInvite, updateVoiceInvite } from '@/lib/voiceInvites';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const token = params?.token;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Token não fornecido.' }, { status: 400 });
  }

  try {
    const invite = await getVoiceInvite(token, env);
    if (!invite) {
      return NextResponse.json({ ok: false, error: 'Link de gravação não encontrado ou inválido.' }, { status: 404 });
    }

    if (invite.active === false) {
      return NextResponse.json({
        ok: false,
        deactivated: true,
        customerName: invite.customerName,
        error: 'Este link de gravação foi desativado pelo administrador.'
      }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      invite: {
        token: invite.token,
        customerName: invite.customerName,
        phone: invite.phone,
        status: invite.status,
        active: invite.active,
        voiceId: invite.voiceId,
        sampleAudioUrl: invite.sampleAudioUrl
      }
    });
  } catch (err) {
    console.error('[voice/invite/token] Erro ao buscar convite:', err?.message);
    return NextResponse.json({ ok: false, error: 'Erro ao validar link de gravação.' }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const token = params?.token;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Token não fornecido.' }, { status: 400 });
  }

  try {
    const invite = await getVoiceInvite(token, env);
    if (!invite) {
      return NextResponse.json({ ok: false, error: 'Link de gravação não encontrado.' }, { status: 404 });
    }

    if (invite.active === false) {
      return NextResponse.json({ ok: false, error: 'Este link foi desativado e não aceita mais gravações.' }, { status: 403 });
    }

    const body = await req.json();
    const { voiceId, voiceRecordingId, sampleAudioUrl, verifyAudioUrl, phone, customerName } = body;

    if (!voiceId) {
      return NextResponse.json({ ok: false, error: 'voiceId é obrigatório para concluir o cadastro.' }, { status: 400 });
    }

    const res = await updateVoiceInvite(token, {
      voiceId,
      voiceRecordingId: voiceRecordingId || null,
      sampleAudioUrl: sampleAudioUrl || null,
      verifyAudioUrl: verifyAudioUrl || null,
      phone: phone || invite.phone,
      customerName: customerName || invite.customerName,
      status: 'concluido'
    }, env);

    // Vincula a voz clonada a qualquer pedido pendente associado ao telefone
    const effectivePhone = phone || invite.phone;
    if (effectivePhone) {
      try {
        const { getSupabaseEdge } = await import('@/lib/supabase-edge');
        const { updateOrder } = await import('@/lib/supabaseDb');
        const { sanitizePhone } = await import('@/lib/customerVoices');
        const supabase = getSupabaseEdge(env);
        const cleanPhone = sanitizePhone(effectivePhone);
        if (supabase && cleanPhone) {
          const localDigits = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : cleanPhone;
          const { data: matchedOrders } = await supabase
            .from('orders')
            .select('id, payment_intent_sku, extras, lyrics, custom_voice_id, is_custom_voice')
            .or(`customer_phone.ilike.%${localDigits}%,customer_phone.ilike.%${cleanPhone}%`)
            .order('created_at', { ascending: false })
            .limit(3);

          for (const ord of matchedOrders || []) {
            const hasComboOrVoice = ord.payment_intent_sku === 'combo_voz' || ord.extras?.hasCustomVoiceAccess || ord.extras?.customVoiceAddonPaid;
            if (hasComboOrVoice && !ord.custom_voice_id) {
              await updateOrder(ord.id, {
                customVoiceId: voiceId,
                voiceRecordingId: voiceRecordingId || null,
                isCustomVoice: true,
                voiceType: 'minha_voz',
                hasCustomVoiceAccess: true
              }, env);
            }
          }
        }
      } catch (linkErr) {
        console.warn('[voice/invite/token] Não foi possível vincular a pedidos existentes:', linkErr.message);
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Voz clonada e vinculada ao contato com sucesso!',
      voiceId,
      customerName: res.invite?.customerName,
      phone: res.invite?.phone
    });
  } catch (err) {
    console.error('[voice/invite/token] Erro ao registrar conclusão:', err?.message);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro ao registrar voz.' }, { status: 500 });
  }
}
