'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function EntregaPedido() {
  const [rating, setRating] = useState(0);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewText, setReviewText] = useState('');

  const orderData = {
    orderNumber: 'NS-98273-2026',
    customerName: 'João da Silva',
    honoreeName: 'Ana Maria',
    musicTitle: 'A Jornada de Nós Dois (Versão Principal)',
    lyrics: `[Verso 1]
No calor desse abraço eu encontrei meu lugar
Com a Ana Maria, aprendi o que é amar
Desde o início, nossa história foi escrita com emoção
E hoje trago esse canto direto do coração.

[Pré-Refrão]
Cada sorriso seu ilumina meu caminho
Nunca mais me senti sozinho

[Refrão]
O tempo passa, mas a lembrança fica
Essa história que a vida nos ensina e simplifica
Para sempre com você,
Nossa trilha não tem fim, e nada nos afasta.

[Verso 2]
Lembro bem de cada detalhe, de cada risada no quintal
Dos momentos em que tudo parecia especial
Com as qualidades de carinho e afeto
Construímos nossa estrada, um destino reto.

[Ponte]
Nossa música ecoa no silêncio da noite
Um abraço forte que nos protege do vento

[Refrão Final]
O tempo passa, mas a lembrança fica
Essa história que a vida nos ensina e simplifica
Para sempre com você,
Nossa trilha não tem fim, e nada nos afasta.`,
    musicStyle: '🎸 Folk Acústico',
    voiceType: 'Voz Feminina',
    deliveredAt: '14/07/2026',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Safe demo audio
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop', // Beautiful placeholder cover
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://nsmusic.vercel.app/entrega?id=NS-98273-2026',
  };

  const handleReviewSubmit = (e) => {
    e.preventDefault();
    if (rating === 0) return;
    setReviewSubmitted(true);
  };

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/" style={styles.logo}>
            <span style={styles.logoIcon}>🎵</span>
            <span style={styles.logoText}>NS<span className="gradient-text">Nexus</span></span>
          </Link>
          <span style={styles.statusBadge}>✨ Música Entregue</span>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container" style={{ maxWidth: '1000px' }}>
          
          <div style={styles.deliveryCard} className="glass-card">
            <div className="responsive-grid-2">
              {/* Cover and Player */}
              <div style={styles.mediaSide}>
                <div style={styles.coverWrapper}>
                  <img src={orderData.coverUrl} alt="Capa da música" style={styles.coverImg} />
                  <div style={styles.coverOverlay}>
                    <h2 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.4rem' }}>{orderData.musicTitle}</h2>
                    <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Homenagem para {orderData.honoreeName}</p>
                  </div>
                </div>

                <div style={styles.audioPlayerContainer} className="glass-card">
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', fontWeight: '600' }}>Ouvir sua música</h4>
                  <audio controls style={styles.audioTag} src={orderData.audioUrl}>
                    Seu navegador não suporta a tag de áudio.
                  </audio>
                </div>

                <div style={styles.downloadGrid}>
                  <a href={orderData.audioUrl} download className="btn btn-primary" style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                    ⬇ Baixar MP3
                  </a>
                  <a href={orderData.audioUrl} download className="btn btn-secondary" style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                    💿 Baixar WAV (HD)
                  </a>
                </div>

                {/* QR Code section */}
                <div style={styles.qrCard} className="glass-card">
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)' }}>QR Code Exclusivo</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      Imprima ou envie este QR Code para que a pessoa homenageada possa escanear e ouvir a música diretamente pelo celular!
                    </p>
                    <a href={orderData.qrCodeUrl} download className="btn btn-secondary" style={{ marginTop: '16px', padding: '8px 16px', fontSize: '0.8rem' }}>
                      Baixar Imagem QR Code
                    </a>
                  </div>
                  <img src={orderData.qrCodeUrl} alt="QR Code da música" style={styles.qrImg} />
                </div>
              </div>

              {/* Lyrics Side */}
              <div style={styles.lyricsSide} className="glass-card">
                <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', fontFamily: 'var(--font-family-title)', color: 'var(--primary)' }}>Letra Oficial</h3>
                <pre style={styles.lyricsText}>{orderData.lyrics}</pre>
              </div>
            </div>
          </div>

          {/* Feedback Form */}
          <div style={styles.feedbackCard} className="glass-card">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', fontFamily: 'var(--font-family-title)' }}>O que achou do resultado?</h3>
            
            {reviewSubmitted ? (
              <div style={styles.reviewSuccess}>
                <span style={{ fontSize: '2rem' }}>💖</span>
                <h4 style={{ marginTop: '12px' }}>Obrigado pela sua avaliação!</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Seu feedback é fundamental para continuarmos melhorando nossas produções musicais.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReviewSubmit} style={styles.reviewForm}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Sua opinião nos ajuda a afinar nossa equipe e melhorar a experiência de novos clientes.
                </p>

                <div style={styles.starsContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      style={{
                        ...styles.starBtn,
                        color: rating >= star ? 'var(--warning)' : 'var(--text-muted)'
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <textarea 
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Escreva um breve depoimento sobre a sua experiência ou a reação de quem ouviu..."
                  style={styles.reviewTextarea}
                />

                <button 
                  type="submit"
                  disabled={rating === 0}
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-start', padding: '12px 24px', fontSize: '0.9rem' }}
                >
                  Enviar Avaliação
                </button>
              </form>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0a0a0c',
  },
  header: {
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
    color: '#fff',
  },
  statusBadge: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: 'var(--success)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  deliveryCard: {
    padding: '32px',
    marginBottom: '32px',
  },
  deliveryLayout: {},
  mediaSide: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  coverWrapper: {
    position: 'relative',
    borderRadius: 'var(--border-radius-md)',
    overflow: 'hidden',
    aspectRatio: '1',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
  },
  coverImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  audioPlayerContainer: {
    padding: '20px',
  },
  audioTag: {
    width: '100%',
    height: '40px',
    outline: 'none',
  },
  downloadGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  qrCard: {
    padding: '20px',
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
  },
  qrImg: {
    width: '110px',
    height: '110px',
    borderRadius: 'var(--border-radius-sm)',
    border: '4px solid #fff',
  },
  lyricsSide: {
    padding: '32px',
    maxHeight: '620px',
    overflowY: 'auto',
  },
  lyricsText: {
    fontFamily: 'var(--font-family-body)',
    fontSize: '1rem',
    lineHeight: '1.8',
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap',
  },
  feedbackCard: {
    padding: '32px',
  },
  reviewForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  starsContainer: {
    display: 'flex',
    gap: '8px',
  },
  starBtn: {
    background: 'none',
    border: 'none',
    fontSize: '2rem',
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
    transition: 'color 0.1s',
  },
  reviewTextarea: {
    width: '100%',
    height: '100px',
    padding: '14px 18px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.95rem',
    outline: 'none',
    resize: 'vertical',
  },
  reviewSuccess: {
    textAlign: 'center',
    padding: '20px 0',
  },
};
