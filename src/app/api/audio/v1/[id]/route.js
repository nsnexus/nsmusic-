import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { lerConfigSite, normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from '@/lib/configSite';
import { DOMINIO_CANONICO } from '@/lib/siteUrl';
import { idDePedidoValido, montarPaginaDownload } from '@/lib/paginaDownload';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Destino do botão "Baixar versão 1" da mensagem de WhatsApp. Abre uma página com player e botão
// de download em vez de mandar direto para o arquivo — ver src/lib/paginaDownload.js.
const FAIXA = 0;

export async function GET(req, { params }) {
  const id = String(params?.id || '');
  if (!idDePedidoValido(id)) {
    return Response.redirect(DOMINIO_CANONICO, 302);
  }

  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {
    // Fora do runtime da Cloudflare (dev local): segue com process.env.
  }

  let totalFaixas = 0;
  let homenageado = '';
  try {
    const pedido = await getOrder(id, env);
    const arquivos = Array.isArray(pedido?.audioFiles) ? pedido.audioFiles.filter(Boolean) : [];
    totalFaixas = arquivos.length || (pedido?.audioUrl ? 1 : 0);
    homenageado = String(pedido?.honoreeName || '').slice(0, 60);
  } catch (err) {
    console.warn('[audio/v1] Falha ao ler o pedido:', err?.name);
  }

  let suporte = WHATSAPP_SUPORTE_PADRAO;
  try {
    const cfg = await lerConfigSite(env);
    suporte = normalizarNumeroWhatsapp(cfg?.whatsappSuporte) || WHATSAPP_SUPORTE_PADRAO;
  } catch (err) {
    console.warn('[audio/v1] Falha ao ler o contato de suporte:', err?.name);
  }

  const html = montarPaginaDownload({ orderId: id, faixa: FAIXA, totalFaixas, homenageado, suporte });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
