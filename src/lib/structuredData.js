// Dados estruturados (JSON-LD / Schema.org) — pedido 20/09/2026: "deixar o site otimizado para
// leitura de IA".
//
// É isto que faz um buscador ou um LLM entender o site como DADO em vez de texto solto: o que é
// vendido, por quanto, em que moeda, quanto tempo leva e quais as perguntas frequentes. Sem isso,
// preço e prazo só existem dentro de elementos visuais que a máquina tem que adivinhar.
//
// Preços vêm de src/lib/pricing.js — o mesmo catálogo que o servidor usa para cobrar, para o valor
// anunciado nunca divergir do valor real (a divergência seria pior aqui do que numa tela: um preço
// errado no JSON-LD vira resposta errada no ChatGPT e no Google).
import { getPriceForSku } from './pricing';
import { SITE_URL } from './siteUrl';

const BASE = SITE_URL;

const brl = (sku) => ({
  '@type': 'Offer',
  price: getPriceForSku(sku).toFixed(2),
  priceCurrency: 'BRL',
  availability: 'https://schema.org/InStock',
  url: `${BASE}/criar`,
});

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NS Music',
    url: BASE,
    logo: `${BASE}/logo.png`,
    description:
      'Estúdio brasileiro que cria músicas personalizadas com inteligência artificial a partir da história contada pelo cliente.',
    areaServed: 'BR',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      telephone: '+55-94-99106-4043',
      availableLanguage: ['Portuguese'],
    },
  };
}

export function serviceJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Música personalizada com IA',
    serviceType: 'Composição musical personalizada',
    provider: { '@type': 'Organization', name: 'NS Music', url: BASE },
    areaServed: 'BR',
    description:
      'Música composta do zero a partir da história do cliente: letra exclusiva e duas versões completas em MP3 HD, prontas em cerca de 2 a 3 minutos. O cliente ouve as músicas inteiras antes de decidir e só paga se gostar.',
    offers: [
      { ...brl('audio_only'), name: 'Música personalizada (2 versões em MP3 HD)' },
      { ...brl('combo'), name: 'Música + Vídeo Homenagem' },
      { ...brl('video_addon'), name: 'Vídeo Homenagem (slideshow com fotos)' },
      { ...brl('carta_addon'), name: 'Carta Virtual' },
      { ...brl('playback_addon'), name: 'Playback instrumental' },
      { ...brl('retrospectiva_addon'), name: 'Retrospectiva' },
    ],
  };
}

// As mesmas perguntas que aparecem na home — se mudarem lá, mudam aqui. Responder no JSON-LD o que
// a página responde na tela é o que permite a resposta aparecer direto no buscador/assistente.
export function faqJsonLd() {
  const perguntas = [
    ['Preciso pagar para ouvir a música?',
      'Não. Você ouve as duas versões completas, do começo ao fim, antes de decidir, e só paga se gostar. O pagamento libera o download em MP3 HD e os extras.'],
    ['Como é feita a criação da música?',
      'Você insere os detalhes da história e escolhe o estilo. Nossa inteligência artificial cria a letra poética e compõe os arranjos vocais e instrumentais de estúdio com alta definição.'],
    ['Recebo 2 versões da minha música?',
      'Sim. No pacote promocional de R$ 9,99 você recebe 2 versões completas da sua música, com arranjos musicais diferentes.'],
    ['Como recebo a música pronta?',
      'Assim que o pagamento é concluído, o download em MP3 HD fica liberado na página de entrega e no painel Minhas Músicas, sem limite de vezes. O link também é enviado no seu WhatsApp.'],
    ['Qual o tempo de geração?',
      'A letra e os áudios são gerados e liberados em cerca de 2 a 3 minutos, direto no site.'],
    ['Preciso criar uma conta para pedir?',
      'Não. O pedido é feito sem cadastro obrigatório. Criar conta serve para reencontrar suas músicas depois, no painel Minhas Músicas.'],
    ['Como funciona o pagamento?',
      'O pagamento é por Pix, à vista, sem assinatura e sem mensalidade. O produto é liberado assim que o pagamento é confirmado.'],
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: perguntas.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

// Os passos que a home descreve em "Como Funciona?", em formato que a máquina lê como procedimento.
export function howToJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Como criar uma música personalizada no NS Music',
    totalTime: 'PT5M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'BRL', value: getPriceForSku('audio_only').toFixed(2) },
    step: [
      {
        '@type': 'HowToStep',
        name: 'Conte os detalhes',
        text: 'Diga para quem é a música, a ocasião e os momentos que marcaram essa história. Escolha o estilo musical, o clima e o tipo de voz.',
        url: `${BASE}/criar`,
      },
      {
        '@type': 'HowToStep',
        name: 'Revise a letra',
        text: 'A inteligência artificial escreve a letra a partir da sua história. Você lê, ajusta se quiser e aprova antes de gerar o áudio.',
        url: `${BASE}/criar`,
      },
      {
        '@type': 'HowToStep',
        name: 'Receba os áudios em MP3 HD',
        text: 'Em cerca de 2 a 3 minutos ficam prontas duas versões da música. Você ouve as duas inteiras, do começo ao fim, e só paga se gostar. O download em MP3 HD é liberado após o pagamento por Pix.',
        url: `${BASE}/criar`,
      },
    ],
  };
}
