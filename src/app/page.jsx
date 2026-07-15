'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [playingId, setPlayingId] = useState(null);
  const [faqOpen, setFaqOpen] = useState({});

  const examples = [
    {
      id: 1,
      title: 'A Jornada de Nós Dois',
      occasion: 'Casamento / Romântico',
      duration: '3:15',
      style: 'Folk Acústico / Emocional',
    },
    {
      id: 2,
      title: 'Parabéns, Pai!',
      occasion: 'Aniversário / Homenagem',
      duration: '2:45',
      style: 'MPB / Bossa Nova',
    },
    {
      id: 3,
      title: 'Império do Amanhã',
      occasion: 'Institucional / Empresa',
      duration: '3:02',
      style: 'Pop Rock / Inspirador',
    },
  ];

  const packages = [
    {
      name: 'Essencial',
      price: 'R$ 49,90',
      description: 'Perfeito para uma lembrança rápida e marcante.',
      features: [
        '1 Música personalizada',
        'Letra criada por IA profissional',
        'Formato MP3',
        'Capa digital simples',
        '1 Pequena correção de letra',
        'Entrega em até 2 dias úteis',
      ],
      popular: false,
    },
    {
      name: 'Presente Completo',
      price: 'R$ 79,90',
      description: 'O pacote mais escolhido para presentear quem você ama.',
      features: [
        '1 Música personalizada',
        'Letra criada por IA profissional',
        'Formatos MP3 & WAV (Alta Qualidade)',
        'Capa personalizada com foto',
        'Arte com QR Code exclusivo',
        '1 Alteração de estrutura de letra',
        'Entrega em até 2 dias úteis',
      ],
      popular: true,
    },
    {
      name: 'Multi-Estilos (3 Versões)',
      price: 'R$ 119,90',
      description: 'Ideal para ter a mesma música em diferentes ritmos.',
      features: [
        '3 Versões da mesma música',
        'Ex: Romântico, Acústico e Pop Rock',
        'Formatos MP3',
        'Capa personalizada',
        'Arte com QR Code exclusivo',
        '1 Alteração de letra',
        'Entrega em até 3 dias úteis',
      ],
      popular: false,
    },
  ];

  const togglePlay = (id) => {
    if (playingId === id) {
      setPlayingId(null);
    } else {
      setPlayingId(id);
    }
  };

  const toggleFaq = (index) => {
    setFaqOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div style={styles.wrapper}>
      {/* Header / Navbar */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="NSMusic" style={{ height: '44px', width: 'auto' }} />
          </Link>
          <nav className="nav-menu">
            <a href="#como-funciona" className="nav-menu-link">Como Funciona</a>
            <a href="#exemplos" className="nav-menu-link">Exemplos</a>
            <a href="#pacotes" className="nav-menu-link">Pacotes</a>
            <a href="#faq" className="nav-menu-link">Dúvidas</a>
          </nav>
          <Link href="/criar" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '0.9rem' }}>
            Criar Música
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section style={styles.hero}>
        <div style={styles.heroBgGlow} />
        <div className="container" style={styles.heroContainer}>
          <div style={styles.heroBadge} className="glass-card">
            <span>✨ Transforme histórias em música com Inteligência Artificial</span>
          </div>
          <h1 className="hero-title">
            <span className="gradient-text">NSMusic</span> — Sua história{' '}
            contada em uma Canção Exclusiva
          </h1>
          <p style={styles.heroSubtitle}>
            A NSMusic é uma plataforma de criação de músicas personalizadas com Inteligência Artificial. Escolha o estilo, conte os momentos mais marcantes e receba uma canção de alta qualidade com letra emocionante criada especialmente para você ou para presentear quem você ama.
          </p>
          <div style={styles.heroActions}>
            <Link href="/criar" className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '16px 36px' }}>
              Criar minha música agora 🚀
            </Link>
            <a href="#exemplos" className="btn btn-secondary" style={{ fontSize: '1.1rem', padding: '16px 36px' }}>
              Ouvir Exemplos
            </a>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section id="como-funciona" style={styles.section}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Como Funciona?</h2>
            <p style={styles.sectionSubtitle}>O processo é simples, rápido e você acompanha cada etapa.</p>
          </div>
          <div style={styles.stepsGrid}>
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>1</div>
              <h3 style={styles.stepTitle}>Conte sua história</h3>
              <p style={styles.stepText}>Preencha nosso formulário simples dizendo para quem é a homenagem, momentos marcantes e escolha o estilo musical ideal.</p>
            </div>
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>2</div>
              <h3 style={styles.stepTitle}>Aprove a letra</h3>
              <p style={styles.stepText}>Nossa inteligência artificial cria uma composição emocionante com seus dados. Você revisa e pode pedir alterações antes de aprovar.</p>
            </div>
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>3</div>
              <h3 style={styles.stepTitle}>Produção e Entrega</h3>
              <p style={styles.stepText}>Após aprovar a letra e concluir o pagamento, produzimos a música no Suno com controle de qualidade manual. Você recebe um link privado para baixar.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Examples / Player Section */}
      <section id="exemplos" style={styles.sectionAlt}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Músicas Demonstrativas</h2>
            <p style={styles.sectionSubtitle}>Ouça a qualidade e a emoção das faixas que já criamos.</p>
          </div>
          <div style={styles.playerGrid}>
            {examples.map((item) => (
              <div key={item.id} style={styles.playerCard} className="glass-card">
                <div style={styles.playerMain}>
                  <div style={styles.playBtnContainer}>
                    <button 
                      onClick={() => togglePlay(item.id)} 
                      style={{
                        ...styles.playBtn,
                        background: playingId === item.id ? 'var(--secondary)' : 'var(--primary)'
                      }}
                    >
                      {playingId === item.id ? '⏹' : '▶'}
                    </button>
                  </div>
                  <div style={styles.playerInfo}>
                    <h3 style={styles.playerTitle}>{item.title}</h3>
                    <p style={styles.playerSub}>{item.occasion} • {item.style}</p>
                  </div>
                  <div style={styles.playerDuration}>{item.duration}</div>
                </div>

                {playingId === item.id && (
                  <div style={styles.visualizerContainer}>
                    <div style={styles.visualizerBar} className="bar-1" />
                    <div style={styles.visualizerBar} className="bar-2" />
                    <div style={styles.visualizerBar} className="bar-3" />
                    <div style={styles.visualizerBar} className="bar-4" />
                    <div style={styles.visualizerBar} className="bar-5" />
                    <div style={styles.visualizerBar} className="bar-6" />
                    <style jsx>{`
                      .bar-1 { animation: bounce 0.8s ease-in-out infinite alternate; }
                      .bar-2 { animation: bounce 1.1s ease-in-out infinite alternate; }
                      .bar-3 { animation: bounce 0.9s ease-in-out infinite alternate; }
                      .bar-4 { animation: bounce 1.3s ease-in-out infinite alternate; }
                      .bar-5 { animation: bounce 0.7s ease-in-out infinite alternate; }
                      .bar-6 { animation: bounce 1.0s ease-in-out infinite alternate; }
                      @keyframes bounce {
                        0% { height: 5px; }
                        100% { height: 35px; }
                      }
                    `}</style>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages Section */}
      <section id="pacotes" style={styles.section}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Escolha o Pacote Ideal</h2>
            <p style={styles.sectionSubtitle}>Valores transparentes e sem surpresas para criar o seu presente perfeito.</p>
          </div>
          <div style={styles.packagesGrid}>
            {packages.map((pkg, idx) => (
              <div 
                key={idx} 
                style={{
                  ...styles.pkgCard,
                  border: pkg.popular ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  transform: pkg.popular ? 'scale(1.03)' : 'none'
                }} 
                className="glass-card"
              >
                {pkg.popular && <div style={styles.popularBadge}>MAIS ESCOLHIDO 🔥</div>}
                <h3 style={styles.pkgName}>{pkg.name}</h3>
                <div style={styles.pkgPrice}>{pkg.price}</div>
                <p style={styles.pkgDesc}>{pkg.description}</p>
                <hr style={styles.pkgDivider} />
                <ul style={styles.pkgFeatures}>
                  {pkg.features.map((feat, fIdx) => (
                    <li key={fIdx} style={styles.pkgFeatureItem}>
                      <span style={styles.checkIcon}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link href="/criar" className={`btn ${pkg.popular ? 'btn-primary' : 'btn-secondary'}`} style={{ width: '100%', marginTop: 'auto' }}>
                  Escolher {pkg.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" style={styles.sectionAlt}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Perguntas Frequentes</h2>
            <p style={styles.sectionSubtitle}>Tudo o que você precisa saber sobre a criação das músicas.</p>
          </div>
          <div style={styles.faqList}>
            {[
              {
                q: 'Como é feita a criação da música?',
                a: 'Você insere os detalhes da história e escolhe o estilo. Nossa Inteligência Artificial cria a letra personalizada. Após a sua aprovação da letra, nós produzimos e refinamos o áudio manualmente através do Suno AI sob nossa conta comercial, garantindo a melhor versão e pronúncia dos nomes.',
              },
              {
                q: 'Posso pedir alterações na letra?',
                a: 'Sim! Todos os pacotes incluem pelo menos uma alteração gratuita antes da aprovação da letra. Você revisa, insere comentários no painel e nós regeneramos para ficar perfeito.',
              },
              {
                q: 'Como recebo a música pronta?',
                a: 'Você receberá uma notificação no e-mail e WhatsApp com um link de acesso a uma página privada e segura no nosso site. Lá você poderá ouvir a música, fazer o download dos arquivos em áudio, ver a letra digitalizada e acessar os produtos adicionais contratados (como capa, vídeo ou QR Code).',
              },
              {
                q: 'Qual o prazo de entrega?',
                a: 'O prazo padrão é de até 2 dias úteis para músicas simples. Pacotes premium ou com vídeos podem levar de 3 a 4 dias úteis. Caso precise com urgência, oferecemos a opção de Entrega Prioritária (em até 12h ou 24h) na seleção de adicionais.',
              },
            ].map((item, idx) => (
              <div key={idx} style={styles.faqItem} className="glass-card">
                <button onClick={() => toggleFaq(idx)} style={styles.faqQuestion}>
                  <span>{item.q}</span>
                  <span style={{ transform: faqOpen[idx] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                </button>
                {faqOpen[idx] && (
                  <div style={styles.faqAnswer}>
                    <p>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div className="container" style={styles.footerContainer}>
          <div style={styles.footerBrand}>
            <img src="/logo.png" alt="NSMusic" style={{ height: '36px', width: 'auto', marginBottom: '12px' }} />
            <p style={styles.footerTagline}>Eternizando momentos marcantes através de acordes e versos únicos.</p>
          </div>
          <div className="footer-rights">
            <div className="footer-links">
              <Link href="/politica-de-privacidade" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Política de Privacidade</Link>
              <Link href="/termos-de-uso" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Termos de Uso</Link>
            </div>
            <p>© {new Date().getFullYear()} NSMusic. Todos os direitos reservados.</p>
            <p style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Projetado e desenvolvido com tecnologia de ponta.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    borderRadius: 0,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '1.5rem',
  },
  logoText: {
    fontFamily: 'var(--font-family-title)',
    fontWeight: '800',
    fontSize: '1.3rem',
    letterSpacing: '-0.02em',
  },
  nav: {},
  navLink: {},
  hero: {
    position: 'relative',
    padding: '120px 0 100px 0',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroBgGlow: {
    position: 'absolute',
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
    top: '-200px',
    left: 'calc(50% - 300px)',
    pointerEvents: 'none',
    zIndex: -1,
  },
  heroContainer: {
    maxWidth: '900px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heroBadge: {
    padding: '8px 16px',
    borderRadius: '100px',
    fontSize: '0.85rem',
    fontWeight: '600',
    marginBottom: '24px',
    color: 'var(--primary)',
    border: '1px solid var(--primary-glow)',
  },
  heroTitle: {},
  heroSubtitle: {
    fontSize: '1.2rem',
    lineHeight: '1.6',
    color: 'var(--text-secondary)',
    maxWidth: '700px',
    marginBottom: '40px',
  },
  heroActions: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  section: {
    padding: '80px 0',
  },
  sectionAlt: {
    padding: '80px 0',
    backgroundColor: 'var(--bg-secondary)',
  },
  sectionHeader: {
    textAlign: 'center',
    marginBottom: '56px',
  },
  sectionTitle: {
    fontSize: '2.2rem',
    marginBottom: '16px',
  },
  sectionSubtitle: {
    fontSize: '1.1rem',
    color: 'var(--text-secondary)',
  },
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '32px',
  },
  stepCard: {
    padding: '40px 32px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  stepNumber: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '1.2rem',
    marginBottom: '24px',
    color: '#fff',
    boxShadow: '0 4px 10px var(--primary-glow)',
  },
  stepTitle: {
    fontSize: '1.4rem',
    marginBottom: '16px',
  },
  stepText: {
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
  },
  playerGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '700px',
    margin: '0 auto',
  },
  playerCard: {
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  playerMain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  playBtnContainer: {
    marginRight: '16px',
  },
  playBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: 'none',
    color: '#fff',
    fontSize: '1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
    transition: 'all 0.2s',
    outline: 'none',
  },
  playerInfo: {
    flex: 1,
  },
  playerTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    marginBottom: '4px',
  },
  playerSub: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
  },
  playerDuration: {
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  visualizerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '40px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '16px',
  },
  visualizerBar: {
    width: '6px',
    backgroundColor: 'var(--secondary)',
    borderRadius: '3px',
  },
  packagesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '32px',
    alignItems: 'stretch',
    paddingTop: '20px',
  },
  pkgCard: {
    padding: '48px 32px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    height: '100%',
  },
  popularBadge: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    backgroundColor: 'var(--primary)',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: '700',
    padding: '6px 12px',
    borderRadius: '100px',
    boxShadow: '0 4px 10px var(--primary-glow)',
  },
  pkgName: {
    fontSize: '1.6rem',
    marginBottom: '12px',
  },
  pkgPrice: {
    fontSize: '2.5rem',
    fontWeight: '800',
    color: 'var(--text-primary)',
    marginBottom: '16px',
  },
  pkgDesc: {
    fontSize: '0.95rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.5',
    marginBottom: '24px',
  },
  pkgDivider: {
    border: 'none',
    borderTop: '1px solid var(--border-color)',
    margin: '24px 0',
  },
  pkgFeatures: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '36px',
  },
  pkgFeatureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '0.95rem',
    color: 'var(--text-secondary)',
  },
  checkIcon: {
    color: 'var(--secondary)',
    fontWeight: 'bold',
  },
  faqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  faqItem: {
    padding: '8px 24px',
    overflow: 'hidden',
  },
  faqQuestion: {
    width: '100%',
    background: 'none',
    border: 'none',
    color: '#fff',
    padding: '16px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '1.1rem',
    fontWeight: '600',
    textAlign: 'left',
    cursor: 'pointer',
    outline: 'none',
  },
  faqAnswer: {
    padding: '0 0 16px 0',
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    fontSize: '0.95rem',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '16px',
  },
  footer: {
    marginTop: 'auto',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    padding: '48px 0',
  },
  footerContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '24px',
  },
  footerBrand: {
    flex: 1,
    minWidth: '280px',
  },
  footerLogo: {
    fontSize: '1.4rem',
    fontWeight: '800',
    marginBottom: '8px',
  },
  footerTagline: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
  },
  footerRights: {},
};
