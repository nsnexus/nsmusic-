import { SITE_URL, resolverSiteUrl } from './siteUrl.js';

/**
 * Constrói metadados Open Graph e Twitter personalizados para a página de homenagem /h/[id].
 * Mostra a capa da música do homenageado e um título/descrição afetuosos de presente.
 */
export function buildHomenagemMetadata(orderId, order = null, env = {}) {
  const baseUrl = resolverSiteUrl(env?.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL) || SITE_URL;

  const honoree = order?.honoreeName ? String(order.honoreeName).trim() : 'Você';
  const customer = order?.customerName ? String(order.customerName).trim() : '';

  const title = `🎁 Uma Homenagem Especial para ${honoree}`;
  const description = customer
    ? `Uma música emocionante preparada por ${customer} com todo carinho para ${honoree}. Toque para abrir e ouvir! ❤️🎵`
    : `Uma música e homenagem emocionante preparada com muito carinho para ${honoree}. Toque para abrir e ouvir! ❤️🎵`;

  let coverUrl = order?.coverUrl
    || (Array.isArray(order?.slideshowImages) && order?.slideshowImages[0])
    || `${baseUrl}/og-homenagem.jpg`;

  if (coverUrl && !coverUrl.startsWith('http')) {
    coverUrl = `${baseUrl}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`;
  }

  const pageUrl = `${baseUrl}/h/${encodeURIComponent(orderId || '')}`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'NS Music',
      type: 'website',
      images: [
        {
          url: coverUrl,
          width: 1200,
          height: 675,
          alt: `Homenagem especial para ${honoree}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [coverUrl],
    },
  };
}
