// noindex: esta página mostra dado de um cliente específico (nome do homenageado, história,
// fotos, áudio) ou área logada. É acessível por link — não é segredo —, mas indexá-la colocaria a
// homenagem de alguém no Google sem ninguém ter pedido. Também está bloqueada em robots.js; aqui é
// a segunda barreira, que vale mesmo se o robô ignorar o robots.txt.
export const metadata = {
  title: '🎁 Uma Homenagem Especial para Você',
  description: 'Toque para ouvir a música e ver a linda homenagem feita com muito carinho para você! ❤️🎵',
  robots: { index: false, follow: false },
  openGraph: {
    title: '🎁 Uma Homenagem Especial para Você',
    description: 'Toque para ouvir a música e ver a linda homenagem feita com muito carinho para você! ❤️🎵',
    images: [
      {
        url: '/og-homenagem.jpg',
        width: 1200,
        height: 675,
        alt: 'Uma homenagem especial para você',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '🎁 Uma Homenagem Especial para Você',
    description: 'Toque para ouvir a música e ver a linda homenagem feita com muito carinho para você! ❤️🎵',
    images: ['/og-homenagem.jpg'],
  },
};

export default function HomenagemLayout({ children }) {
  return children;
}
