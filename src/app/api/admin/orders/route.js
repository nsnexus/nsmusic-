import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { isBonusOrder } from '@/lib/trafficSource.js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Colunas otimizadas para a listagem e busca do painel administrativo.
// Omite campos pesados desnecessários na tabela (como retrospectiva, história completa,
// slideshow_images, carta_texto e dumps de erros) para acelerar a query e reduzir o tráfego em ~70%.
const ADMIN_ORDER_COLUMNS = [
  'id',
  'order_number',
  'customer_name',
  'customer_phone',
  'customer_phone_digits',
  'customer_email',
  'user_id',
  'honoree_name',
  'recipient_type',
  'relationship',
  'occasion',
  'music_style',
  'music_mood',
  'voice_type',
  'lyrics',
  'production_status',
  'suno_provider',
  'suno_generation_count',
  'suno_requested_at',
  'audio_url',
  'audio_files',
  'audio_ids',
  'cover_url',
  'payment_status',
  'paid_at',
  'has_video_access',
  'has_carta_access',
  'has_retrospectiva_access',
  'has_playback_access',
  'has_karaoke_access',
  'video_url',
  'video_status',
  'playback_url',
  'playback_status',
  'carta_tema_escolhido',
  'carta_musica_url',
  'homenagem_musica_url',
  'preview_listened_at',
  'terms_accepted',
  'terms_accepted_at',
  'created_at',
  'updated_at',
  'deleted_at',
  'extras'
].join(',');

/**
 * Normaliza os limites de data (dateFrom e dateTo) para o fuso do Brasil (UTC-3).
 * Suporta formatos 'YYYY-MM-DD' e ISO 8601 ('YYYY-MM-DDTHH:mm:ss.sssZ').
 * Quando apenas dateFrom é fornecido, cobre as 24 horas daquele dia completo (00:00 a 23:59:59.999).
 * Se dateFrom > dateTo, inverte automaticamente para evitar intervalos vazios.
 */
export function normalizeDateBounds(dateFrom, dateTo) {
  const rawFrom = (dateFrom || '').trim();
  const rawTo = (dateTo || '').trim();
  if (!rawFrom && !rawTo) return { fromIso: null, toIso: null };

  const toDayStartIso = (val) => {
    if (!val) return null;
    const datePart = val.includes('T') ? val.split('T')[0] : val;
    return `${datePart}T00:00:00-03:00`;
  };

  const toDayEndIso = (val) => {
    if (!val) return null;
    const datePart = val.includes('T') ? val.split('T')[0] : val;
    return `${datePart}T23:59:59.999-03:00`;
  };

  let fromIso = null;
  let toIso = null;

  if (rawFrom && rawTo) {
    let s = rawFrom;
    let e = rawTo;
    const sDate = s.includes('T') ? s.split('T')[0] : s;
    const eDate = e.includes('T') ? e.split('T')[0] : e;
    if (sDate > eDate) {
      s = rawTo;
      e = rawFrom;
    }
    fromIso = toDayStartIso(s);
    toIso = toDayEndIso(e);
  } else if (rawFrom) {
    fromIso = toDayStartIso(rawFrom);
    toIso = toDayEndIso(rawFrom);
  } else if (rawTo) {
    toIso = toDayEndIso(rawTo);
  }

  return { fromIso, toIso };
}

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const search = (searchParams.get('search') || '').trim();
  const paymentStatus = searchParams.get('paymentStatus') || 'ALL';
  const productionStatus = searchParams.get('productionStatus') || 'ALL';
  const limitCount = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 1000);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
    }

    let q = supabase.from('orders').select(ADMIN_ORDER_COLUMNS)
      .is('deleted_at', null)
      .neq('production_status', 'CONFIG');

    if ((dateFrom || dateTo) && !search) {
      const { fromIso, toIso } = normalizeDateBounds(dateFrom, dateTo);

      if (paymentStatus === 'PAGO' || paymentStatus === 'PAGAMENTO_APROVADO') {
        // Quando filtra pagos, traz quem foi pago OU criado naquele período
        if (fromIso && toIso) {
          q = q.or(`and(created_at.gte.${fromIso},created_at.lte.${toIso}),and(paid_at.gte.${fromIso},paid_at.lte.${toIso})`);
        } else if (fromIso) {
          q = q.or(`created_at.gte.${fromIso},paid_at.gte.${fromIso}`);
        } else if (toIso) {
          q = q.or(`created_at.lte.${toIso},paid_at.lte.${toIso}`);
        }
      } else {
        if (fromIso) q = q.gte('created_at', fromIso);
        if (toIso) q = q.lte('created_at', toIso);
      }
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      if (paymentStatus === 'PAGO' || paymentStatus === 'PAGAMENTO_APROVADO') {
        q = q.in('payment_status', ['PAGO', 'PAGAMENTO_APROVADO']);
      } else {
        q = q.eq('payment_status', paymentStatus);
      }
    }

    if (productionStatus && productionStatus !== 'ALL') {
      q = q.eq('production_status', productionStatus);
    }

    if (search) {
      const safe = search.replace(/[,()]/g, '');
      const digits = search.replace(/\D/g, '');
      const terms = [
        `customer_name.ilike.*${safe}*`,
        `customer_phone.ilike.*${safe}*`,
        `customer_email.ilike.*${safe}*`,
        `honoree_name.ilike.*${safe}*`,
        `order_number.ilike.*${safe}*`
      ];
      if (digits && digits.length >= 4) {
        terms.push(`customer_phone.ilike.*${digits}*`);
        terms.push(`customer_phone_digits.ilike.*${digits}*`);
        if (digits.length >= 7) {
          const suffix8 = digits.length >= 8 ? digits.slice(-8) : digits;
          const suffix7 = digits.slice(-7);
          terms.push(`customer_phone.ilike.*${suffix8}*`);
          terms.push(`customer_phone_digits.ilike.*${suffix8}*`);
          terms.push(`customer_phone.ilike.*${suffix7}*`);
          terms.push(`customer_phone_digits.ilike.*${suffix7}*`);
        }
      }
      q = q.or(terms.join(','));
    }

    q = q.order('created_at', { ascending: false }).limit(limitCount).offset(offset);

    const { data, error } = await q;
    if (error) {
      throw error;
    }

    const allMapped = (Array.isArray(data) ? data : [])
      .filter(row => row && !row.id.startsWith('session_') && !row.id.startsWith('config_'))
      .map(mapSupabaseOrderToFirestore)
      .filter(Boolean);

    // Regra mandatória: Pedidos bônus, cortesias e 2ª geração NÃO devem aparecer como pedidos avulsos
    // na listagem nem na tabela de pedidos do admin. Seus áudios/status são consolidados no pedido pai,
    // e suas gerações são apuradas exclusivamente em relatórios de custo da Suno/Kie.ai.
    const childOrdersMap = new Map();
    for (const o of allMapped) {
      if (o.parentOrderId) {
        childOrdersMap.set(o.parentOrderId, o);
      }
    }

    const orders = allMapped
      .filter(o => !isBonusOrder(o))
      .map(parent => {
        const child = childOrdersMap.get(parent.id) || childOrdersMap.get(parent.orderNumber);
        if (child) {
          const childAudioFiles = Array.isArray(child.audioFiles) && child.audioFiles.length > 0 ? child.audioFiles : (child.audioUrl ? [child.audioUrl] : []);
          const childHasAudio = childAudioFiles.length > 0 || ['AUDIO_GERADO', 'CONCLUIDO', 'FINALIZADO', 'ENTREGUE'].includes(child.productionStatus);
          const childIsGenerating = !childHasAudio && ['GERANDO_AUDIO', 'EM_PRODUCAO', 'PROCESSANDO', 'GERANDO'].includes(child.productionStatus);

          parent.secondGeneration = {
            id: child.id,
            orderNumber: child.orderNumber,
            customerName: child.customerName,
            productionStatus: child.productionStatus,
            audioUrl: child.audioUrl,
            audioFiles: childAudioFiles,
            lyrics: child.lyrics,
            musicStyle: child.musicStyle,
            musicMood: child.musicMood,
            createdAt: child.createdAt,
            hasAudio: childHasAudio,
            isGenerating: childIsGenerating,
            isDraft: !childHasAudio && !childIsGenerating,
          };
          parent.secondOrderCreated = childHasAudio;
          parent.secondOrderDraft = !childHasAudio && !childIsGenerating;
          parent.secondOrderGenerating = childIsGenerating;

          // Se o pai não tem áudio gerado mas o filho tem áudio, promove o status e áudio para o pai
          if (childHasAudio && (!parent.audioUrl && (!parent.audioFiles || parent.audioFiles.length === 0))) {
            parent.productionStatus = child.productionStatus || 'AUDIO_GERADO';
            parent.audioUrl = child.audioUrl;
            parent.audioFiles = childAudioFiles;
          }

          // Se o nome do pai é genérico ('Cliente') ou formato de CPF e o filho tem o nome real, promove o nome
          const isCpfOrGeneric = !parent.customerName || parent.customerName === 'Cliente' || /^\d[\d.\-\/\s]+$/.test(String(parent.customerName).trim());
          if (isCpfOrGeneric && child.customerName && child.customerName !== 'Cliente') {
            parent.customerName = child.customerName;
          }

          // Se o telefone do pai está vazio ou incompleto e o filho tem telefone válido, promove o telefone
          if ((!parent.customerPhone || String(parent.customerPhone).replace(/\D/g, '').length < 8) && child.customerPhone) {
            parent.customerPhone = child.customerPhone;
          }

          // Se o pai não tem registro de reprodução da prévia e o filho já ouviu, reflete o timestamp
          if (!parent.previewListenedAt && child.previewListenedAt) {
            parent.previewListenedAt = child.previewListenedAt;
          }
        }
        return parent;
      });
    return NextResponse.json({
      ok: true,
      orders,
      count: orders.length,
      source: 'supabase'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });

  } catch (err) {
    console.error('[admin/orders] Erro geral:', err.message);
    return NextResponse.json({ error: 'Erro ao listar pedidos' }, { status: 500 });
  }
}
