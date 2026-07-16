'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';

function EntregaContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [rating, setRating] = useState(0);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewText, setReviewText] = useState('');

  // Estados de Cadastro de Conta
  const [accountPassword, setAccountPassword] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (usr) => {
      setCurrentUser(usr);
      if (usr && orderId) {
        // Vincula a ordem ao ID do usuário conectado no Firebase
        await updateDoc(doc(db, 'orders', orderId), {
          userId: usr.uid,
          updatedAt: new Date().toISOString()
        }).catch(e => console.warn(e));
      }
    });
    return () => unsubscribe();
  }, [orderId]);

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
        console.error("Erro ao buscar pedido para entrega:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!order || !order.customerEmail) return;
    if (accountPassword.length < 6) {
      setAccountError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setIsCreatingAccount(true);
    setAccountError('');
    try {
      const userCred = await createUserWithEmailAndPassword(auth, order.customerEmail, accountPassword);
      const user = userCred.user;
      
      // Vincula a ordem ao ID do novo usuário no Firestore
      if (orderId) {
        await updateDoc(doc(db, 'orders', orderId), {
          userId: user.uid,
          updatedAt: new Date().toISOString()
        }).catch(e => console.warn(e));
      }
      setAccountCreated(true);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setAccountError("Este e-mail já possui uma conta. Faça login no topo para acessar!");
      } else {
        setAccountError(err.message || "Erro ao criar conta. Tente novamente.");
      }
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleReviewSubmit = (e) => {
    e.preventDefault();
    if (rating === 0) return;
    setReviewSubmitted(true);
  };

  if (loading) {
    return (
      <div style={styles.wrapper} className="flex-center">
        <div style={styles.spinner} />
        <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Carregando sua página de entrega...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={styles.wrapper} className="flex-center">
        <h2 style={{ fontSize: '1.8rem', marginBottom: '16px' }}>Pedido não encontrado 🔍</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Verifique o link ou entre em contato com o suporte.</p>
        <Link href="/" className="btn btn-primary">Voltar ao início</Link>
      </div>
    );
  }

  // Permite liberação se o pagamento consta como aprovado ou se veio o parâmetro de sucesso do checkout
  const isPaid = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO' || searchParams.get('status') === 'success' || searchParams.get('status') === 'approved';

  // Get active audio track URLs
  const primaryAudioUrl = order.audioUrl || (order.audioFiles && order.audioFiles[0]) || '';
  const secondAudioUrl = order.audioFiles && order.audioFiles[1] ? order.audioFiles[1] : '';

  // Get QR Code
  const deliveryPageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(deliveryPageUrl)}`;

  // Default beautiful dynamic cover
  const coverUrl = order.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop';

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="NSMusic" style={{ height: '40px', width: 'auto' }} />
          </Link>
          <span 
            style={{
              ...styles.statusBadge,
              color: isPaid ? 'var(--success)' : 'var(--warning)',
              borderColor: isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              backgroundColor: isPaid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)'
            }}
          >
            {isPaid ? '✨ Entrega Liberada' : '⏳ Aguardando Pagamento'}
          </span>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container" style={{ maxWidth: '1000px' }}>
          
          <div style={styles.deliveryCard} className="glass-card">
            <div className="responsive-grid-2">
              
              {/* Media Player & Downloads */}
              <div style={styles.mediaSide}>
                <div style={styles.coverWrapper}>
                  <img src={coverUrl} alt="Capa da música" style={styles.coverImg} />
                  <div style={styles.coverOverlay}>
                    <h2 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.4rem' }}>
                      Melodia para {order.honoreeName}
                    </h2>
                    <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Uma homenagem de {order.customerName}</p>
                  </div>
                </div>

                {isPaid ? (
                  <>
                    {/* Audio Player 1 */}
                    {primaryAudioUrl && (
                      <div style={styles.audioPlayerContainer} className="glass-card">
                        <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', fontWeight: '700', color: 'var(--primary)' }}>
                          🎧 Versão Principal (Versão 1)
                        </h4>
                        <audio controls style={styles.audioTag} src={primaryAudioUrl}>
                          Seu navegador não suporta.
                        </audio>
                        <div style={{ ...styles.downloadGrid, marginTop: '16px' }}>
                          <a href={primaryAudioUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={styles.downloadBtn}>
                            ⬇ Baixar MP3 (V1)
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Audio Player 2 (Incluso sempre que gerado no pedido) */}
                    {secondAudioUrl && (
                      <div style={styles.audioPlayerContainer} className="glass-card">
                        <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', fontWeight: '700', color: 'var(--secondary)' }}>
                          🎧 Versão Alternativa (Versão 2 Bônus)
                        </h4>
                        <audio controls style={styles.audioTag} src={secondAudioUrl}>
                          Seu navegador não suporta.
                        </audio>
                        <div style={{ ...styles.downloadGrid, marginTop: '16px' }}>
                          <a href={secondAudioUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={styles.downloadBtn}>
                            ⬇ Baixar MP3 (V2 Bônus)
                          </a>
                        </div>
                      </div>
                    )}

                    {/* QR Code section */}
                    <div style={styles.qrCard} className="glass-card">
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '1rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)' }}>Compartilhar Homenagem</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          Quem receber escaneia o QR Code com o celular e ouve as músicas diretamente nessa página personalizada!
                        </p>
                        <a href={qrCodeUrl} download={`qrcode-${order.orderNumber}.png`} className="btn btn-secondary" style={{ marginTop: '16px', padding: '8px 16px', fontSize: '0.8rem' }}>
                          Salvar Imagem QR Code
                        </a>
                      </div>
                      <img src={qrCodeUrl} alt="QR Code" style={styles.qrImg} />
                    </div>
                  </>
                ) : (
                  <div style={styles.blockedCard} className="glass-card">
                    <span style={{ fontSize: '2.5rem' }}>🔒</span>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '12px' }}>Downloads Bloqueados</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '8px', lineHeight: '1.5' }}>
                      O pagamento para este pedido ainda não foi confirmado pelo Mercado Pago. As músicas completas e downloads serão liberados de forma automática imediatamente após a aprovação!
                    </p>
                  </div>
                )}
              </div>

              {/* Lyrics Side */}
              <div style={styles.lyricsSide} className="glass-card">
                <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', fontFamily: 'var(--font-family-title)', color: 'var(--primary)' }}>
                  Letra Oficial 📜
                </h3>
                <pre style={styles.lyricsText}>{order.lyrics || 'Letra ainda não gerada para esta composição.'}</pre>
              </div>

            </div>
          </div>

          {/* Gerenciamento de Conta: Oculta o formulário de senha se o usuário já estiver logado no Firebase */}
          {isPaid && (
            currentUser ? (
              <div className="glass-card" style={{ padding: '24px 28px', marginBottom: '32px', border: '1px solid rgba(52, 211, 153, 0.3)', background: 'rgba(52, 211, 153, 0.05)', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <span style={{ background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    ✅ CONTA CONECTADA
                  </span>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginTop: '6px' }}>Músicas vinculadas à sua conta ({currentUser.email})</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Este pedido foi salvo automaticamente no seu perfil e está disponível na sua biblioteca.
                  </p>
                </div>
                <Link href="/minhas-musicas" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '0.88rem' }}>
                  🎵 Ver Minhas Músicas
                </Link>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: '28px', marginBottom: '32px', border: '1px solid rgba(124, 58, 237, 0.3)', background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <span style={{ background: 'rgba(124, 58, 237, 0.2)', color: 'var(--secondary)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      🔐 SUA CONTA NSMUSIC
                    </span>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '8px' }}>Crie sua senha para salvar suas músicas</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Crie uma senha para acessar <strong>{order.customerEmail}</strong> e veja todas as suas músicas no painel <strong>Minhas Músicas</strong> sempre que quiser!
                    </p>
                  </div>

                  {accountCreated ? (
                    <div style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '16px 20px', borderRadius: '12px', color: '#34d399', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'block' }}>✅ Conta Criada e Músicas Salvas!</span>
                      <Link href="/minhas-musicas" className="btn btn-primary" style={{ marginTop: '10px', display: 'inline-block', padding: '8px 18px', fontSize: '0.88rem' }}>
                        🎵 Acessar Minhas Músicas
                      </Link>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateAccount} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input 
                        type="password" 
                        placeholder="Crie uma senha segura (mín 6 dígitos)"
                        required
                        minLength={6}
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem', width: '240px' }}
                      />
                      <button 
                        type="submit" 
                        disabled={isCreatingAccount}
                        className="btn btn-primary"
                        style={{ padding: '12px 20px', fontSize: '0.9rem' }}
                      >
                        {isCreatingAccount ? '⏳ Salvando...' : '💾 Salvar Conta & Músicas'}
                      </button>
                      {accountError && (
                        <span style={{ color: '#fca5a5', fontSize: '0.8rem', width: '100%', display: 'block' }}>{accountError}</span>
                      )}
                    </form>
                  )}
                </div>
              </div>
            )
          )}

          {/* Feedback Form */}
          {isPaid && (
            <div style={styles.feedbackCard} className="glass-card">
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', fontFamily: 'var(--font-family-title)' }}>O que achou do resultado?</h3>
              
              {reviewSubmitted ? (
                <div style={styles.reviewSuccess}>
                  <span style={{ fontSize: '2rem' }}>💖</span>
                  <h4 style={{ marginTop: '12px' }}>Obrigado pela sua avaliação!</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
                    Seu depoimento nos ajuda a fazer as composições ficarem cada vez melhores.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleReviewSubmit} style={styles.reviewForm}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                    Sua opinião é fundamental para a nossa equipe e para novos clientes!
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
                    placeholder="Escreva como foi a reação de quem ouviu ou o que você achou das versões..."
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
          )}

        </div>
      </main>
    </div>
  );
}

export default function EntregaPedido() {
  return (
    <Suspense fallback={
      <div style={styles.wrapper} className="flex-center">
        <div style={styles.spinner} />
        <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Carregando sua página de entrega...</p>
      </div>
    }>
      <EntregaContent />
    </Suspense>
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
  statusBadge: {
    fontSize: '0.85rem',
    fontWeight: '600',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid',
  },
  deliveryCard: {
    padding: '32px',
    marginBottom: '32px',
  },
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
    display: 'flex',
    gap: '12px',
  },
  downloadBtn: {
    flex: 1,
    padding: '12px',
    textAlign: 'center',
    fontSize: '0.9rem',
    textDecoration: 'none'
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
  blockedCard: {
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(245, 158, 11, 0.1)',
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
  spinner: {
    width: '50px',
    height: '50px',
    border: '3px solid rgba(255,255,255,0.06)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};
