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
        <meta name="facebook-domain-verification" content="qi9uy0hda0fhx97jdp01eathe33ikq" />
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
            gtag('config', 'AW-966585092');
          `}
        </Script>
        <Script id="facebook-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '1366434898413500');
            fbq('track', 'PageView');
          `}
        </Script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

