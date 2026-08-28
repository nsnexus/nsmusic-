'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';
import { getFriendlyAuthErrorMessage } from '@/lib/authErrors';

export default function MinhasMusicasPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orders, setOrders] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Busca Rápida por WhatsApp ou E-mail (sem necessidade de senha)
  const [searchTab, setSearchTab] = useState('phone'); // 'phone' | 'email' | 'login'
  const [searchPhone, setSearchPhone] = useState('');
  const [searchEmail, setSearchEmail] = useState('');

  // Login / Register Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
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
          const ordersRef = collection(db, 'orders');
          const qUser = query(ordersRef, where('userId', '==', currentUser.uid));
          const qEmail = query(ordersRef, where('customerEmail', '==', currentUser.email));

          const [snapUser, snapEmail] = await Promise.all([
            getDocs(qUser).catch(() => ({ docs: [] })),
            getDocs(qEmail).catch(() => ({ docs: [] }))
          ]);

          // Exclusão lógica (M-07 no AUDIT_REPORT.md) — pedidos excluídos não aparecem para o cliente.
          const map = new Map();
          snapUser.docs.forEach(doc => { if (!doc.data().deletedAt) map.set(doc.id, { id: doc.id, ...doc.data() }); });
          snapEmail.docs.forEach(doc => { if (!doc.data().deletedAt) map.set(doc.id, { id: doc.id, ...doc.data() }); });

          setOrders(Array.from(map.values()));
          setHasSearched(true);
        } catch (err) {
          console.error("Erro ao carregar músicas do usuário:", err);
        } finally {
          setLoadingOrders(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Reconstrói o telefone no mesmo formato mascarado usado ao salvar o pedido
  // (ver criar/page.jsx:handlePhoneChange), para permitir consulta exata no Firestore.
  const formatPhoneForQuery = (raw) => {
    const clean = (raw || '').replace(/\D/g, '');
    if (clean.length < 10 || clean.length > 11) return null;
    let formatted = `(${clean.slice(0, 2)})`;
    formatted += clean.length === 11 ? ` ${clean.slice(2, 7)}` : ` ${clean.slice(2, 6)}`;
    formatted += clean.length === 11 ? `-${clean.slice(7, 11)}` : `-${clean.slice(6, 10)}`;
    return formatted;
  };

  // Busca rápida por WhatsApp ou E-mail sem exigir senha.
  // Usa `where` no Firestore em vez de baixar a coleção inteira (ver C-08 do audit).
  const handleQuickSearch = async (e) => {
    e.preventDefault();
    setLoadingOrders(true);
    setHasSearched(true);

    try {
      const ordersRef = collection(db, 'orders');

      if (searchTab === 'phone') {
        const formattedPhone = formatPhoneForQuery(searchPhone);
        if (!formattedPhone) {
          setOrders([]);
          setLoadingOrders(false);
          return;
        }

        const q = query(ordersRef, where('customerPhone', '==', formattedPhone));
        const snap = await getDocs(q).catch(() => ({ docs: [] }));
        setOrders(snap.docs.filter(d => !d.data().deletedAt).map(d => ({ id: d.id, ...d.data() })));
      } else {
        const typedEmail = searchEmail.trim();
        const lowerEmail = typedEmail.toLowerCase();
        if (!typedEmail) {
          setOrders([]);
          setLoadingOrders(false);
          return;
        }

        const qExact = query(ordersRef, where('customerEmail', '==', typedEmail));
        const qLower = query(ordersRef, where('customerEmail', '==', lowerEmail));
        const [snapExact, snapLower] = await Promise.all([
          getDocs(qExact).catch(() => ({ docs: [] })),
          getDocs(qLower).catch(() => ({ docs: [] })),
        ]);

        const map = new Map();
        snapExact.docs.forEach(d => { if (!d.data().deletedAt) map.set(d.id, { id: d.id, ...d.data() }); });
        snapLower.docs.forEach(d => { if (!d.data().deletedAt) map.set(d.id, { id: d.id, ...d.data() }); });
        setOrders(Array.from(map.values()));
      }
    } catch (err) {
      console.error("Erro na busca de pedidos:", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setResetSuccess('');

    if (isSignUp && password !== confirmPassword) {
      setAuthError("As senhas não coincidem. Digite a mesma senha nos dois campos.");
      return;
    }

    if (password.length < 6) {
      setAuthError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setAuthSubmitting(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      setAuthError(getFriendlyAuthErrorMessage(err));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email || !email.includes('@')) {
      setAuthError("Digite o seu e-mail no campo acima para receber o link de redefinição de senha.");
      return;
    }
    setAuthError('');
    setResetSuccess('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess(`✅ Enviamos um e-mail de redefinição para ${email}. Verifique sua caixa de entrada e de spam!`);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setAuthError("Nenhuma conta encontrada com este e-mail.");
      } else {
        setAuthError(getFriendlyAuthErrorMessage(err));
      }
    }
  };

  const getAudioUrl = (track) => {
    if (!track) return '';
    let url = typeof track === 'string' ? track : (track.audioUrl || track.sourceAudioUrl || track.sourceStreamAudioUrl || track.audio_url || track.streamAudioUrl || track.stream_url || track.url || track.audioFile || track.cdn_url || '');
    if (!url) return '';
    if (typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('/api/'))) return url;
    // &v= quebra cache de resposta quebrada já salva no navegador — ver src/lib/audioCacheVersion.js.
    return `/api/audio/proxy?url=${encodeURIComponent(url)}&v=${AUDIO_CACHE_VERSION}`;
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
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <Image src="/logo.png" alt="NSMusic" width={38} height={38} style={{ height: '38px', width: 'auto' }} priority />
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)' }}>NSMusic</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link href="/criar" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              ✨ Criar Nova Música
            </Link>

            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span 
                  style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }} 
                  title={user.email}
                >
                  👤 {user.email}
                </span>
                <button 
                  onClick={() => signOut(auth)}
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '6px 10px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '36px 0' }}>
        <div className="container" style={{ maxWidth: '1050px' }}>

          {/* Painel de Busca Rápida por WhatsApp ou E-mail */}
          {!user && (
            <div className="glass-card" style={{ maxWidth: '520px', margin: '20px auto 40px auto', padding: '28px 24px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>🎵</span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginTop: '10px', color: 'var(--text-primary)' }}>
                Encontrar Minhas Músicas
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px', marginBottom: '20px' }}>
                Digite o seu número de WhatsApp para ver suas composições na hora sem precisar de senha!
              </p>

              {/* Abas de Escolha: WhatsApp vs E-mail vs Login */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px' }}>
                <button
                  type="button"
                  onClick={() => { setSearchTab('phone'); setOrders([]); setHasSearched(false); }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: searchTab === 'phone' ? 'var(--primary)' : 'transparent',
                    color: searchTab === 'phone' ? '#fff' : 'var(--text-muted)'
                  }}
                >
                  📱 Por WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => { setSearchTab('email'); setOrders([]); setHasSearched(false); }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: searchTab === 'email' ? 'var(--primary)' : 'transparent',
                    color: searchTab === 'email' ? '#fff' : 'var(--text-muted)'
                  }}
                >
                  📧 Por E-mail
                </button>
                <button
                  type="button"
                  onClick={() => { setSearchTab('login'); setOrders([]); setHasSearched(false); }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    background: searchTab === 'login' ? 'var(--primary)' : 'transparent',
                    color: searchTab === 'login' ? '#fff' : 'var(--text-muted)'
                  }}
                >
                  🔐 Login com Senha
                </button>
              </div>

              {/* Formulário 1: Busca por Telefone / WhatsApp */}
              {searchTab === 'phone' && (
                <form onSubmit={handleQuickSearch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <input
                    type="tel"
                    placeholder="Seu WhatsApp (ex: 94 99106-4040)"
                    required
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    style={styles.input}
                  />
                  <button type="submit" disabled={loadingOrders} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}>
                    {loadingOrders ? '🔍 Buscando...' : '📱 Localizar Minhas Músicas'}
                  </button>
                </form>
              )}

              {/* Formulário 2: Busca por E-mail simples */}
              {searchTab === 'email' && (
                <form onSubmit={handleQuickSearch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <input
                    type="email"
                    placeholder="Seu e-mail do pedido"
                    required
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    style={styles.input}
                  />
                  <button type="submit" disabled={loadingOrders} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}>
                    {loadingOrders ? '🔍 Buscando...' : '📧 Localizar Minhas Músicas'}
                  </button>
                </form>
              )}

              {/* Formulário 3: Login Tradicional com Senha */}
              {searchTab === 'login' && (
                <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <input 
                    type="email" 
                    placeholder="Seu e-mail de acesso" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={styles.input}
                  />
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="Sua senha de acesso" 
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ ...styles.input, paddingRight: '45px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        fontSize: '1.1rem',
                        cursor: 'pointer',
                        color: 'var(--text-muted)'
                      }}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>

                  {authError && <span style={{ color: 'var(--danger)', fontSize: '0.84rem' }}>{authError}</span>}
                  {resetSuccess && <span style={{ color: '#34d399', fontSize: '0.84rem' }}>{resetSuccess}</span>}

                  <button type="submit" disabled={authSubmitting} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}>
                    {authSubmitting ? '⏳ Entrando...' : 'Entrar na Minha Conta'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Resultado das Músicas Encontradas */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Biblioteca • Minhas Músicas 🎧</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '4px' }}>
                  Suas músicas personalizadas produzidas pelo estúdio NSMusic.
                </p>
              </div>

              <Link href="/criar" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '0.9rem' }}>
                ✨ Criar Nova Música
              </Link>
            </div>

            {loadingOrders ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={styles.spinner} />
                <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Buscando faixas no acervo...</p>
              </div>
            ) : orders.length === 0 ? (
              hasSearched && (
                <div className="glass-card" style={{ padding: '48px 20px', textAlign: 'center', maxWidth: '580px', margin: '40px auto' }}>
                  <span style={{ fontSize: '3rem' }}>🎼</span>
                  <h3 style={{ fontSize: '1.3rem', marginTop: '14px', fontWeight: '800' }}>Nenhuma música encontrada</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px', marginBottom: '24px' }}>
                    Verifique se o número do WhatsApp ou e-mail digitado é exatamente o mesmo utilizado no pedido.
                  </p>
                  <Link href="/criar" className="btn btn-primary" style={{ padding: '12px 24px' }}>
                    Criar Minha Música por R$ 9,99
                  </Link>
                </div>
              )
            ) : (
              /* Grid de Músicas do Cliente */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {orders.map((ord) => {
                  const primaryAudio = ord.audioUrl || (ord.audioFiles && ord.audioFiles[0]) || '';
                  const secondaryAudio = ord.audioFiles && ord.audioFiles[1] ? ord.audioFiles[1] : '';
                  const coverImg = ord.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop';
                  const isOrderPaid = ord.paymentStatus === 'PAGO' || ord.paymentStatus === 'PAGAMENTO_APROVADO';

                  return (
                    <div key={ord.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      {/* Capa e Dados da Homenagem */}
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                        <img src={coverImg} alt="Capa" style={{ width: '72px', height: '72px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.72rem', background: isOrderPaid ? 'var(--success-bg)' : 'var(--warning-bg)', color: isOrderPaid ? 'var(--success)' : 'var(--warning)', padding: '3px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                            {isOrderPaid ? 'PRODUÇÃO CONCLUÍDA ✓' : 'AGUARDANDO PAGAMENTO'}
                          </span>
                          <h3 style={{ fontSize: '1.05rem', fontWeight: '800', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                            Para {ord.honoreeName || 'Alguém Especial'}
                          </h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Estilo: {ord.musicStyle || 'Romântica'} • {ord.recipientType}
                          </p>
                        </div>
                      </div>

                      {/* Players e Downloads */}
                      {isOrderPaid && primaryAudio ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-secondary)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                          <div>
                            <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                              🎧 Versão 1 - Arranjo Principal
                            </span>
                            <audio controls src={getAudioUrl(primaryAudio)} style={{ width: '100%', height: '36px' }} />
                            <button 
                              onClick={() => handleDownload(getAudioUrl(primaryAudio), `Musica_V1_${ord.honoreeName || 'Homenagem'}.mp3`)} 
                              className="btn btn-secondary" 
                              style={{ display: 'block', width: '100%', marginTop: '8px', padding: '6px 12px', fontSize: '0.78rem', textAlign: 'center', cursor: 'pointer', borderRadius: '6px' }}
                            >
                              ⬇ Baixar MP3 (Versão 1)
                            </button>
                          </div>

                          {secondaryAudio && (
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--secondary)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                🎧 Versão 2 - Arranjo Bônus
                              </span>
                              <audio controls src={getAudioUrl(secondaryAudio)} style={{ width: '100%', height: '36px' }} />
                              <button 
                                onClick={() => handleDownload(getAudioUrl(secondaryAudio), `Musica_V2_${ord.honoreeName || 'Homenagem'}.mp3`)} 
                                className="btn btn-secondary" 
                                style={{ display: 'block', width: '100%', marginTop: '8px', padding: '6px 12px', fontSize: '0.78rem', textAlign: 'center', cursor: 'pointer', borderRadius: '6px' }}
                              >
                                ⬇ Baixar MP3 (Versão 2)
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          🔒 Finalize o pagamento do pedido para destravar os downloads em alta definição.
                        </div>
                      )}

                      {/* Ações Rápidas */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button 
                          onClick={() => setSelectedLyrics({ title: ord.honoreeName, text: ord.lyrics })}
                          className="btn btn-secondary"
                          style={{ flex: 1, padding: '8px', fontSize: '0.8rem', minHeight: '36px' }}
                        >
                          📜 Ver Letra
                        </button>
                        <a 
                          href={`/entrega?orderId=${ord.id}`} 
                          className="btn btn-primary"
                          style={{ flex: 1, padding: '8px', fontSize: '0.8rem', textAlign: 'center', textDecoration: 'none', minHeight: '36px' }}
                        >
                          🎁 Página do Presente
                        </a>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Visualizador de Letra */}
          {selectedLyrics && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '20px' }}>
              <div className="glass-card" style={{ maxWidth: '580px', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)' }}>Letra da Música de {selectedLyrics.title}</h3>
                  <button onClick={() => setSelectedLyrics(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
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
    backgroundColor: 'var(--bg-primary)',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    borderRadius: 0,
    borderWidth: '0 0 1px 0',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: '10px',
  },
  input: {
    width: '100%',
    padding: '14px 18px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    outline: 'none',
  },
  spinner: {
    width: '44px',
    height: '44px',
    border: '3px solid var(--border-color)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto'
  }
};
