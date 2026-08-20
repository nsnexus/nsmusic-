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
        <a
          href="https://wa.me/5594991081351?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20NSMusic."
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="floating-whatsapp-btn"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '58px',
            height: '58px',
            borderRadius: '50%',
            backgroundColor: '#25D366',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            zIndex: 9999,
            textDecoration: 'none',
          }}
        >
          <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" aria-hidden="true">
            <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.386.696 4.609 1.897 6.479L4 29l7.706-1.858A11.94 11.94 0 0 0 16.001 27C22.628 27 28 21.627 28 15S22.628 3 16.001 3Zm6.965 17.14c-.297.837-1.474 1.532-2.41 1.73-.641.135-1.478.243-4.29-.921-3.598-1.49-5.91-5.147-6.09-5.386-.174-.239-1.453-1.935-1.453-3.69 0-1.756.92-2.618 1.245-2.977.325-.359.71-.448.947-.448.237 0 .474.002.681.012.219.01.512-.083.8.611.297.712 1.01 2.468 1.098 2.647.088.18.147.39.03.629-.118.239-.177.39-.354.6-.177.21-.372.469-.532.63-.177.176-.362.368-.156.723.207.354.918 1.514 1.97 2.452 1.354 1.207 2.496 1.581 2.85 1.758.354.177.561.148.769-.09.207-.239.888-1.035 1.126-1.39.237-.354.474-.294.799-.176.325.117 2.062.973 2.416 1.15.354.176.59.264.679.412.088.148.088.858-.209 1.695Z" />
          </svg>
        </a>
      </body>
    </html>
  );
}

