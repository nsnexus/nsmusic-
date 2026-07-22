import Script from 'next/script';
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
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-W4FMK1K20Y"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-W4FMK1K20Y');
          `}
        </Script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

