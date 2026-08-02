"use client";
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, Gift, Headphones, Star, Clock, ShieldCheck, Music, Flame, Check, ChevronDown, Heart } from 'lucide-react';

export default function Home() {
  const [playingId, setPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioTime, setAudioTime] = useState('0:00');
  const [faqOpen, setFaqOpen] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const audioRef = useRef(null);
  const examplesSectionRef = useRef(null);

  const examples = [
    {
      id: 1,
      title: 'A História de um Autista',
      occasion: 'Homenagem Emocionante',
      style: 'Folk / Sertanejo Acústico',
      cover: '/demo/cover_autista.png',
      src: '/audio/historia-autista.mp3',
    },
    {
      id: 2,
      title: 'Feliz Aniversário Filipe',
      occasion: 'Aniversário Especial',
      style: 'Pop Romântico HD',
      cover: '/demo/cover_aniversario.png',
      src: '/audio/feliz-aniversario.mp3',
    },
    {
      id: 3,
      title: 'Hino Inspirador',
      occasion: 'Homenagem Épica',
      style: 'Gospel / Orquestral',
      cover: '/demo/cover_hino.png',
      src: '/audio/hino.mp3',
    },
  ];

  const testimonials = [
    {
      name: 'Mariana & Lucas',
      relation: 'Presente de Aniversário de Casamento',
      rating: 5,
      comment: 'Minha esposa chorou do início ao fim quando tocou a música no jantar! A letra citava nossa viagem a Gramado e o dia que nos conhecemos. Inesquecível!'
    },
    {
      name: 'Carlos Eduardo',
      relation: 'Homenagem para o Pai (60 Anos)',
      rating: 5,
      comment: 'Fiz a música para os 60 anos do meu pai. Quando ele ouviu a voz cantando o nome dele e da nossa família, todo mundo na festa se emocionou. Vale cada centavo!'
    },
    {
      name: 'Fernanda & Gabriel',
      relation: 'Declaração de Aniversário de Namoro',
      rating: 5,
      comment: 'Surpreendente! Recebi 2 versões incrivelmente bem gravadas em ritmos diferentes. O atendimento e a rapidez na entrega foram nota 10!'
    }
  ];

  // Iniciais em vez de foto de banco de imagens — os depoimentos citam nomes reais de clientes,
  // usar rosto de banco de imagens junto seria enganoso (auditoria de identidade visual, 2026-08-02).
  const getInitials = (name) => name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
    }
    setPlayingId(null);
    setAudioProgress(0);
    setAudioTime('0:00');
  };

  const togglePlay = (id) => {
    if (playingId === id) {
      stopAudio();
    } else {
      stopAudio();
      const track = examples.find(e => e.id === id);
      if (track) {
        const audio = new Audio(track.src);
        audio.ontimeupdate = () => {
          if (audio.duration) {
            const current = audio.currentTime;
            const progress = (current / audio.duration) * 100;
            const mins = Math.floor(current / 60);
            const secs = Math.floor(current % 60).toString().padStart(2, '0');
            setAudioProgress(progress);
            setAudioTime(`${mins}:${secs}`);
          }
        };
        audio.onended = () => {
          stopAudio();
        };
        audio.play().catch(() => {});
        audioRef.current = audio;
        setPlayingId(id);
      }
    }
  };

  useEffect(() => {
    const sectionEl = examplesSectionRef.current;
    if (!sectionEl || typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            stopAudio();
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(sectionEl);

    const handlePageHide = () => stopAudio();
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      observer.disconnect();
      window.removeEventListener('pagehide', handlePageHide);
      stopAudio();
    };
  }, []);

  const toggleFaq = (index) => {
    setFaqOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div style={styles.wrapper}>
      {/* Header / Navbar */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <Image src="/logo.png" alt="NSMusic" width={38} height={38} style={{ height: '38px', width: 'auto' }} priority />
            <span className="gradient-text" style={{ fontSize: '1.3rem', fontWeight: '900', letterSpacing: '-0.5px' }}>
              NSMusic
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="nav-menu">
            <a href="#como-funciona" className="nav-menu-link">Como Funciona</a>
            <a href="#exemplos" className="nav-menu-link">Exemplos</a>
            <a href="#depoimentos" className="nav-menu-link">Depoimentos</a>
            <a href="#oferta" className="nav-menu-link">Oferta</a>
            <a href="#faq" className="nav-menu-link">Dúvidas</a>
          </nav>

          <div style={styles.headerActions}>
            <Link href="/minhas-musicas" className="btn btn-secondary desktop-only" style={{ padding: '8px 14px', fontSize: '0.85rem', minHeight: '38px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Music size={15} aria-hidden="true" /> Minhas Músicas
            </Link>
            <Link href="/criar" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem', minHeight: '38px', whiteSpace: 'nowrap' }}>
              Criar R$ 9,99
            </Link>

            {/* Mobile Hamburger Button */}
            <button 
              type="button" 
              className="mobile-nav-toggle" 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Menu"
            >
              <div className="mobile-nav-bar" style={{ transform: mobileMenuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
              <div className="mobile-nav-bar" style={{ opacity: mobileMenuOpen ? 0 : 1 }} />
              <div className="mobile-nav-bar" style={{ transform: mobileMenuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer">
          <a href="#como-funciona" className="nav-menu-link" style={{ fontSize: '1.25rem' }} onClick={() => setMobileMenuOpen(false)}>Como Funciona</a>
          <a href="#exemplos" className="nav-menu-link" style={{ fontSize: '1.25rem' }} onClick={() => setMobileMenuOpen(false)}>Exemplos</a>
          <a href="#depoimentos" className="nav-menu-link" style={{ fontSize: '1.25rem' }} onClick={() => setMobileMenuOpen(false)}>Depoimentos</a>
          <a href="#oferta" className="nav-menu-link" style={{ fontSize: '1.25rem' }} onClick={() => setMobileMenuOpen(false)}>Oferta</a>
          <a href="#faq" className="nav-menu-link" style={{ fontSize: '1.25rem' }} onClick={() => setMobileMenuOpen(false)}>Dúvidas</a>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '280px', marginTop: '12px' }}>
            <Link href="/criar" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setMobileMenuOpen(false)}>
              Criar 2 Músicas por R$ 9,99
            </Link>
            <Link href="/minhas-musicas" className="btn btn-secondary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => setMobileMenuOpen(false)}>
              <Music size={16} aria-hidden="true" /> Acessar Minhas Músicas
            </Link>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section style={styles.hero}>
        <div style={styles.heroBgGlow} />
        <div className="container" style={styles.heroContainer}>
          <div style={{ ...styles.heroBadge, display: 'inline-flex', alignItems: 'center', gap: '8px' }} className="glass-card">
            <Sparkles size={15} aria-hidden="true" />
            <span>Estúdio de produção musical com IA, feito com carinho</span>
          </div>

          <h1 style={styles.heroTitle}>
            A história de vocês, em uma <span className="gradient-text">canção só sua</span>
          </h1>

          <p style={styles.heroSubtitle}>
            Transforme momentos, nomes e sentimentos em uma música gravada em estúdio profissional. Escolha o estilo musical e receba <strong>2 arranjos exclusivos em MP3 HD</strong> com capa digital para emocionar quem você ama.
          </p>

          <div style={styles.heroActions}>
            <Link href="/criar" className="btn btn-primary" style={{ ...styles.heroPrimaryCta, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Gift size={18} aria-hidden="true" /> Criar 2 músicas por R$ 9,99
            </Link>
            <a href="#exemplos" className="btn btn-secondary" style={{ ...styles.heroSecondaryCta, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Headphones size={18} aria-hidden="true" /> Ouvir amostras
            </a>
          </div>

          <div style={styles.heroTrust}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Heart size={15} aria-hidden="true" /> +2.400 músicas produzidas</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Clock size={15} aria-hidden="true" /> Entrega rápida</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={15} aria-hidden="true" /> Garantia de aprovação</span>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section id="como-funciona" style={styles.section}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Como Funciona?</h2>
            <p style={styles.sectionSubtitle}>Em apenas 3 passos simples você presenteia quem ama com uma canção própria.</p>
          </div>

          <div style={styles.stepsGrid}>
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>1</div>
              <h3 style={styles.stepTitle}>Conte os Detalhes</h3>
              <p style={styles.stepText}>Preencha o nome do presenteado, a ocasião especial e os fatos mais marcantes da sua história.</p>
            </div>
            
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>2</div>
              <h3 style={styles.stepTitle}>Revise a Letra</h3>
              <p style={styles.stepText}>Nosso estúdio escreve versos poéticos e emocionantes. Você aprova e ajusta tudo com alterações ilimitadas.</p>
            </div>

            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>3</div>
              <h3 style={styles.stepTitle}>Receba os Áudios HD</h3>
              <p style={styles.stepText}>Sintetizamos a melodia e vozes de estúdio. Receba 2 Versões completas em MP3 HD com capa digital.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Demo Songs Section */}
      <section id="exemplos" ref={examplesSectionRef} style={styles.sectionAlt}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Músicas demonstrativas</h2>
            <p style={styles.sectionSubtitle}>Ouça a qualidade dos arranjos e a emoção das vozes produzidas pelo nosso estúdio.</p>
          </div>

          <div className="horizontal-scroll-mobile">
            {examples.map((item) => (
              <div 
                key={item.id} 
                className="glass-card" 
                style={{ 
                  padding: '20px', 
                  borderRadius: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '14px', 
                  background: playingId === item.id
                    ? 'linear-gradient(145deg, #F7E9DD 0%, #FBEFDF 100%)'
                    : '#FFFDF9',
                  borderColor: playingId === item.id
                    ? 'var(--primary)'
                    : 'var(--border-color)',
                  boxShadow: playingId === item.id
                    ? '0 12px 35px rgba(181, 80, 46, 0.2)'
                    : 'var(--card-shadow)',
                  position: 'relative' 
                }}
              >
                {/* Album Cover */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.12)' }}>
                  <img 
                    src={item.cover} 
                    alt={item.title} 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover', 
                      transform: playingId === item.id ? 'scale(1.05)' : 'scale(1)', 
                      transition: 'transform 0.4s ease' 
                    }} 
                  />
                  
                  <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    background: playingId === item.id 
                      ? 'rgba(181, 80, 46, 0.25)'
                      : 'rgba(0, 0, 0, 0.2)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <button 
                      type="button"
                      onClick={() => togglePlay(item.id)}
                      style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        border: 'none',
                        background: playingId === item.id ? 'var(--primary)' : '#FFFFFF',
                        color: playingId === item.id ? '#FFFFFF' : 'var(--primary)',
                        fontSize: '1.4rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.2)',
                        transition: 'all 0.25s ease'
                      }}
                    >
                      {playingId === item.id ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}><path d="M8 5v14l11-7z"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Track Details */}
                <div>
                  <span style={{ fontSize: '0.75rem', background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontWeight: '700' }}>
                    {item.style}
                  </span>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginTop: '8px', color: 'var(--text-primary)' }}>{item.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.occasion}</p>
                </div>

                {/* Audio Progress Bar */}
                {playingId === item.id && (
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${audioProgress}%`, background: 'var(--primary)', transition: 'width 0.1s linear' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--success)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
                        Tocando amostra...
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{audioTime}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offer Banner Section */}
      <section id="oferta" style={styles.section}>
        <div className="container" style={{ maxWidth: '850px' }}>
          <div 
            className="glass-card" 
            style={{ 
              padding: '40px 24px', 
              borderRadius: '24px', 
              border: '2px solid var(--primary)', 
              background: 'linear-gradient(135deg, #F7E9DD 0%, #FBEFDF 100%)',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(181, 80, 46, 0.12)'
            }}
          >
            <span style={{ background: 'var(--primary)', color: '#FFFDF9', padding: '6px 16px', borderRadius: '20px', fontWeight: '800', fontSize: '0.82rem', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Flame size={14} aria-hidden="true" /> OFERTA POR TEMPO LIMITADO
            </span>
            
            <h2 style={{ fontSize: '2.2rem', fontWeight: '900', marginTop: '16px', color: 'var(--text-primary)' }}>
              Pacote 2 Músicas Completas em Estúdio
            </h2>
            
            <div style={{ margin: '18px 0' }}>
              <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', textDecoration: 'line-through', marginRight: '12px' }}>
                De R$ 69,90
              </span>
              <span style={{ fontSize: '3rem', fontWeight: '900', color: 'var(--success)' }}>
                Por R$ 9,99
              </span>
            </div>

            <ul style={{ ...styles.offerList, listStyle: 'none', padding: 0 }}>
              {[
                <><strong>2 músicas completas em estilos diferentes</strong> (versão 1 + versão 2 bônus)</>,
                'Download ilimitado dos áudios em altíssima qualidade (MP3 HD)',
                'Capa digital personalizada do álbum',
                'Alterações gratuitas ilimitadas na composição',
                'Liberação imediata após confirmação do PIX',
              ].map((text, idx) => (
                <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  <Check size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>

            <Link href="/criar" className="btn btn-primary" style={{ fontSize: '1.15rem', padding: '16px 40px', width: '100%', maxWidth: '420px', marginTop: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Gift size={20} aria-hidden="true" /> Garantir minhas 2 músicas por R$ 9,99
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="depoimentos" style={styles.sectionAlt}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Depoimentos de quem já presenteou</h2>
            <p style={styles.sectionSubtitle}>Veja as reações de quem transformou momentos em canções inesquecíveis.</p>
          </div>

          <div className="horizontal-scroll-mobile">
            {testimonials.map((item, idx) => (
              <div key={idx} className="glass-card" style={{ padding: '24px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1.05rem', flexShrink: 0 }}>
                    {getInitials(item.name)}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: '800' }}>{item.name}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.relation}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2px', color: '#B5502E' }} aria-label={`${item.rating} de 5 estrelas`}>
                  {Array.from({ length: item.rating }).map((_, i) => (
                    <Star key={i} size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  ))}
                </div>

                <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: '1.6', fontStyle: 'italic' }}>
                  &ldquo;{item.comment}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" style={styles.section}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Perguntas Frequentes</h2>
            <p style={styles.sectionSubtitle}>Tudo o que você precisa saber sobre a criação das músicas.</p>
          </div>
          
          <div style={styles.faqList}>
            {[
              {
                q: 'Como é feita a criação da música?',
                a: 'Você insere os detalhes da história e escolhe o estilo. Nossa inteligência artificial cria a letra poética e compõe os arranjos vocais e instrumentais de estúdio com alta definição.',
              },
              {
                q: 'Recebo 2 versões da minha música?',
                a: 'Sim! No pacote promocional de R$ 9,99 você recebe 2 versões completas da sua música em arranjos musicais diferentes.',
              },
              {
                q: 'Como recebo a música pronta?',
                a: 'Assim que o pagamento for concluído, você pode salvar sua conta e acessar o painel "Minhas Músicas" para ouvir e fazer o download ilimitado dos arquivos em MP3 HD. Além disso, enviamos o link no seu WhatsApp.',
              },
              {
                q: 'Qual o tempo de geração?',
                a: 'A letra e os áudios são gerados e liberados em cerca de 2 a 3 minutos diretamente no aplicativo.',
              },
            ].map((item, idx) => (
              <div key={idx} style={styles.faqItem} className="glass-card">
                <button onClick={() => toggleFaq(idx)} style={styles.faqQuestion} aria-expanded={!!faqOpen[idx]}>
                  <span>{item.q}</span>
                  <ChevronDown size={18} aria-hidden="true" style={{ transform: faqOpen[idx] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--primary)', flexShrink: 0 }} />
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
            <Image src="/logo.png" alt="NSMusic" width={36} height={36} style={{ height: '36px', width: 'auto', marginBottom: '8px' }} />
            <p style={styles.footerTagline}>Eternizando momentos marcantes através de acordes e versos únicos.</p>
          </div>
          
          <div className="footer-rights" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="footer-links" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <Link href="/politica-de-privacidade" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Política de Privacidade</Link>
              <Link href="/termos-de-uso" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Termos de Uso</Link>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>© {new Date().getFullYear()} NSMusic. Todos os direitos reservados.</p>
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
    backgroundColor: 'var(--bg-primary)',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    backgroundColor: 'rgba(251, 246, 239, 0.9)',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  hero: {
    position: 'relative',
    padding: '60px 0 50px 0',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroBgGlow: {
    position: 'absolute',
    width: '500px',
    height: '500px',
    background: 'radial-gradient(circle, rgba(181, 80, 46, 0.12) 0%, transparent 70%)',
    top: '-150px',
    left: 'calc(50% - 250px)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  heroContainer: {
    position: 'relative',
    zIndex: 1,
    maxWidth: '850px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heroBadge: {
    padding: '6px 16px',
    borderRadius: '100px',
    fontSize: '0.82rem',
    fontWeight: '700',
    marginBottom: '20px',
    color: 'var(--primary)',
    backgroundColor: 'var(--primary-light)',
    border: '1px solid rgba(181, 80, 46, 0.2)',
  },
  heroTitle: {
    fontSize: '2.5rem',
    lineHeight: '1.2',
    marginBottom: '16px',
  },
  heroSubtitle: {
    fontSize: '1.1rem',
    lineHeight: '1.6',
    color: 'var(--text-secondary)',
    maxWidth: '680px',
    marginBottom: '32px',
  },
  heroActions: {
    display: 'flex',
    gap: '12px',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '450px',
    marginBottom: '28px',
  },
  heroPrimaryCta: {
    fontSize: '1.1rem',
    padding: '16px 28px',
    width: '100%',
  },
  heroSecondaryCta: {
    fontSize: '1.05rem',
    padding: '14px 28px',
    width: '100%',
  },
  heroTrust: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    fontSize: '0.82rem',
    fontWeight: '700',
    color: 'var(--text-muted)',
  },
  section: {
    padding: '60px 0',
  },
  sectionAlt: {
    padding: '60px 0',
    backgroundColor: 'var(--bg-secondary)',
  },
  sectionHeader: {
    textAlign: 'center',
    marginBottom: '36px',
  },
  sectionTitle: {
    fontSize: '2rem',
    marginBottom: '10px',
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: '1rem',
    color: 'var(--text-muted)',
  },
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
  },
  stepCard: {
    padding: '30px 24px',
    display: 'flex',
    flexDirection: 'column',
  },
  stepNumber: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '1.1rem',
    marginBottom: '16px',
    color: '#FFFFFF',
  },
  stepTitle: {
    fontSize: '1.2rem',
    marginBottom: '10px',
    fontWeight: '700',
  },
  stepText: {
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    fontSize: '0.92rem',
  },
  offerList: {
    listStyle: 'none',
    padding: 0,
    margin: '20px auto',
    maxWidth: '520px',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '1rem',
    color: 'var(--text-secondary)',
  },
  faqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  faqItem: {
    padding: '6px 20px',
    overflow: 'hidden',
  },
  faqQuestion: {
    width: '100%',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    padding: '14px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '1rem',
    fontWeight: '700',
    textAlign: 'left',
    cursor: 'pointer',
    outline: 'none',
  },
  faqAnswer: {
    padding: '0 0 16px 0',
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    fontSize: '0.92rem',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '12px',
  },
  footer: {
    marginTop: 'auto',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: '#FFFFFF',
    padding: '36px 0',
  },
  footerContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '20px',
  },
  footerBrand: {
    flex: 1,
    minWidth: '240px',
  },
  footerTagline: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
};
