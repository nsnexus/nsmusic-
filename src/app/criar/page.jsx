'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { doc, getDoc, collection, addDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '@/lib/firebase';
import { buildSunoPayload } from '@/lib/sunoPayload';
import { pushAdvancedMatching } from '@/lib/metaPixel';
import { styles } from './wizardStyles';
import CustomAudioPreview from './CustomAudioPreview';
import WizardSteps from './WizardSteps';
import PixQrCode from '@/components/PixQrCode';

// Códigos de área (DDD) válidos no Brasil, segundo o plano de numeração da ANATEL.
const VALID_BRAZIL_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

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

export default function CriarMusica() {
  const [step, setStep] = useState(1);
  const [orderId, setOrderId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [isRestored, setIsRestored] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const [pixInfo, setPixInfo] = useState(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const [pixPollingCount, setPixPollingCount] = useState(0);
  const [pixPollingTimedOut, setPixPollingTimedOut] = useState(false);

  // Máximo de tentativas do polling automático: 150 × 4s = 10min. Sem isso, o polling roda para
  // sempre enquanto a aba ficar aberta (viola .claude/rules/frontend.md — "Polling precisa de
  // limite de tentativas e de parada em caso de erro persistente"). Auditoria de fechamento, 2026-08-02.
  const PIX_POLLING_MAX_ATTEMPTS = 150;

  // Polling automático de aprovação do Pix em tempo real (com fallback Firestore)
  useEffect(() => {
    let interval;
    if (pixInfo && pixInfo.paymentId && pixInfo.status !== 'approved') {
      setPixPollingTimedOut(false);
      setPixPollingCount(0);
      interval = setInterval(async () => {
        setPixPollingCount(prev => {
          const next = prev + 1;
          if (next >= PIX_POLLING_MAX_ATTEMPTS) {
            clearInterval(interval);
            setPixPollingTimedOut(true);
          }
          return next;
        });

        // 1. Consulta a API da Efí via backend
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
    // Preenchido automaticamente a partir de recipientType (ver selectFieldAndAdvance) — não é
    // mais uma etapa própria do wizard, era redundante com "quem vai receber a música".
    relationship: '',
    // Step 3
    occasion: '',
    // Step 4
    story: '',
    importantMoments: '',
    // Step 5
    musicStyle: '',
    // Step 6
    musicMood: '',
    // Step 7
    requiredNames: '',
    requiredPhrase: '',
    voiceType: 'masculina',
    coverUrl: '', // URL do Firebase Storage (ver M-08 no AUDIT_REPORT.md — nunca base64)
    // Step 8
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    termsAccepted: false,
    // Step 9: Lyrics state
    lyrics: '',
    lyricsVersion: 1,
    lyricsStatus: 'idle', // 'idle', 'generating', 'generated', 'error'
    lyricsComment: '',
    // Step 10: Suno AI Audio state
    sunoStatus: 'idle', // 'idle', 'generating', 'generated', 'error'
    sunoProgress: '',
    sunoTracks: [],
    addVersion2: false,
    // Step 11: Pricing package
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

  const totalWizardSteps = 8; // era 9 — etapa de "parentesco" removida (redundante com recipientType)
  const audio1Ref = useRef(null);
  const audio2Ref = useRef(null);
  const recognitionRef = useRef(null);
  const voiceDictationGotResultRef = useRef(false);
  const voiceDictationErrorHandledRef = useRef(false);
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
  const [phoneVerifyStatus, setPhoneVerifyStatus] = useState('idle'); // 'idle' | 'valid' | 'invalid'
  const [phoneVerifyMessage, setPhoneVerifyMessage] = useState('');

  // Validação de formato do telefone. Não existe mais checagem em tempo real de conta ativa no
  // WhatsApp — a API oficial da Meta (que substituiu o provedor não oficial W-API, banido repetidas
  // vezes) não expõe esse tipo de consulta. Só confere DDD + quantidade de dígitos.
  useEffect(() => {
    const phone = formData.customerPhone || '';
    const clean = phone.replace(/\D/g, '');

    if (clean.length === 0) {
      setPhoneVerifyStatus('idle');
      setPhoneVerifyMessage('');
      return;
    }

    // Aceita DDD + 8 ou 9 dígitos — muita gente esquece o 9 inicial do celular.
    if (clean.length < 10) {
      setPhoneVerifyStatus('idle');
      setPhoneVerifyMessage('Digite o DDD + número do seu celular');
      return;
    }

    const ddd = clean.slice(0, 2);
    if (clean.length > 11 || !VALID_BRAZIL_DDDS.has(ddd)) {
      setPhoneVerifyStatus('invalid');
      setPhoneVerifyMessage('❌ DDD ou número inválido');
      return;
    }

    setPhoneVerifyStatus('valid');
    setPhoneVerifyMessage('✓ Número válido');
  }, [formData.customerPhone]);

  // Restore draft from localStorage on load & check URL query params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const resetParam = urlParams.get('reset') || urlParams.get('new');

        if (resetParam === 'true' || resetParam === '1') {
          localStorage.removeItem('nsmusic_order_draft');
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsRestored(true);
          return;
        }

        const saved = localStorage.getItem('nsmusic_order_draft');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.formData) setFormData(parsed.formData);
          if (parsed.orderId) setOrderId(parsed.orderId);
          if (parsed.taskId) setTaskId(parsed.taskId);
          if (parsed.step) setStep(parsed.step >= 11 ? 11 : parsed.step);

          const savedTaskId = parsed.taskId;
          const currentOrderId = parsed.orderId;

          // Se estava aguardando áudio ou tem um taskId pendente
          if (savedTaskId && parsed.formData?.sunoStatus !== 'generated') {
            pollSunoStatus(savedTaskId, currentOrderId);
          } else if (currentOrderId && parsed.formData?.sunoStatus !== 'generated' && parsed.step >= 9) {
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

  // Confirma que o áudio já responde de verdade (via o mesmo proxy que o player usa) antes de
  // redirecionar pra /entrega — evita mandar o cliente pra uma prévia que ainda não carrega porque
  // a Kie.ai reportou "pronto" antes do arquivo propagar de fato na CDN deles.
  const waitForAudioReady = async (rawUrl, maxAttempts = 6, delayMs = 2000) => {
    if (!rawUrl) return false;
    const proxiedUrl = `/api/audio/proxy?url=${encodeURIComponent(rawUrl)}`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(proxiedUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) return true;
      } catch (e) {
        // Aviso silencioso — só uma verificação de prontidão, não bloqueia o fluxo em caso de erro.
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  };

  // Passos de carregamento dinâmico no estúdio de composição de letra (Step 9)
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

  // Passos de carregamento dinâmico no estúdio de produção musical (Step 10)
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

  // Valor promocional dinâmico: R$ 9,99 (só música) ou R$ 16,89 (música + vídeo)
  const getSelectedPackagePrice = () => 9.99;
  const getVideoAddonPrice = () => formData.addons?.wantsVideo ? 6.90 : 0;
  const getAddonsPrice = () => getVideoAddonPrice();
  const getTotalPrice = () => 9.99 + getVideoAddonPrice();

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
      voiceDictationGotResultRef.current = false;
      voiceDictationErrorHandledRef.current = false;

      recognition.onstart = () => setIsListening(true);

      // Sem isso, uma permissão de microfone negada (ou nenhuma fala captada) fazia o botão
      // simplesmente voltar ao normal sem explicação nenhuma — parecia que "nada acontecia"
      // (relato do usuário, 2026-08-02). onerror sempre é seguido de onend pela spec da Web Speech
      // API — o ref evita mostrar dois alertas empilhados para o mesmo problema.
      recognition.onend = () => {
        setIsListening(false);
        if (!voiceDictationGotResultRef.current && !voiceDictationErrorHandledRef.current) {
          alert('Não conseguimos captar sua fala. Verifique se o microfone está liberado para este site e tente falar logo após clicar em "Ditar por Voz".');
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        voiceDictationErrorHandledRef.current = true;
        if (event.error === 'aborted') return; // parada manual (usuário clicou em parar) — sem aviso
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          alert('O microfone está bloqueado para este site. Permita o acesso ao microfone nas configurações do navegador e tente de novo.');
        } else if (event.error === 'no-speech') {
          alert('Não conseguimos ouvir nada. Tente falar logo após clicar em "Ditar por Voz", bem próximo do microfone.');
        } else {
          alert('Não foi possível usar o ditado por voz agora. Tente novamente ou digite a história.');
        }
      };

      recognition.onresult = (event) => {
        let textRecorded = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            textRecorded += event.results[i][0].transcript + ' ';
          }
        }
        textRecorded = textRecorded.trim();
        if (textRecorded) {
          voiceDictationGotResultRef.current = true;
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

  // Parar gravação de voz automaticamente se o usuário mudar de etapa ou se o step não for 4
  // (etapa "Conte sua história" — era 5 antes da remoção da etapa de parentesco)
  useEffect(() => {
    if (step !== 4 && isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Erro ao parar ditado de voz ao sair da etapa 4:", e);
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
    // Mesma trava do botão "Continuar" (ver isNextDisabled): estes botões avançam sozinhos 150ms
    // depois do clique, então trocar de opção com o upload da capa em andamento também descartaria
    // a foto. Registra a escolha, mas não avança enquanto o upload não terminar.
    if (isUploadingCover) {
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value,
      // A pergunta separada de "parentesco" foi removida do wizard por ser redundante com "quem vai
      // receber a música" (feedback do usuário, 2026-08-02) — mas src/lib e a letra gerada ainda
      // esperam um `relationship`, então ele é preenchido automaticamente aqui, sem perguntar de novo.
      ...(name === 'recipientType' ? { relationship: value } : {}),
    }));
    setTimeout(() => {
      setStep(prevStep => Math.min(prevStep + 1, totalWizardSteps));
    }, 150);
  };

  const handlePhoneChange = (value) => {
    const clean = value.replace(/\D/g, '').slice(0, 11);
    let formatted = clean;
    if (clean.length > 0) {
      formatted = `(${clean.slice(0, 2)}`;
    }
    if (clean.length > 2) {
      const local = clean.slice(2);
      // Número local pode ter 8 dígitos (sem o 9º, esquecimento comum) ou 9 (padrão atual) — o
      // agrupamento do meio muda de tamanho conforme o total (ver isPhoneValid, que aceita as
      // duas variantes).
      const splitAt = local.length >= 9 ? 5 : Math.min(4, local.length);
      formatted += `) ${local.slice(0, splitAt)}`;
      if (local.length > splitAt) {
        formatted += `-${local.slice(splitAt)}`;
      }
    }
    updateField('customerPhone', formatted);
  };

  const isPhoneValid = (phone) => {
    const clean = (phone || '').replace(/\D/g, '');
    // DDD + 8 dígitos (sem o 9, esquecimento comum) ou 9 dígitos (padrão atual) e DDD real —
    // ver VALID_BRAZIL_DDDS.
    if (clean.length !== 10 && clean.length !== 11) return false;
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

    // A flag sobe AQUI, não no início do upload para o Storage: ler o arquivo, decodificar e
    // redimensionar no canvas leva segundos num celular com foto grande, e era exatamente nessa
    // janela que o cliente clicava em "Continuar" e a foto se perdia. Enquanto ela for true, o
    // wizard não avança (ver isNextDisabled e selectFieldAndAdvance).
    //
    // Consequência: TODO caminho de saída daqui para baixo precisa baixar a flag, senão o wizard
    // fica travado para sempre — um bug pior do que o que estamos corrigindo.
    setIsUploadingCover(true);

    const failUpload = (mensagem) => {
      setIsUploadingCover(false);
      alert(mensagem);
    };

    const reader = new FileReader();
    reader.onerror = () => failUpload("Não foi possível ler a imagem selecionada. Tente novamente.");
    reader.onload = (event) => {
      // window.Image (não `new Image()`) — o identificador `Image` neste arquivo é o componente do
      // next/image importado no topo, que sombreia o construtor nativo do navegador. Chamar
      // `new Image()" aqui invocava o componente React em vez do <img> nativo, e o TypeError
      // resultante ("is not a constructor") só aparecia no overlay de dev do Next, nunca em
      // console.error — por isso o upload de capa parecia simplesmente não fazer nada.
      const img = new window.Image();
      img.onerror = () => failUpload("Não foi possível abrir a imagem selecionada. Tente outra foto.");
      img.onload = () => {
       // Rede de segurança: uma exceção síncrona aqui (canvas sem contexto 2d, drawImage recusando
       // a imagem) escaparia do handler de evento sem passar por nenhum dos resets abaixo, e o
       // wizard ficaria travado sem o cliente conseguir sequer voltar atrás.
       try {
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
            failUpload("Não foi possível processar a imagem. Tente novamente.");
            return;
          }
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
       } catch (err) {
         console.error("Erro ao processar a imagem de capa:", err);
         failUpload("Não foi possível processar a imagem. Tente outra foto.");
       }
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
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Verifica trava de 5 prévias para usuários que nunca compraram
      const { isBlocked } = await checkUserLimit(formData.customerPhone, formData.customerEmail);
      if (isBlocked) {
        setShowLimitModal(true);
        return;
      }

      setStep(9);
      // Se a letra já foi gerada com sucesso anteriormente, apenas exibe a letra existente sem fazer nova requisição
      if (formData.lyricsStatus === 'generated' && formData.lyrics) {
        return;
      }

    updateField('lyricsStatus', 'generating');
      // Criação segura do pedido no Firestore via API Backend (Server-Side).
      // IMPORTANTE: só cria um pedido novo se ainda não existir um para esta sessão. Antes, esta
      // chamada rodava incondicionalmente — cada vez que "Tentar Gerar Novamente" era clicado após
      // uma falha (ex: instabilidade na API de letras), um pedido NOVO era criado no Firestore sem
      // reaproveitar o orderId já existente. Isso gerava vários pedidos duplicados e órfãos para o
      // mesmo cliente em poucos minutos, e fazia com que apenas o último pedido criado chegasse de
      // fato a /api/suno/generate — os anteriores ficavam presos em AGUARDANDO_PAGAMENTO/LETRA_CRIADA
      // parecendo que o cliente "pediu a música" mas ela nunca foi enviada à Kie.ai (achado da
      // auditoria de fechamento, 2026-08-05). Mesmo padrão já usado em handleApproveLyrics.
      let currentOrderId = orderId;
      if (!currentOrderId) {
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
          // productionStatus separa "letra pronta, aguardando aprovação" de EM_PRODUCAO (que hoje é
          // só o estado inicial do pedido) — sem isso não dá pra distinguir cliente que desistiu antes
          // da letra de cliente que chegou até aqui e não avançou (achado da auditoria, 2026-08-07).
          await updateDoc(doc(db, 'orders', currentOrderId), {
            lyrics: data.lyrics,
            productionStatus: 'LETRA_CRIADA',
            updatedAt: new Date().toISOString()
          }).catch(e => console.warn(e));
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
    } finally {
      setIsSubmitting(false);
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

  // Step 9 Approval -> Move to Audio Generation preview screen (Step 10)
  const handleApproveLyrics = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      setStep(10);
      // Se as músicas já foram geradas com sucesso anteriormente, apenas navega sem regenerar
      if (formData.sunoStatus === 'generated' && formData.sunoTracks && formData.sunoTracks.length > 0) {
        if (orderId) window.location.href = `/entrega?orderId=${orderId}`;
        return;
      }

      updateField('sunoStatus', 'generating');
      updateField('sunoProgress', 'Enviando composição de letra ao Suno AI...');

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
    } finally {
      setIsSubmitting(false);
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

              // A Kie.ai às vezes reporta "pronto" antes do arquivo terminar de propagar na CDN
              // deles — redirecionar na hora podia levar a uma prévia que não tocava (só resolvia
              // atualizando a página). Confirma que o áudio já responde de verdade antes de mandar
              // o cliente pra lá; se não conseguir confirmar a tempo, redireciona mesmo assim (o
              // player em /entrega também tenta recarregar sozinho).
              updateField('sunoProgress', 'Finalizando e conferindo o áudio...');
              await waitForAudioReady(primaryAudio);
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
    // Upload da foto de capa em andamento: sem esta trava, quem clicava em "Continuar" antes do
    // upload terminar avançava com formData.coverUrl ainda vazio e a foto simplesmente se perdia —
    // o pedido saía com a capa padrão sem ninguém entender por quê. Guarda global de propósito:
    // isUploadingCover só é true durante esse upload, então não afeta nenhum outro passo.
    if (isUploadingCover) return true;

    if (step === 1 && !formData.recipientType) return true;
    if (step === 2 && !formData.honoreeName) return true;
    if (step === 3 && !formData.occasion) return true;
    if (step === 4 && formData.story.length < 50) return true;
    if (step === 5 && !formData.musicStyle) return true;
    if (step === 6 && !formData.musicMood) return true;
    if (step === 8 && (!formData.customerName || !isPhoneValid(formData.customerPhone) || !formData.termsAccepted)) return true;
    if (step === 9 && formData.lyricsStatus !== 'generated') return true;
    if (step === 10 && formData.sunoStatus !== 'generated') return true;
    if (step === 11 && !formData.selectedPackage) return true;
    return false;
  };

  const renderWizardStep = () => (
    <WizardSteps
      step={step}
      formData={formData}
      updateField={updateField}
      selectFieldAndAdvance={selectFieldAndAdvance}
      isListening={isListening}
      toggleVoiceDictation={toggleVoiceDictation}
      appendStoryPrompt={appendStoryPrompt}
      isUploadingCover={isUploadingCover}
      handleImageUpload={handleImageUpload}
      handlePhoneChange={handlePhoneChange}
      phoneVerifyStatus={phoneVerifyStatus}
      phoneVerifyMessage={phoneVerifyMessage}
    />
  );

  const renderWorkflowStep = () => {
    switch (step) {
      case 9: // Lyrics Generation & Editing
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
      case 10: // Direct Audio Generation & 60s Preview Playback
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
                      onClick={() => setStep(11)}
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
      case 11: // Checkout Transparente Pix (Efí) embutido no site
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
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: '700' }}>⚡ Pagamento via PIX Instantâneo</h3>

                {/* Área de Pagamento PIX Transparente */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                    {!pixInfo ? (
                      <button
                        type="button"
                        disabled={isGeneratingPix}
                        onClick={async () => {
                          setIsGeneratingPix(true);
                          setPaymentErrorMessage('');
                          try {
                            if (orderId) {
                              // hasVideoAccess NUNCA é definido aqui: é um flag de acesso a produto pago
                              // e só pode ser concedido pelo servidor após confirmação de pagamento
                              // (ver C-09/A-07 em docs/audit/AUDIT_REPORT.md).
                              try {
                                await updateDoc(doc(db, 'orders', orderId), {
                                  total: getTotalPrice(),
                                  package: formData.selectedPackage,
                                  updatedAt: new Date().toISOString()
                                });
                              } catch (e) {
                                console.warn(e);
                                setPaymentErrorMessage('Não foi possível salvar os dados do pedido. Verifique sua internet e tente novamente.');
                                setIsGeneratingPix(false);
                                return;
                              }
                            }

                            const sku = formData.addons?.wantsVideo ? 'combo' : 'audio_only';
                            const res = await fetch('/api/payments/create', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderId, sku })
                            });
                            if (res.ok) {
                              const data = await res.json();
                              // IMPORTANTE: não gravar paymentId aqui. O servidor (/api/payments/create)
                              // já persiste o txid pendente em paymentIntentId. O campo paymentId só pode
                              // ser escrito pelo servidor após aprovação real (ver applyPaymentApproval em
                              // src/lib/payments.js) — gravá-lo aqui, ainda pendente, é o que permitia que
                              // /api/payments/status aprovasse o pedido sem nunca checar a Efí (bug da
                              // aprovação falsa).
                              setPixInfo(data);

                              if (typeof window !== 'undefined' && window.fbq) {
                                // Correspondência avançada manual: telefone é obrigatório e já validado
                                // aqui, e-mail é opcional e só entra quando preenchido.
                                pushAdvancedMatching(formData.customerPhone, formData.customerEmail);
                                // Valor real do carrinho (9.99 ou 16.89 com vídeo), não um fixo — combo
                                // era subcontado como se fosse sempre a música avulsa.
                                window.fbq('track', 'InitiateCheckout', { value: getTotalPrice(), currency: 'BRL' });
                              }
                            } else {
                              const errData = await res.json().catch(() => ({}));
                              console.error("Payment API Error:", errData);
                              setPaymentErrorMessage(errData?.error || errData?.message || 'Erro ao gerar o PIX. Tente novamente.');
                            }
                          } catch (err) {
                            console.error(err);
                            setPaymentErrorMessage('Falha ao conectar com o serviço de pagamento. Tente novamente.');
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

                        {pixPollingTimedOut && (
                          <div style={{ width: '100%', padding: '12px 16px', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: '10px', color: '#facc15', fontSize: '0.85rem', textAlign: 'center' }}>
                            Ainda não recebemos a confirmação automática deste pagamento. Se você já
                            pagou, use o botão &quot;Já Paguei&quot; abaixo para verificar manualmente.
                          </div>
                        )}

                        {/* QR Code como caminho principal: parte dos clientes não localizava o
                            botão de copiar e desistia do pagamento. */}
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                            Abra o app do seu banco e aponte a câmera para o QR Code:
                          </p>
                          <PixQrCode payload={pixInfo.qrCode} />
                        </div>

                        <div style={{ width: '100%' }}>
                          <label htmlFor="pix-copia-cola-criar" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                            Ou use o código PIX Copia e Cola:
                          </label>
                          <textarea
                            id="pix-copia-cola-criar"
                            readOnly
                            value={pixInfo.qrCode || ''}
                            style={{ width: '100%', height: '70px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', fontFamily: 'monospace', resize: 'none' }}
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
                              // 1. Verifica via API da Efí
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
                                    window.location.href = `/entrega?orderId=${orderId}`;
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

                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'center' }}>
                          A liberação é automática assim que o pagamento for confirmado — não precisa enviar comprovante.
                        </p>
                      </div>
                    )}
                  </div>
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
          {formData.lyricsStatus !== 'generating' && formData.sunoStatus !== 'generating' && (step <= totalWizardSteps || step === 9) && (
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
                      onClick={step === 8 ? handleSaveAndGenerateLyrics : nextStep}
                      disabled={isNextDisabled() || (step === 8 && isSubmitting)}
                      className="btn btn-primary"
                      style={{
                        padding: '12px 28px',
                        fontSize: '0.95rem',
                        minHeight: '46px',
                        background: (isNextDisabled() || (step === 8 && isSubmitting)) ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                        color: (isNextDisabled() || (step === 8 && isSubmitting)) ? 'var(--text-muted)' : '#FFFFFF'
                      }}
                    >
                      {/* Botão desabilitado sem explicação lê como travamento. Diz o motivo. */}
                      {isUploadingCover
                        ? '⏳ Enviando foto...'
                        : (step === 8 ? 'Criar Música →' : 'Continuar →')}
                    </button>
                  ) : (
                    step === 9 && (
                      <button
                        onClick={handleApproveLyrics}
                        disabled={isNextDisabled() || isSubmitting}
                        className="btn btn-primary"
                        style={{
                          padding: '12px 28px',
                          fontSize: '0.95rem',
                          minHeight: '46px',
                          background: (isNextDisabled() || isSubmitting) ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                          color: (isNextDisabled() || isSubmitting) ? 'var(--text-muted)' : '#FFFFFF'
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
                    if (step < 11) setStep(11);
                  }}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 'bold' }}
                >
                  🎵 Ver Minha Última Música Gerada (R$ 9,99)
                </button>
              )}

              <a
                href="https://wa.me/5594991064043?text=Ol%C3%A1%2C%20gostaria%20de%20liberar%20mais%20cria%C3%A7%C3%B5es%20de%20m%C3%BAsicas%20no%20NSMusic!"
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
