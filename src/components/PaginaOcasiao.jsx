// Layout das páginas de ocasião (/musica-de-aniversario e irmãs) — ver src/lib/ocasioes.js.
//
// Server Component de propósito: sem 'use client', sem hook, sem fetch. O HTML sai inteiro do
// servidor, então crawler e assistente que não executam JavaScript leem a página completa — que é
// o ponto de existirem. O FAQ usa <details>/<summary> nativo justamente para ser interativo sem
// estado de React.
import Link from 'next/link';
import Image from 'next/image';
import { ocasioes } from '@/lib/ocasioes';
import { getPriceForSku } from '@/lib/pricing';
import { SITE_URL } from '@/lib/siteUrl';

const BASE = SITE_URL;

const preco = (sku) => getPriceForSku(sku).toFixed(2).replace('.', ',');

// FAQPage + BreadcrumbList específicos desta página. O layout raiz já publica Organization e
// Service (site inteiro); aqui entra só o que muda de ocasião para ocasião.
function jsonLdDaOcasiao(ocasiao) {
  const url = `${BASE}/${ocasiao.slug}`;

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: ocasiao.faq.map(([pergunta, resposta]) => ({
        '@type': 'Question',
        name: pergunta,
        acceptedAnswer: { '@type': 'Answer', text: resposta },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: BASE },
        { '@type': 'ListItem', position: 2, name: ocasiao.titulo, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: ocasiao.titulo,
      description: ocasiao.descricao,
      brand: { '@type': 'Brand', name: 'NS Music' },
      offers: {
        '@type': 'Offer',
        price: getPriceForSku('audio_only').toFixed(2),
        priceCurrency: 'BRL',
        availability: 'https://schema.org/InStock',
        url: `${url}`,
      },
    },
  ];
}

export default function PaginaOcasiao({ ocasiao }) {
  const linkCriar = `/criar?ocasiao=${encodeURIComponent(ocasiao.ocasiaoWizard)}`;
  const outras = ocasioes.filter((o) => o.slug !== ocasiao.slug);

  return (
    <div style={s.wrapper}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdDaOcasiao(ocasiao)) }}
      />

      <header style={s.header} className="glass-panel">
        <div className="container" style={s.headerContainer}>
          <Link href="/" style={s.marca}>
            <Image src="/logo.png" alt="NSMusic" width={36} height={36} style={{ height: '36px', width: 'auto' }} />
            <span className="gradient-text" style={s.marcaTexto}>NSMusic</span>
          </Link>
          <Link href={linkCriar} className="btn btn-primary" style={s.ctaHeader}>
            Criar R$ {preco('audio_only')}
          </Link>
        </div>
      </header>

      <main>
        <section className="container" style={s.hero}>
          <p style={s.sobretitulo}>Música personalizada com IA</p>
          <h1 style={s.h1}>{ocasiao.h1}</h1>
          {ocasiao.intro.map((paragrafo) => (
            <p key={paragrafo.slice(0, 32)} style={s.paragrafo}>{paragrafo}</p>
          ))}
          <Link href={linkCriar} className="btn btn-primary" style={s.ctaGrande}>
            Criar minha música por R$ {preco('audio_only')}
          </Link>
          <p style={s.microcopy}>
            Ouça inteira antes de pagar · 2 versões em MP3 HD · pronta em ~3 min · Pix · sem cadastro
          </p>
        </section>

        <section className="container" style={s.secao}>
          <h2 style={s.h2}>O que você recebe</h2>
          <ul style={s.lista}>
            {ocasiao.bullets.map((item) => (
              <li key={item} style={s.listaItem}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="container" style={s.secao}>
          <h2 style={s.h2}>Como funciona</h2>
          <ol style={s.passos}>
            <li style={s.passo}>
              <strong>Conte a história.</strong> Para quem é, a ocasião, os momentos que marcaram,
              nomes e frases que não podem faltar.
            </li>
            <li style={s.passo}>
              <strong>Revise a letra.</strong> A inteligência artificial escreve a letra a partir do
              que você contou. Você lê, ajusta e só então aprova.
            </li>
            <li style={s.passo}>
              <strong>Ouça inteira e decida.</strong> Duas versões completas em MP3 HD em cerca de
              2 a 3 minutos. Você ouve as duas do começo ao fim e só paga se gostar. O pagamento
              por Pix libera o download.
            </li>
          </ol>
        </section>

        <section className="container" style={s.secao}>
          <h2 style={s.h2}>Estilos que combinam com essa ocasião</h2>
          <div style={s.chips}>
            {ocasiao.estilos.map((estilo) => (
              <span key={estilo} style={s.chip}>{estilo}</span>
            ))}
          </div>
          <p style={s.paragrafoPequeno}>
            Clima sugerido: {ocasiao.climaSugerido}. São 18 estilos e 10 climas no total, e a voz
            pode ser masculina, feminina ou dueto.
          </p>
        </section>

        <section className="container" style={s.secao}>
          <h2 style={s.h2}>Preços</h2>
          <ul style={s.lista}>
            <li style={s.listaItem}>
              <strong>Música personalizada, R$ {preco('audio_only')}:</strong> 2 versões completas
              em MP3 HD, com letra exclusiva.
            </li>
            <li style={s.listaItem}>
              <strong>Vídeo Homenagem, R$ {preco('video_addon')}:</strong> slideshow vertical com 10
              a 20 fotos sincronizadas com a música.
            </li>
            <li style={s.listaItem}>
              <strong>Carta Virtual, R$ {preco('carta_addon')}:</strong> carta escrita a partir da
              mesma história, com página própria para compartilhar.
            </li>
            <li style={s.listaItem}>
              <strong>Playback, R$ {preco('playback_addon')}:</strong> a mesma música sem voz, para
              cantar junto.
            </li>
          </ul>
          <p style={s.paragrafoPequeno}>Pagamento por Pix, à vista. Sem assinatura e sem mensalidade.</p>
        </section>

        <section className="container" style={s.secao}>
          <h2 style={s.h2}>Perguntas frequentes</h2>
          <div style={s.faqLista}>
            {ocasiao.faq.map(([pergunta, resposta]) => (
              <details key={pergunta} className="glass-card" style={s.faqItem}>
                <summary style={s.faqPergunta}>{pergunta}</summary>
                <p style={s.faqResposta}>{resposta}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="container" style={s.secaoCta}>
          <h2 style={s.h2}>Pronto para criar?</h2>
          <p style={s.paragrafo}>
            Você escreve a história, lê a letra antes de gerar e ouve a música inteira antes de pagar.
          </p>
          <Link href={linkCriar} className="btn btn-primary" style={s.ctaGrande}>
            Criar minha música por R$ {preco('audio_only')}
          </Link>
        </section>

        <section className="container" style={s.secao}>
          <h2 style={s.h2}>Outras ocasiões</h2>
          <div style={s.chips}>
            {outras.map((outra) => (
              <Link key={outra.slug} href={`/${outra.slug}`} style={s.chipLink}>
                {outra.titulo.replace(' Personalizada com IA', '').replace(' com IA', '')}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer style={s.footer}>
        <div className="container" style={s.footerContainer}>
          <p style={s.footerTexto}>
            NS Music. Músicas personalizadas criadas com inteligência artificial a partir da sua
            história.
          </p>
          <div style={s.footerLinks}>
            <Link href="/" style={s.footerLink}>Início</Link>
            <Link href="/criar" style={s.footerLink}>Criar música</Link>
            <Link href="/politica-de-privacidade" style={s.footerLink}>Política de Privacidade</Link>
            <Link href="/termos-de-uso" style={s.footerLink}>Termos de Uso</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

const s = {
  wrapper: { minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' },
  header: { position: 'sticky', top: 0, zIndex: 20, padding: '12px 0', borderBottom: '1px solid var(--border-color)' },
  headerContainer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
  marca: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
  marcaTexto: { fontSize: '1.2rem', fontWeight: '900', letterSpacing: '-0.5px' },
  ctaHeader: { padding: '8px 16px', fontSize: '0.85rem', minHeight: '38px', whiteSpace: 'nowrap' },

  hero: { paddingTop: '48px', paddingBottom: '24px', maxWidth: '760px' },
  sobretitulo: {
    textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: '0.75rem',
    fontWeight: '700', color: 'var(--primary)', marginBottom: '12px',
  },
  h1: { fontSize: '2.1rem', lineHeight: '1.2', fontWeight: '800', marginBottom: '20px' },
  h2: { fontSize: '1.5rem', fontWeight: '800', marginBottom: '16px' },
  paragrafo: { color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '1.02rem', marginBottom: '14px' },
  paragrafoPequeno: { color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.9rem', marginTop: '14px' },
  ctaGrande: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px',
    padding: '16px 30px', fontSize: '1.02rem', textAlign: 'center', whiteSpace: 'normal',
  },
  microcopy: { color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '12px' },

  secao: { paddingTop: '32px', paddingBottom: '8px', maxWidth: '760px' },
  secaoCta: { paddingTop: '40px', paddingBottom: '16px', maxWidth: '760px' },

  lista: { listStyle: 'disc', paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '10px' },
  listaItem: { color: 'var(--text-secondary)', lineHeight: '1.65', fontSize: '0.98rem' },
  passos: { paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '12px' },
  passo: { color: 'var(--text-secondary)', lineHeight: '1.65', fontSize: '0.98rem' },

  chips: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  chip: {
    padding: '7px 13px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: '600',
    backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
  },
  chipLink: {
    padding: '9px 15px', borderRadius: '999px', fontSize: '0.88rem', fontWeight: '600',
    border: '1px solid var(--border-color)', color: 'var(--text-secondary)', textDecoration: 'none',
  },

  faqLista: { display: 'flex', flexDirection: 'column', gap: '10px' },
  faqItem: { padding: '14px 18px' },
  faqPergunta: { fontWeight: '700', fontSize: '0.98rem', cursor: 'pointer', color: 'var(--text-primary)' },
  faqResposta: { color: 'var(--text-secondary)', lineHeight: '1.65', fontSize: '0.93rem', marginTop: '10px' },

  footer: { marginTop: '48px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', padding: '30px 0' },
  footerContainer: { display: 'flex', flexDirection: 'column', gap: '14px' },
  footerTexto: { fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '520px' },
  footerLinks: { display: 'flex', flexWrap: 'wrap', gap: '16px' },
  footerLink: { fontSize: '0.85rem', color: 'var(--text-muted)' },
};
