'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { doc, getDoc, collection, addDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '@/lib/firebase';
import { buildSunoPayload } from '@/lib/sunoPayload';

function BrandLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Image src="/logo.png" alt="NSMusic" width={38} height={38} style={{ height: '38px', width: 'auto' }} priority />
      <span style={{
        fontSize: '1.3rem',
        fontWeight: '900',
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.3px'
      }}>
        NSMusic
      </span>
      <div className="header-mini-eq">
        <div className="header-mini-bar" style={{ animationDelay: '0.1s' }}></div>
        <div className="header-mini-bar" style={{ animationDelay: '0.4s' }}></div>
        <div className="header-mini-bar" style={{ animationDelay: '0.2s' }}></div>
      </div>
    </div>
  );
}

function CustomAudioPreview({ src, label, badge, isBonus }) {
  const audioRef = useRef(null);
  const retryTimerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showEndedNotice, setShowEndedNotice] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Limpa o timer de retry na desmontagem (ver B-01 no AUDIT_REPORT.md).
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn(e));
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    if (curr >= 60) {
      audioRef.current.pause();
      audioRef.current.currentTime = 60;
      setIsPlaying(false);
      setShowEndedNotice(true);
    } else {
      if (showEndedNotice) setShowEndedNotice(false);
    }
    setCurrentTime(Math.min(curr, 60));
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(Math.min(audioRef.current.duration || 60, 60));
  };

  const handleSeek = (e) => {
    if (!audioRef.current) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleError = () => {
    // CDN ainda propagando o arquivo (ex: erro 502/404 da proxy). Tentar de novo.
    if (retryCount < 10) {
      retryTimerRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        if (audioRef.current) {
          audioRef.current.load();
        }
      }, 3000);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: isBonus ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid rgba(255,255,255,0.1)', backgroundColor: isBonus ? 'rgba(236, 72, 153, 0.03)' : 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ background: isBonus ? 'rgba(236, 72, 153, 0.2)' : 'rgba(124, 58, 237, 0.2)', color: isBonus ? '#ec4899' : 'var(--secondary)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
            {badge}
          </span>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginTop: '6px' }}>🎵 {label}</h3>
        </div>
        <span style={{ fontSize: '0.85rem', color: isBonus ? '#ec4899' : '#34d399', fontWeight: 'bold' }}>
          {isBonus ? 'Bônus Grátis Incluso ✓' : 'Incluso no Pacote ✓'}
        </span>
      </div>

      {src ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px', background: 'rgba(0, 0, 0, 0.3)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <audio 
            ref={audioRef}
            src={`${src}${src.includes('?') ? '&' : '?'}retry=${retryCount}`}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            controlsList="nodownload noplaybackrate"
            onContextMenu={(e) => e.preventDefault()}
            style={{ display: 'none' }}
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={togglePlay}
              type="button"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                border: 'none',
                background: isBonus ? 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                color: '#fff',
                fontSize: '1.2rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                flexShrink: 0
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <input 
                type="range"
                min="0"
                max={duration || 60}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                style={{
                  width: '100%',
                  accentColor: isBonus ? '#ec4899' : 'var(--primary)',
                  cursor: 'pointer'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>{formatTime(currentTime)}</span>
                <span>0:60 (Prévia Protegida)</span>
              </div>
            </div>
          </div>

          {showEndedNotice && (
            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontSize: '0.8rem', color: '#fca5a5', fontWeight: 'bold' }}>
              🔒 Prévia de 60s finalizada. Avance para liberar o download da versão completa MP3 HD!
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
          ⏳ Sintetizando áudio do estúdio...
        </div>
      )}

      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        🔒 Prévia de 60s. O áudio completo em MP3 HD sem restrições será liberado imediatamente após o pagamento.
      </span>
    </div>
  );
}

export default function CriarMusica() {
  const [step, setStep] = useState(1);
  const [orderId, setOrderId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [isRestored, setIsRestored] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);

  // Força reload da página após gerar a música para resetar o DOM e o AudioPlayer
  useEffect(() => {
    if (needsReload && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 6000); // 6s de delay para dar tempo das CDNs da Suno/Kie.ai propagarem o arquivo MP3
      return () => clearTimeout(timer);
    }
  }, [needsReload]);

  // Estados do Checkout Transparente
  const [paymentMethod, setPaymentMethod] = useState('pix'); // 'pix' | 'card'
  const [pixInfo, setPixInfo] = useState(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const [pixPollingCount, setPixPollingCount] = useState(0);

  // Polling automático de aprovação do Pix em tempo real (com fallback Firestore)
  useEffect(() => {
    let interval;
    if (pixInfo && pixInfo.paymentId && pixInfo.status !== 'approved') {
      interval = setInterval(async () => {
        setPixPollingCount(prev => prev + 1);

        // 1. Consulta a API do Mercado Pago via backend
        try {
          const res = await fetch(`/api/payments/status?paymentId=${pixInfo.paymentId}${orderId ? `&orderId=${orderId}` : ''}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'approved') {
              // A gravação em Firestore já aconteceu no servidor, dentro de /api/payments/status
              // (ver src/lib/payments.js) — o cliente nunca escreve paymentStatus (ver C-01/C-09).
              clearInterval(interval);
              setPixInfo(prev => ({ ...prev, status: 'approved' }));
              window.location.href = `/entrega?orderId=${orderId}`;
              return;
            }
          }
        } catch (err) {
          console.warn("Erro no fetch do status do PIX (tentando fallback Firestore):", err);
        }

        // 2. Fallback: verifica diretamente no Firestore se o webhook já atualizou o status
        // Executa SEMPRE, independentemente do resultado do fetch acima
        try {
          if (orderId) {
            const orderSnap = await getDoc(doc(db, 'orders', orderId));
            if (orderSnap.exists()) {
              const orderData = orderSnap.data();
              if (orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO') {
                clearInterval(interval);
                setPixInfo(prev => ({ ...prev, status: 'approved' }));
                window.location.href = `/entrega?orderId=${orderId}`;
                return;
              }
            }
          }
        } catch (fbErr) {
          console.warn("Erro no fallback Firestore do PIX:", fbErr);
        }
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [pixInfo, orderId]);
  
  const [formData, setFormData] = useState({
    // Step 1
    recipientType: '',
    // Step 2
    honoreeName: '',
    // Step 3
    relationship: '',
    // Step 4
    occasion: '',
    // Step 5
    story: '',
    importantMoments: '',
    // Step 6
    musicStyle: '',
    // Step 7
    musicMood: '',
    // Step 8
    requiredNames: '',
    requiredPhrase: '',
    voiceType: 'masculina',
    coverUrl: '', // URL do Firebase Storage (ver M-08 no AUDIT_REPORT.md — nunca base64)
    // Step 9
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    termsAccepted: false,
    // Step 10: Lyrics state
    lyrics: '',
    lyricsVersion: 1,
    lyricsStatus: 'idle', // 'idle', 'generating', 'generated', 'error'
    lyricsComment: '',
    // Step 11: Suno AI Audio state
    sunoStatus: 'idle', // 'idle', 'generating', 'generated', 'error'
    sunoProgress: '',
    sunoTracks: [],
    addVersion2: false,
    // Step 12: Pricing package
    selectedPackage: 'promo_2_musicas',
    // Step 13: Addons
    addons: {
      extraSongs2: false, // will represent version 2 addon
      photoVideo: false,
      wantsVideo: false,
      spotifyDistribution: false,
      premiumCover: false,
      qrCode: false,
      instrumentalVersion: false,
      wavFormat: false,
      priorityDelivery: false,
    }
  });

  const totalWizardSteps = 9;
  const audio1Ref = useRef(null);
  const audio2Ref = useRef(null);
  const recognitionRef = useRef(null);
  const baseStoryRef = useRef('');
  const pollIntervalRef = useRef(null);

  // Garante que o polling do Suno pare ao desmontar o componente — antes sobrevivia à navegação por
  // até 6 minutos, continuando a fazer fetch/gravações em segundo plano (ver M-10 no AUDIT_REPORT.md).
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const [paymentErrorMessage, setPaymentErrorMessage] = useState('');
  const [phoneVerifyStatus, setPhoneVerifyStatus] = useState('idle'); // 'idle' | 'checking' | 'valid' | 'invalid'
  const [phoneVerifyMessage, setPhoneVerifyMessage] = useState('');

  // Verificação de WhatsApp em tempo real via Whats Evolution API
  useEffect(() => {
    const phone = formData.customerPhone || '';
    const clean = phone.replace(/\D/g, '');

    if (clean.length < 11) {
      setPhoneVerifyStatus('idle');
      setPhoneVerifyMessage(clean.length > 0 ? 'Digite o DDD + 9 dígitos do seu celular' : '');
      return;
    }

    setPhoneVerifyStatus('checking');
    setPhoneVerifyMessage('⏳ Verificando conta no WhatsApp...');

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/whatsapp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: clean })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.exists) {
            setPhoneVerifyStatus('valid');
            setPhoneVerifyMessage('✓ WhatsApp ativo e verificado!');
          } else {
            setPhoneVerifyStatus('invalid');
            setPhoneVerifyMessage('❌ Este número não possui WhatsApp ativo');
          }
        } else {
          // Falha fechada: se o serviço de verificação não respondeu, não tratamos como validado
          // (ver M-15 no AUDIT_REPORT.md — antes qualquer erro de rede liberava o número como válido).
          setPhoneVerifyStatus('unknown');
          setPhoneVerifyMessage('⚠️ Não foi possível verificar agora. Confira o número e tente novamente.');
        }
      } catch (err) {
        setPhoneVerifyStatus('unknown');
        setPhoneVerifyMessage('⚠️ Não foi possível verificar agora. Confira o número e tente novamente.');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.customerPhone]);

  // Restore draft from localStorage on load & check URL query params for payment failure
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Checar retorno de pagamento cancelado/falho do Mercado Pago
        const urlParams = new URLSearchParams(window.location.search);
        const statusParam = urlParams.get('status');
        const collectionStatus = urlParams.get('collection_status');
        const resetParam = urlParams.get('reset') || urlParams.get('new');

        if (resetParam === 'true' || resetParam === '1') {
          localStorage.removeItem('nsmusic_order_draft');
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsRestored(true);
          return;
        }

        if (statusParam === 'failure' || statusParam === 'null' || collectionStatus === 'null') {
          setPaymentErrorMessage('⚠️ O pagamento no Mercado Pago não foi concluído ou foi cancelado. Você pode tentar novamente abaixo ou via PIX.');
          setStep(12);
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        const saved = localStorage.getItem('nsmusic_order_draft');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.formData) setFormData(parsed.formData);
          if (parsed.orderId) setOrderId(parsed.orderId);
          if (parsed.taskId) setTaskId(parsed.taskId);
          if (parsed.step) setStep(parsed.step >= 12 ? 12 : parsed.step);

          const savedTaskId = parsed.taskId;
          const currentOrderId = parsed.orderId;

          // Se estava aguardando áudio ou tem um taskId pendente
          if (savedTaskId && parsed.formData?.sunoStatus !== 'generated') {
            pollSunoStatus(savedTaskId, currentOrderId);
          } else if (currentOrderId && parsed.formData?.sunoStatus !== 'generated' && parsed.step >= 10) {
            checkOrderStatusInFirestore(currentOrderId, savedTaskId);
          }
        }
      } catch (e) {
        console.warn("Erro ao restaurar rascunho:", e);
      } finally {
        setIsRestored(true);
      }
    }
  }, []);

  // Persist draft to localStorage on state changes
  useEffect(() => {
    if (typeof window !== 'undefined' && isRestored) {
      try {
        const draft = { step, orderId, taskId, formData };
        localStorage.setItem('nsmusic_order_draft', JSON.stringify(draft));
      } catch (e) {
        console.warn("Erro ao salvar rascunho:", e);
      }
    }
  }, [step, orderId, taskId, formData, isRestored]);

  const checkOrderStatusInFirestore = async (targetOrderId, activeTaskId) => {
    try {
      const docRef = doc(db, 'orders', targetOrderId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.audioFiles && data.audioFiles.length > 0) {
          const tracks = data.audioFiles.map(url => ({ audio_url: url }));
          setFormData(prev => ({
            ...prev,
            sunoTracks: tracks,
            sunoStatus: 'generated'
          }));
          return;
        }
      }
    } catch (err) {
      console.warn("Erro ao verificar Firestore no recarregamento:", err);
    }
    if (activeTaskId) {
      pollSunoStatus(activeTaskId, targetOrderId);
    }
  };

  const handleResetForm = () => {
    if (confirm("Deseja realmente reiniciar o formulário e apagar o rascunho atual?")) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nsmusic_order_draft');
      }
      window.location.reload();
    }
  };

  // Extrai a URL bruta do áudio (para salvar no Firestore e uso interno)
  const getRawAudioUrl = (track) => {
    if (!track) return '';
    if (typeof track === 'string') return track;
    return track.sourceAudioUrl || track.audioUrl || track.audio_url || track.streamAudioUrl || track.sourceStreamAudioUrl || track.stream_url || track.url || track.audioFile || track.cdn_url || '';
  };

  // URL de reprodução via proxy (resolve bloqueio do Suno CDN no navegador)
  const getAudioUrl = (track) => {
    const raw = getRawAudioUrl(track);
    if (!raw) return '';
    if (raw.startsWith('blob:') || raw.startsWith('/api/')) return raw;
    return `/api/audio/proxy?url=${encodeURIComponent(raw)}`;
  };

  // Passos de carregamento dinâmico no estúdio de composição de letra (Step 10)
  const [lyricsStepIdx, setLyricsStepIdx] = useState(0);
  const studioLyricsPhrases = [
    "✍️ Analisando sua história e conectando memórias emocionais...",
    "🎵 Escrevendo versos poéticos, estrutura e rimas marcantes...",
    "🎼 Lapidando o refrão exclusivo e ajustando a harmonia da letra..."
  ];

  useEffect(() => {
    let interval;
    if (formData.lyricsStatus === 'generating') {
      interval = setInterval(() => {
        setLyricsStepIdx(prev => (prev + 1) % studioLyricsPhrases.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [formData.lyricsStatus]);

  // Passos de carregamento dinâmico no estúdio de produção musical (Step 11)
  const [audioStepIdx, setAudioStepIdx] = useState(0);
  const studioAudioPhrases = [
    "🎸 Compondo arranjos de instrumentos e base harmônica em estúdio...",
    "🎤 Gravando vocais e ajustando afinação e interpretação...",
    "🎚️ Executando mixagem profissional e masterização em alta definição 4K HD...",
    "🎧 Finalizando os últimos detalhes dos 2 arranjos exclusivos..."
  ];

  useEffect(() => {
    let interval;
    if (formData.sunoStatus === 'generating') {
      interval = setInterval(() => {
        setAudioStepIdx(prev => (prev + 1) % studioAudioPhrases.length);
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [formData.sunoStatus]);

  // Pacote promocional fixo de R$ 9,99 com 2 músicas inclusas
  const [packagesList, setPackagesList] = useState([
    { 
      id: 'promo_2_musicas', 
      name: '🎁 Pacote Promocional Especial (2 Músicas Completas Inclusas)', 
      price: 9.99, 
      originalPrice: 69.90,
      desc: '2 Músicas Personalizadas em Estilos Diferentes + Arquivo MP3 HD + Capa Digital' 
    }
  ]);

  const [addonsConfig, setAddonsConfig] = useState([
    { id: 'photoVideo', name: '🎥 Vídeo com fotos (sincronizado com a música)', price: 9.99 },
    { id: 'spotifyDistribution', name: '🎧 Publicação no Spotify e plataformas de streaming', price: 9.99 },
    { id: 'premiumCover', name: '🖼️ Capa Premium personalizada profissional', price: 9.99 },
    { id: 'qrCode', name: '📱 QR Code da música para cartões e presentes', price: 9.99 },
    { id: 'instrumentalVersion', name: '🎤 Versão Instrumental (Sem voz - para karaokê)', price: 9.99 },
    { id: 'wavFormat', name: '💿 Áudio em formato WAV (Qualidade de estúdio)', price: 9.99 },
    { id: 'priorityDelivery', name: '🚀 Entrega Prioritária em até 24 horas', price: 9.99 },
  ]);

  // Valor promocional dinâmico: R$ 9,99 (só música) ou R$ 16,89 (música + vídeo)
  const getSelectedPackagePrice = () => 9.99;
  const getVideoAddonPrice = () => formData.addons?.wantsVideo ? 6.90 : 0;
  const getAddonsPrice = () => getVideoAddonPrice();
  const getTotalPrice = () => 9.99 + getVideoAddonPrice();

  // Configuration options
  const recipients = [
    { id: 'Namorada', label: 'Namorada', icon: '💖' },
    { id: 'Esposa', label: 'Esposa', icon: '💍' },
    { id: 'Namorado', label: 'Namorado', icon: '❤️' },
    { id: 'Marido', label: 'Marido', icon: '💑' },
    { id: 'Mãe', label: 'Mãe', icon: '👩' },
    { id: 'Pai', label: 'Pai', icon: '👨' },
    { id: 'Vó', label: 'Vó', icon: '👵' },
    { id: 'Vô', label: 'Vô', icon: '👴' },
    { id: 'Filha', label: 'Filha', icon: '👧' },
    { id: 'Filho', label: 'Filho', icon: '👦' },
    { id: 'Amiga', label: 'Amiga', icon: '💛' },
    { id: 'Amigo', label: 'Amigo', icon: '🤝' },
    { id: 'Chefe', label: 'Chefe', icon: '💼' },
    { id: 'Eu mesmo', label: 'Eu mesmo', icon: '🎤' },
    { id: 'Outro', label: 'Outro', icon: '🎵' },
  ];

  const relationshipsEuSouO = [
    { id: 'Esposo', label: 'Esposo' },
    { id: 'Filho', label: 'Filho' },
    { id: 'Namorado', label: 'Namorado' },
    { id: 'Amigo', label: 'Amigo' },
    { id: 'Pai', label: 'Pai' },
    { id: 'Neto', label: 'Neto' },
  ];

  const relationshipsEuSouA = [
    { id: 'Esposa', label: 'Esposa' },
    { id: 'Filha', label: 'Filha' },
    { id: 'Namorada', label: 'Namorada' },
    { id: 'Amiga', label: 'Amiga' },
    { id: 'Mãe', label: 'Mãe' },
    { id: 'Neta', label: 'Neta' },
  ];

  const occasions = [
    { id: 'Aniversário', label: 'Aniversário', icon: '🎂' },
    { id: 'Aniv. de Casamento', label: 'Aniv. de Casamento', icon: '💎' },
    { id: 'Dia dos Namorados', label: 'Dia dos Namorados', icon: '💝' },
    { id: 'Dia das Mães', label: 'Dia das Mães', icon: '🌷' },
    { id: 'Declaração de Amor', label: 'Declaração de Amor', icon: '💌' },
    { id: 'Pedido de Namoro', label: 'Pedido de Namoro', icon: '💍' },
    { id: 'Surpresa', label: 'Surpresa', icon: '🎁' },
    { id: 'Homenagem', label: 'Homenagem', icon: '🌟' },
    { id: 'Aniversário de Namoro', label: 'Aniversário de Namoro', icon: '💑' },
    { id: 'Formatura', label: 'Formatura', icon: '🎓' },
    { id: 'Chá Revelação', label: 'Chá Revelação', icon: '👶' },
    { id: 'Outro', label: 'Outro', icon: '✨' },
  ];

  const stylesList = [
    { id: 'Romântica', label: 'Romântica', icon: '💖', desc: 'Ritmo amoroso e cativante' },
    { id: 'Sertanejo', label: 'Sertanejo', icon: '🤠', desc: 'Estilo romântico ou universitário' },
    { id: 'Pop', label: 'Pop', icon: '⚡', desc: 'Moderno, jovem e dançante' },
    { id: 'Rock', label: 'Rock', icon: '🎸', desc: 'Atitude com guitarras marcantes' },
    { id: 'MPB / Bossa Nova', label: 'MPB / Bossa Nova', icon: '☕', desc: 'Estilo clássico e intimista' },
    { id: 'Gospel / Adoração', label: 'Gospel / Adoração', icon: '⛪', desc: 'Mensagem de fé e inspiração' },
    { id: 'Samba / Pagode', label: 'Samba / Pagode', icon: '🥁', desc: 'Descontraído e alegre' },
    { id: 'Folk Acústico', label: 'Folk Acústico', icon: '🪵', desc: 'Voz e violão aconchegante' },
    { id: 'Forró / Baião', label: 'Forró / Baião', icon: '🪗', desc: 'Ritmo nordestino alegre e envolvente' },
    { id: 'Trap / Rap', label: 'Trap / Rap', icon: '🎙️', desc: 'Batidas urbanas modernas' },
    { id: 'Reggae', label: 'Reggae', icon: '🌴', desc: 'Vibe positiva e relaxada' },
    { id: 'Lo-Fi Chill', label: 'Lo-Fi Chill', icon: '🎧', desc: 'Melodias suaves e tranquilas' }
  ];

  const moods = [
    { id: 'Alegre', label: 'Alegre', icon: '☀️', desc: 'Ritmo contagioso e alto astral' },
    { id: 'Emocionante', label: 'Emocionante', icon: '🥺', desc: 'Para tocar o coração e fazer chorar' },
    { id: 'Energética', label: 'Energética', icon: '🔥', desc: 'Vibe vibrante e cheia de ritmo' },
    { id: 'Calma', label: 'Calma', icon: '🍃', desc: 'Suave, relaxante e acolhedora' },
    { id: 'Nostálgica', label: 'Nostálgica', icon: '🍂', desc: 'Recordações marcantes e saudades' },
    { id: 'Romântica', label: 'Romântica', icon: '💖', desc: 'Declaração amorosa e carinhosa' },
    { id: 'Festiva', label: 'Festiva', icon: '🎉', desc: 'Clima de celebração e festa' },
    { id: 'Inspiradora', label: 'Inspiradora', icon: '✨', desc: 'Mensagem de superação e motivação' }
  ];

  // Gerenciamento de Tema Claro / Escuro
  const [theme, setTheme] = useState('dark');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('nsmusic_theme') || 'dark';
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('nsmusic_theme', nextTheme);
  };

  // Ditado por Voz (Web Speech API) sem duplicação de texto no mobile
  const [isListening, setIsListening] = useState(false);

  const toggleVoiceDictation = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Seu navegador não possui suporte ao recurso de voz. Por favor, digite a história.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false; // Em celulares, evita duplicação de frases em loop
      recognition.interimResults = false; // Apenas grava quando o trecho for finalizado
      recognitionRef.current = recognition;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event) => {
        let textRecorded = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            textRecorded += event.results[i][0].transcript + ' ';
          }
        }
        textRecorded = textRecorded.trim();
        if (textRecorded) {
          setFormData(prev => ({
            ...prev,
            story: prev.story ? `${prev.story.trim()} ${textRecorded}` : textRecorded
          }));
        }
      };

      recognition.start();
    } catch (err) {
      console.warn("Erro ao iniciar ditado de voz:", err);
      setIsListening(false);
    }
  };

  // Parar gravação de voz automaticamente se o usuário mudar de etapa ou se o step não for 5
  useEffect(() => {
    if (step !== 5 && isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Erro ao parar ditado de voz ao sair da etapa 5:", e);
        }
      }
      setIsListening(false);
    }
  }, [step, isListening]);

  // Sugestões de texto rápido para inspirar a história
  const appendStoryPrompt = (promptText) => {
    setFormData(prev => ({
      ...prev,
      story: (prev.story ? prev.story + '\n\n' : '') + promptText
    }));
  };

  // Helper functions
  const updateField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Seleção com Avanço Automático para a próxima etapa
  const selectFieldAndAdvance = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setTimeout(() => {
      setStep(prevStep => Math.min(prevStep + 1, totalWizardSteps));
    }, 150);
  };

  const handlePhoneChange = (value) => {
    const clean = value.replace(/\D/g, '');
    let formatted = clean;
    if (clean.length > 0) {
      formatted = `(${clean.slice(0, 2)}`;
    }
    if (clean.length > 2) {
      formatted += `) ${clean.slice(2, 7)}`;
    }
    if (clean.length > 7) {
      formatted += `-${clean.slice(7, 11)}`;
    }
    updateField('customerPhone', formatted);
  };

  const isPhoneValid = (phone) => {
    const clean = (phone || '').replace(/\D/g, '');
    if (clean.length !== 11) return false;
    // Bloqueia durante verificação e quando inválido
    return phoneVerifyStatus === 'valid';
  };

  const updateAddon = (id, value) => {
    setFormData(prev => ({
      ...prev,
      addons: { ...prev.addons, [id]: value }
    }));
  };

  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("A imagem selecionada é muito grande. Escolha uma imagem de até 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Faz upload para o Firebase Storage em vez de gravar base64 no Firestore — um documento tem
        // limite de 1 MiB, e o base64 também estourava o payload de /api/lyrics/generate no Safari
        // (ver M-08 no AUDIT_REPORT.md).
        canvas.toBlob(async (blob) => {
          if (!blob) {
            alert("Não foi possível processar a imagem. Tente novamente.");
            return;
          }
          setIsUploadingCover(true);
          try {
            const fileName = `draft_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
            const fileRef = ref(storage, `covers/${fileName}`);
            await uploadBytes(fileRef, blob);
            const url = await getDownloadURL(fileRef);
            updateField('coverUrl', url);
          } catch (err) {
            console.error("Erro ao enviar capa para o Storage:", err);
            alert("Falha ao enviar a foto de capa. Tente novamente.");
          } finally {
            setIsUploadingCover(false);
          }
        }, 'image/jpeg', 0.82);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const [showLimitModal, setShowLimitModal] = useState(false);

  // Checa se o usuário que nunca comprou já atingiu o limite de 5 músicas geradas
  const checkUserLimit = async (phone, email) => {
    try {
      let localGenerated = [];
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('nsmusic_generated_orders');
        if (saved) {
          try { localGenerated = JSON.parse(saved); } catch (e) {}
        }
      }

      let totalCount = Array.isArray(localGenerated) ? localGenerated.length : 0;
      let hasPaid = false;

      if (db) {
        const ordersRef = collection(db, 'orders');
        let fetchedOrders = [];

        if (phone && phone.replace(/\D/g, '').length >= 10) {
          const qPhone = query(ordersRef, where('customerPhone', '==', phone));
          const snap = await getDocs(qPhone).catch(() => null);
          if (snap && !snap.empty) {
            snap.forEach(d => { if (!d.data().deletedAt) fetchedOrders.push(d.data()); });
          }
        }

        if (email && email.includes('@')) {
          const qEmail = query(ordersRef, where('customerEmail', '==', email));
          const snapEmail = await getDocs(qEmail).catch(() => null);
          if (snapEmail && !snapEmail.empty) {
            snapEmail.forEach(d => {
              const data = d.data();
              if (data.deletedAt) return;
              if (!fetchedOrders.some(o => o.orderNumber === data.orderNumber)) {
                fetchedOrders.push(data);
              }
            });
          }
        }

        if (fetchedOrders.length > 0) {
          totalCount = Math.max(totalCount, fetchedOrders.length);
          hasPaid = fetchedOrders.some(o => 
            o.paymentStatus === 'PAGO' || 
            o.paymentStatus === 'PAGAMENTO_APROVADO' || 
            o.paymentStatus === 'approved'
          );
        }
      }

      return { totalCount, hasPaid, isBlocked: !hasPaid && totalCount >= 5 };
    } catch (e) {
      console.warn("Erro ao verificar limite de gerações:", e);
      return { totalCount: 0, hasPaid: false, isBlocked: false };
    }
  };

  // Função para reiniciar o formulário e criar uma nova música do zero (com trava de 5 músicas para não pagantes)
  const handleCreateNewSongFromScratch = async () => {
    const { isBlocked } = await checkUserLimit(formData.customerPhone, formData.customerEmail);

    if (isBlocked) {
      setShowLimitModal(true);
      return;
    }

    if (confirm("Deseja criar uma nova música do zero? O progresso da composição atual será limpo.")) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nsmusic_order_draft');
      }
      setOrderId('');
      setTaskId('');
      setFormData({
        recipientType: '',
        honoreeName: '',
        relationship: '',
        occasion: '',
        story: '',
        importantMoments: '',
        musicStyle: '',
        musicMood: '',
        requiredNames: '',
        requiredPhrase: '',
        voiceType: 'masculina',
        coverUrl: '',
        customerName: formData.customerName || '',
        customerPhone: formData.customerPhone || '',
        customerEmail: formData.customerEmail || '',
        termsAccepted: false,
        lyrics: '',
        lyricsVersion: 1,
        lyricsStatus: 'idle',
        lyricsComment: '',
        sunoStatus: 'idle',
        sunoProgress: '',
        sunoTracks: [],
        addVersion2: false,
        selectedPackage: 'promo_2_musicas',
        addons: {
          extraSongs2: false,
          photoVideo: false,
          spotifyDistribution: false,
          premiumCover: false,
          qrCode: false,
          instrumentalVersion: false,
          wavFormat: false,
          priorityDelivery: false,
        }
      });
      setStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Step 9: Save Order to Firestore first, then trigger lyrics generation
  const handleSaveAndGenerateLyrics = async () => {
    // Verifica trava de 5 prévias para usuários que nunca compraram
    const { isBlocked } = await checkUserLimit(formData.customerPhone, formData.customerEmail);
    if (isBlocked) {
      setShowLimitModal(true);
      return;
    }

    setStep(10);
    // Se a letra já foi gerada com sucesso anteriormente, apenas exibe a letra existente sem fazer nova requisição
    if (formData.lyricsStatus === 'generated' && formData.lyrics) {
      return;
    }

    updateField('lyricsStatus', 'generating');
    try {
      // Criação segura do pedido no Firestore via API Backend (Server-Side)
      let currentOrderId = orderId;
      try {
        const orderRes = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          if (orderData.orderId) {
            currentOrderId = orderData.orderId;
            setOrderId(orderData.orderId);
            if (typeof window !== 'undefined') {
              try {
                const saved = localStorage.getItem('nsmusic_generated_orders');
                const arr = saved ? JSON.parse(saved) : [];
                if (!arr.includes(orderData.orderId)) {
                  arr.push(orderData.orderId);
                  localStorage.setItem('nsmusic_generated_orders', JSON.stringify(arr));
                }
              } catch (e) {}
            }
          }
        } else if (orderRes.status === 403) {
          // Trava de músicas grátis reforçada no servidor (ver A-11) — o cliente já verifica isso
          // antes de chegar aqui, mas se ainda assim for bloqueado, não prossegue para gerar a letra.
          updateField('lyricsStatus', 'idle');
          setShowLimitModal(true);
          return;
        }
      } catch (orderErr) {
        console.error("Erro ao criar pedido via API Backend:", orderErr);
      }

      // Call lyrics generation with lightweight text payload (stripping Base64 coverUrl to prevent Safari Load failed errors)
      const { coverUrl, ...lightweightFormData } = formData;

      const response = await fetch('/api/lyrics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lightweightFormData)
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          lyrics: data.lyrics,
          lyricsStatus: 'generated',
          lyricsError: ''
        }));

        if (currentOrderId) {
          await updateDoc(doc(db, 'orders', currentOrderId), { lyrics: data.lyrics }).catch(e => console.warn(e));
        }

        if (typeof window !== 'undefined' && window.fbq) {
          window.fbq('trackCustom', 'GenerateLyrics');
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao gerar letra.');
      }
    } catch (err) {
      console.error("Erro na geração da letra:", err);
      setFormData(prev => ({
        ...prev,
        lyricsStatus: 'error',
        lyricsError: err.message
      }));
    }
  };

  const generateLyrics = async () => {
    // Legacy helper trigger, handled inside handleSaveAndGenerateLyrics
  };

  const requestLyricsAdjustment = async () => {
    if (!formData.lyricsComment.trim()) return;
    updateField('lyricsStatus', 'generating');
    try {
      const response = await fetch('/api/lyrics/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentLyrics: formData.lyrics,
          comment: formData.lyricsComment,
          formData
        })
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          lyrics: data.lyrics,
          lyricsStatus: 'generated',
          lyricsVersion: prev.lyricsVersion + 1,
          lyricsComment: ''
        }));
        // Update lyrics version in Firestore
        if (orderId) {
          await updateDoc(doc(db, 'orders', orderId), { lyrics: data.lyrics });
        }
      } else {
        throw new Error('Falha ao ajustar');
      }
    } catch (err) {
      console.error(err);
      updateField('lyricsStatus', 'generated');
    }
  };

  // Step 10 Approval -> Move to Audio Generation preview screen (Step 11)
  const handleApproveLyrics = async () => {
    setStep(11);
    // Se as músicas já foram geradas com sucesso anteriormente, apenas navega sem regenerar
    if (formData.sunoStatus === 'generated' && formData.sunoTracks && formData.sunoTracks.length > 0) {
      if (orderId) window.location.href = `/entrega?orderId=${orderId}`;
      return;
    }

    updateField('sunoStatus', 'generating');
    updateField('sunoProgress', 'Enviando composição de letra ao Suno AI...');

    try {
      let activeOrderId = orderId;
      if (!activeOrderId) {
        try {
          const createRes = await fetch('/api/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...formData,
              userId: auth.currentUser ? auth.currentUser.uid : null
            })
          });
          if (createRes.ok) {
            const createData = await createRes.json();
            if (createData.orderId) {
              activeOrderId = createData.orderId;
              setOrderId(createData.orderId);
            }
          } else if (createRes.status === 403) {
            updateField('sunoStatus', 'idle');
            setShowLimitModal(true);
            return;
          }
        } catch (e) {
          console.error("Erro ao criar pedido emergencial antes do Suno:", e);
        }
      }

      const response = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildSunoPayload(formData),
          orderId: activeOrderId
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao acionar a API do Suno.');
      }

      const data = await response.json();
      
      if (!data.taskId) {
        throw new Error('Nenhum taskId retornado pela API.');
      }

      setTaskId(data.taskId);

      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('trackCustom', 'GenerateMusic');
      }

      // Poll status for completing audio rendering
      pollSunoStatus(data.taskId, activeOrderId);
    } catch (err) {
      console.error("Erro na chamada do Suno:", err);
      updateField('sunoStatus', 'error');
      updateField('sunoProgress', err.message);
    }
  };

  const pollSunoStatus = (activeTaskId, activeOrderId = orderId) => {
    let attempts = 0;
    const maxAttempts = 72; // 360 seconds (6 minutos) max
    updateField('sunoStatus', 'generating');
    updateField('sunoProgress', 'Aguardando o Suno compor e renderizar os áudios (2 a 4 min)...');

    // Só um polling ativo por vez — cancela qualquer intervalo anterior antes de iniciar outro.
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const targetOrder = activeOrderId || orderId;
        const res = await fetch(`/api/suno/status?taskId=${activeTaskId}&orderId=${targetOrder || ''}`);
        if (res.ok) {
          const statusData = await res.json();

          if (statusData.status === 'COMPLETED' && statusData.tracks && statusData.tracks.length > 0) {
            setFormData(prev => ({
              ...prev,
              sunoTracks: statusData.tracks,
              sunoStatus: 'generated'
            }));
            clearInterval(pollIntervalRef.current);

            // Garante que o documento do pedido em orders no Firebase receba os links reais dos áudios
            if (targetOrder) {
              const primaryAudio = getRawAudioUrl(statusData.tracks[0]);
              const audioFiles = statusData.tracks.map(getRawAudioUrl).filter(Boolean);
              await updateDoc(doc(db, 'orders', targetOrder), {
                audioUrl: primaryAudio,
                audioFiles: audioFiles,
                productionStatus: 'AUDIO_GERADO',
                updatedAt: new Date().toISOString()
              }).catch(e => console.warn("Aviso ao atualizar ordem no Firebase:", e));

              // Dispara a notificação de WhatsApp via backend
              fetch('/api/whatsapp/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: targetOrder })
              }).catch(e => console.warn("Erro ao notificar WhatsApp:", e));
              
              // Redireciona imediatamente para a página de entrega quando finalizado
              window.location.href = `/entrega?orderId=${targetOrder}`;
            }
          } else {
            updateField('sunoProgress', `Estúdio produzindo arranjos...`);
          }
        }
      } catch (err) {
        console.error(err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollIntervalRef.current);
        updateField('sunoStatus', 'error');
        updateField('sunoProgress', 'Não foi possível concluir em tempo real. Os áudios serão enviados manualmente.');
      }
    }, 5000);
  };

  // Time update handler to lock playback of previews to 60 seconds
  const handleAudioTimeUpdate = (e, playerIdx) => {
    const audio = e.target;
    if (audio.currentTime > 60) {
      audio.pause();
      audio.currentTime = 60;
      alert("🔒 Prévia de 60 segundos finalizada! Efetue o pagamento para liberar a música completa e fazer o download.");
    }
  };

  const nextStep = () => {
    setStep(prev => prev + 1);
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const isNextDisabled = () => {
    if (step === 1 && !formData.recipientType) return true;
    if (step === 2 && !formData.honoreeName) return true;
    if (step === 3 && !formData.relationship) return true;
    if (step === 4 && !formData.occasion) return true;
    if (step === 5 && formData.story.length < 50) return true;
    if (step === 6 && !formData.musicStyle) return true;
    if (step === 7 && !formData.musicMood) return true;
    if (step === 9 && (!formData.customerName || !isPhoneValid(formData.customerPhone) || !formData.termsAccepted)) return true;
    if (step === 10 && formData.lyricsStatus !== 'generated') return true;
    if (step === 11 && formData.sunoStatus !== 'generated') return true;
    if (step === 12 && !formData.selectedPackage) return true;
    return false;
  };

  const renderWizardStep = () => {
    switch (step) {
      case 1:
        return (
          <div>
            <h1 style={styles.stepTitle}>Quem vai RECEBER a música?</h1>
            <p style={styles.stepSubtitle}>Escolha a pessoa que será homenageada — ao clicar, a tela avança automaticamente!</p>
            <div style={styles.gridCards}>
              {recipients.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => selectFieldAndAdvance('recipientType', item.id)}
                  style={{
                    ...styles.wizardCard,
                    borderColor: formData.recipientType === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: formData.recipientType === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  {formData.recipientType === item.id && <div style={styles.checkCircle}>✓</div>}
                  <span style={{ fontSize: '2.2rem', marginBottom: '10px' }}>{item.icon}</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '600' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h1 style={styles.stepTitle}>Qual o nome de quem vai RECEBER a música?</h1>
            <p style={styles.stepSubtitle}>Coloque o nome ou apelido de quem vai receber a homenagem. Esse nome vai aparecer na letra da música.</p>
            <input 
              type="text" 
              value={formData.honoreeName}
              onChange={(e) => updateField('honoreeName', e.target.value)}
              placeholder="Digite o nome..." 
              style={styles.wizardInput}
            />
          </div>
        );
      case 3:
        return (
          <div>
            <h1 style={styles.stepTitle}>Qual seu parentesco com essa pessoa?</h1>
            <p style={styles.stepSubtitle}>Selecione quem é VOCÊ em relação a quem vai receber a música</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '30px', marginTop: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)', marginBottom: '16px', textAlign: 'center', fontWeight: '800' }}>🧔 Eu sou o...</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {relationshipsEuSouO.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectFieldAndAdvance('relationship', item.id)}
                      style={{
                        ...styles.wizardListBtn,
                        borderColor: formData.relationship === item.id ? 'var(--primary)' : 'var(--border-color)',
                        backgroundColor: formData.relationship === item.id ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                        color: formData.relationship === item.id ? 'var(--primary)' : 'var(--text-primary)',
                        boxShadow: formData.relationship === item.id ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--secondary)', marginBottom: '16px', textAlign: 'center', fontWeight: '800' }}>👩 Eu sou a...</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {relationshipsEuSouA.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectFieldAndAdvance('relationship', item.id)}
                      style={{
                        ...styles.wizardListBtn,
                        borderColor: formData.relationship === item.id ? 'var(--secondary)' : 'var(--border-color)',
                        backgroundColor: formData.relationship === item.id ? 'rgba(236, 72, 153, 0.08)' : '#FFFFFF',
                        color: formData.relationship === item.id ? 'var(--secondary)' : 'var(--text-primary)',
                        boxShadow: formData.relationship === item.id ? '0 4px 14px rgba(236, 72, 153, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button
                onClick={() => selectFieldAndAdvance('relationship', 'Outro')}
                style={{
                  ...styles.wizardListBtn,
                  width: '180px',
                  borderColor: formData.relationship === 'Outro' ? 'var(--primary)' : 'var(--border-color)',
                  backgroundColor: formData.relationship === 'Outro' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                  color: formData.relationship === 'Outro' ? 'var(--primary)' : 'var(--text-primary)',
                }}
              >
                Outro
              </button>
            </div>
          </div>
        );
      case 4:
        return (
          <div>
            <h1 style={styles.stepTitle}>Qual a ocasião?</h1>
            <p style={styles.stepSubtitle}>Escolha o momento que você quer eternizar</p>
            <div style={styles.gridCards}>
              {occasions.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => selectFieldAndAdvance('occasion', item.id)}
                  style={{
                    ...styles.wizardCard,
                    borderColor: formData.occasion === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: formData.occasion === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  {formData.occasion === item.id && <div style={styles.checkCircle}>✓</div>}
                  <span style={{ fontSize: '2.2rem', marginBottom: '10px' }}>{item.icon}</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '600', textAlign: 'center' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div style={{ maxWidth: '750px', margin: '0 auto' }}>
            <h1 style={styles.stepTitle}>Conte sua história 📜</h1>
            <p style={styles.stepSubtitle}>Digite ou use o microfone para contar os detalhes. Faremos uma composição inesquecível!</p>
            
            {/* Barra de Ferramentas de Voz e Sugestões Rápida */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={toggleVoiceDictation}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: isListening ? '2px solid #ef4444' : '1px solid var(--primary)',
                  background: isListening ? 'rgba(239, 68, 68, 0.2)' : 'rgba(124, 58, 237, 0.15)',
                  color: isListening ? '#fca5a5' : '#c4b5fd',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isListening ? '⏹ Gravando... (Fale Agora)' : '🎙️ Ditar por Voz (Gravar Fala)'}
              </button>

              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sugestões rápidas:</span>

              <button
                type="button"
                onClick={() => appendStoryPrompt("Nos conhecemos em um momento marcante de nossas vidas e desde então não nos separamos mais.")}
                style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                💡 Como nos conhecemos
              </button>

              <button
                type="button"
                onClick={() => appendStoryPrompt("As maiores virtudes dessa pessoa são a bondade, o sorriso contagiante e a dedicação à família.")}
                style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                💡 Qualidades e virtudes
              </button>

              <button
                type="button"
                onClick={() => appendStoryPrompt("Quero expressar minha gratidão por cada segundo ao lado dela e reafirmar meu amor eterno.")}
                style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                💡 Declaração de Amor
              </button>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={styles.wizardLabel}>Sua história *</label>
              <textarea 
                value={formData.story}
                onChange={(e) => updateField('story', e.target.value)}
                placeholder="Como vocês se conheceram? Qual o momento mais especial? O que essa pessoa significa pra você? (Ou clique no microfone acima para falar)"
                style={{ ...styles.wizardTextarea, height: '140px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: formData.story.length >= 50 ? 'var(--success)' : 'var(--danger)' }}>
                  {formData.story.length < 50 ? `Mínimo de 50 caracteres (faltam ${50 - formData.story.length})` : 'Tamanho ideal atingido ✓'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formData.story.length}/2000</span>
              </div>
            </div>

            <div>
              <label style={styles.wizardLabel}>Momentos especiais para mencionar (opcional)</label>
              <textarea 
                value={formData.importantMoments}
                onChange={(e) => updateField('importantMoments', e.target.value)}
                placeholder="Ex: primeiro encontro no parque, viagem para a praia, pedido de casamento..."
                style={{ ...styles.wizardTextarea, height: '100px' }}
              />
            </div>
          </div>
        );
      case 6:
        return (
          <div>
            <h1 style={styles.stepTitle}>Gênero musical</h1>
            <p style={styles.stepSubtitle}>Selecione o ritmo ideal para a sua canção</p>
            <div style={styles.gridCards2}>
              {stylesList.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => selectFieldAndAdvance('musicStyle', item.id)}
                  style={{
                    ...styles.wizardCardLarge,
                    borderColor: formData.musicStyle === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: formData.musicStyle === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  {formData.musicStyle === item.id && <div style={styles.checkCircle}>✓</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '2.2rem' }}>{item.icon}</span>
                    <div style={{ textAlign: 'left' }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: '700' }}>{item.label}</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 7:
        return (
          <div>
            <h1 style={styles.stepTitle}>Clima da música</h1>
            <p style={styles.stepSubtitle}>Qual o clima que a música deve transmitir?</p>
            <div style={styles.gridCards2}>
              {moods.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => selectFieldAndAdvance('musicMood', item.id)}
                  style={{
                    ...styles.wizardCardLarge,
                    borderColor: formData.musicMood === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: formData.musicMood === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  {formData.musicMood === item.id && <div style={styles.checkCircle}>✓</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '2.2rem' }}>{item.icon}</span>
                    <div style={{ textAlign: 'left' }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: '700' }}>{item.label}</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 8:
        return (
          <div style={{ maxWidth: '650px', margin: '0 auto' }}>
            <h1 style={styles.stepTitle}>Detalhes finais</h1>
            <p style={styles.stepSubtitle}>Últimos ajustes para personalizar ainda mais sua música</p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={styles.wizardLabel}>Nomes que devem aparecer na música</label>
              <input 
                type="text" 
                value={formData.requiredNames}
                onChange={(e) => updateField('requiredNames', e.target.value)}
                placeholder="Ex: João e Maria" 
                style={styles.wizardInput}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={styles.wizardLabel}>Frase especial para incluir (opcional)</label>
              <input 
                type="text" 
                value={formData.requiredPhrase}
                onChange={(e) => updateField('requiredPhrase', e.target.value)}
                placeholder="Ex: Te amo mais que ontem e menos que amanhã" 
                style={styles.wizardInput}
              />
            </div>

            <div>
              <label style={styles.wizardLabel}>Tipo de voz da música (quem vai cantar)</label>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => updateField('voiceType', 'masculina')}
                  style={{
                    ...styles.voiceBtn,
                    borderColor: formData.voiceType === 'masculina' ? 'var(--primary)' : 'var(--border-color)',
                    backgroundColor: formData.voiceType === 'masculina' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                    color: formData.voiceType === 'masculina' ? 'var(--primary)' : 'var(--text-primary)',
                    boxShadow: formData.voiceType === 'masculina' ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  🎤 Masculina
                </button>
                <button
                  type="button"
                  onClick={() => updateField('voiceType', 'feminina')}
                  style={{
                    ...styles.voiceBtn,
                    borderColor: formData.voiceType === 'feminina' ? 'var(--primary)' : 'var(--border-color)',
                    backgroundColor: formData.voiceType === 'feminina' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                    color: formData.voiceType === 'feminina' ? 'var(--primary)' : 'var(--text-primary)',
                    boxShadow: formData.voiceType === 'feminina' ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  🎤 Feminina
                </button>
                <button
                  type="button"
                  onClick={() => updateField('voiceType', 'dueto')}
                  style={{
                    ...styles.voiceBtn,
                    borderColor: formData.voiceType === 'dueto' ? 'var(--primary)' : 'var(--border-color)',
                    backgroundColor: formData.voiceType === 'dueto' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                    color: formData.voiceType === 'dueto' ? 'var(--primary)' : 'var(--text-primary)',
                    boxShadow: formData.voiceType === 'dueto' ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  👥 Dueto
                </button>
              </div>
            </div>

            {/* Foto de Capa da Música */}
            <div style={{ marginTop: '28px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
              <label style={styles.wizardLabel}>🖼️ Foto de Capa da Música (Opcional)</label>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Envie uma foto especial (casal, família, aniversariante). Se não enviar, utilizaremos a capa padrão do estúdio.
              </p>

              <div>
                {formData.coverUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--primary)' }}>
                    <img 
                      src={formData.coverUrl} 
                      alt="Capa personalizada" 
                      style={{ width: '70px', height: '70px', borderRadius: '10px', objectFit: 'cover' }} 
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.88rem', color: '#34d399', fontWeight: 'bold' }}>✓ Foto enviada com sucesso!</span>
                      <button
                        type="button"
                        onClick={() => updateField('coverUrl', '')}
                        style={{ background: 'none', border: 'none', color: '#fca5a5', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', padding: 0 }}
                      >
                        🗑️ Remover foto (usar capa padrão)
                      </button>
                    </div>
                  </div>
                ) : isUploadingCover ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '22px',
                    borderRadius: '14px',
                    border: '2px dashed rgba(124, 58, 237, 0.4)',
                    background: 'rgba(124, 58, 237, 0.04)',
                  }}>
                    <span style={{ fontSize: '1.8rem' }}>⏳</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#fff' }}>Enviando foto...</span>
                  </div>
                ) : (
                  <label style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '22px',
                    borderRadius: '14px',
                    border: '2px dashed rgba(124, 58, 237, 0.4)',
                    background: 'rgba(124, 58, 237, 0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}>
                    <span style={{ fontSize: '1.8rem' }}>📸</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#fff' }}>Clique para enviar uma foto de capa</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Suporta fotos em JPG, PNG ou WEBP</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        );
      case 9:
        return (
          <div className="responsive-grid-2">
            <div style={styles.checkoutSummary} className="glass-card">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--primary)' }}>Resumo do pedido</h3>
              
              <div style={styles.summaryItemRow}>
                <span style={{ color: 'var(--text-secondary)' }}>Para quem:</span>
                <span style={{ fontWeight: '600' }}>{formData.honoreeName} ({formData.recipientType})</span>
              </div>
              <div style={styles.summaryItemRow}>
                <span style={{ color: 'var(--text-secondary)' }}>De quem:</span>
                <span style={{ fontWeight: '600' }}>{formData.relationship}</span>
              </div>
              <div style={styles.summaryItemRow}>
                <span style={{ color: 'var(--text-secondary)' }}>Ocasião:</span>
                <span style={{ fontWeight: '600' }}>{formData.occasion}</span>
              </div>
              <div style={styles.summaryItemRow}>
                <span style={{ color: 'var(--text-secondary)' }}>Gênero:</span>
                <span style={{ fontWeight: '600' }}>{formData.musicStyle}</span>
              </div>
              <div style={styles.summaryItemRow}>
                <span style={{ color: 'var(--text-secondary)' }}>Clima:</span>
                <span style={{ fontWeight: '600' }}>{formData.musicMood}</span>
              </div>
              <div style={styles.summaryItemRow}>
                <span style={{ color: 'var(--text-secondary)' }}>Voz:</span>
                <span style={{ fontWeight: '600' }}>
                  {formData.voiceType === 'masculina' ? 'Masculina' : formData.voiceType === 'feminina' ? 'Feminina' : '👩‍🎤 Dueto (Masc. + Fem.)'}
                </span>
              </div>
              <div style={styles.summaryItemRow}>
                <span style={{ color: 'var(--text-secondary)' }}>Capa:</span>
                <span style={{ fontWeight: '600', color: formData.coverUrl ? '#34d399' : 'var(--text-muted)' }}>
                  {formData.coverUrl ? '📸 Foto enviada' : '🖼️ Capa padrão'}
                </span>
              </div>
              
              <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>História contada:</span>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', fontStyle: 'italic', lineHeight: '1.5' }}>
                  {formData.story}
                </p>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>Seus dados de contato</h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.wizardLabel}>SEU nome (quem está pedindo a música) *</label>
                <input 
                  type="text" 
                  value={formData.customerName}
                  onChange={(e) => updateField('customerName', e.target.value)}
                  placeholder="Ex: Maria Silva" 
                  style={styles.wizardInput}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={styles.wizardLabel}>SEU WhatsApp (enviaremos a música pronta aqui) *</label>
                <input 
                  type="tel" 
                  value={formData.customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="(99) 99999-9999" 
                  style={styles.wizardInput}
                />
                <span style={{ fontSize: '0.75rem', color: phoneVerifyStatus === 'valid' ? 'var(--success)' : (phoneVerifyStatus === 'invalid' || phoneVerifyStatus === 'unknown') ? '#ef4444' : phoneVerifyStatus === 'checking' ? '#f59e0b' : 'var(--text-muted)', marginTop: '4px', display: 'block', fontWeight: (phoneVerifyStatus === 'invalid' || phoneVerifyStatus === 'unknown') ? 'bold' : 'normal' }}>
                  {phoneVerifyMessage || 'Digite o DDD + 9 dígitos'}
                </span>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={styles.wizardLabel}>E-mail (opcional)</label>
                <input 
                  type="email" 
                  value={formData.customerEmail}
                  onChange={(e) => updateField('customerEmail', e.target.value)}
                  placeholder="seuemail@exemplo.com" 
                  style={styles.wizardInput}
                />
              </div>

              <div style={styles.infoAlert} className="glass-card">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  🔒 Respeitamos sua privacidade. Seus contatos serão utilizados exclusivamente para entregar e acompanhar a criação da sua composição.
                </p>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="termsAccepted"
                  checked={formData.termsAccepted}
                  onChange={(e) => updateField('termsAccepted', e.target.checked)}
                  style={{ marginTop: '3px', width: '18px', height: '18px', flexShrink: 0 }}
                />
                <label htmlFor="termsAccepted" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Li e aceito os{' '}
                  <Link href="/termos-de-uso" target="_blank" style={{ color: 'var(--primary)', fontWeight: '600' }}>
                    Termos de Uso
                  </Link>
                  {' '}e a{' '}
                  <Link href="/politica-de-privacidade" target="_blank" style={{ color: 'var(--primary)', fontWeight: '600' }}>
                    Política de Privacidade
                  </Link>
                  . *
                </label>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderWorkflowStep = () => {
    switch (step) {
      case 10: // Lyrics Generation & Editing
        return (
          <div>
            {formData.lyricsStatus === 'generating' ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }} className="glass-card">
                <iframe 
                  src="https://lottie.host/embed/8ef96961-7dbf-44bf-96b4-c8cddc2f7890/HPh8HceFC2.lottie" 
                  style={{ width: '240px', height: '200px', border: 'none', background: 'transparent', margin: '0 auto 12px auto', display: 'block', pointerEvents: 'none' }}
                />
                <h3 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.6rem', color: 'var(--text-primary)' }}>
                  Estúdio de Composição Ativo ✨
                </h3>
                <p style={{ color: 'var(--secondary)', fontSize: '1.05rem', fontWeight: '600', marginTop: '14px', minHeight: '32px' }}>
                  {studioLyricsPhrases[lyricsStepIdx]}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '16px' }}>
                  Nossa Inteligência de Composição Poética está transformando seus momentos em versos exclusivos.
                </p>
              </div>
            ) : formData.lyricsStatus === 'error' ? (
              <div style={styles.generatingState}>
                <h3 style={{ marginTop: '24px', fontFamily: 'var(--font-family-title)', fontSize: '1.6rem', color: 'var(--danger)' }}>Erro ao comunicar com a Inteligência de Composição</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '8px', maxWidth: '500px' }}>
                  {formData.lyricsError || 'Não foi possível conectar ao servidor para gerar sua letra. Tente novamente.'}
                </p>
                <button 
                  onClick={handleSaveAndGenerateLyrics}
                  className="btn btn-primary"
                  style={{ marginTop: '20px', padding: '12px 28px' }}
                >
                  Tentar Gerar Novamente 🔄
                </button>
              </div>
            ) : (
              <div>
                <h1 style={styles.stepTitle}>Sua Letra Exclusiva ✨</h1>
                <p style={styles.stepSubtitle}>Revisada e gerada especialmente para você. Se gostar, aprove para produzir o áudio!</p>
                
                <div className="responsive-grid-split">
                  <div style={styles.lyricsBox}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>LETRA DA MÚSICA</span>
                      <span style={styles.stepIndicator}>Versão {formData.lyricsVersion}</span>
                    </div>
                    <pre style={styles.lyricsText}>{formData.lyrics}</pre>
                  </div>
                  
                  <div style={styles.lyricsActions}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={styles.wizardLabel}>Gostaria de mudar algo na composição?</label>
                      <textarea 
                        value={formData.lyricsComment}
                        onChange={(e) => updateField('lyricsComment', e.target.value)}
                        placeholder="Ex: mude o segundo verso para falar da nossa viagem a Gramado..."
                        style={{ ...styles.wizardTextarea, height: '100px' }}
                      />
                      <button 
                        onClick={requestLyricsAdjustment}
                        disabled={!formData.lyricsComment.trim()}
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '14px', fontSize: '0.95rem' }}
                      >
                        Solicitar Ajuste Gratuito ✍️
                      </button>
                    </div>

                    <div style={styles.infoAlert} className="glass-card">
                      <p style={{ fontSize: '0.85rem', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                        💡 Você tem direito a ajustes ilimitados na composição para que ela fique do jeitinho que sonhou.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 11: // Direct Audio Generation & 60s Preview Playback
        return (
          <div>
            {formData.sunoStatus !== 'generated' ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }} className="glass-card">
                <iframe 
                  src="https://lottie.host/embed/b55df25e-6dc6-4fc5-b1b0-4d4cd20490b1/VHGaPTVcOG.lottie" 
                  style={{ width: '260px', height: '220px', border: 'none', background: 'transparent', margin: '0 auto 12px auto', display: 'block', pointerEvents: 'none' }}
                />
                <h3 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.6rem', color: 'var(--text-primary)' }}>
                  Produzindo seus 2 Arranjos Musicais 🎧
                </h3>
                <p style={{ color: 'var(--secondary)', fontSize: '1.05rem', fontWeight: '600', marginTop: '14px', minHeight: '32px' }}>
                  {studioAudioPhrases[audioStepIdx]}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '16px' }}>
                  Isso leva cerca de 2 minutos. Aguarde enquanto nosso estúdio sintetiza os vocalistas e a base instrumental.
                </p>

                {/* Notificação sobre aviso no WhatsApp caso não queira esperar na tela */}
                <div style={{ marginTop: '20px', padding: '16px 20px', background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '14px', textAlign: 'left' }}>
                  <p style={{ fontSize: '0.88rem', color: '#34d399', margin: 0, lineHeight: '1.5', fontWeight: '600' }}>
                    💡 <strong>Não precisa ficar esperando nesta tela!</strong> Assim que suas 2 versões da música forem totalmente sintetizadas em nosso estúdio, enviaremos automaticamente uma mensagem no seu WhatsApp com o link direto para você ouvir e baixar quando quiser.
                  </p>
                </div>
                {formData.sunoStatus === 'error' && (
                  <div style={{ color: 'var(--danger)', marginTop: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ fontWeight: 'bold', fontSize: '1rem' }}>Ocorreu um imprevisto na renderização automática.</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>Motivo: {formData.sunoProgress}</p>
                    
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          setFormData(prev => ({ ...prev, sunoStatus: 'generating', sunoProgress: 'Iniciando nova geração...' }));
                          try {
                            const res = await fetch('/api/suno/generate', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                ...buildSunoPayload(formData),
                                orderId: orderId
                              })
                            });
                            if (res.ok) {
                              const data = await res.json();
                              if (data.taskId) {
                                setTaskId(data.taskId);
                                pollSunoStatus(data.taskId, orderId);
                              } else {
                                setFormData(prev => ({ ...prev, sunoStatus: 'error', sunoProgress: 'Falha ao obter ID da tarefa.' }));
                              }
                            } else {
                              const errData = await res.json().catch(() => ({}));
                              setFormData(prev => ({ ...prev, sunoStatus: 'error', sunoProgress: errData.error || 'Erro no servidor' }));
                            }
                          } catch (err) {
                            setFormData(prev => ({ ...prev, sunoStatus: 'error', sunoProgress: err.message || 'Falha de conexão' }));
                          }
                        }}
                        style={{ padding: '10px 18px', background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}
                      >
                        🔄 Tentar Novamente
                      </button>

                      <button
                        type="button"
                        onClick={handleResetForm}
                        style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}
                      >
                        ✨ Criar Nova Música (Limpar Rascunho)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h1 style={styles.stepTitle}>Sua Música Está Pronta! 🎧</h1>
                <p style={styles.stepSubtitle}>Ouça as prévias de 60 segundos geradas em estúdio. As 2 versões estão inclusas pelo valor promocional!</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px', margin: '24px auto 0' }}>
                  
                  {/* Banner Oferta Promocional R$ 9,99 */}
                  <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)', border: '1px solid var(--primary)', borderRadius: '16px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: '800', letterSpacing: '0.5px' }}>⚡ OFERTA PROMOCIONAL ESPECIAL</span>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: '800', marginTop: '2px', color: '#fff' }}>Você ganhou 2 Músicas Completas!</h4>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        De <s style={{ opacity: 0.6 }}>R$ 69,90</s> por apenas <strong style={{ color: '#34d399', fontSize: '1.05rem' }}>R$ 9,99</strong>
                      </p>
                    </div>
                    <span style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', color: '#fff', padding: '8px 16px', borderRadius: '24px', fontWeight: 'bold', fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(124, 58, 237, 0.4)' }}>
                      2 Músicas por R$ 9,99
                    </span>
                  </div>

                  {/* Versão 1 Preview Card */}
                  <CustomAudioPreview 
                    src={getAudioUrl(formData.sunoTracks[0])}
                    label={`Música ${formData.honoreeName || 'Personalizada'} (Arranjo 1)`}
                    badge={`VERSÃO 1 - ESTILO ${formData.musicStyle?.toUpperCase() || 'PRINCIPAL'}`}
                    isBonus={false}
                  />

                  {/* Versão 2 Preview Card */}
                  {formData.sunoTracks[1] && (
                    <CustomAudioPreview 
                      src={getAudioUrl(formData.sunoTracks[1])}
                      label={`Versão ${formData.honoreeName || 'Personalizada'} (Arranjo 2)`}
                      badge="VERSÃO 2 - ARRANJO ALTERNATIVO BÔNUS"
                      isBonus={true}
                    />
                  )}

                  {/* Card de Oferta do Vídeo Homenagem */}
                  <div className="glass-card" style={{ padding: '20px 24px', borderRadius: '16px', border: formData.addons?.wantsVideo ? '2px solid #8b5cf6' : '1px solid rgba(139, 92, 246, 0.3)', background: formData.addons?.wantsVideo ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.15) 100%)' : 'rgba(139, 92, 246, 0.05)', transition: 'all 0.3s ease' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '1.3rem' }}>🎬</span>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#c084fc' }}>Vídeo Homenagem com Fotos</h4>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '8px' }}>
                          Crie um vídeo emocionante com <strong>10 a 20 fotos</strong> da pessoa homenageada, com sua música de fundo. 
                          Perfeito para compartilhar no WhatsApp, Instagram ou em festas!
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                          <span style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>📸 10-20 fotos</span>
                          <span style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>🎵 Sua música de fundo</span>
                          <span style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>📲 Link exclusivo</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#34d399' }}>+ R$ 6,90</span>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, addons: { ...prev.addons, wantsVideo: !prev.addons?.wantsVideo } }))}
                          style={{
                            padding: '10px 20px',
                            borderRadius: '24px',
                            border: 'none',
                            fontWeight: 'bold',
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            background: formData.addons?.wantsVideo ? 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' : 'rgba(139, 92, 246, 0.2)',
                            color: formData.addons?.wantsVideo ? '#fff' : '#c084fc',
                            boxShadow: formData.addons?.wantsVideo ? '0 4px 15px rgba(139, 92, 246, 0.4)' : 'none'
                          }}
                        >
                          {formData.addons?.wantsVideo ? '✓ Adicionado' : '+ Adicionar'}
                        </button>
                      </div>
                    </div>
                    {formData.addons?.wantsVideo && (
                      <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '10px', border: '1px solid rgba(52, 211, 153, 0.2)', fontSize: '0.82rem', color: '#34d399', fontWeight: '600' }}>
                        ✅ Após o pagamento, você poderá enviar as fotos para montagem do vídeo.
                      </div>
                    )}
                  </div>

                  {/* Botões de Ação */}
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setStep(12)}
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '16px', fontSize: '1.1rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '12px' }}
                    >
                      💳 {formData.addons?.wantsVideo ? `Liberar Música + Vídeo (R$ ${getTotalPrice().toFixed(2).replace('.', ',')})` : 'Liberar Músicas Completas (R$ 9,99)'}
                    </button>

                    <button
                      type="button"
                      onClick={handleCreateNewSongFromScratch}
                      className="btn btn-secondary"
                      style={{ width: '100%', padding: '14px', fontSize: '0.95rem', cursor: 'pointer', borderRadius: '12px' }}
                    >
                      🔄 Criar Outra Música do Zero
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 12: // Checkout Transparente e Mercado Pago embutido no site
        return (
          <div>
            <h1 style={styles.stepTitle}>Finalizar Pedido 💳</h1>
            <p style={styles.stepSubtitle}>Pagamento seguro embutido no próprio site com liberação instantânea</p>

            {paymentErrorMessage && (
              <div style={{ padding: '16px 20px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '14px', marginBottom: '24px', color: '#fca5a5', fontWeight: 'bold', fontSize: '0.95rem', textAlign: 'center' }}>
                {paymentErrorMessage}
              </div>
            )}

            <div className="responsive-grid-2" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
              {/* Resumo do Pedido */}
              <div style={styles.checkoutSummary} className="glass-card">
                <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--primary)' }}>Resumo do Pedido</h3>
                
                <div style={{ ...styles.summaryItem, flexWrap: 'wrap', gap: '8px' }}>
                  <span>Pacote Promocional (2 Músicas Completas)</span>
                  <span style={{ fontWeight: '700', color: 'var(--success)' }}>R$ 9,99</span>
                </div>

                {formData.addons?.wantsVideo && (
                  <div style={{ ...styles.summaryItem, flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    <span>🎬 Vídeo Homenagem com Fotos</span>
                    <span style={{ fontWeight: '700', color: 'var(--success)' }}>R$ 6,90</span>
                  </div>
                )}

                <div style={{ ...styles.summaryItem, flexWrap: 'wrap', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  <span>Desconto Aplicado ({formData.addons?.wantsVideo ? '68' : '71'}% OFF)</span>
                  <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>- R$ {formData.addons?.wantsVideo ? '50,00' : '50,00'}</span>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />
                
                <div style={{ ...styles.summaryItem, flexWrap: 'wrap', gap: '8px', fontSize: '1.3rem', fontWeight: '800' }}>
                  <span>Total Geral:</span>
                  <span className="gradient-text">R$ {getTotalPrice().toFixed(2).replace('.', ',')}</span>
                </div>

                <div style={{ marginTop: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p>👤 <strong>Cliente:</strong> {formData.customerName}</p>
                  <p>📱 <strong>WhatsApp:</strong> {formData.customerPhone}</p>
                  <p>🎧 <strong>Conteúdo:</strong> 2 Músicas MP3 HD + Capa Exclusiva{formData.addons?.wantsVideo ? ' + Vídeo Homenagem' : ''}</p>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />

                <button
                  type="button"
                  onClick={handleCreateNewSongFromScratch}
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '12px 16px', fontSize: '0.9rem', cursor: 'pointer', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  🔄 Criar Outra Música do Zero
                </button>
              </div>

              {/* Opções de Pagamento Embutidas no Site */}
              <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: '700' }}>Escolha a Forma de Pagamento</h3>

                {/* Seletores de Método */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    style={{
                      flex: 1,
                      minWidth: '130px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: paymentMethod === 'pix' ? '2px solid var(--success)' : '1.5px solid var(--border-color)',
                      background: paymentMethod === 'pix' ? 'var(--success-bg)' : '#FFFFFF',
                      color: paymentMethod === 'pix' ? 'var(--success)' : 'var(--text-secondary)',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.92rem'
                    }}
                  >
                    ⚡ PIX Instantâneo
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    style={{
                      flex: 1,
                      minWidth: '130px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: paymentMethod === 'card' ? '2px solid var(--primary)' : '1.5px solid var(--border-color)',
                      background: paymentMethod === 'card' ? 'var(--primary-light)' : '#FFFFFF',
                      color: paymentMethod === 'card' ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.92rem'
                    }}
                  >
                    💳 Cartão de Crédito
                  </button>
                </div>

                {/* Área de Pagamento PIX Transparente */}
                {paymentMethod === 'pix' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                    {!pixInfo ? (
                      <button
                        type="button"
                        disabled={isGeneratingPix}
                        onClick={async () => {
                          setIsGeneratingPix(true);
                          try {
                            if (orderId) {
                              // hasVideoAccess NUNCA é definido aqui: é um flag de acesso a produto pago
                              // e só pode ser concedido pelo servidor após confirmação de pagamento
                              // (ver C-09/A-07 em docs/audit/AUDIT_REPORT.md).
                              await updateDoc(doc(db, 'orders', orderId), {
                                total: getTotalPrice(),
                                package: formData.selectedPackage,
                                updatedAt: new Date().toISOString()
                              }).catch(e => console.warn(e));
                            }

                            const sku = formData.addons?.wantsVideo ? 'combo' : 'audio_only';
                            const res = await fetch('/api/payments/create', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderId, sku })
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setPixInfo(data);
                              if (orderId && data.paymentId) {
                                await updateDoc(doc(db, 'orders', orderId), {
                                  paymentId: String(data.paymentId),
                                  updatedAt: new Date().toISOString()
                                }).catch(e => console.warn(e));
                              }
                              
                              if (typeof window !== 'undefined' && window.fbq) {
                                window.fbq('track', 'InitiateCheckout', { value: 9.99, currency: 'BRL' });
                              }
                            } else {
                              const errData = await res.json().catch(() => ({}));
                              console.error("Payment API Error:", errData);
                              alert(`Erro no pagamento: ${errData?.error || errData?.message || 'Tente novamente.'}`);
                            }
                          } catch (err) {
                            console.error(err);
                            alert('Falha ao conectar com o serviço de pagamento.');
                          } finally {
                            setIsGeneratingPix(false);
                          }
                        }}
                        className="btn btn-primary"
                        style={{ padding: '16px', fontSize: '1.05rem', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}
                      >
                        {isGeneratingPix ? '⏳ Gerando PIX...' : `⚡ Gerar QR Code do PIX (R$ ${getTotalPrice().toFixed(2).replace('.', ',')})`}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', background: 'var(--bg-secondary)', padding: '20px', borderRadius: '16px', border: '1.5px solid var(--border-color)', maxWidth: '100%' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 'bold' }}>
                          ✅ QR Code PIX Gerado com Sucesso!
                        </span>

                        {pixInfo.qrCodeBase64 && (
                          <img 
                            src={pixInfo.qrCodeBase64.startsWith('http') || pixInfo.qrCodeBase64.startsWith('data:') ? pixInfo.qrCodeBase64 : `data:image/png;base64,${pixInfo.qrCodeBase64}`} 
                            alt="QR Code PIX" 
                            style={{ width: '180px', height: '180px', borderRadius: '12px', border: '3px solid #FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          />
                        )}

                        <div style={{ width: '100%' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                            Código PIX Copia e Cola:
                          </span>
                          <textarea 
                            readOnly 
                            value={pixInfo.qrCode || ''} 
                            style={{ width: '100%', height: '70px', background: '#FFFFFF', color: 'var(--text-primary)', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', fontFamily: 'monospace', resize: 'none' }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (pixInfo.qrCode) {
                              navigator.clipboard.writeText(pixInfo.qrCode);
                              setPixCopied(true);
                              setTimeout(() => setPixCopied(false), 3000);
                            }
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
                            cursor: 'pointer'
                          }}
                        >
                          {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX'}
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (!pixInfo?.paymentId) return;
                            try {
                              // 1. Verifica via API do Mercado Pago
                              const res = await fetch(`/api/payments/status?paymentId=${pixInfo.paymentId}${orderId ? `&orderId=${orderId}` : ''}`);
                              if (res.ok) {
                                const data = await res.json();
                                if (data.status === 'approved') {
                                  // Gravação já feita no servidor (/api/payments/status) — ver C-01/C-09.
                                  setPixInfo(prev => ({ ...prev, status: 'approved' }));
                                  window.location.href = `/entrega?orderId=${orderId}`;
                                  return;
                                }
                              }

                              // 2. Fallback: verifica diretamente no Firestore
                              if (orderId) {
                                const orderSnap = await getDoc(doc(db, 'orders', orderId));
                                if (orderSnap.exists()) {
                                  const orderData = orderSnap.data();
                                  if (orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO') {
                                    setPixInfo(prev => ({ ...prev, status: 'approved' }));
                                    window.location.href = `/entrega?orderId=${orderId}&status=success`;
                                    return;
                                  }
                                }
                              }

                              alert('🔄 Pagamento ainda em processamento. Se você já pagou, aguarde alguns segundos e tente novamente!');
                            } catch (e) {
                              alert('Erro ao conectar com o servidor.');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
                            color: '#FFFFFF',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            marginTop: '8px',
                            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
                          }}
                        >
                          ⚡ Já Fiz o Pagamento / Validar Agora
                        </button>

                        <a
                          href="https://wa.me/5594991081351?text=Olá,%20fiz%20o%20pagamento%20da%20minha%20música!%20Segue%20o%20meu%20comprovante:"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '14px',
                            borderRadius: '10px',
                            background: '#25D366',
                            color: '#FFF',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            textAlign: 'center',
                            textDecoration: 'none',
                            marginTop: '8px',
                            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
                          }}
                        >
                          💬 Enviar Comprovante no WhatsApp
                        </a>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'center' }}>
                          Após o pagamento, envie o comprovante no WhatsApp para liberarmos sua música imediatamente!
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Área de Cartão de Crédito / Mercado Pago Checkout */}
                {paymentMethod === 'card' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (orderId) {
                            // hasVideoAccess NUNCA é definido aqui — ver comentário equivalente acima.
                            await updateDoc(doc(db, 'orders', orderId), {
                              total: getTotalPrice(),
                              package: formData.selectedPackage,
                              updatedAt: new Date().toISOString()
                            }).catch(e => console.warn(e));
                          }

                          const sku = formData.addons?.wantsVideo ? 'combo' : 'audio_only';
                          const response = await fetch('/api/payments/create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId, sku })
                          });
                          if (response.ok) {
                            const data = await response.json();
                            if (data.init_point) {
                              if (typeof window !== 'undefined' && window.fbq) {
                                window.fbq('track', 'InitiateCheckout', { value: 9.99, currency: 'BRL' });
                              }
                              window.location.href = data.init_point;
                            } else {
                              alert('Erro ao iniciar checkout do Mercado Pago.');
                            }
                          } else {
                            const errData = await response.json();
                            alert(`Erro do Mercado Pago: ${errData.error || 'Falha no processamento.'}`);
                          }
                        } catch (err) {
                          console.error(err);
                          alert('Ocorreu um erro ao processar seu pagamento.');
                        }
                      }}
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '16px', fontSize: '1.05rem' }}
                    >
                      Confirmar & Pagar no Mercado Pago 💳
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Header Estúdio Musical Premium */}
      <header style={styles.header} className="glass-panel">
        <div style={{ ...styles.headerContainer, justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Logo & Marca NSMusic com Animação SVG */}
          <Link href="/" style={{ textDecoration: 'none' }}>
            <BrandLogo />
          </Link>

          <Link href="/" className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem', minHeight: '36px' }}>
            🏠 Voltar ao Início
          </Link>

        </div>
      </header>

      {/* Main content container */}
      <main style={{ flex: 1, padding: '32px 0 100px 0' }}>
        <div className="container" style={{ maxWidth: '900px' }}>
          
          {/* Wizard step indicators */}
          {step <= totalWizardSteps && (
            <div style={styles.progressBarBg}>
              <div style={{ ...styles.progressBarFill, width: `${(step / totalWizardSteps) * 100}%` }} />
            </div>
          )}

          {/* Form step renderers */}
          <div style={{ marginTop: '32px' }}>
            {step <= totalWizardSteps ? renderWizardStep() : renderWorkflowStep()}
          </div>

          {/* Fixed Bottom Navigation Dock */}
          {formData.lyricsStatus !== 'generating' && formData.sunoStatus !== 'generating' && (step <= totalWizardSteps || step === 10) && (
            <div style={styles.navigationControls}>
              <div className="container" style={{ width: '100%', maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                {step > 1 ? (
                  <button 
                    onClick={prevStep} 
                    className="btn btn-secondary"
                    style={{ padding: '12px 20px', fontSize: '0.95rem', minHeight: '46px' }}
                  >
                    ← Voltar
                  </button>
                ) : (
                  <div />
                )}
                
                <div>
                  {step <= totalWizardSteps ? (
                    <button 
                      onClick={step === 9 ? handleSaveAndGenerateLyrics : nextStep}
                      disabled={isNextDisabled()}
                      className="btn btn-primary"
                      style={{
                        padding: '12px 28px',
                        fontSize: '0.95rem',
                        minHeight: '46px',
                        background: isNextDisabled() ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                        color: isNextDisabled() ? 'var(--text-muted)' : '#FFFFFF'
                      }}
                    >
                      {step === 9 ? 'Criar Música →' : 'Continuar →'}
                    </button>
                  ) : (
                    step === 10 && (
                      <button 
                        onClick={handleApproveLyrics}
                        disabled={isNextDisabled()}
                        className="btn btn-primary"
                        style={{
                          padding: '12px 28px',
                          fontSize: '0.95rem',
                          minHeight: '46px',
                          background: isNextDisabled() ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                          color: isNextDisabled() ? 'var(--text-muted)' : '#FFFFFF'
                        }}
                      >
                        Aprovar Letra →
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal de Limite de Prévias Gratuitas Atingido */}
      {showLimitModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            maxWidth: '520px',
            width: '100%',
            padding: '32px',
            borderRadius: '24px',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.95) 0%, rgba(35, 20, 45, 0.95) 100%)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🚫</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>
              Limite de 5 Prévias Gratuitas Atingido
            </h2>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '24px' }}>
              Você já gerou 5 composições de teste. Para continuar criando novas músicas do zero sem restrições, escolha uma das suas composições para adquirir por apenas <strong style={{ color: '#34d399' }}>R$ 9,99</strong>! Como você ainda não realizou nenhuma compra, a geração de novas prévias do zero foi desabilitada temporariamente.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {orderId && (
                <button
                  onClick={() => {
                    setShowLimitModal(false);
                    if (step < 12) setStep(12);
                  }}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 'bold' }}
                >
                  🎵 Ver Minha Última Música Gerada (R$ 9,99)
                </button>
              )}

              <a
                href="https://wa.me/5531999999999?text=Ol%C3%A1%2C%20gostaria%20de%20liberar%20mais%20cria%C3%A7%C3%B5es%20de%20m%C3%BAsicas%20no%20NSMusic!"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ width: '100%', padding: '12px', fontSize: '0.95rem', display: 'inline-block', textAlign: 'center' }}
              >
                💬 Falar com o Suporte no WhatsApp
              </a>

              <button
                onClick={() => setShowLimitModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer', marginTop: '6px' }}
              >
                Fechar aviso
              </button>
            </div>
          </div>
        </div>
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepIndicator: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: 'var(--primary)',
    backgroundColor: 'var(--primary-light)',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid rgba(124, 58, 237, 0.2)',
  },
  progressBarBg: {
    width: '100%',
    height: '6px',
    backgroundColor: 'var(--border-color)',
    borderRadius: '100px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
    transition: 'width 0.3s ease',
  },
  stepTitle: {
    fontSize: '1.8rem',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: '8px',
    fontFamily: 'var(--font-family-title)',
    color: 'var(--text-primary)',
  },
  stepSubtitle: {
    fontSize: '0.98rem',
    textAlign: 'center',
    color: 'var(--text-muted)',
    marginBottom: '28px',
  },
  gridCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },
  gridCards2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
    marginTop: '16px',
  },
  wizardCard: {
    aspectRatio: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-md)',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    userSelect: 'none',
    backgroundColor: '#FFFFFF',
    boxShadow: 'var(--card-shadow)',
  },
  wizardCardLarge: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-md)',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    userSelect: 'none',
    backgroundColor: '#FFFFFF',
    boxShadow: 'var(--card-shadow)',
  },
  checkCircle: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.82rem',
    fontWeight: 'bold',
    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)',
  },
  wizardInput: {
    width: '100%',
    padding: '16px 20px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '1.1rem',
    outline: 'none',
    transition: 'all 0.2s',
    marginTop: '16px',
    textAlign: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
  },
  wizardLabel: {
    fontSize: '0.95rem',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '8px',
    display: 'block',
  },
  wizardTextarea: {
    width: '100%',
    padding: '16px 20px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '1rem',
    outline: 'none',
    transition: 'all 0.2s',
    resize: 'vertical',
    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
  },
  wizardListBtn: {
    width: '100%',
    padding: '16px',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-primary)',
    backgroundColor: '#FFFFFF',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
  },
  wizardPillBtn: {
    padding: '14px 28px',
    borderRadius: '100px',
    border: '1.5px solid var(--border-color)',
    backgroundColor: '#FFFFFF',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '700',
    transition: 'all 0.2s',
  },
  voiceBtn: {
    flex: 1,
    padding: '16px',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-primary)',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.25s',
  },
  navigationControls: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderTop: '1.5px solid var(--border-color)',
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.06)',
    padding: '12px 16px',
  },
  checkoutSummary: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    backgroundColor: '#FFFFFF',
    borderRadius: 'var(--border-radius-md)',
  },
  summaryItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.95rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '8px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.95rem',
  },
  infoAlert: {
    padding: '16px 20px',
    borderRadius: 'var(--border-radius-sm)',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
  },
  generatingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid var(--border-color)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  lyricsBox: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-md)',
    padding: '24px',
    boxShadow: 'var(--card-shadow)',
  },
  lyricsText: {
    fontFamily: 'var(--font-family-body)',
    fontSize: '1rem',
    lineHeight: '1.75',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
  },
  lyricsActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  packagesSelectGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    maxWidth: '700px',
    margin: '24px auto 0',
  },
  pkgSelectCard: {
    padding: '20px 24px',
    borderRadius: 'var(--border-radius-md)',
    border: '1.5px solid var(--border-color)',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
    transition: 'all 0.25s',
    boxShadow: 'var(--card-shadow)',
  },
  addonsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '700px',
    margin: '24px auto 0',
  },
  addonItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    cursor: 'pointer',
    border: '1.5px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    backgroundColor: '#FFFFFF',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    accentColor: 'var(--primary)',
  },
};

