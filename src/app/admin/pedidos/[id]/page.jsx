'use client';
export const runtime = 'edge';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { formatToWhatsAppNumber } from '@/lib/whatsappTemplates';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';
import Link from 'next/link';
import Image from 'next/image';

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
  const [audioUrl2, setAudioUrl2] = useState('');
  const [wavUrl, setWavUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('PENDENTE');
  const [hasVideoAccess, setHasVideoAccess] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState('');
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [checkPaymentMsg, setCheckPaymentMsg] = useState('');
  const [copiedClientLink, setCopiedClientLink] = useState(false);

  const [sunoPrompt, setSunoPrompt] = useState('');

  // Suno AI direct generation states
  const [generatingSuno, setGeneratingSuno] = useState(false);
  const [pollingStatus, setPollingStatus] = useState('');
  const [generatedTracks, setGeneratedTracks] = useState([]);
  const [sunoError, setSunoError] = useState('');

  const router = useRouter();
  const params = useParams();
  const orderId = params.id;

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser || auth.currentUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      }
    }, 1500);

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      clearTimeout(timeout);
      if (!authUser || authUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      } else {
        setUser(authUser);
        setCheckingAuth(false);
      }
    }, (error) => {
      clearTimeout(timeout);
      router.push('/admin/login');
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
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
          setProductionStatus(data.productionStatus || 'LETRA_APROVADA');
          setPaymentStatus(data.paymentStatus || 'PENDENTE');
          setHasVideoAccess(Boolean(data.hasVideoAccess || data.videoAddonPaid));
          setAudioUrl(data.audioFiles?.[0] || data.audioUrl || '');
          setAudioUrl2(data.audioFiles?.[1] || '');
          setWavUrl(data.wavFiles?.[0] || data.wavUrl || '');
          setVideoUrl(data.videoFile || data.videoUrl || '');
          setQrCodeUrl(data.qrCodeFile || data.qrCodeUrl || '');
          setLyrics(data.lyrics || '');
          setSunoPrompt(data.sunoPrompt || '');
        } else {
          setOrder({
            orderNumber: orderId,
            customerName: 'Cliente',
            customerPhone: '',
            honoreeName: 'Homenageado',
            occasion: 'Especial',
            musicStyle: 'Pop',
            total: 9.99,
            paymentStatus: 'PAGAMENTO_APROVADO',
            productionStatus: 'EM_PRODUCAO'
          });
        }
      } catch (err) {
        console.error("Erro ao buscar pedido:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [user, orderId]);

  const handleSaveOrder = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setSuccessMsg('');

    try {
      const docRef = doc(db, 'orders', orderId);
      await updateDoc(docRef, {
        productionStatus,
        paymentStatus,
        hasVideoAccess,
        videoAddonPaid: hasVideoAccess,
        lyrics,
        audioUrl,
        audioFiles: [audioUrl, audioUrl2].filter(Boolean),
        wavUrl,
        wavFiles: wavUrl ? [wavUrl] : [],
        videoFile: videoUrl,
        videoUrl: videoUrl,
        qrCodeFile: qrCodeUrl,
        sunoPrompt,
        updatedAt: new Date().toISOString()
      });
      setOrder(prev => ({
        ...prev,
        productionStatus,
        paymentStatus,
        hasVideoAccess,
        videoAddonPaid: hasVideoAccess,
        lyrics,
        audioUrl,
        audioFiles: [audioUrl, audioUrl2].filter(Boolean),
        wavUrl,
        videoFile: videoUrl,
        qrCodeFile: qrCodeUrl,
        sunoPrompt
      }));
      setSuccessMsg('✅ Pedido atualizado com sucesso no banco de dados!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
      setSuccessMsg('❌ Erro ao salvar dados no banco.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setUpdating(false);
    }
  };

  // Reenvia a notificação de "pagamento aprovado" — necessário quando o status é aprovado manualmente
  // aqui no painel, porque esse updateDoc é feito direto do browser e não passa por
  // applyPaymentApproval (único lugar que dispara o WhatsApp automático).
  const handleNotifyPayment = async () => {
    setNotifying(true);
    setNotifyMsg('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/notify-payment-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => ({}));
      setNotifyMsg(res.ok ? '✅ Cliente notificado no WhatsApp!' : `❌ ${data.error || 'Falha ao notificar.'}`);
    } catch (err) {
      setNotifyMsg('❌ Falha ao notificar cliente.');
    } finally {
      setNotifying(false);
      setTimeout(() => setNotifyMsg(''), 5000);
    }
  };

  // Reconsulta a Efí AGORA pra este pedido, em vez de esperar o webhook ou a reconciliação por cron
  // (a cada 10min) — achado 30/08/2026: pedido pago de verdade só foi aprovado pelo sistema minutos
  // DEPOIS de o admin ter editado paymentStatus manualmente aqui na tela, achando que precisava
  // forçar. Editar o campo direto pula a verificação real (payments.md) e não grava paymentId/paidAt
  // (só o form de baixo faz isso — quem grava esses dois é sempre applyPaymentApproval). Este botão
  // dá o mesmo resultado — na hora — sem abrir mão de checar de verdade: chama a mesma rota pública
  // que o polling do cliente usa, que só aprova depois de confirmar na Efí.
  const handleCheckPaymentNow = async () => {
    const txid = order?.paymentIntentId;
    if (!txid) {
      setCheckPaymentMsg('❌ Este pedido não tem cobrança Pix registrada (paymentIntentId ausente).');
      setTimeout(() => setCheckPaymentMsg(''), 6000);
      return;
    }

    setCheckingPayment(true);
    setCheckPaymentMsg('');
    try {
      const res = await fetch(`/api/payments/status?orderId=${orderId}&paymentId=${encodeURIComponent(txid)}`);
      const data = await res.json().catch(() => ({}));

      if (data.status === 'approved') {
        // A rota já rodou applyPaymentApproval (paymentStatus/paymentId/paidAt gravados de verdade)
        // — só falta refletir aqui na tela sem precisar recarregar a página inteira.
        const docSnap = await getDoc(doc(db, 'orders', orderId));
        if (docSnap.exists()) {
          const freshData = docSnap.data();
          setOrder(freshData);
          setPaymentStatus(freshData.paymentStatus || 'PENDENTE');
          setHasVideoAccess(Boolean(freshData.hasVideoAccess || freshData.videoAddonPaid));
        }
        setCheckPaymentMsg('✅ Pagamento confirmado na Efí e aprovado agora!');
      } else if (data.status === 'pending') {
        setCheckPaymentMsg('⏳ A Efí ainda não confirma este pagamento. Se o cliente já pagou, pode levar alguns instantes.');
      } else {
        setCheckPaymentMsg(`❌ ${data.error || 'Não foi possível verificar agora.'}`);
      }
    } catch (err) {
      setCheckPaymentMsg('❌ Falha ao consultar a Efí.');
    } finally {
      setCheckingPayment(false);
      setTimeout(() => setCheckPaymentMsg(''), 8000);
    }
  };

  const handleCopyClientLink = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/entrega?orderId=${orderId}`;
    navigator.clipboard.writeText(url);
    setCopiedClientLink(true);
    setTimeout(() => setCopiedClientLink(false), 3000);
  };

  const handleDownload = async (url, filename) => {
    if (!url) return;
    // Sempre pelo proxy (nunca direto na CDN da Kie.ai): é ele que sabe tentar as fontes
    // alternativas quando uma delas falha ou devolve corpo vazio — ver
    // src/app/api/audio/proxy/route.js (incidente 28/08/2026, download do admin quebrado com
    // "MissingKey" enquanto a mesma faixa seguia disponível na outra CDN).
    const isAlreadyProxied = url.startsWith('/api/') || url.startsWith('blob:');
    const base = isAlreadyProxied ? url : `/api/audio/proxy?url=${encodeURIComponent(url)}&v=${AUDIO_CACHE_VERSION}`;
    // ?download= faz o servidor mandar Content-Disposition — sem isso o navegador toca o arquivo em
    // vez de baixar quando o link é aberto direto (ver src/app/api/audio/proxy/route.js).
    const downloadUrl = base.startsWith('/api/')
      ? `${base}${base.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`
      : base;

    try {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      console.warn('Erro ao iniciar o download:', err);
      window.location.href = downloadUrl;
    }
  };

  const handleResetVideo = async () => {
    if (!window.confirm("Tem certeza que deseja resetar completamente o vídeo deste pedido? Isso apagará o status, o link atual e todas as fotos enviadas pela cliente.")) return;
    setUpdating(true);
    setSuccessMsg('');
    try {
      const docRef = doc(db, 'orders', orderId);
      await updateDoc(docRef, {
        videoUrl: '',
        videoFile: '',
        slideshowImages: [],
        videoStatus: '',
        videoProgress: 0,
        updatedAt: new Date().toISOString()
      });
      setVideoUrl('');
      setOrder(prev => ({
        ...prev,
        videoUrl: '',
        videoFile: '',
        slideshowImages: [],
        videoStatus: ''
      }));
      setSuccessMsg('✅ Vídeo resetado com sucesso! A cliente já pode gerar novamente.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      console.error(err);
      setSuccessMsg('❌ Erro ao resetar vídeo no banco.');
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

  const handleGenerateSuno = async () => {
    if (!lyrics.trim()) {
      alert('Por favor, informe a letra da música antes de gerar no Suno AI.');
      return;
    }
    setGeneratingSuno(true);
    setSunoError('');
    setPollingStatus('Enviando solicitação ao Suno API...');
    setGeneratedTracks([]);

    try {
      const response = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: lyrics,
          tags: sunoPrompt || getSunoStylePrompt(),
          orderId
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Falha ao iniciar geração.');
      }

      const data = await response.json();
      
      if (!data.taskId) {
        throw new Error("Nenhum taskId retornado pela API.");
      }
      
      pollSunoStatus(data.taskId);
    } catch (err) {
      console.error(err);
      setSunoError(err.message || 'Ocorreu um erro.');
      setGeneratingSuno(false);
    }
  };

  const pollSunoStatus = (taskId) => {
    let attempts = 0;
    const maxAttempts = 72;
    
    setPollingStatus('Aguardando Suno compor e renderizar áudios (2 a 4 min)...');
    
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/suno/status?taskId=${taskId}`);
        if (res.ok) {
          const statusData = await res.json();
          
          if (statusData.status === 'COMPLETED' && statusData.tracks && statusData.tracks.length > 0) {
            setGeneratedTracks(statusData.tracks);
            setPollingStatus('✅ Geração concluída com sucesso!');
            clearInterval(interval);
            setGeneratingSuno(false);
            
            const validTracks = statusData.tracks.filter(t => t.audio_url);
            if (validTracks[0]) {
              setAudioUrl(validTracks[0].audio_url);
            }
            if (validTracks[1]) {
              setAudioUrl2(validTracks[1].audio_url);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setPollingStatus('');
        setSunoError('Tempo limite esgotado. Verifique a página ou tente de novo.');
        setGeneratingSuno(false);
      }
    }, 5000);
  };

  const copyToClipboard = (text, alertMsg) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      alert(alertMsg);
    }
  };

  if (checkingAuth || loading) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (!order) {
    return (
      <div style={styles.wrapper}>
        <div className="container" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <h2 style={{ color: '#0f172a' }}>Pedido não encontrado</h2>
          <Link href="/admin" style={{ color: '#7c3aed', fontWeight: 'bold', marginTop: '16px', display: 'inline-block' }}>
            ← Voltar ao painel admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Header Tema Claro */}
      <header style={styles.header}>
        <div style={styles.headerContainer}>
          <div style={styles.logo}>
            <Image src="/logo.png" alt="NSMusic" width={36} height={36} style={{ height: '36px', width: 'auto' }} priority />
            <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase' }}>Gerenciar Pedido</span>
          </div>
          <Link href="/admin" style={styles.backLink}>
            ← Voltar ao Painel
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px 0' }}>
        <div className="container" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 20px' }}>
          
          <div style={styles.titleRow}>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a' }}>
                Pedido {order.orderNumber || orderId}
              </h1>
              <p style={{ color: '#475569', fontSize: '0.95rem', marginTop: '4px', fontWeight: '500' }}>
                Cliente: <strong style={{ color: '#0f172a' }}>{order.customerName}</strong> ({order.customerEmail || 'Sem e-mail'}) • <strong style={{ color: '#2563eb' }}>{order.customerPhone || 'Sem telefone'}</strong>
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                {order.customerPhone && (
                  <a
                    href={`https://wa.me/${formatToWhatsAppNumber(order.customerPhone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...styles.quickActionBtn, background: '#25D366', color: '#fff', textDecoration: 'none' }}
                  >
                    📲 Conversar no WhatsApp
                  </a>
                )}
                <button type="button" onClick={handleCopyClientLink} style={{ ...styles.quickActionBtn, background: '#e2e8f0', color: '#0f172a' }}>
                  {copiedClientLink ? '✅ Link copiado!' : '🔗 Copiar página do cliente'}
                </button>
                <a
                  href={`/entrega?orderId=${orderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...styles.quickActionBtn, background: '#e2e8f0', color: '#0f172a', textDecoration: 'none' }}
                >
                  🔗 Abrir página do cliente
                </a>
              </div>
            </div>
            <div style={styles.priceTag}>
              R$ {(Number(order.total) || 9.99).toFixed(2)}
            </div>
          </div>

          {successMsg && (
            <div style={styles.successAlert}>
              {successMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            
            {/* Form principal */}
            <div style={styles.formSide}>
              <form onSubmit={handleSaveOrder}>
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>Gerenciamento de Produção</h3>
                  
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Status do Pagamento 💳</label>
                    <select 
                      value={paymentStatus} 
                      onChange={(e) => setPaymentStatus(e.target.value)}
                      style={styles.select}
                    >
                      <option value="PENDENTE">PENDENTE (Aguardando pagamento)</option>
                      <option value="PAGAMENTO_APROVADO">PAGAMENTO_APROVADO (Liberado)</option>
                      <option value="PAGO">PAGO</option>
                      <option value="RECUSADO">RECUSADO</option>
                    </select>

                    {order.paymentStatus !== 'PAGAMENTO_APROVADO' && order.paymentStatus !== 'PAGO' && order.paymentIntentId && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          type="button"
                          onClick={handleCheckPaymentNow}
                          disabled={checkingPayment}
                          style={{ ...styles.quickActionBtn, background: checkingPayment ? '#94a3b8' : '#2563eb', color: '#fff', cursor: checkingPayment ? 'default' : 'pointer' }}
                          title="Consulta a Efí agora, na hora — não espera o webhook nem os 10min da reconciliação automática"
                        >
                          {checkingPayment ? '⏳ Consultando a Efí...' : '🔍 Verificar pagamento agora (Efí)'}
                        </button>
                        {checkPaymentMsg && <p style={{ fontSize: '0.8rem', marginTop: '6px', color: checkPaymentMsg.startsWith('✅') ? '#059669' : checkPaymentMsg.startsWith('⏳') ? '#d97706' : '#dc2626' }}>{checkPaymentMsg}</p>}
                      </div>
                    )}

                    {(order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO') && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          type="button"
                          onClick={handleNotifyPayment}
                          disabled={notifying}
                          style={{ ...styles.quickActionBtn, background: notifying ? '#94a3b8' : '#25D366', color: '#fff', cursor: notifying ? 'default' : 'pointer' }}
                        >
                          {notifying ? '⏳ Enviando...' : '📲 Notificar cliente (pagamento aprovado)'}
                        </button>
                        {notifyMsg && <p style={{ fontSize: '0.8rem', marginTop: '6px', color: notifyMsg.startsWith('✅') ? '#059669' : '#dc2626' }}>{notifyMsg}</p>}
                      </div>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasVideoAccess}
                        onChange={(e) => setHasVideoAccess(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      Liberar Vídeo Homenagem 🎬
                    </label>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                      Marca e clica em &quot;Salvar&quot; para o cliente poder enviar as fotos e gerar
                      o vídeo sem precisar pagar o add-on (cortesia/liberação manual).
                    </p>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Status da Produção ⚙️</label>
                    <select 
                      value={productionStatus} 
                      onChange={(e) => setProductionStatus(e.target.value)}
                      style={styles.select}
                    >
                      <option value="LETRA_GERADA">1. Letra Gerada (Rascunho)</option>
                      <option value="LETRA_APROVADA">2. Letra Aprovada (Aguardando Áudio)</option>
                      <option value="EM_PRODUCAO">3. Em Produção no Suno AI</option>
                      <option value="AUDIO_GERADO">4. Áudio Gerado (Pronto para Entrega)</option>
                      <option value="FINALIZADO">5. Finalizado / Entregue</option>
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Letra Oficial Aprovada</label>
                    <textarea 
                      value={lyrics} 
                      onChange={(e) => setLyrics(e.target.value)}
                      rows={10} 
                      style={styles.textarea}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Áudio Principal (Versão 1 - MP3 HD)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="url"
                        value={audioUrl}
                        onChange={(e) => setAudioUrl(e.target.value)}
                        placeholder="https://..."
                        style={{ ...styles.input, flex: 1 }}
                      />
                      {audioUrl && (
                        <button type="button" onClick={() => handleDownload(audioUrl, `${order.orderNumber || orderId}-versao1.mp3`)} style={{ ...styles.quickActionBtn, background: '#2563eb', color: '#fff' }} title="Baixar MP3">
                          ⬇️
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Áudio Secundário (Versão 2 Bônus - MP3 HD)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="url"
                        value={audioUrl2}
                        onChange={(e) => setAudioUrl2(e.target.value)}
                        placeholder="https://..."
                        style={{ ...styles.input, flex: 1 }}
                      />
                      {audioUrl2 && (
                        <button type="button" onClick={() => handleDownload(audioUrl2, `${order.orderNumber || orderId}-versao2.mp3`)} style={{ ...styles.quickActionBtn, background: '#2563eb', color: '#fff' }} title="Baixar MP3">
                          ⬇️
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Arquivo WAV (Alta Definição)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="url"
                        value={wavUrl}
                        onChange={(e) => setWavUrl(e.target.value)}
                        placeholder="https://..."
                        style={{ ...styles.input, flex: 1 }}
                      />
                      {wavUrl && (
                        <button type="button" onClick={() => handleDownload(wavUrl, `${order.orderNumber || orderId}.wav`)} style={{ ...styles.quickActionBtn, background: '#2563eb', color: '#fff' }} title="Baixar WAV">
                          ⬇️
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Vídeo Homenagem (MP4)</label>
                    <input 
                      type="url" 
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://..." 
                      style={styles.input}
                    />
                    <button
                      type="button"
                      onClick={handleResetVideo}
                      disabled={updating}
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      🔄 Resetar Status e Fotos do Vídeo
                    </button>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do QR Code Personalizado</label>
                    <input 
                      type="url" 
                      value={qrCodeUrl}
                      onChange={(e) => setQrCodeUrl(e.target.value)}
                      placeholder="https://..." 
                      style={styles.input}
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={updating}
                    style={{
                      width: '100%',
                      padding: '14px',
                      marginTop: '16px',
                      backgroundColor: '#7c3aed',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '1rem',
                      cursor: 'pointer'
                    }}
                  >
                    {updating ? 'Salvando...' : 'Salvar Alterações do Pedido 💾'}
                  </button>
                </div>
              </form>
            </div>

            {/* Side de prompts e detalhes do homenageado */}
            <div style={styles.infoSide}>
              
              {/* Suno AI card with auto generator */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Prompts & Geração Suno AI 🤖</h3>
                
                <div style={{ marginBottom: '16px' }}>
                  <label style={styles.label}>Prompt de Estilo (Tags)</label>
                  <input 
                    type="text"
                    value={sunoPrompt || getSunoStylePrompt()}
                    onChange={(e) => setSunoPrompt(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button 
                    type="button"
                    onClick={handleGenerateSuno}
                    disabled={generatingSuno}
                    style={{
                      fontSize: '0.9rem',
                      padding: '12px 14px',
                      width: '100%',
                      background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {generatingSuno ? '⏳ Gerando Música...' : '🎵 Gerar Áudio no Suno AI (1 Click)'}
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      type="button"
                      onClick={() => copyToClipboard(sunoPrompt || getSunoStylePrompt(), 'Prompt de estilo copiado!')}
                      style={{ fontSize: '0.8rem', padding: '8px 10px', flex: 1, backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      📋 Copiar Tags
                    </button>
                    <button 
                      type="button"
                      onClick={() => copyToClipboard(lyrics, 'Letra da música copiada!')}
                      style={{ fontSize: '0.8rem', padding: '8px 10px', flex: 1, backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      📋 Copiar Letra
                    </button>
                  </div>
                </div>

                {pollingStatus && (
                  <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '10px', borderRadius: '6px', border: '1px solid #ddd6fe', textAlign: 'center', fontWeight: 'bold' }}>
                    {pollingStatus}
                  </div>
                )}

                {sunoError && (
                  <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#dc2626', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '6px', border: '1px solid #fca5a5', textAlign: 'center', fontWeight: 'bold' }}>
                    ⚠️ {sunoError}
                  </div>
                )}

                {generatedTracks.length > 0 && (
                  <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#0f172a', fontWeight: 'bold' }}>Versões Geradas:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {generatedTracks.map((track, idx) => (
                        <div key={track.id || idx} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a' }}>Versão {idx + 1} ({track.status})</span>
                          {track.audio_url ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <audio src={track.audio_url} controls style={{ width: '100%', height: '36px' }} />
                              <button 
                                type="button" 
                                onClick={() => {
                                  setAudioUrl(track.audio_url);
                                  alert(`Link da Versão ${idx + 1} copiado para o campo de áudio principal! Não esqueça de Salvar.`);
                                }}
                                style={{ fontSize: '0.8rem', padding: '6px 10px', backgroundColor: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                              >
                                Usar como Áudio Principal 🎯
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Processando áudio...</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Dados do Homenageado</h3>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Ocasião</span>
                  <p style={styles.infoVal}>{order.occasion || 'N/A'}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Relação</span>
                  <p style={styles.infoVal}>{order.relationship || 'N/A'}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Qualidades</span>
                  <p style={styles.infoVal}>{order.qualities || 'Nenhuma informada'}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Frase Obrigatória</span>
                  <p style={{ ...styles.infoVal, color: '#7c3aed', fontWeight: 'bold' }}>{order.requiredPhrase || 'Nenhuma'}</p>
                </div>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Assuntos Proibidos</span>
                  <p style={{ ...styles.infoVal, color: '#dc2626', fontWeight: 'bold' }}>{order.forbiddenSubjects || 'Nenhum'}</p>
                </div>
              </div>

              <div style={styles.card}>
                <h3 style={styles.cardTitle}>História Fornecida</h3>
                <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {order.story || 'Nenhuma história digitada.'}
                </p>
                {order.importantMoments && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <span style={styles.infoLabel}>Momentos Marcantes:</span>
                    <p style={{ fontSize: '0.9rem', color: '#334155', marginTop: '4px' }}>{order.importantMoments}</p>
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
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  loadingWrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #e2e8f0',
    borderTopColor: '#7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  headerContainer: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  backLink: {
    color: '#475569',
    fontSize: '0.9rem',
    fontWeight: '700',
    textDecoration: 'none',
  },
  quickActionBtn: {
    border: 'none',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '0.82rem',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
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
    color: '#059669',
  },
  successAlert: {
    backgroundColor: '#d1fae5',
    border: '1px solid #10b981',
    borderRadius: '8px',
    padding: '16px 20px',
    color: '#065f46',
    marginBottom: '24px',
    fontSize: '0.95rem',
    fontWeight: 'bold',
  },
  formSide: {
    flex: 1.3,
  },
  infoSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    padding: '28px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
    marginBottom: '24px',
  },
  cardTitle: {
    fontSize: '1.15rem',
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: '20px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '10px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#475569',
    marginBottom: '6px',
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    color: '#0f172a',
    fontSize: '0.9rem',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    color: '#0f172a',
    fontSize: '0.9rem',
    outline: 'none',
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    color: '#0f172a',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical',
  },
  infoBlock: {
    marginBottom: '14px',
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: '8px',
  },
  infoLabel: {
    fontSize: '0.8rem',
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoVal: {
    fontSize: '0.95rem',
    color: '#0f172a',
    marginTop: '2px',
    fontWeight: '500',
  }
};
