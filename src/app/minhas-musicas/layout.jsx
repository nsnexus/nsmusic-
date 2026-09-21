// noindex: esta página mostra dado de um cliente específico (nome do homenageado, história,
// fotos, áudio) ou área logada. É acessível por link — não é segredo —, mas indexá-la colocaria a
// homenagem de alguém no Google sem ninguém ter pedido. Também está bloqueada em robots.js; aqui é
// a segunda barreira, que vale mesmo se o robô ignorar o robots.txt.
export const metadata = {
  title: 'Minhas Músicas',
  description: 'Suas músicas criadas no NS Music.',
  robots: { index: false, follow: false },
};

export default function MinhasMusicasLayout({ children }) {
  return children;
}
