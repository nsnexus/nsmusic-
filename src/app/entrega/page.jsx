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
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [copied, setCopied] = useState(false);

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
          const data = docSnap.data();
          setOrder(data);
          if (data && data.customerEmail) {
            setAccountEmail(data.customerEmail);
          }
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
      const userCred = await createUserWithEmailAndPassword(auth, accountEmail, accountPassword);
      const user = userCred.user;
      
      // Vincula a ordem ao ID do novo usuário no Firestore e atualiza e-mail
      if (orderId) {
        await updateDoc(doc(db, 'orders', orderId), {
          userId: user.uid,
          customerEmail: accountEmail,
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
      console.warn("Erro ao fazer download via fetch, abrindo nova aba:", err);
      window.open(url, '_blank');
    }
  };

  const handleCopyLink = () => {
    const sharePageUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/homenagem?orderId=${orderId}` 
      : '';
    navigator.clipboard.writeText(sharePageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
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

  // Estados do Checkout PIX para pedidos pendentes
  const [pixInfo, setPixInfo] = useState({ qrCode: '', qrCodeBase64: '', paymentId: '' });
  const [pixLoading, setPixLoading] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [isPaidState, setIsPaidState] = useState(false);

  // Permite liberação se o pagamento consta como aprovado ou se veio o parâmetro de sucesso do checkout
  const isPaid = isPaidState || order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO' || searchParams.get('status') === 'success' || searchParams.get('status') === 'approved';

  // Gera o PIX automaticamente se o pedido não estiver pago
  useEffect(() => {
    if (order && !isPaid && !pixInfo.qrCode && !pixLoading) {
      handleGeneratePix();
    }
  }, [order, isPaid]);

  // Polling em tempo real para confirmação de pagamento PIX
  useEffect(() => {
    if (!orderId || isPaid) return;

    const interval = setInterval(async () => {
      try {
        const paymentIdQuery = pixInfo.paymentId ? `&paymentId=${pixInfo.paymentId}` : '';
        const res = await fetch(`/api/payments/status?orderId=${orderId}${paymentIdQuery}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved' || data.status === 'PAGO' || data.status === 'PAGAMENTO_APROVADO') {
            setIsPaidState(true);
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn("Erro ao checar status do PIX na entrega:", e);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, isPaid, pixInfo.paymentId]);

  const handleGeneratePix = async () => {
    if (!order) return;
    setPixLoading(true);
    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: {
            customerName: order.customerName || 'Cliente',
            customerPhone: order.customerPhone || '',
            customerEmail: order.customerEmail || '',
            honoreeName: order.honoreeName || ''
          },
          totalAmount: 19.90,
          paymentType: 'pix',
          orderId
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPixInfo({
          qrCode: data.qrCode || '',
          qrCodeBase64: data.qrCodeBase64 || '',
          paymentId: data.paymentId || ''
        });
      }
    } catch (err) {
      console.error("Erro gerando PIX na entrega:", err);
    } finally {
      setPixLoading(false);
    }
  };

  const handleAudioTimeUpdate = (e) => {
    const audio = e.target;
    if (!isPaid && audio.currentTime > 60) {
      audio.pause();
      audio.currentTime = 60;
      alert("🔒 Prévia de 60 segundos finalizada! Efetue o pagamento de R$ 19,90 abaixo para liberar as versões completas e os downloads em MP3 HD.");
    }
  };

  // Get active audio track URLs
  const primaryAudioUrl = order?.audioUrl || (order?.audioFiles && order.audioFiles[0]) || '';
  const secondAudioUrl = order?.audioFiles && order.audioFiles[1] ? order.audioFiles[1] : '';

  // Get QR Code pointing to the public shareable page
  const sharePageUrl = typeof window !== 'undefined' ? `${window.location.origin}/homenagem?orderId=${orderId}` : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(sharePageUrl)}`;

  // Default beautiful dynamic cover
  const coverUrl = order?.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop';

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
            {isPaid ? '✨ Entrega Liberada' : '⏳ Aguardando Pagamento (R$ 19,90)'}
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
                      Melodia para {order?.honoreeName}
                    </h2>
                    <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Uma homenagem de {order?.customerName}</p>
                  </div>
                </div>

                {/* Audio Player 1 (Prévia de 60s se pendente, Completo se pago) */}
                {primaryAudioUrl && (
                  <div style={styles.audioPlayerContainer} className="glass-card">
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', fontWeight: '700', color: 'var(--primary)' }}>
                      {isPaid ? '🎧 Versão Principal (Versão 1)' : '🎧 Prévia (Versão 1 — 60 segundos)'}
                    </h4>
                    {!isPaid && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--warning)', marginBottom: '8px', fontWeight: '600' }}>
                        🔒 Modo Degustação: Áudio limitado aos primeiros 60 segundos.
                      </p>
                    )}
                    <audio controls onTimeUpdate={handleAudioTimeUpdate} style={styles.audioTag} src={primaryAudioUrl}>
                      Seu navegador não suporta.
                    </audio>

                    {isPaid && (
                      <div style={{ ...styles.downloadGrid, marginTop: '16px' }}>
                        <button 
                          onClick={() => handleDownload(primaryAudioUrl, `Musica_V1_${order?.honoreeName || 'Homenagem'}.mp3`)} 
                          className="btn btn-primary" 
                          style={{ ...styles.downloadBtn, border: 'none', cursor: 'pointer' }}
                        >
                          ⬇ Baixar MP3 (V1)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Player 2 */}
                {secondAudioUrl && (
                  <div style={styles.audioPlayerContainer} className="glass-card">
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', fontWeight: '700', color: 'var(--secondary)' }}>
                      {isPaid ? '🎧 Versão Alternativa (Versão 2 Bônus)' : '🎧 Prévia (Versão 2 — 60 segundos Bônus)'}
                    </h4>
                    {!isPaid && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--warning)', marginBottom: '8px', fontWeight: '600' }}>
                        🔒 Modo Degustação: Áudio limitado aos primeiros 60 segundos.
                      </p>
                    )}
                    <audio controls onTimeUpdate={handleAudioTimeUpdate} style={styles.audioTag} src={secondAudioUrl}>
                      Seu navegador não suporta.
                    </audio>

                    {isPaid && (
                      <div style={{ ...styles.downloadGrid, marginTop: '16px' }}>
                        <button 
                          onClick={() => handleDownload(secondAudioUrl, `Musica_V2_${order?.honoreeName || 'Homenagem'}.mp3`)} 
                          className="btn btn-secondary" 
                          style={{ ...styles.downloadBtn, border: 'none', cursor: 'pointer' }}
                        >
                          ⬇ Baixar MP3 (V2 Bônus)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* SE PAGO: QR Code section */}
                {isPaid ? (
                  <div style={styles.qrCard} className="glass-card">
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '1rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)' }}>Compartilhar Homenagem 🎁</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Envie o link exclusivo ou salve o QR Code para compartilhar essa linda homenagem diretamente com quem você ama!
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
                        <button onClick={handleCopyLink} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}>
                          {copied ? '✅ Link Copiado!' : '🔗 Copiar Link'}
                        </button>
                        <a href={sharePageUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none', textAlign: 'center' }}>
                          👁 Visualizar Página
                        </a>
                        <a href={qrCodeUrl} download={`qrcode-${order?.orderNumber}.png`} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none', textAlign: 'center' }}>
                          💾 Salvar QR Code
                        </a>
                      </div>
                    </div>
                    <img src={qrCodeUrl} alt="QR Code" style={styles.qrImg} />
                  </div>
                ) : (
                  /* SE PENDENTE: Bloco de Pagamento PIX Instantâneo */
                  <div className="glass-card" style={{ padding: '24px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.08) 0%, rgba(16, 185, 129, 0.12) 100%)', border: '1.5px solid rgba(16, 185, 129, 0.3)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '2rem' }}>⚡</span>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginTop: '6px', color: 'var(--text-primary)' }}>
                        Liberar Músicas Completas em MP3 HD
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Pague apenas <strong style={{ color: 'var(--success)', fontSize: '1.1rem' }}>R$ 19,90</strong> para liberar o download das 2 versões completas sem corte e a página especial de presente!
                      </p>
                    </div>

                    {pixLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <div style={styles.spinner} />
                        <p style={{ fontSize: '0.85rem', marginTop: '10px', color: 'var(--text-muted)' }}>Gerando PIX com aprovação instantânea...</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
                        {pixInfo.qrCodeBase64 && (
                          <img 
                            src={`data:image/jpeg;base64,${pixInfo.qrCodeBase64}`} 
                            alt="QR Code PIX" 
                            style={{ width: '180px', height: '180px', borderRadius: '12px', border: '2px solid var(--border-color)', backgroundColor: '#FFFFFF', padding: '8px' }}
                          />
                        )}

                        {pixInfo.qrCode ? (
                          <div style={{ width: '100%' }}>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(pixInfo.qrCode);
                                setPixCopied(true);
                                setTimeout(() => setPixCopied(false), 3000);
                              }}
                              style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '10px',
                                border: 'none',
                                background: pixCopied ? 'var(--success)' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                color: '#FFFFFF',
                                fontWeight: 'bold',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)'
                              }}
                            >
                              {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleGeneratePix}
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                          >
                            💚 Gerar PIX (R$ 19,90)
                          </button>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--warning)', marginTop: '4px' }}>
                          <span>🔄 Aguardando confirmação do pagamento em tempo real...</span>
                        </div>
                      </div>
                    )}
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
                        type="email" 
                        placeholder="Seu e-mail de acesso"
                        required
                        value={accountEmail}
                        onChange={(e) => setAccountEmail(e.target.value)}
                        style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem', width: '220px' }}
                      />
                      <input 
                        type="password" 
                        placeholder="Senha segura (mín 6 dígitos)"
                        required
                        minLength={6}
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem', width: '220px' }}
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
  },
  statusBadge: {
    fontSize: '0.85rem',
    fontWeight: '700',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid',
  },
  deliveryCard: {
    padding: '28px',
    marginBottom: '28px',
    backgroundColor: '#FFFFFF',
    boxShadow: 'var(--card-shadow)',
  },
  mediaSide: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  coverWrapper: {
    position: 'relative',
    borderRadius: 'var(--border-radius-md)',
    overflow: 'hidden',
    aspectRatio: '1',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12)',
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
    background: 'linear-gradient(to top, rgba(15, 23, 42, 0.9) 0%, rgba(15, 23, 42, 0.3) 60%, transparent 100%)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: '#FFFFFF',
  },
  audioPlayerContainer: {
    padding: '18px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-md)',
    boxShadow: 'var(--card-shadow)',
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
    padding: '18px',
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
  },
  qrImg: {
    width: '100px',
    height: '100px',
    borderRadius: 'var(--border-radius-sm)',
    border: '3px solid #FFFFFF',
    boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
  },
  lyricsSide: {
    padding: '28px',
    maxHeight: '620px',
    overflowY: 'auto',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-md)',
    boxShadow: 'var(--card-shadow)',
  },
  lyricsText: {
    fontFamily: 'var(--font-family-body)',
    fontSize: '1rem',
    lineHeight: '1.8',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
  },
  blockedCard: {
    padding: '36px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid var(--warning)',
    backgroundColor: 'var(--warning-bg)',
    borderRadius: 'var(--border-radius-md)',
  },
  feedbackCard: {
    padding: '28px',
    backgroundColor: '#FFFFFF',
    boxShadow: 'var(--card-shadow)',
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
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-primary)',
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
    width: '44px',
    height: '44px',
    border: '3px solid var(--border-color)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

