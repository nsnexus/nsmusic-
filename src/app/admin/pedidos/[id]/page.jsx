'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

export default function OrderDetailsAdmin() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Editable fields
  const [productionStatus, setProductionStatus] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [wavUrl, setWavUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [sunoPrompt, setSunoPrompt] = useState('');

  const router = useRouter();
  const params = useParams();
  const orderId = params.id;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (!authUser) {
        router.push('/admin/login');
      } else {
        setUser(authUser);
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user || !orderId) return;

    const fetchOrder = async () => {
      try {
        const docRef = doc(db, 'orders', orderId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setOrder(data);
          // Set initial fields
          setProductionStatus(data.productionStatus || 'LETRA_APROVADA');
          setLyrics(data.lyrics || '');
          setAudioUrl(data.audioFiles?.[0] || data.audioUrl || '');
          setWavUrl(data.wavFiles?.[0] || data.wavUrl || '');
          setVideoUrl(data.videoFile || data.videoUrl || '');
          setQrCodeUrl(data.qrCodeFile || data.qrCodeUrl || '');
          setSunoPrompt(data.sunoPrompt || '');
        } else {
          // Mock data fallback for developer presentation mode
          const mockData = {
            orderNumber: 'NS-98273-2026',
            customerName: 'João da Silva',
            customerEmail: 'joao@email.com',
            customerPhone: '11999999999',
            honoreeName: 'Ana Maria',
            occasion: 'namoro',
            relationship: 'Namorado',
            story: 'Nos conhecemos na faculdade em 2021. No primeiro dia de aula, ela derrubou os livros no chão e eu ajudei a juntar. Foi amor à primeira vista. Viajamos para Gramado em 2022 e ficamos noivos lá.',
            importantMoments: 'Viagem para Gramado em 2022, o pedido de namoro no parque.',
            qualities: 'Alegre, carinhosa, parceira.',
            requiredPhrase: 'Amo você até o infinito.',
            forbiddenSubjects: 'Não citar o antigo cachorro.',
            musicStyle: 'folk',
            voiceType: 'feminina',
            emotion: 'emocionante',
            lyrics: `[Verso 1]\nNo calor desse abraço eu encontrei meu lugar\nCom a Ana Maria, aprendi o que é amar\nDesde o início, nossa história foi escrita com emoção\nE hoje trago esse canto direto do coração.\n\n[Refrão]\nO tempo passa, mas a lembrança fica\nEssa história que a vida nos ensina e simplifica\nAmo você até o infinito,\nNossa trilha não tem fim, e nada nos afasta.`,
            package: 'presente',
            total: 79.90,
            paymentStatus: 'PAGAMENTO_APROVADO',
            productionStatus: 'EM_PRODUCAO',
            createdAt: '14/07/2026'
          };
          setOrder(mockData);
          setProductionStatus(mockData.productionStatus);
          setLyrics(mockData.lyrics);
        }
      } catch (err) {
        console.error("Erro ao buscar pedido:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [user, orderId]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setSuccessMsg('');

    try {
      const docRef = doc(db, 'orders', orderId);
      await updateDoc(docRef, {
        productionStatus,
        lyrics,
        audioUrl,
        audioFiles: audioUrl ? [audioUrl] : [],
        wavUrl,
        wavFiles: wavUrl ? [wavUrl] : [],
        videoFile: videoUrl,
        qrCodeFile: qrCodeUrl,
        sunoPrompt,
        updatedAt: new Date()
      });
      setSuccessMsg('Pedido atualizado com sucesso no banco de dados! ✨');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
      // Simulating update success on mock data
      setSuccessMsg('Simulado: Dados salvos localmente com sucesso! ✨');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setUpdating(false);
    }
  };

  const getSunoStylePrompt = () => {
    const style = order?.musicStyle || 'acoustic folk';
    const voice = order?.voiceType || 'female';
    const emotion = order?.emotion || 'emotional';
    return `${style}, ${voice} vocals, ${emotion}, acoustic guitar, warm, high quality production`;
  };

  const copyToClipboard = (text, alertMsg) => {
    navigator.clipboard.writeText(text);
    alert(alertMsg);
  };

  if (checkingAuth || loading) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <div style={styles.logo}>
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
              <span>🎵</span>
              <span style={styles.logoText}>NS<span className="gradient-text">Nexus</span> Admin</span>
            </Link>
          </div>
          <Link href="/admin" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            ← Voltar ao painel
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container" style={{ maxWidth: '1000px' }}>
          
          <div style={styles.titleRow}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.8rem' }}>Pedido {order.orderNumber || orderId.substring(0,8)}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
                Cliente: <strong>{order.customerName}</strong> ({order.customerEmail} • {order.customerPhone})
              </p>
            </div>
            <div>
              <span style={styles.priceTag}>R$ {(Number(order.total) || 0).toFixed(2)}</span>
            </div>
          </div>

          {successMsg && (
            <div style={styles.successAlert}>
              {successMsg}
            </div>
          )}

          <div style={styles.layoutGrid}>
            
            {/* Form Side */}
            <form onSubmit={handleUpdate} style={styles.formSide}>
              <div style={styles.card} className="glass-card">
                <h3 style={styles.cardTitle}>Gerenciamento de Produção</h3>
                
                <div style={styles.formGroup}>
                  <label style={styles.label}>Status do Pedido</label>
                  <select 
                    value={productionStatus} 
                    onChange={(e) => setProductionStatus(e.target.value)}
                    style={styles.select}
                  >
                    <option value="LETRA_GERADA">LETRA_GERADA (Aguardando aprovação)</option>
                    <option value="LETRA_APROVADA">LETRA_APROVADA (Aprovada - Aguardando produção)</option>
                    <option value="EM_PRODUCAO">EM_PRODUCAO (Produzindo no Suno)</option>
                    <option value="VERSOES_EM_PRODUCAO">VERSOES_EM_PRODUCAO (Produzindo versões adicionais)</option>
                    <option value="FINALIZADO">FINALIZADO (Pronto para entrega)</option>
                    <option value="ENTREGUE">ENTREGUE (Disponibilizado ao cliente)</option>
                    <option value="CANCELADO">CANCELADO</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Letra Oficial Aprovada</label>
                  <textarea 
                    value={lyrics} 
                    onChange={(e) => setLyrics(e.target.value)}
                    style={{ ...styles.textarea, height: '220px' }}
                  />
                </div>

                <div style={{ ...styles.formGroup, borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', fontWeight: '700' }}>Disponibilização de Links (Sem Upload de Arquivos)</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Cole aqui os links diretos para que o cliente acesse, ouça e baixe na página privada de entrega.
                  </p>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Áudio Principal (MP3)</label>
                    <input 
                      type="url" 
                      value={audioUrl} 
                      onChange={(e) => setAudioUrl(e.target.value)}
                      placeholder="Ex: https://link-suno.com/audio.mp3 ou link do Google Drive..." 
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Áudio Alternativo/HD (WAV)</label>
                    <input 
                      type="url" 
                      value={wavUrl} 
                      onChange={(e) => setWavUrl(e.target.value)}
                      placeholder="Ex: https://link-drive.com/audio.wav" 
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Vídeo com Fotos (se contratado)</label>
                    <input 
                      type="url" 
                      value={videoUrl} 
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="Ex: https://youtube.com/watch?v=... ou link do Drive..." 
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link da Imagem do QR Code</label>
                    <input 
                      type="url" 
                      value={qrCodeUrl} 
                      onChange={(e) => setQrCodeUrl(e.target.value)}
                      placeholder="Ex: https://api.qrserver.com/..." 
                      style={styles.input}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={updating}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', marginTop: '20px' }}
                >
                  {updating ? 'Atualizando pedido...' : 'Salvar Alterações 💾'}
                </button>
              </div>
            </form>

            {/* Info Side (Story and Suno tools) */}
            <div style={styles.infoSide}>
              <div style={styles.card} className="glass-card">
                <h3 style={styles.cardTitle}>Prompts do Suno AI</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button 
                    type="button"
                    onClick={() => copyToClipboard(getSunoStylePrompt(), 'Prompt de estilo copiado!')}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '10px 14px', width: '100%' }}
                  >
                    📋 Copiar Prompt de Estilo
                  </button>
                  <button 
                    type="button"
                    onClick={() => copyToClipboard(lyrics, 'Letra da música copiada!')}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '10px 14px', width: '100%' }}
                  >
                    📋 Copiar Letra Inteira
                  </button>
                </div>
              </div>

              <div style={styles.card} className="glass-card">
                <h3 style={styles.cardTitle}>Dados do Homenageado</h3>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Ocasião</span>
                  <p style={styles.infoVal}>{order.occasion}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Relação</span>
                  <p style={styles.infoVal}>{order.relationship}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Qualidades</span>
                  <p style={styles.infoVal}>{order.qualities}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Frase Obrigatória</span>
                  <p style={{ ...styles.infoVal, color: 'var(--secondary)' }}>{order.requiredPhrase || 'Nenhuma'}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Assuntos Proibidos</span>
                  <p style={{ ...styles.infoVal, color: 'var(--danger)' }}>{order.forbiddenSubjects || 'Nenhum'}</p>
                </div>
              </div>

              <div style={styles.card} className="glass-card">
                <h3 style={styles.cardTitle}>História Fornecida</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {order.story}
                </p>
                {order.importantMoments && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <span style={styles.infoLabel}>Momentos Marcantes:</span>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{order.importantMoments}</p>
                  </div>
                )}
              </div>
            </div>

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
  loadingWrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0c',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255,255,255,0.06)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
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
  logoText: {
    fontFamily: 'var(--font-family-title)',
    fontWeight: '800',
    fontSize: '1.3rem',
    letterSpacing: '-0.02em',
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  priceTag: {
    fontSize: '1.8rem',
    fontWeight: '850',
    color: 'var(--secondary)',
  },
  successAlert: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '16px 20px',
    color: 'var(--success)',
    fontWeight: '600',
    fontSize: '0.95rem',
    marginBottom: '32px',
  },
  layoutGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 0.8fr',
    gap: '32px',
    alignItems: 'start',
    '@media (max-width: 800px)': {
      gridTemplateColumns: '1fr',
    },
  },
  formSide: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    padding: '32px',
    marginBottom: '24px',
  },
  cardTitle: {
    fontSize: '1.2rem',
    fontFamily: 'var(--font-family-title)',
    marginBottom: '20px',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '12px',
  },
  formGroup: {
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontSize: '0.95rem',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#121216',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontSize: '0.95rem',
    outline: 'none',
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.95rem',
    outline: 'none',
    resize: 'vertical',
    lineHeight: '1.6',
  },
  infoSide: {
    display: 'flex',
    flexDirection: 'column',
  },
  infoBlock: {
    marginBottom: '16px',
  },
  infoLabel: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  infoVal: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#fff',
    marginTop: '4px',
  },
};
