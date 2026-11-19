import { DOMINIO_CANONICO } from '@/lib/siteUrl';
import { idDePedidoValido } from '@/lib/paginaDownload';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Destino dos botões "Baixar Versão 1" e "Baixar Versão 2" da mensagem de pagamento confirmado no
// WhatsApp (template confirmacao_pagamento_v2, URL fixa na Meta: /api/audio/v1/{{1}} e /v2/{{1}}).
//
// Pedido do dono em 19/11/2026: os dois botões abrem a PÁGINA DO PEDIDO. A página intermediária de
// download (src/lib/paginaDownload.js) dava "página indisponível" para muitos clientes dentro do
// navegador do WhatsApp; a página do pedido já tem player, download e o resto do que foi comprado.
export async function GET(req, { params }) {
  const id = String(params?.id || '');
  if (!idDePedidoValido(id)) {
    return Response.redirect(DOMINIO_CANONICO, 302);
  }
  return Response.redirect(`${DOMINIO_CANONICO}/entrega?orderId=${encodeURIComponent(id)}`, 302);
}
