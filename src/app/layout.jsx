import './globals.css';

export const metadata = {
  title: 'NSMusic — Músicas Personalizadas com IA',
  description: 'Dê vida às suas histórias em formato de canções personalizadas criadas com Inteligência Artificial.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'NSMusic — Músicas Personalizadas com IA',
    description: 'Dê vida às suas histórias em formato de canções personalizadas criadas com Inteligência Artificial.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
