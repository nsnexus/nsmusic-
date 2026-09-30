import { SITE_URL, resolverSiteUrl } from './siteUrl.js';

/**
 * Constrói metadados Open Graph e Twitter personalizados para a página de retrospectiva /r/[id].
 * Mostra a foto da retrospectiva ou capa da música do homenageado e um título/descrição afetuosos.
 */
export function buildRetrospectivaMetadata(orderId, order = null, env = {}) {
  const baseUrl = resolverSiteUrl(env?.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL) || SITE_URL;

  const honoree = order?.honoreeName ? String(order.honoreeName).trim() : 'Você';
  const customer = order?.customerName ? String(order.customerName).trim() : '';
  const retroTitulo = order?.retrospectiva?.titulo ? String(order.retrospectiva.titulo).trim() : '';

  const title = retroTitulo 
    ? `📖 ${retroTitulo} | Retrospectiva de ${honoree}` 
    : `📖 Uma Retrospectiva Especial para ${honoree}`;

  const description = customer
    ? `Momentos inesquecíveis, fotos e música personalizada preparados por ${customer} com todo carinho para ${honoree}. Toque para reviver essa história! ✨❤️`
    : `Momentos inesquecíveis, fotos e música personalizada preparados com todo carinho para ${honoree}. Toque para reviver essa história! ✨❤️`;

  let coverUrl = (Array.isArray(order?.retrospectiva?.fotos) && order.retrospectiva.fotos[0])
    || (Array.isArray(order?.slideshowImages) && order?.slideshowImages[0])
    || order?.coverUrl
    || `${baseUrl}/og-homenagem.jpg`;

  if (coverUrl && !coverUrl.startsWith('http')) {
    coverUrl = `${baseUrl}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`;
  }

  const pageUrl = `${baseUrl}/r/${encodeURIComponent(orderId || '')}`;

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
          alt: `Retrospectiva especial para ${honoree}`,
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
