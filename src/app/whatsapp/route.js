import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { lerConfigSite, WHATSAPP_SUPORTE_PADRAO, normalizarNumeroWhatsapp } from '@/lib/configSite';

export const runtime = 'edge';

/**
 * Link inteligente e dinâmico de WhatsApp (/whatsapp).
 * Redireciona o cliente diretamente para o número oficial de suporte configurado
 * no Painel Administrativo em tempo real, sem precisar de deploy ou alterar modelos da Meta.
 */
export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const config = await lerConfigSite(env);
  const numero = normalizarNumeroWhatsapp(config?.whatsappSuporte) || WHATSAPP_SUPORTE_PADRAO;

  const { searchParams } = new URL(req.url);
  const pedido = searchParams.get('pedido') || searchParams.get('id') || searchParams.get('orderId');
  const texto = pedido
    ? `Olá! Preciso de ajuda com o meu pedido #${pedido} no NS Music.`
    : 'Olá! Preciso de ajuda com o meu pedido no NS Music.';

  const destino = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  return NextResponse.redirect(destino, 307);
}
