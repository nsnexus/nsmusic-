"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, Gift, Headphones, Star, Clock, ShieldCheck, Music, Flame, Check, ChevronDown, Heart } from 'lucide-react';
import { faqJsonLd, howToJsonLd } from '@/lib/structuredData';
import { ocasioes } from '@/lib/ocasioes';

const formatarNumero = (n) => Number(n || 0).toLocaleString('pt-BR');

export default function Home() {
  const [playingId, setPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioTime, setAudioTime] = useState('0:00');
  const [faqOpen, setFaqOpen] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const audioRef = useRef(null);
  const examplesSectionRef = useRef(null);

  const [stats, setStats] = useState({ generations: 2423, sales: 962 });

  useEffect(() => {
    let ativo = true;
    fetch('/api/stats/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ativo && d && (d.generations > 0 || d.sales > 0)) {
          setStats({ generations: d.generations || 0, sales: d.sales || 0 });
        }
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

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
    <div className="nx-experience" style={styles.wrapper}>
      {/* Schema.org SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([faqJsonLd(), howToJsonLd()]) }}
      />

      {/* Header / Navbar Padrão Editorial */}
      <header className="nx-header">
        <div className="nx-header-inner">
          <Link href="/" className="nx-brand">
            <Image src="/logo.png" alt="NS Music" width={40} height={40} priority />
            <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#29232d', letterSpacing: '-0.02em' }}>
              NS Music
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="nav-menu" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <a href="#como-funciona" className="nav-menu-link" style={{ fontSize: '0.88rem', color: '#6c636f', fontWeight: '600', textDecoration: 'none' }}>Como Funciona</a>
            <a href="#exemplos" className="nav-menu-link" style={{ fontSize: '0.88rem', color: '#6c636f', fontWeight: '600', textDecoration: 'none' }}>Exemplos</a>
            <a href="#depoimentos" className="nav-menu-link" style={{ fontSize: '0.88rem', color: '#6c636f', fontWeight: '600', textDecoration: 'none' }}>Depoimentos</a>
            <a href="#oferta" className="nav-menu-link" style={{ fontSize: '0.88rem', color: '#6c636f', fontWeight: '600', textDecoration: 'none' }}>Oferta</a>
            <a href="#faq" className="nav-menu-link" style={{ fontSize: '0.88rem', color: '#6c636f', fontWeight: '600', textDecoration: 'none' }}>Dúvidas</a>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/conta" className="nx-account-link" style={{ fontSize: '0.88rem', fontWeight: '650' }}>
              Minha conta
            </Link>
            <Link
              href="/criar"
              className="nx-button nx-primary"
              style={{
                padding: '9px 18px',
                fontSize: '0.88rem',
                minHeight: '40px',
                fontWeight: '700',
                borderRadius: '10px',
                textDecoration: 'none'
              }}
            >
              Criar por R$ 9,99
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
        <div className="mobile-menu-drawer" style={{ background: '#ffffff', borderBottom: '1px solid #e7e0e8', padding: '20px' }}>
          <a href="#como-funciona" className="nav-menu-link" style={{ fontSize: '1.1rem', color: '#29232d', padding: '8px 0', textDecoration: 'none', display: 'block' }} onClick={() => setMobileMenuOpen(false)}>Como Funciona</a>
          <a href="#exemplos" className="nav-menu-link" style={{ fontSize: '1.1rem', color: '#29232d', padding: '8px 0', textDecoration: 'none', display: 'block' }} onClick={() => setMobileMenuOpen(false)}>Exemplos</a>
          <a href="#depoimentos" className="nav-menu-link" style={{ fontSize: '1.1rem', color: '#29232d', padding: '8px 0', textDecoration: 'none', display: 'block' }} onClick={() => setMobileMenuOpen(false)}>Depoimentos</a>
          <a href="#oferta" className="nav-menu-link" style={{ fontSize: '1.1rem', color: '#29232d', padding: '8px 0', textDecoration: 'none', display: 'block' }} onClick={() => setMobileMenuOpen(false)}>Oferta</a>
          <a href="#faq" className="nav-menu-link" style={{ fontSize: '1.1rem', color: '#29232d', padding: '8px 0', textDecoration: 'none', display: 'block' }} onClick={() => setMobileMenuOpen(false)}>Dúvidas</a>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <Link href="/criar" className="nx-button nx-primary" style={{ textAlign: 'center', textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
              Criar 2 Músicas por R$ 9,99
            </Link>
            <Link href="/conta" className="nx-button" style={{ textAlign: 'center', textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
              Minha Conta & Músicas
            </Link>
          </div>
        </div>
      )}

      {/* Hero Section Editorial */}
      <section style={styles.heroSection}>
        <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center', padding: '0 20px' }}>
          <div style={styles.heroBadge}>
            <Sparkles size={14} color="#67408b" aria-hidden="true" />
            <span>Músicas Personalizadas de Alta Fidelidade</span>
          </div>

          <h1 style={styles.heroTitle}>
            A história de quem você ama, transformada em uma canção inesquecível.
          </h1>

          <p style={styles.heroSubtitle}>
            Você conta os momentos marcantes e sentimentos. Em poucos minutos, entregamos duas versões completas em áudio profissional com letra e melodia emocionantes.
          </p>

          <div style={styles.heroActions}>
            <Link
              href="/criar"
              className="nx-button nx-primary"
              style={{
                fontSize: '1.05rem',
                padding: '16px 32px',
                borderRadius: '12px',
                fontWeight: '700',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(103, 64, 139, 0.25)'
              }}
            >
              <Gift size={18} aria-hidden="true" /> Criar Minha Música por R$ 9,99 ➔
            </Link>
            <a
              href="#exemplos"
              className="nx-button"
              style={{
                fontSize: '1rem',
                padding: '16px 26px',
                borderRadius: '12px',
                fontWeight: '600',
                textDecoration: 'none'
              }}
            >
              <Headphones size={18} aria-hidden="true" /> Ouvir Amostras
            </a>
          </div>

          {/* Prova Social com números reais */}
          <div style={styles.heroTrust}>
            <div style={styles.trustItem}>
              <Heart size={18} color="#67408b" aria-hidden="true" />
              <div>
                <strong>+{formatarNumero(stats.generations * 2)}</strong>
                <small>músicas produzidas</small>
              </div>
            </div>
            <div style={styles.trustItem}>
              <Star size={18} color="#f59e0b" fill="#f59e0b" aria-hidden="true" />
              <div>
                <strong>+{formatarNumero(stats.sales)}</strong>
                <small>presentes entregues</small>
              </div>
            </div>
            <div style={styles.trustItem}>
              <Clock size={18} color="#059669" aria-hidden="true" />
              <div>
                <strong>2 a 3 minutos</strong>
                <small>entrega no WhatsApp</small>
              </div>
            </div>
            <div style={styles.trustItem}>
              <ShieldCheck size={18} color="#2563eb" aria-hidden="true" />
              <div>
                <strong>Prévia grátis</strong>
                <small>ouça antes de pagar</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seção Como Funciona */}
      <section id="como-funciona" style={styles.section}>
        <div style={styles.container}>
          <div style={styles.sectionHeader}>
            <span className="nx-eyebrow">Simples e Rápido</span>
            <h2 style={styles.sectionTitle}>Como Funciona?</h2>
            <p style={styles.sectionSubtitle}>
              Em apenas 3 passos simples você presenteia quem ama com uma canção própria, ouvindo a prévia antes de pagar.
            </p>
          </div>

          <div style={styles.stepsGrid}>
            <div style={styles.stepCard}>
              <div style={styles.stepNumber}>1</div>
              <h3 style={styles.stepTitle}>Conte os Detalhes</h3>
              <p style={styles.stepText}>Preencha o nome do presenteado, a ocasião especial e os fatos e lembranças mais marcantes da sua história.</p>
            </div>

            <div style={styles.stepCard}>
              <div style={styles.stepNumber}>2</div>
              <h3 style={styles.stepTitle}>Revise a Letra</h3>
              <p style={styles.stepText}>Nosso estúdio escreve versos poéticos e emocionantes. Você aprova e ajusta tudo com alterações ilimitadas.</p>
            </div>

            <div style={styles.stepCard}>
              <div style={styles.stepNumber}>3</div>
              <h3 style={styles.stepTitle}>Ouça a Prévia e Libere</h3>
              <p style={styles.stepText}>Sintetizamos a melodia e vozes de estúdio. Você ouve as 2 versões antes de pagar. O Pix de R$ 9,99 libera os arquivos em MP3 HD com capa digital.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Seção Exemplos com Player Interativo */}
      <section id="exemplos" ref={examplesSectionRef} style={styles.sectionAlt}>
        <div style={styles.container}>
          <div style={styles.sectionHeader}>
            <span className="nx-eyebrow">Qualidade de Estúdio</span>
            <h2 style={styles.sectionTitle}>Músicas Demonstrativas</h2>
            <p style={styles.sectionSubtitle}>Ouça a riqueza dos arranjos e a emoção das vozes produzidas pelo nosso estúdio.</p>
          </div>

          <div style={styles.examplesGrid}>
            {examples.map((item) => (
              <div
                key={item.id}
                style={{
                  ...styles.exampleCard,
                  borderColor: playingId === item.id ? '#67408b' : '#e7e0e8',
                  boxShadow: playingId === item.id ? '0 10px 30px rgba(103, 64, 139, 0.12)' : '0 2px 8px rgba(0,0,0,0.03)'
                }}
              >
                {/* Capa com Botão Play Central */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '14px', overflow: 'hidden' }}>
                  <img
                    src={item.cover}
                    alt={item.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: playingId === item.id ? 'scale(1.04)' : 'scale(1)',
                      transition: 'transform 0.4s ease'
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: playingId === item.id ? 'rgba(103, 64, 139, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => togglePlay(item.id)}
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        border: 'none',
                        background: playingId === item.id ? '#67408b' : '#ffffff',
                        color: playingId === item.id ? '#ffffff' : '#67408b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                        transition: 'transform 0.2s'
                      }}
                      title={playingId === item.id ? 'Pausar' : 'Ouvir amostra'}
                    >
                      {playingId === item.id ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Detalhes da faixa */}
                <div>
                  <span style={{ fontSize: '0.75rem', background: '#f2eaf8', color: '#67408b', padding: '4px 10px', borderRadius: '20px', fontWeight: '700' }}>
                    {item.style}
                  </span>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', marginTop: '8px', color: '#29232d' }}>{item.title}</h3>
                  <p style={{ fontSize: '0.84rem', color: '#6c636f', marginTop: '2px' }}>{item.occasion}</p>
                </div>

                {/* Barra de Progresso do Áudio */}
                {playingId === item.id && (
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ width: '100%', height: '6px', background: '#e7e0e8', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${audioProgress}%`, background: '#67408b', transition: 'width 0.1s linear' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span style={{ color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669' }} />
                        Tocando amostra...
                      </span>
                      <span style={{ color: '#6c636f', fontFamily: 'monospace' }}>{audioTime}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Banner de Oferta */}
      <section id="oferta" style={styles.section}>
        <div style={{ maxWidth: '580px', margin: '0 auto', padding: '0 20px' }}>
          <div
            style={{
              padding: '32px 28px',
              borderRadius: '24px',
              border: '2px solid #67408b',
              background: '#ffffff',
              textAlign: 'center',
              boxShadow: '0 12px 30px rgba(103, 64, 139, 0.08)'
            }}
          >
            <span style={{ background: '#f2eaf8', color: '#67408b', padding: '5px 14px', borderRadius: '20px', fontWeight: '800', fontSize: '0.75rem', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Flame size={14} color="#67408b" aria-hidden="true" /> PACOTE COMPLETO DE ESTÚDIO
            </span>

            <h2 style={{ fontSize: '1.45rem', fontWeight: '800', marginTop: '14px', color: '#29232d', lineHeight: 1.25 }}>
              2 Músicas Completas em Estúdio
            </h2>

            <div style={{ margin: '14px 0 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.05rem', color: '#6c636f', textDecoration: 'line-through' }}>
                R$ 69,90
              </span>
              <span style={{ fontSize: '2.4rem', fontWeight: '900', color: '#059669', lineHeight: 1 }}>
                R$ 9,99
              </span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                <><strong>2 músicas completas</strong>, em estilos diferentes</>,
                <>Prévia das duas <strong>antes de pagar</strong></>,
                'Download ilimitado em MP3 HD',
                'Capa digital personalizada com a foto',
                'Alterações ilimitadas na letra',
                'Liberação imediata pelo PIX',
              ].map((text, idx) => (
                <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.9rem', color: '#475569', lineHeight: 1.4 }}>
                  <Check size={16} color="#059669" style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/criar"
              className="nx-button nx-primary"
              style={{
                fontSize: '1.02rem',
                padding: '15px 24px',
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
                borderRadius: '12px',
                fontWeight: '700'
              }}
            >
              <Gift size={18} aria-hidden="true" /> Criar Minha Música por R$ 9,99
            </Link>
          </div>
        </div>
      </section>

      {/* Seção Depoimentos */}
      <section id="depoimentos" style={styles.sectionAlt}>
        <div style={styles.container}>
          <div style={styles.sectionHeader}>
            <span className="nx-eyebrow">Histórias Reais</span>
            <h2 style={styles.sectionTitle}>Depoimentos de quem já presenteou</h2>
            <p style={styles.sectionSubtitle}>Veja as reações de quem transformou momentos em canções inesquecíveis.</p>
          </div>

          <div style={styles.testimonialsGrid}>
            {testimonials.map((item, idx) => (
              <div key={idx} style={styles.testimonialCard}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#f2eaf8', color: '#67408b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.95rem', flexShrink: 0 }}>
                    {getInitials(item.name)}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#29232d', margin: 0 }}>{item.name}</h4>
                    <span style={{ fontSize: '0.78rem', color: '#6c636f' }}>{item.relation}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2px', color: '#f59e0b' }} aria-label={`${item.rating} de 5 estrelas`}>
                  {Array.from({ length: item.rating }).map((_, i) => (
                    <Star key={i} size={15} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  ))}
                </div>

                <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: '1.6', fontStyle: 'italic', margin: 0 }}>
                  &ldquo;{item.comment}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seção Dúvidas / FAQ */}
      <section id="faq" style={styles.section}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
          <div style={styles.sectionHeader}>
            <span className="nx-eyebrow">Dúvidas Frequentes</span>
            <h2 style={styles.sectionTitle}>Perguntas e Respostas</h2>
            <p style={styles.sectionSubtitle}>Tudo o que você precisa saber sobre a criação e entrega da sua música.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              {
                q: 'Como é feita a criação da música?',
                a: 'Você insere os detalhes da história e escolhe o estilo musical. Nossa tecnologia cria a letra poética e sintetiza os arranjos vocais e instrumentais de estúdio com máxima fidelidade.',
              },
              {
                q: 'Recebo 2 versões da minha música?',
                a: 'Sim! No pacote de R$ 9,99 você recebe 2 versões completas da sua canção em arranjos musicais diferentes para escolher ou guardar as duas.',
              },
              {
                q: 'Como recebo a música pronta?',
                a: 'Assim que o pagamento for confirmado, você acessa seu painel na mesma hora para ouvir e baixar em MP3 HD, e também enviamos o link direto no seu WhatsApp.',
              },
              {
                q: 'Qual o tempo de geração?',
                a: 'A letra e os áudios são gerados e liberados em cerca de 2 a 3 minutos diretamente no aplicativo.',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e7e0e8',
                  borderRadius: '14px',
                  padding: '16px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    color: '#29232d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.98rem',
                    fontWeight: '700',
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  aria-expanded={!!faqOpen[idx]}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    style={{
                      transform: faqOpen[idx] ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                      color: '#67408b',
                      flexShrink: 0
                    }}
                  />
                </button>
                {faqOpen[idx] && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', color: '#475569', fontSize: '0.9rem', lineHeight: '1.6' }}>
                    <p style={{ margin: 0 }}>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ocasiões Especiais */}
      <section style={{ maxWidth: '1060px', margin: '0 auto', padding: '30px 20px 50px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: '800', marginBottom: '16px', textAlign: 'center', color: '#29232d' }}>
          Música personalizada por ocasião
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {ocasioes.map((o) => (
            <Link
              key={o.slug}
              href={`/${o.slug}`}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                fontSize: '0.86rem',
                fontWeight: '650',
                background: '#ffffff',
                border: '1px solid #e7e0e8',
                color: '#475569',
                textDecoration: 'none',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              {o.titulo.replace(' Personalizada com IA', '').replace(' com IA', '')}
            </Link>
          ))}
        </div>
      </section>

      {/* Footer Padrão Editorial */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid #e7e0e8', padding: '40px 0' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <Image src="/logo.png" alt="NS Music" width={32} height={32} />
              <span style={{ fontWeight: '800', color: '#29232d', fontSize: '1rem' }}>NS Music</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#6c636f', margin: 0 }}>Eternizando momentos marcantes através de versos e melodias exclusivas.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'right' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <Link href="/politica-de-privacidade" style={{ fontSize: '0.82rem', color: '#6c636f', textDecoration: 'none' }}>Política de Privacidade</Link>
              <Link href="/termos-de-uso" style={{ fontSize: '0.82rem', color: '#6c636f', textDecoration: 'none' }}>Termos de Uso</Link>
              <Link href="/conta" style={{ fontSize: '0.82rem', color: '#67408b', fontWeight: '600', textDecoration: 'none' }}>Minha Conta</Link>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>© {new Date().getFullYear()} NS Music. Todos os direitos reservados.</p>
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
    backgroundColor: '#faf8f5',
  },
  heroSection: {
    padding: '70px 0 60px 0',
    background: 'linear-gradient(180deg, #f7f1f9 0%, #faf8f5 100%)',
    borderBottom: '1px solid #e7e0e8',
  },
  heroBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 16px',
    borderRadius: '100px',
    fontSize: '0.82rem',
    fontWeight: '700',
    marginBottom: '20px',
    color: '#67408b',
    backgroundColor: '#f2eaf8',
    border: '1px solid #e5d6ee',
  },
  heroTitle: {
    fontFamily: 'Georgia, serif',
    fontSize: 'clamp(2.1rem, 4vw, 3.2rem)',
    lineHeight: '1.14',
    letterSpacing: '-0.025em',
    marginBottom: '18px',
    color: '#29232d',
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: '1.08rem',
    lineHeight: '1.65',
    color: '#6c636f',
    maxWidth: '660px',
    margin: '0 auto 32px auto',
  },
  heroActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: '36px',
  },
  heroTrust: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginTop: '20px',
    paddingTop: '24px',
    borderTop: '1px solid #e7e0e8',
  },
  trustItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    textAlign: 'left',
    fontSize: '0.88rem',
    color: '#475569',
  },
  container: {
    maxWidth: '1160px',
    margin: '0 auto',
    padding: '0 24px',
  },
  section: {
    padding: '70px 0',
  },
  sectionAlt: {
    padding: '70px 0',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e7e0e8',
    borderBottom: '1px solid #e7e0e8',
  },
  sectionHeader: {
    textAlign: 'center',
    maxWidth: '680px',
    margin: '0 auto 40px auto',
  },
  sectionTitle: {
    fontFamily: 'Georgia, serif',
    fontSize: '2rem',
    letterSpacing: '-0.02em',
    color: '#29232d',
    margin: '8px 0 10px 0',
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: '0.98rem',
    color: '#6c636f',
    lineHeight: '1.55',
    margin: 0,
  },
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
  },
  stepCard: {
    background: '#ffffff',
    border: '1px solid #e7e0e8',
    borderRadius: '20px',
    padding: '30px 24px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  },
  stepNumber: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    background: '#f2eaf8',
    color: '#67408b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '1.15rem',
    marginBottom: '16px',
  },
  stepTitle: {
    fontSize: '1.15rem',
    fontWeight: '800',
    color: '#29232d',
    marginBottom: '10px',
  },
  stepText: {
    color: '#6c636f',
    lineHeight: '1.6',
    fontSize: '0.9rem',
    margin: 0,
  },
  examplesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px',
  },
  exampleCard: {
    padding: '20px',
    borderRadius: '20px',
    background: '#ffffff',
    border: '1.5px solid #e7e0e8',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    transition: 'all 0.2s ease',
  },
  testimonialsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  testimonialCard: {
    background: '#faf8f5',
    border: '1px solid #e7e0e8',
    borderRadius: '20px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
};
