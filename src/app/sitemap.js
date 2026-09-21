// sitemap.xml gerado pelo Next (App Router) — pedido 20/09/2026.
//
// Só páginas públicas e estáveis. Nada que dependa de orderId entra aqui: /entrega, /carta,
// /homenagem e afins mostram a homenagem de um cliente específico, e listá-las seria publicar o
// presente de alguém (ver o comentário em robots.js).
import { ocasioes } from '@/lib/ocasioes';

export const runtime = 'edge';

const BASE = 'https://nsmusic.nsnexus.com.br';

export default function sitemap() {
  const agora = new Date();

  return [
    { url: `${BASE}/`, lastModified: agora, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/criar`, lastModified: agora, changeFrequency: 'weekly', priority: 0.9 },
    // Páginas de ocasião: é por onde a busca de cauda longa ("música para o dia das mães") chega.
    ...ocasioes.map((o) => ({
      url: `${BASE}/${o.slug}`,
      lastModified: agora,
      changeFrequency: 'monthly',
      priority: 0.8,
    })),
    { url: `${BASE}/apoie`, lastModified: agora, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE}/termos-de-uso`, lastModified: agora, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/politica-de-privacidade`, lastModified: agora, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
