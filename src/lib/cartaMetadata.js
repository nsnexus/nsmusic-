import { SITE_URL, resolverSiteUrl } from './siteUrl.js';

/**
 * Constrói metadados Open Graph e Twitter personalizados para a página de carta /c/[id].
 * Mostra "Carta Especial de [Remetente]" (ou para [Homenageado]) e descrição personalizada.
 */
export function buildCartaMetadata(orderId, order = null, env = {}) {
  const baseUrl = resolverSiteUrl(env?.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL) || SITE_URL;

  const remetente = order?.customerName ? String(order.customerName).trim() : '';
  const honoree = order?.honoreeName ? String(order.honoreeName).trim() : '';

  let title = '💌 Você recebeu uma Carta Especial...';
  if (remetente && honoree) {
    title = `💌 Carta Especial de ${remetente} para ${honoree}`;
  } else if (remetente) {
    title = `💌 Carta Especial de ${remetente}`;
  } else if (honoree) {
    title = `💌 Carta Especial para ${honoree}`;
  }

  let description = 'Toque para abrir o envelope e ler esta homenagem feita especialmente com muito carinho para você.';
  if (remetente && honoree) {
    description = `Uma carta emocionante preparada por ${remetente} para ${honoree}. Toque para abrir o envelope e ler! 💌❤️`;
  } else if (remetente) {
    description = `Uma carta emocionante preparada por ${remetente}. Toque para abrir o envelope e ler! 💌❤️`;
  } else if (honoree) {
    description = `Uma carta emocionante preparada especialmente para ${honoree}. Toque para abrir o envelope e ler! 💌❤️`;
  }

  let coverUrl = order?.coverUrl || `${baseUrl}/og-carta.jpg`;
  if (coverUrl && !coverUrl.startsWith('http')) {
    coverUrl = `${baseUrl}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`;
  }

  const pageUrl = `${baseUrl}/c/${encodeURIComponent(orderId || '')}`;

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
          alt: title,
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
