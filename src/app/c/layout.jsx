// noindex: a carta é de um cliente específico. O preview rico abaixo continua valendo — o
// WhatsApp lê as tags og: independentemente de robots, então o link compartilhado segue bonito.
export const metadata = {
  robots: { index: false, follow: false },
  title: '💌 Você recebeu uma Carta Especial...',
  description: 'Toque para abrir e ler esta homenagem feita especialmente com muito carinho para você.',
  openGraph: {
    title: '💌 Você recebeu uma Carta Especial...',
    description: 'Toque para abrir e ler esta homenagem feita especialmente com muito carinho para você.',
    images: [
      {
        url: '/og-carta.jpg',
        width: 1200,
        height: 675,
        alt: 'Uma carta especial para você',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '💌 Você recebeu uma Carta Especial...',
    description: 'Toque para abrir e ler esta homenagem feita especialmente com muito carinho para você.',
    images: ['/og-carta.jpg'],
  },
};

export default function ShortLinkLayout({ children }) {
  return children;
}
