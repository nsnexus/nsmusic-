"use client";
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
  const [playingId, setPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioTime, setAudioTime] = useState('0:00');
  const [faqOpen, setFaqOpen] = useState({});
  
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
      photo: 'https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?q=80&w=300&auto=format&fit=crop',
      relation: 'Presente de Aniversário de Casamento',
      rating: 5,
      comment: 'Minha esposa chorou do início ao fim quando tocou a música no jantar! A letra citava nossa viagem a Gramado e o dia que nos conhecemos. Inesquecível!'
    },
    {
      name: 'Carlos Eduardo',
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=300&auto=format&fit=crop',
      relation: 'Homenagem para o Pai (60 Anos)',
      rating: 5,
      comment: 'Fiz a música para os 60 anos do meu pai. Quando ele ouviu a voz cantando o nome dele e da nossa família, todo mundo na festa se emocionou. Vale cada centavo!'
    },
    {
      name: 'Fernanda & Gabriel',
      photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=300&auto=format&fit=crop',
      relation: 'Declaração de Aniversário de Namoro',
      rating: 5,
      comment: 'Surpreendente! Recebi 2 versões incrivelmente bem gravadas em ritmos diferentes. O atendimento e a rapidez na entrega foram nota 10!'
    }
  ];

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

  // Parar áudio automaticamente quando o usuário rolar para fora da seção de exemplos ou mudar de página
  useEffect(() => {
    const sectionEl = examplesSectionRef.current;
    if (!sectionEl || typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Se a seção de exemplos não estiver mais visível na tela, para o áudio imediatamente
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
            <img src="/logo.png" alt="NSMusic" style={{ height: '42px', width: 'auto' }} />
            <span style={{ fontSize: '1.25rem', fontWeight: '900', background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              NSMusic
            </span>
          </Link>
          <nav className="nav-menu">
            <a href="#como-funciona" className="nav-menu-link">Como Funciona</a>
            <a href="#exemplos" className="nav-menu-link">Exemplos</a>
            <a href="#depoimentos" className="nav-menu-link">Depoimentos</a>
            <a href="#oferta" className="nav-menu-link">Oferta</a>
            <a href="#faq" className="nav-menu-link">Dúvidas</a>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/minhas-musicas" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              🎵 Minhas Músicas
            </Link>
            <Link href="/criar" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '0.9rem' }}>
              Criar Música R$ 19,90
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={styles.hero}>
        <div style={styles.heroBgGlow} />
        <div className="container" style={styles.heroContainer}>
          <div style={styles.heroBadge} className="glass-card">
            <span>✨ Estúdio de Produção Musical com IA de Alta Definição</span>
          </div>
          <h1 className="hero-title">
            <span className="gradient-text">NSMusic</span> — Sua História contada em uma Canção Inesquecível
          </h1>
          <p style={styles.heroSubtitle}>
            Transforme suas memórias e sentimentos em uma música gravada em estúdio profissional. Escolha o estilo musical, conte os momentos mais marcantes e receba <strong>2 Arranjos Exclusivos em MP3 HD</strong> para emocionar quem você ama.
          </p>
          <div style={styles.heroActions}>
            <Link href="/criar" className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '16px 36px' }}>
              Criar 2 Músicas por R$ 19,90 🚀
            </Link>
            <a href="#exemplos" className="btn btn-secondary" style={{ fontSize: '1.1rem', padding: '16px 36px' }}>
              🎧 Ouvir Amostras
            </a>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section id="como-funciona" style={styles.section}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Como Funciona?</h2>
            <p style={styles.sectionSubtitle}>Em apenas 3 passos simples você presenteia quem ama com uma música própria.</p>
          </div>
          <div style={styles.stepsGrid}>
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>1</div>
              <h3 style={styles.stepTitle}>Conte os detalhes</h3>
              <p style={styles.stepText}>Preencha o nome do presenteado, a ocasião e os fatos marcantes da sua história.</p>
            </div>
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>2</div>
              <h3 style={styles.stepTitle}>Revise a letra</h3>
              <p style={styles.stepText}>Nosso estúdio escreve versos poéticos e emocionantes. Você aprova e ajusta tudo antes da gravação.</p>
            </div>
            <div style={styles.stepCard} className="glass-card">
              <div style={styles.stepNumber}>3</div>
              <h3 style={styles.stepTitle}>Receba os áudios HD</h3>
              <p style={styles.stepText}>Sintetizamos os instrumentos e vocais. Você recebe 2 Versões completas em MP3 HD com capa digital.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Demo Songs Section */}
      <section id="exemplos" ref={examplesSectionRef} style={styles.sectionAlt}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Músicas Demonstrativas 🎧</h2>
            <p style={styles.sectionSubtitle}>Ouça a qualidade dos arranjos e a emoção das vozes produzidas pelo nosso estúdio.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px', maxWidth: '1000px', margin: '0 auto' }}>
            {examples.map((item) => (
              <div 
                key={item.id} 
                className="glass-card" 
                style={{ 
                  padding: '22px', 
                  borderRadius: '24px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '16px', 
                  background: playingId === item.id 
                    ? 'linear-gradient(145deg, rgba(124, 58, 237, 0.22) 0%, rgba(236, 72, 153, 0.15) 100%)' 
                    : 'rgba(255, 255, 255, 0.03)',
                  border: playingId === item.id 
                    ? '1px solid rgba(168, 85, 247, 0.5)' 
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: playingId === item.id 
                    ? '0 12px 35px rgba(124, 58, 237, 0.3)' 
                    : '0 8px 25px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative' 
                }}
              >
                
                {/* Capa de Álbum em HD com Selo de Estilo e Overlay Neon */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.6)' }}>
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
                      ? 'linear-gradient(to top, rgba(10, 10, 15, 0.85) 0%, rgba(124, 58, 237, 0.25) 50%, transparent 100%)' 
                      : 'linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, transparent 60%)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    {/* Botão de Play / Pause Neon Flutuante */}
                    <button 
                      type="button"
                      onClick={() => togglePlay(item.id)}
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        border: 'none',
                        background: playingId === item.id ? 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)' : 'rgba(255, 255, 255, 0.95)',
                        color: playingId === item.id ? '#fff' : '#000',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: playingId === item.id ? '0 0 25px rgba(236, 72, 153, 0.8)' : '0 8px 20px rgba(0, 0, 0, 0.4)',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        backdropFilter: 'blur(8px)'
                      }}
                    >
                      {playingId === item.id ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}><path d="M8 5v14l11-7z"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Informações da Faixa */}
                <div>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.15)', color: '#c4b5fd', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '4px 12px', borderRadius: '20px', fontWeight: '700' }}>
                    {item.style}
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginTop: '10px', color: '#fff' }}>{item.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.occasion}</p>
                </div>

                {/* Barra de Progresso e Player Ativo */}
                {playingId === item.id && (
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${audioProgress}%`, background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)', transition: 'width 0.1s linear' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span style={{ color: '#34d399', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
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

      {/* Offer Banner Section (Substitui tabela antiga) */}
      <section id="oferta" style={styles.section}>
        <div className="container" style={{ maxWidth: '850px' }}>
          <div 
            className="glass-card" 
            style={{ 
              padding: '40px 32px', 
              borderRadius: '24px', 
              border: '2px solid var(--primary)', 
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(124, 58, 237, 0.2)'
            }}
          >
            <span style={{ background: '#fbbf24', color: '#000', padding: '6px 16px', borderRadius: '20px', fontWeight: '900', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
              🔥 OFERTA PROMOCIONAL POR TEMPO LIMITADO
            </span>
            
            <h2 style={{ fontSize: '2.4rem', fontWeight: '900', marginTop: '16px', color: '#fff' }}>
              Pacote 2 Músicas Completas em Estúdio
            </h2>
            
            <div style={{ margin: '20px 0' }}>
              <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', textDecoration: 'line-through', marginRight: '12px' }}>
                De R$ 69,90
              </span>
              <span style={{ fontSize: '3.2rem', fontWeight: '900', color: '#34d399' }}>
                Por R$ 19,90
              </span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '24px auto', maxWidth: '500px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
              <li>✅ <strong>2 Músicas Completas em Estilos Diferentes</strong> (Versão 1 + Versão 2 Bônus)</li>
              <li>✅ Download ilimitado dos áudios em altíssima qualidade (MP3 HD)</li>
              <li>✅ Capa Digital Personalizada do Álbum</li>
              <li>✅ Liberação imediata após confirmação do PIX/Cartão</li>
            </ul>

            <Link href="/criar" className="btn btn-primary" style={{ fontSize: '1.2rem', padding: '18px 48px', marginTop: '10px' }}>
              Garantir Minhas 2 Músicas por R$ 19,90 🎁
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials Section (Nova Seção de Depoimentos) */}
      <section id="depoimentos" style={styles.sectionAlt}>
        <div className="container">
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Depoimentos de Quem Já Presenteou 💖</h2>
            <p style={styles.sectionSubtitle}>Veja as reações de quem transformou momentos em canções inesquecíveis.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '28px', maxWidth: '1100px', margin: '0 auto' }}>
            {testimonials.map((item, idx) => (
              <div key={idx} className="glass-card" style={{ padding: '28px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                  <img src={item.photo} alt={item.name} style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} />
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: '800' }}>{item.name}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.relation}</span>
                  </div>
                </div>

                <div style={{ color: '#fbbf24', fontSize: '1.2rem' }}>
                  {'★'.repeat(item.rating)}
                </div>

                <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: '1.6', fontStyle: 'italic' }}>
                  "{item.comment}"
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
                a: 'Você insere os detalhes da história e escolhe o estilo. Nossa inteligência artificial cria a letra e compõe os arranjos vocais e instrumentais de estúdio com alta definição.',
              },
              {
                q: 'Recebo 2 versões da minha música?',
                a: 'Sim! No pacote promocional de R$ 19,90 você recebe 2 versões completas da sua música em arranjos musicais diferentes.',
              },
              {
                q: 'Como recebo a música pronta?',
                a: 'Assim que o pagamento for concluído, você pode salvar a conta e acessar o painel "Minhas Músicas" para ouvir e fazer o download ilimitado dos arquivos em MP3 HD.',
              },
              {
                q: 'Qual o tempo de geração?',
                a: 'A letra e os áudios são gerados e liberados em poucos minutos diretamente no aplicativo.',
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
  hero: {
    position: 'relative',
    padding: '100px 0 80px 0',
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
  heroSubtitle: {
    fontSize: '1.2rem',
    lineHeight: '1.6',
    color: 'var(--text-secondary)',
    maxWidth: '720px',
    marginBottom: '36px',
  },
  heroActions: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  section: {
    padding: '70px 0',
  },
  sectionAlt: {
    padding: '70px 0',
    backgroundColor: 'var(--bg-secondary)',
  },
  sectionHeader: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  sectionTitle: {
    fontSize: '2.2rem',
    marginBottom: '14px',
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: '1.05rem',
    color: 'var(--text-secondary)',
  },
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '28px',
  },
  stepCard: {
    padding: '36px 28px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  stepNumber: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '1.2rem',
    marginBottom: '20px',
    color: '#fff',
  },
  stepTitle: {
    fontSize: '1.3rem',
    marginBottom: '12px',
    fontWeight: '700',
  },
  stepText: {
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    fontSize: '0.92rem',
  },
  faqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
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
    fontSize: '1.05rem',
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
    paddingTop: '14px',
  },
  footer: {
    marginTop: 'auto',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    padding: '40px 0',
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
  footerTagline: {
    fontSize: '0.88rem',
    color: 'var(--text-secondary)',
  },
};
