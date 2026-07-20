'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

function HomenagemContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (order && order.honoreeName) {
      document.title = `Uma Homenagem para ${order.honoreeName} ❤️ | NSMusic`;
    } else {
      document.title = 'Sua Homenagem Especial | NSMusic';
    }
  }, [order]);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) {
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'orders', orderId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setOrder(docSnap.data());
        }
      } catch (err) {
        console.error("Erro ao buscar homenagem:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  const handleDownload = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn("Erro ao baixar áudio:", err);
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div style={styles.wrapper} className="flex-center">
        <div style={styles.spinner} />
        <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Carregando sua homenagem...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={styles.wrapper} className="flex-center">
        <h2 style={{ fontSize: '1.8rem', marginBottom: '16px' }}>Homenagem não encontrada 🔍</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>O link que você acessou pode estar incorreto ou expirado.</p>
        <Link href="/" className="btn btn-primary">Ir para a NSMusic</Link>
      </div>
    );
  }

  const isPaid = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO' || searchParams.get('status') === 'success';

  const primaryAudioUrl = order.audioUrl || (order.audioFiles && order.audioFiles[0]) || '';
  const secondAudioUrl = order.audioFiles && order.audioFiles[1] ? order.audioFiles[1] : '';
  const coverUrl = order.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop';

  return (
    <div style={styles.wrapper}>
      {/* Decorações Românticas Flutuantes */}
      <div style={styles.heartDecoration1}>❤️</div>
      <div style={styles.heartDecoration2}>🎵</div>
      <div style={styles.heartDecoration3}>✨</div>

      <main style={styles.main}>
        <div className="container" style={{ maxWidth: '850px', zIndex: 10 }}>
          
          <div style={styles.homenagemCard} className="glass-card">
            
            {/* Bloco de Capa e Cabeçalho da Homenagem */}
            <div style={styles.headerBlock}>
              <div style={styles.coverContainer}>
                <img src={coverUrl} alt="Capa personalizada" style={styles.coverImg} />
              </div>
              
              <div style={styles.titleInfo}>
                <span style={styles.presentBadge}>🎁 UMA COMPOSIÇÃO EXCLUSIVA</span>
                <h1 style={styles.mainTitle} id="homenagem-title">
                  Uma Homenagem para {order.honoreeName}
                </h1>
                <p style={styles.subtitle}>
                  Uma linda melodia personalizada encomendada com carinho por <strong>{order.customerName}</strong> para celebrar a sua vida e história.
                </p>
              </div>
            </div>

            {/* Reprodutores de Áudio (Se o pagamento estiver confirmado) */}
            {isPaid ? (
              <div style={styles.audioSection}>
                <h3 style={styles.sectionTitle}>Escute sua Homenagem Especial 🎧</h3>
                
                <div style={styles.audioGrid}>
                  {primaryAudioUrl && (
                    <div style={styles.audioRow} className="glass-panel">
                      <div style={styles.audioHeader}>
                        <span style={styles.trackLabel1}>Versão Principal (Arranjo 1)</span>
                      </div>
                      <audio controls src={primaryAudioUrl} style={styles.audioTag} />
                      <button 
                        onClick={() => handleDownload(primaryAudioUrl, `Musica_Homenagem_V1_${order.honoreeName}.mp3`)}
                        style={styles.downloadBtn}
                        id="download-v1"
                      >
                        ⬇ Baixar Música (V1)
                      </button>
                    </div>
                  )}

                  {secondAudioUrl && (
                    <div style={styles.audioRow} className="glass-panel">
                      <div style={styles.audioHeader}>
                        <span style={styles.trackLabel2}>Versão Bônus (Arranjo 2)</span>
                      </div>
                      <audio controls src={secondAudioUrl} style={styles.audioTag} />
                      <button 
                        onClick={() => handleDownload(secondAudioUrl, `Musica_Homenagem_V2_${order.honoreeName}.mp3`)}
                        style={styles.downloadBtn}
                        id="download-v2"
                      >
                        ⬇ Baixar Música (V2)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={styles.blockedBox} className="glass-panel">
                <span style={{ fontSize: '2rem' }}>🔒</span>
                <h3 style={{ marginTop: '10px', fontSize: '1.1rem' }}>Músicas em Produção</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '6px' }}>
                  A homenagem está sendo finalizada e as músicas estarão liberadas para audição imediatamente.
                </p>
              </div>
            )}

            {/* Letra da Música */}
            <div style={styles.lyricsBlock}>
              <h3 style={{ ...styles.sectionTitle, textAlign: 'center' }}>Letra Oficial 📜</h3>
              <pre style={styles.lyricsText}>{order.lyrics || 'Carregando composição...'}</pre>
            </div>

          </div>

          {/* Rodapé da Homenagem */}
          <footer style={styles.footer}>
            <p>Criado com amor via <a href="https://nsnexus.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>NSMusic</a></p>
            <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>Músicas personalizadas com Inteligência Artificial e alma.</p>
          </footer>

        </div>
      </main>
    </div>
  );
}

export default function HomenagemPublica() {
  return (
    <Suspense fallback={
      <div style={styles.wrapper} className="flex-center">
        <div style={styles.spinner} />
        <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Carregando sua homenagem...</p>
      </div>
    }>
      <HomenagemContent />
    </Suspense>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#F8FAFC',
    backgroundImage: 'radial-gradient(circle at 50% 10%, rgba(124, 58, 237, 0.08) 0%, transparent 50%), radial-gradient(circle at 10% 90%, rgba(236, 72, 153, 0.06) 0%, transparent 40%)',
    overflow: 'hidden',
    position: 'relative',
    fontFamily: 'var(--font-family-body)',
    color: 'var(--text-primary)',
  },
  main: {
    flex: 1,
    padding: '40px 16px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  homenagemCard: {
    padding: '36px',
    borderRadius: '24px',
    border: '1.5px solid var(--border-color)',
    background: '#FFFFFF',
    boxShadow: '0 20px 50px rgba(124, 58, 237, 0.12)',
  },
  headerBlock: {
    display: 'flex',
    gap: '28px',
    alignItems: 'center',
    marginBottom: '32px',
    flexWrap: 'wrap',
  },
  coverContainer: {
    width: '220px',
    height: '220px',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
    flexShrink: 0,
    margin: '0 auto',
  },
  coverImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  titleInfo: {
    flex: 1,
    minWidth: '260px',
  },
  presentBadge: {
    display: 'inline-block',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    letterSpacing: '0.08em',
    color: 'var(--secondary)',
    background: 'var(--secondary-light)',
    padding: '4px 12px',
    borderRadius: '100px',
    marginBottom: '12px',
  },
  mainTitle: {
    fontFamily: 'var(--font-family-title)',
    fontSize: '2.2rem',
    lineHeight: '1.2',
    fontWeight: '800',
    color: 'var(--text-primary)',
    backgroundImage: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.98rem',
    lineHeight: '1.6',
    color: 'var(--text-secondary)',
    marginTop: '12px',
  },
  audioSection: {
    marginTop: '32px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '32px',
  },
  sectionTitle: {
    fontFamily: 'var(--font-family-title)',
    fontSize: '1.3rem',
    marginBottom: '20px',
    color: 'var(--primary)',
    fontWeight: '800',
  },
  audioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
  },
  audioRow: {
    padding: '20px',
    borderRadius: '16px',
    background: 'var(--bg-primary)',
    border: '1.5px solid var(--border-color)',
  },
  audioHeader: {
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackLabel1: {
    fontSize: '0.8rem',
    color: 'var(--primary)',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  trackLabel2: {
    fontSize: '0.8rem',
    color: 'var(--secondary)',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  audioTag: {
    width: '100%',
    height: '36px',
  },
  downloadBtn: {
    width: '100%',
    marginTop: '14px',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
    color: '#FFFFFF',
    fontSize: '0.88rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    outline: 'none',
    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
  },
  blockedBox: {
    padding: '30px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
  },
  lyricsBlock: {
    marginTop: '36px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '32px',
  },
  lyricsText: {
    fontFamily: 'var(--font-family-body)',
    fontSize: '1.05rem',
    lineHeight: '1.9',
    textAlign: 'center',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    background: 'var(--bg-primary)',
    padding: '24px',
    borderRadius: '16px',
    maxHeight: '450px',
    overflowY: 'auto',
    border: '1px solid var(--border-color)',
  },
  footer: {
    textAlign: 'center',
    marginTop: '32px',
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
  },
  spinner: {
    width: '44px',
    height: '44px',
    border: '3px solid var(--border-color)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  heartDecoration1: {
    position: 'absolute',
    top: '10%',
    left: '8%',
    fontSize: '2rem',
    opacity: 0.35,
    animation: 'float 6s ease-in-out infinite',
  },
  heartDecoration2: {
    position: 'absolute',
    bottom: '15%',
    right: '8%',
    fontSize: '1.8rem',
    opacity: 0.3,
    animation: 'float 8s ease-in-out infinite 2s',
  },
  heartDecoration3: {
    position: 'absolute',
    top: '40%',
    right: '5%',
    fontSize: '1.5rem',
    opacity: 0.25,
    animation: 'float 7s ease-in-out infinite 1s',
  },
};

