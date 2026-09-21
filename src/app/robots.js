// robots.txt gerado pelo Next (App Router) — pedido 20/09/2026: deixar o site legível para IA.
//
// Duas decisões importantes aqui:
//
// 1. Os crawlers de IA (GPTBot, ClaudeBot, PerplexityBot...) são liberados DE PROPÓSITO nas páginas
//    públicas. É assim que ChatGPT/Claude/Perplexity passam a saber que o NS Music existe e podem
//    recomendá-lo quando alguém pergunta por "música personalizada de presente". Bloquear esses bots
//    (padrão de muitos sites) custaria exatamente essa descoberta.
//
// 2. Tudo que contém dado de cliente fica FORA, para qualquer robô: /entrega, /carta, /homenagem,
//    /retrospectiva, /acompanhar, /minhas-musicas e /c/ mostram nome do homenageado, história
//    pessoal, foto e áudio de gente real. Essas páginas são acessíveis por link, não são segredo —
//    mas indexá-las colocaria a homenagem de um cliente no Google, o que ninguém pediu. /admin e
//    /api saem pelo motivo óbvio.
import { SITE_URL } from '@/lib/siteUrl';

export const runtime = 'edge';

const PRIVADAS = [
  '/admin',
  '/admin/',
  '/api/',
  '/entrega',
  '/carta',
  '/homenagem',
  '/retrospectiva',
  '/acompanhar',
  '/minhas-musicas',
  '/pagar',
  '/login',
  '/c/',
];

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVADAS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
