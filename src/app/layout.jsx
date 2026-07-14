import './globals.css';

export const metadata = {
  title: 'NSNexus — Músicas Personalizadas com IA',
  description: 'Dê vida às suas histórias em formato de canções personalizadas criadas com Inteligência Artificial.',
  openGraph: {
    title: 'NSNexus — Músicas Personalizadas com IA',
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
