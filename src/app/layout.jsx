import Script from 'next/script';
import './globals.css';
import { organizationJsonLd, serviceJsonLd } from '@/lib/structuredData';
import { SITE_URL } from '@/lib/siteUrl';

// Descrição única, usada em todo lugar (meta, OpenGraph, Twitter) — pedido 20/09/2026 ("deixar o
// site otimizado para leitura de IA"). Diz O QUE é, PARA QUEM serve, QUANTO custa e EM QUANTO
// TEMPO fica pronto: é essa frase que um assistente cita quando alguém pergunta por música
// personalizada de presente, então ela precisa responder sozinha, sem depender do resto da página.
const DESCRICAO =
  'Transforme sua história em música. A IA escreve a letra e compõe 2 versões completas em MP3 HD '
  + 'em cerca de 3 minutos. Você ouve as músicas inteiras antes de decidir e só paga se gostar, '
  + 'a partir de R$ 9,99. Presente para aniversário, Dia das Mães, declaração de amor e homenagens.';

const TITULO = 'NS Music | Música Personalizada com IA a partir da Sua História';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITULO,
    template: '%s · NS Music',
  },
  description: DESCRICAO,
  applicationName: 'NS Music',
  keywords: [
    'música personalizada', 'música com IA', 'presente personalizado', 'homenagem em música',
    'música de aniversário', 'declaração de amor em música', 'canção personalizada',
  ],
  authors: [{ name: 'NS Music' }],
  creator: 'NS Music',
  publisher: 'NS Music',
  alternates: { canonical: '/' },
  category: 'music',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: TITULO,
    description: DESCRICAO,
    type: 'website',
    locale: 'pt_BR',
    siteName: 'NS Music',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRICAO,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Verificação de domínio da Meta. A Meta emite um código POR DOMÍNIO, e as duas tags
            convivem: a primeira é de nsmusic.nsnexus.com.br, a segunda de nsmusic.ia.br
            (migração de 21/09/2026). Manter as duas enquanto o domínio antigo servir — remover a
            de cima só quando ele deixar de receber tráfego, senão a verificação dele cai e a
            atribuição dos anúncios antigos vai junto. */}
        <meta name="facebook-domain-verification" content="qi9uy0hda0fhx97jdp01eathe33ikq" />
        <meta name="facebook-domain-verification" content="0eo12pnwh2cj9ugkzhpkvrl6tr96wj" />
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
        {/* Dados estruturados do negócio inteiro — quem somos e o que vendemos, por quanto. Ficam
            no layout porque valem para toda página. O FAQPage e o HowTo NÃO ficam aqui: cada
            página tem o seu (home em page.jsx, ocasiões em PaginaOcasiao.jsx), e dois FAQPage no
            mesmo documento fazem o Google descartar os dois. Ver src/lib/structuredData.js. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationJsonLd(), serviceJsonLd()]),
          }}
        />
        {children}
      </body>
    </html>
  );
}

