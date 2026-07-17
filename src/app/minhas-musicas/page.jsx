'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function MinhasMusicasPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orders, setOrders] = useState([]);
  
  // Login / Register Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Modal para visualização da letra
  const [selectedLyrics, setSelectedLyrics] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);

      if (currentUser) {
        setLoadingOrders(true);
        try {
          // Busca pedidos por userId ou pelo e-mail do cliente
          const ordersRef = collection(db, 'orders');
          const qUser = query(ordersRef, where('userId', '==', currentUser.uid));
          const qEmail = query(ordersRef, where('customerEmail', '==', currentUser.email));

          const [snapUser, snapEmail] = await Promise.all([
            getDocs(qUser).catch(() => ({ docs: [] })),
            getDocs(qEmail).catch(() => ({ docs: [] }))
          ]);

          const map = new Map();
          snapUser.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
          snapEmail.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));

          setOrders(Array.from(map.values()));
        } catch (err) {
          console.error("Erro ao carregar músicas do usuário:", err);
        } finally {
          setLoadingOrders(false);
        }
      } else {
        setOrders([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setAuthError("E-mail ou senha incorretos.");
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError("Este e-mail já está cadastrado. Alterne para Entrar.");
      } else {
        setAuthError(err.message || "Erro de autenticação.");
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const getAudioUrl = (track) => {
    if (!track) return '';
    if (typeof track === 'string') return track;
    return track.audio_url || track.audioUrl || track.stream_url || track.url || track.audioFile || track.cdn_url || '';
  };

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
      console.warn("Erro ao baixar áudio via blob, abrindo em nova aba:", err);
      window.open(url, '_blank');
    }
  };

  if (loadingAuth) {
    return (
      <div style={styles.wrapper} className="flex-center">
        <div style={styles.spinner} />
        <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Carregando suas músicas salvas...</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <img src="/logo.png" alt="NSMusic" style={{ height: '40px', width: 'auto' }} />
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#fff' }}>NSMusic</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>👤 {user.email}</span>
                <button 
                  onClick={() => signOut(auth)}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '6px 12px', cursor: 'pointer' }}
                >
                  Sair
                </button>
              </div>
            ) : (
              <Link href="/login" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                Entrar / Cadastrar
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container" style={{ maxWidth: '1050px' }}>

          {!user ? (
            /* Login / Criar Conta se não estiver autenticado */
            <div className="glass-card" style={{ maxWidth: '460px', margin: '40px auto', padding: '36px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>🎵</span>
              <h2 style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '12px' }}>
                {isSignUp ? 'Criar sua Conta NSMusic' : 'Acessar Suas Músicas'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px', marginBottom: '24px' }}>
                {isSignUp 
                  ? 'Digite seu e-mail e crie uma senha para ver todas as suas composições.' 
                  : 'Entre com seu e-mail para ouvir e baixar suas músicas enviadas pelo estúdio.'}
              </p>

              <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input 
                  type="email" 
                  placeholder="Seu e-mail cadastrado no pedido" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                />
                <input 
                  type="password" 
                  placeholder="Sua senha de acesso" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                />

                {authError && (
                  <span style={{ color: '#fca5a5', fontSize: '0.82rem' }}>{authError}</span>
                )}

                <button 
                  type="submit" 
                  disabled={authSubmitting}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: '6px' }}
                >
                  {authSubmitting ? '⏳ Entrando...' : isSignUp ? 'Criar Conta' : 'Entrar na Minha Conta'}
                </button>
              </form>

              <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.88rem', cursor: 'pointer' }}
                >
                  {isSignUp ? 'Já tem conta? Faça Login aqui' : 'Primeira vez? Crie sua senha aqui'}
                </button>
              </div>
            </div>
          ) : (
            /* Biblioteca do Cliente Logado */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }}>Biblioteca • Minhas Músicas 🎧</h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '4px' }}>
                    Todas as suas músicas personalizadas produzidas pelo estúdio NSMusic.
                  </p>
                </div>

                <Link href="/criar" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '0.9rem' }}>
                  ✨ Criar Nova Música
                </Link>
              </div>

              {loadingOrders ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={styles.spinner} />
                  <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Buscando suas faixas no acervo...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="glass-card" style={{ padding: '50px 20px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
                  <span style={{ fontSize: '3rem' }}>🎼</span>
                  <h3 style={{ fontSize: '1.4rem', marginTop: '14px' }}>Nenhuma música encontrada neste e-mail</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px', marginBottom: '24px' }}>
                    Caso você tenha acabado de comprar, certifique-se de que usou o e-mail <strong>{user.email}</strong>.
                  </p>
                  <Link href="/criar" className="btn btn-primary" style={{ padding: '12px 24px' }}>
                    Criar Minha Primeira Música por R$ 19,90
                  </Link>
                </div>
              ) : (
                /* Grid de Músicas do Cliente */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                  {orders.map((ord) => {
                    const primaryAudio = ord.audioUrl || (ord.audioFiles && ord.audioFiles[0]) || '';
                    const secondaryAudio = ord.audioFiles && ord.audioFiles[1] ? ord.audioFiles[1] : '';
                    const coverImg = ord.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop';
                    const isOrderPaid = ord.paymentStatus === 'PAGO' || ord.paymentStatus === 'PAGAMENTO_APROVADO';

                    return (
                      <div key={ord.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        
                        {/* Capa e Dados da Homenagem */}
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <img src={coverImg} alt="Capa" style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover' }} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <span style={{ fontSize: '0.72rem', background: isOrderPaid ? 'rgba(52, 211, 153, 0.2)' : 'rgba(251, 191, 36, 0.2)', color: isOrderPaid ? '#34d399' : '#fbbf24', padding: '3px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                              {isOrderPaid ? 'PRODUÇÃO CONCLUÍDA ✓' : 'AGUARDANDO PAGAMENTO'}
                            </span>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              Para {ord.honoreeName || 'Alguém Especial'}
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Estilo: {ord.musicStyle || 'Romântica'} • {ord.recipientType}
                            </p>
                          </div>
                        </div>

                        {/* Players e Downloads */}
                        {isOrderPaid && primaryAudio ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.25)', padding: '14px', borderRadius: '12px' }}>
                            <div>
                              <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                🎧 Versão 1 - Arranjo Principal
                              </span>
                              <audio controls src={getAudioUrl(primaryAudio)} style={{ width: '100%', height: '36px' }} />
                              <button 
                                onClick={() => handleDownload(getAudioUrl(primaryAudio), `Musica_V1_${ord.honoreeName || 'Homenagem'}.mp3`)} 
                                className="btn btn-secondary" 
                                style={{ display: 'block', width: '100%', marginTop: '8px', padding: '6px 12px', fontSize: '0.78rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', cursor: 'pointer', borderRadius: '6px' }}
                              >
                                ⬇ Baixar MP3 (Versão 1)
                              </button>
                            </div>

                            {secondaryAudio && (
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                                <span style={{ fontSize: '0.78rem', color: '#ec4899', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                  🎧 Versão 2 - Arranjo Bônus
                                </span>
                                <audio controls src={getAudioUrl(secondaryAudio)} style={{ width: '100%', height: '36px' }} />
                                <button 
                                  onClick={() => handleDownload(getAudioUrl(secondaryAudio), `Musica_V2_${ord.honoreeName || 'Homenagem'}.mp3`)} 
                                  className="btn btn-secondary" 
                                  style={{ display: 'block', width: '100%', marginTop: '8px', padding: '6px 12px', fontSize: '0.78rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', cursor: 'pointer', borderRadius: '6px' }}
                                >
                                  ⬇ Baixar MP3 (Versão 2)
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            🔒 Finalize o pagamento do pedido para destravar os downloads em alta definição.
                          </div>
                        )}

                        {/* Ações Rápidas */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button 
                            onClick={() => setSelectedLyrics({ title: ord.honoreeName, text: ord.lyrics })}
                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                          >
                            📜 Ver Letra
                          </button>
                          <Link 
                            href={`/entrega?orderId=${ord.id}`} 
                            style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'var(--primary)', color: '#fff', fontSize: '0.8rem', textAlign: 'center', textDecoration: 'none', fontWeight: 'bold' }}
                          >
                            🎁 Página do Presente
                          </Link>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Modal Visualizador de Letra */}
          {selectedLyrics && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '20px' }}>
              <div className="glass-card" style={{ maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: '800' }}>Letra da Música de {selectedLyrics.title}</h3>
                  <button onClick={() => setSelectedLyrics(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-family-body)', color: 'var(--text-secondary)', lineHeight: '1.8', fontSize: '0.95rem' }}>
                  {selectedLyrics.text || 'Letra oficial não disponível.'}
                </pre>
              </div>
            </div>
          )}

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
  input: {
    width: '100%',
    padding: '14px 18px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontSize: '0.95rem',
    outline: 'none',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '3px solid rgba(255,255,255,0.06)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto'
  }
};
