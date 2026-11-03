import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { sendEvolutionMediaMessage, sendEvolutionTextMessage } from '@/lib/whatsapp';
import { buildAudioDownloadLink, formatToWhatsAppNumber } from '@/lib/whatsappTemplates';
import { DOMINIO_CANONICO } from '@/lib/siteUrl';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const { orderId, trackIndex = 0 } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    // Regra de segurança: nunca liberar ou enviar áudio oficial completo sem confirmação de pagamento
    const isPaid = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO';
    if (!isPaid) {
      return NextResponse.json({ error: 'A música só pode ser enviada após a confirmação do pagamento.' }, { status: 403 });
    }

    const phone = order.whatsappSenderPhone || order.customerPhone;
    if (!phone) {
      return NextResponse.json({ error: 'Telefone de WhatsApp não cadastrado neste pedido.' }, { status: 400 });
    }

    const idx = Math.max(0, Number.parseInt(trackIndex, 10) || 0);
    const arquivos = Array.isArray(order.audioFiles) ? order.audioFiles.filter(Boolean) : [];
    let audioUrl = arquivos[idx] || arquivos[0] || order.audioUrl || '';

    if (!audioUrl) {
      return NextResponse.json({ error: 'Arquivo de áudio não disponível para este pedido.' }, { status: 404 });
    }

    // Garante URL pública absoluta caso seja relativa
    if (audioUrl.startsWith('/')) {
      audioUrl = `${DOMINIO_CANONICO}${audioUrl}`;
    }

    const honoree = order.honoreeName || 'alguém especial';
    const safeHonoree = honoree.replace(/[^\w]/g, '_');
    const fileName = `Musica_${safeHonoree}_Versao_${idx + 1}.mp3`;
    const caption = `🎵 Olá! Aqui está o arquivo MP3 da sua música para *${honoree}* (Versão ${idx + 1})!\n\nVocê pode tocar agora, salvar no seu aparelho ou encaminhar para quem você ama. 💖`;

    // 1. Tenta enviar o arquivo de mídia diretamente pelo WhatsApp (Evolution API)
    const mediaResult = await sendEvolutionMediaMessage(phone, {
      mediaUrl: audioUrl,
      caption,
      fileName,
      mediaType: 'audio',
      mimeType: 'audio/mpeg'
    }, env);

    if (mediaResult.success) {
      return NextResponse.json({
        success: true,
        method: 'media',
        message: 'Áudio oficial enviado diretamente para o seu WhatsApp!'
      });
    }

    // 2. Fallback: Se o envio do arquivo direto falhar (ex: áudio muito pesado ou VPS ocupada),
    // envia mensagem de texto com link direto seguro para download
    const downloadLink = buildAudioDownloadLink(audioUrl, fileName);
    const textMessage = `🎵 Olá! Aqui está o link direto para ouvir e baixar o MP3 da sua música para *${honoree}*:\n\n${downloadLink}\n\nVocê também pode acessar a página completa aqui:\n${DOMINIO_CANONICO}/entrega?orderId=${encodeURIComponent(orderId)}`;

    const textResult = await sendEvolutionTextMessage(phone, textMessage, env);
    if (textResult.success) {
      return NextResponse.json({
        success: true,
        method: 'link',
        message: 'Link de download direto enviado para o seu WhatsApp!'
      });
    }

    return NextResponse.json({
      error: 'Não foi possível conectar com o serviço de WhatsApp no momento. Tente novamente em instantes.'
    }, { status: 502 });

  } catch (error) {
    console.error('[send-audio-whatsapp] Erro:', error?.message);
    return NextResponse.json({ error: 'Falha interna ao processar envio para WhatsApp.' }, { status: 500 });
  }
}

