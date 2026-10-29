'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { auth } from '@/lib/authClient';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';
import { buildSunoPayload } from '@/lib/sunoPayload';
import { pushAdvancedMatching } from '@/lib/metaPixel';
import { identifyTikTok, trackTikTok } from '@/lib/tiktokPixel';
import { trackGooglePurchase } from '@/lib/googleAds';
import { styles } from './wizardStyles';
import { occasions } from './wizardOptions';
import { getStoredTrafficSource, isOrderFromTikTok } from '@/lib/trafficSource';
import CustomAudioPreview from './CustomAudioPreview';
import { usePromoverAudio } from '@/lib/usePromoverAudio';
import { calcularCota, COTA_POR_COMPRA } from '@/lib/cotaGeracoes';
import WizardSteps from '@/components/creation/CreationSteps';
import PixQrCode from '@/components/PixQrCode';
import { requestPixCharge } from '@/lib/pixCheckout';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';
import { lerConfigSite } from '@/lib/configSite';
import { StudioLyricsAnimation, StudioAudioAnimation } from '@/components/creation/StudioProgress';
import { IconeCelularWhatsApp } from '@/components/AppIcons';
import { readReferralCode } from '@/lib/referralTracking';
import { getPriceForSku } from '@/lib/pricing';

// Tempo na tela de produção depois do qual o cliente sempre ganha uma saída (conferir de novo,
// recomeçar ou chamar no WhatsApp). Maior que o corte de 6 min do polling de propósito: só entra
// em cena quando o polling não está dando conta, não em vez dele.
const AUDIO_WATCHDOG_MS = 10 * 60 * 1000;

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

// Normaliza dígitos de telefone brasileiro removendo pontuação e DDI 55 quando presente.
// No Brasil, todo celular começa com '9' após o DDD. Se o usuário digita 55 seguido de 1..8
// (ex: 55219..., 55119..., 55519...), o '55' inicial é indubitavelmente o DDI do país e não o DDD 55 (Santa Maria/RS).
export function normalizeBrazilPhoneDigits(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55')) {
    if (digits.length >= 12) {
      digits = digits.slice(2);
    } else if (digits.length >= 3 && digits[2] !== '9') {
      digits = digits.slice(2);
    }
  }
  return digits;
}



export default function CriarMusica() {
  // Número do suporte vem da configuração editável no painel (src/lib/configSite.js), não do código.
  const whatsappSuporte = useWhatsappSuporte();
  const [contingencyMode, setContingencyMode] = useState(false);
  const [step, setStep] = useState(1);
  const [showValidation, setShowValidation] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [isRestored, setIsRestored] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSelfTribute, setIsSelfTribute] = useState(false);
  const [customLyricsMode, setCustomLyricsMode] = useState(false);
  const [pastedLyricsText, setPastedLyricsText] = useState('');
  const [isEditingLyricsDirectly, setIsEditingLyricsDirectly] = useState(false);
  const [editingLyricsText, setEditingLyricsText] = useState('');
  const [lyricsSaveSuccess, setLyricsSaveSuccess] = useState(false);
  const [creationError, setCreationError] = useState('');

  useEffect(() => { readReferralCode(); }, []);


  useEffect(() => {
    let ativo = true;
    lerConfigSite().then((cfg) => {
      if (ativo && cfg?.contingencyMode) {
        setContingencyMode(true);
      }
    });
    return () => { ativo = false; };
  }, []);

  // Força reload da página após gerar a música para resetar o DOM e o AudioPlayer
  useEffect(() => {
    if (needsReload && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 6000); // 6s de delay para dar tempo das CDNs da Suno/Kie.ai propagarem o arquivo MP3
      return () => clearTimeout(timer);
    }
  }, [needsReload]);

  // Dispara ViewContent no TikTok Pixel ao acessar a página de criação
  useEffect(() => {
    trackTikTok('ViewContent', {
      contents: [
        {
          content_id: 'audio_only',
          content_type: 'product',
          content_name: 'Música Personalizada com IA',
        },
      ],
      value: 9.99,
      currency: 'BRL',
    });
  }, []);

  const handlePaymentApproved = (targetOrderId) => {
    const idToUse = targetOrderId || orderId;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nsmusic_order_draft');
    }
    try {
      const currentTraffic = getStoredTrafficSource();
      if (isOrderFromTikTok(currentTraffic)) {
        const purchaseKey = `tt_purchase_${idToUse}`;
        if (typeof window !== 'undefined' && !localStorage.getItem(purchaseKey)) {
          localStorage.setItem(purchaseKey, '1');
          identifyTikTok(formData.customerPhone, formData.customerEmail, idToUse);
          const eventId = `purchase_${idToUse}_musica`;
          const sku = 'audio_only';
          trackTikTok('CompletePayment', {
            contents: [
              {
                content_id: sku,
                content_type: 'product',
                content_name: 'Música Personalizada com IA',
              },
            ],
            value: getTotalPrice(),
            currency: 'BRL',
          }, { event_id: eventId });
        }
      }
      trackGooglePurchase({ orderId: idToUse, value: getTotalPrice() });
    } catch (trackErr) {
      console.warn('[criar] Falha não impeditiva no tracking de pagamento:', trackErr?.message);
    }
    setPixInfo(prev => ({ ...prev, status: 'approved' }));
    setTimeout(() => {
      window.location.href = `/entrega?orderId=${idToUse}&justPaid=1`;
    }, 450);
  };

  // Estados do Checkout Transparente
  const [pixInfo, setPixInfo] = useState(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [isPayingCard, setIsPayingCard] = useState(false);
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
              handlePaymentApproved(orderId);
              return;
            }
          }
        } catch (err) {
          console.warn("Erro no fetch do status do PIX (tentando fallback Firestore):", err);
        }

        // 2. Fallback: verifica se o pedido foi aprovado
        try {
          if (orderId) {
            const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
            if (res.ok) {
              const json = await res.json();
              const orderData = json?.order;
              if (orderData && (orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO')) {
                clearInterval(interval);
                handlePaymentApproved(orderId);
                return;
              }
            }
          }
        } catch (fbErr) {}
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [pixInfo, orderId]);
  
  const [formData, setFormData] = useState({
    // Step 1
    recipientType: '',
    // Step 2
    honoreeName: '',
    relationship: '',
    customRelationship: '',
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
    voiceType: '',
    coverUrl: '', // URL do Firebase Storage (ver M-08 no AUDIT_REPORT.md — nunca base64)
    // Step 8
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    termsAccepted: true,
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

  const TOTAL_JOURNEY_STEPS = 7; // Jornada total de 7 etapas no padrão Capivarinha Love
  const TOTAL_FORM_STEPS = 4; // Etapas do formulário Wizard (1: Pessoa, 2: História, 3: Estilo, 4: Contato)
  const [selectedPackageSku, setSelectedPackageSku] = useState('combo');
  const [sunoProgressPercent, setSunoProgressPercent] = useState(8);

  // Efeito assintótico de porcentagem para retenção na tela de estúdio (0% a 98%)
  useEffect(() => {
    if (formData.sunoStatus !== 'generating') {
      if (formData.sunoStatus === 'generated') {
        setSunoProgressPercent(100);
      }
      return;
    }

    setSunoProgressPercent(8);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - start) / 1000;
      let p;
      if (elapsedSec < 6) {
        p = 8 + elapsedSec * 3;
      } else if (elapsedSec < 18) {
        p = 26 + (elapsedSec - 6) * 2.5;
      } else if (elapsedSec < 35) {
        p = 56 + (elapsedSec - 18) * 1.5;
      } else if (elapsedSec < 55) {
        p = 81.5 + (elapsedSec - 35) * 0.65;
      } else {
        p = Math.min(97, 94.5 + (elapsedSec - 55) * 0.1);
      }
      setSunoProgressPercent(Math.round(p));
    }, 400);

    return () => clearInterval(interval);
  }, [formData.sunoStatus]);
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

  const handlePayWithCard = async () => {
    if (isPayingCard || isGeneratingPix) return;
    setIsPayingCard(true);
    setPaymentErrorMessage('');
    try {
      if (orderId) {
        try {
          await fetch('/api/orders/client-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              total: getTotalPrice(),
              package: formData.selectedPackage,
            }),
          });
        } catch (e) {
          console.warn(e);
        }
      }

      const sku = selectedPackageSku || 'combo';
      const cancelUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/criar?orderId=${encodeURIComponent(orderId)}&step=7`
        : undefined;
      const res = await fetch('/api/payments/stripe/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, sku, cancelUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data?.error || 'Não foi possível iniciar o pagamento com cartão.');
      }

      if (typeof window !== 'undefined' && window.fbq) {
        pushAdvancedMatching(formData.customerPhone, formData.customerEmail);
        window.fbq('track', 'InitiateCheckout', { value: getTotalPrice(), currency: 'BRL' });
      }

      identifyTikTok(formData.customerPhone, formData.customerEmail, orderId);
      trackTikTok('InitiateCheckout', {
        contents: [
          {
            content_id: sku || 'audio_only',
            content_type: 'product',
            content_name: 'Música Personalizada com IA',
          },
        ],
        value: getTotalPrice(),
        currency: 'BRL',
      });

      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error(err);
      setPaymentErrorMessage(err?.message || 'Falha ao conectar com o serviço de cartão. Tente novamente.');
      setIsPayingCard(false);
    }
  };
  const [phoneVerifyStatus, setPhoneVerifyStatus] = useState('idle'); // 'idle' | 'valid' | 'invalid'
  const [phoneVerifyMessage, setPhoneVerifyMessage] = useState('');
  const [recognizedVoice, setRecognizedVoice] = useState(null);
  const [checkingVoice, setCheckingVoice] = useState(false);

  // Validação de formato do telefone. Não existe mais checagem em tempo real de conta ativa no
  // WhatsApp — a API oficial da Meta (que substituiu o provedor não oficial W-API, banido repetidas
  // vezes) não expõe esse tipo de consulta. Só confere DDD + quantidade de dígitos.
  useEffect(() => {
    const phone = formData.customerPhone || '';
    const clean = normalizeBrazilPhoneDigits(phone);

    if (clean.length === 0) {
      setPhoneVerifyStatus('idle');
      setPhoneVerifyMessage('');
      setRecognizedVoice(null);
      return;
    }

    // Aceita DDD + 8 ou 9 dígitos — muita gente esquece o 9 inicial do celular.
    if (clean.length < 10) {
      setPhoneVerifyStatus('idle');
      setPhoneVerifyMessage('Digite o DDD + número do seu celular');
      setRecognizedVoice(null);
      return;
    }

    const ddd = clean.slice(0, 2);
    if (clean.length > 11 || !VALID_BRAZIL_DDDS.has(ddd)) {
      setPhoneVerifyStatus('invalid');
      setPhoneVerifyMessage('❌ DDD ou número inválido');
      setRecognizedVoice(null);
      return;
    }

    setPhoneVerifyStatus('valid');
    setPhoneVerifyMessage('✓ Número válido');

    // Consulta se este WhatsApp já tem um timbre de voz cadastrado ativo
    let cancel = false;
    setCheckingVoice(true);
    fetch(`/api/voice/check?phone=${clean}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancel) {
          if (data && data.found && data.voice) {
            setRecognizedVoice(data.voice);
            setFormData((prev) => ({
              ...prev,
              voiceType: 'minha_voz',
              customVoiceId: data.voice.voiceId,
            }));
          } else {
            setRecognizedVoice(null);
          }
        }
      })
      .catch(() => {
        if (!cancel) setRecognizedVoice(null);
      })
      .finally(() => {
        if (!cancel) setCheckingVoice(false);
      });

    return () => {
      cancel = true;
    };
  }, [formData.customerPhone]);

  // Restore draft from localStorage on load & check URL query params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const resetParam = urlParams.get('reset') || urlParams.get('new') || urlParams.get('novo');
        const ocasiaoParam = urlParams.get('ocasiao');
        const ocasiaoValida = occasions.some((o) => o.id === ocasiaoParam) ? ocasiaoParam : '';
        const origemParam = urlParams.get('origem');
        const orderRefParam = urlParams.get('orderRef');

        // Flag de sessão para que F5 / pull-to-refresh NÃO apague o rascunho em andamento
        const resetKey = `nsmusic_reset_done_${origemParam || ''}_${orderRefParam || ''}_${resetParam || ''}`;
        const alreadyHandledReset = sessionStorage.getItem(resetKey) === '1';

        // Apenas limpa o rascunho se o usuário clicou explicitamente em novo=1 e ainda não tratou nesta aba
        if ((resetParam === 'true' || resetParam === '1') && !alreadyHandledReset) {
          sessionStorage.setItem(resetKey, '1');
          localStorage.removeItem('nsmusic_order_draft');
          const initialUpdates = {};
          if (ocasiaoValida) initialUpdates.occasion = ocasiaoValida;
          if (orderRefParam && (origemParam === 'segunda_geracao' || origemParam === 'segunda_musica')) {
            initialUpdates.origem = origemParam;
            initialUpdates.orderRef = orderRefParam;
            initialUpdates.isSecondGeneration = true;
          }
          if (Object.keys(initialUpdates).length > 0) {
            setFormData((prev) => ({ ...prev, ...initialUpdates }));
          }
          setIsRestored(true);
          return;
        }

        const saved = localStorage.getItem('nsmusic_order_draft');
        if (saved) {
          const parsed = JSON.parse(saved);

          // Rascunho só é descartado automaticamente se o pedido já tiver sido PAGO e com áudio gerado
          const rascunhoPago = (parsed.formData?.paymentStatus === 'PAGO'
            || parsed.formData?.paymentStatus === 'PAGAMENTO_APROVADO') && (parsed.formData?.sunoStatus === 'generated' || parsed.step >= 6);
          if (rascunhoPago && parsed.orderId) {
            localStorage.removeItem('nsmusic_order_draft');
            window.location.href = `/entrega?orderId=${encodeURIComponent(parsed.orderId)}`;
            setIsRestored(true);
            return;
          }

          if (parsed.formData) {
            setFormData((prev) => ({
              ...prev,
              ...parsed.formData,
              ...(ocasiaoValida && !parsed.formData.occasion ? { occasion: ocasiaoValida } : {}),
              ...(orderRefParam ? { orderRef: orderRefParam, origem: origemParam || parsed.formData.origem || 'segunda_geracao', isSecondGeneration: true } : {}),
            }));
            if (parsed.formData.relationship === 'Eu mesmo' || parsed.formData.recipientType === 'Eu mesmo') {
              setIsSelfTribute(true);
            }
          } else if (ocasiaoValida) {
            setFormData((prev) => ({ ...prev, occasion: ocasiaoValida }));
          }

          if (parsed.orderId) setOrderId(parsed.orderId);
          if (parsed.taskId) setTaskId(parsed.taskId);
          if (parsed.selectedPackageSku) setSelectedPackageSku(parsed.selectedPackageSku);
          if (parsed.pixInfo) setPixInfo(parsed.pixInfo);

          if (parsed.step) {
            const rawStep = Number(parsed.step);
            let mappedStep = 1;
            if (rawStep >= 11 || rawStep === 7) mappedStep = 7;
            else if (rawStep === 10 || rawStep === 6) mappedStep = 6;
            else if (rawStep === 9 || rawStep === 5) mappedStep = 5;
            else if (rawStep >= 1 && rawStep <= 4) mappedStep = rawStep;
            else mappedStep = 1;
            setStep(mappedStep);
          }

          const savedTaskId = parsed.taskId;
          const currentOrderId = parsed.orderId;

          // Se estava aguardando áudio ou tem um taskId pendente
          if (savedTaskId && parsed.formData?.sunoStatus !== 'generated') {
            pollSunoStatus(savedTaskId, currentOrderId);
          } else if (currentOrderId && parsed.formData?.sunoStatus !== 'generated' && parsed.step >= 5) {
            checkOrderStatusInFirestore(currentOrderId, savedTaskId);
          }
        } else if (ocasiaoValida) {
          setFormData((prev) => ({ ...prev, occasion: ocasiaoValida }));
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
        const draft = { step, orderId, taskId, selectedPackageSku, pixInfo, formData };
        localStorage.setItem('nsmusic_order_draft', JSON.stringify(draft));
      } catch (e) {
        console.warn("Erro ao salvar rascunho:", e);
      }
    }
  }, [step, orderId, taskId, selectedPackageSku, pixInfo, formData, isRestored]);

  const checkOrderStatusInFirestore = async (targetOrderId, activeTaskId) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(targetOrderId)}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const data = json?.order;
        if ((data?.paymentStatus === 'PAGO' || data?.paymentStatus === 'PAGAMENTO_APROVADO') && ((data?.audioFiles && data.audioFiles.length > 0) || data?.audioUrl || data?.productionStatus === 'AUDIO_GERADO')) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('nsmusic_order_draft');
          }
          window.location.href = `/entrega?orderId=${encodeURIComponent(targetOrderId)}`;
          return;
        }
        if (data?.audioFiles && data.audioFiles.length > 0) {
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
      console.warn("Erro ao verificar status no recarregamento:", err);
    }
    if (activeTaskId) {
      pollSunoStatus(activeTaskId, targetOrderId);
      return;
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
    // &v= quebra cache de resposta quebrada já salva no navegador — ver src/lib/audioCacheVersion.js.
    return `/api/audio/proxy?url=${encodeURIComponent(raw)}&v=${AUDIO_CACHE_VERSION}`;
  };

  // Confirma que o áudio já responde de verdade (via o mesmo proxy que o player usa) antes de
  // redirecionar pra /entrega — evita mandar o cliente pra uma prévia que ainda não carrega porque
  // a Kie.ai reportou "pronto" antes do arquivo propagar de fato na CDN deles. Consome o corpo da
  // resposta inteiro (res.blob()) de propósito — o proxy manda Cache-Control immutable, mas sem ler
  // o body o navegador não termina de baixar/cachear o arquivo, e o player de /entrega baixava tudo
  // de novo do zero (era o "parece que tá baixando" antes de tocar).
  // Achado 09/09/2026: 6 tentativas x 2s (12s no total) não bastava pra CDN da Kie.ai propagar de
  // verdade em boa parte das gerações — o cliente era redirecionado assim mesmo (ver chamador
  // abaixo, que agora RESPEITA o retorno desta função em vez de ignorá-lo), caía numa prévia que
  // ainda não carregava em /entrega, achava que tinha dado falha e fechava a aba sem nem clicar no
  // WhatsApp. Mais tentativas e mais espaçadas dão à CDN uma chance real de terminar de propagar.
  const waitForAudioReady = async (rawUrl, maxAttempts = 10, delayMs = 3000) => {
    if (!rawUrl) return false;
    const proxiedUrl = `/api/audio/proxy?url=${encodeURIComponent(rawUrl)}&v=${AUDIO_CACHE_VERSION}`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(proxiedUrl, { signal: AbortSignal.timeout(20000) });
        if (res.ok) {
          // Só considera pronto se veio conteúdo de verdade: a CDN de origem já respondeu 200 com
          // corpo vazio (incidente 28/08/2026), o que fazia o cliente ser mandado pra /entrega com
          // uma prévia que nunca ia tocar.
          const blob = await res.blob();
          if (blob.size > 0) return true;
        }
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

  // Barra de progresso da tela de geração (pedido 18/09/2026: "acho que retém mais o cliente") — não
  // existe progresso real vindo da Suno (só sabemos "pronto" ou "ainda não"), então é uma estimativa
  // que se aproxima de 95% ao longo de ~2min (a duração típica, ver texto da tela) e nunca chega a
  // 100% sozinha — só quando sunoStatus vira 'generated' de verdade, o que já tira o cliente desta
  // tela (redireciona pra /entrega). Sem isso o cliente ficaria vendo "100%" parado, esperando ainda.
  // Saída de emergência da tela de produção (pedido 20/09/2026: "tenho música que tá travada nessa
  // tela... não teria tipo quando passar mais de 10 minutos aparecer o botão de resetar?").
  //
  // O polling normal já desiste em 6 minutos e mostra o painel de erro. Este relógio existe para o
  // que o polling NÃO cobre: aba em segundo plano (o navegador estrangula setInterval e o corte de
  // 6 min demora muito mais que 6 min), rede que caiu, ou qualquer caminho que deixe a tela viva
  // sem ninguém consultando nada. Depois disso o cliente sempre tem o que clicar.
  const [audioDemorouDemais, setAudioDemorouDemais] = useState(false);
  useEffect(() => {
    if (step !== 6 || formData.sunoStatus === 'generated') {
      setAudioDemorouDemais(false);
      return;
    }
    const timer = setTimeout(() => setAudioDemorouDemais(true), AUDIO_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [step, formData.sunoStatus]);




  // Valor promocional dinâmico de acordo com o pacote escolhido
  const getTotalPrice = () => getPriceForSku(selectedPackageSku) || 16.90;



  // Ditado por Voz (Web Speech API) sem duplicação de texto no mobile
  const [isListening, setIsListening] = useState(false);

  const toggleVoiceDictation = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCreationError("Seu navegador não possui suporte ao recurso de voz. Por favor, digite a história.");
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
          setCreationError('Não conseguimos captar sua fala. Verifique se o microfone está liberado para este site e tente falar logo após clicar em "Ditar por Voz".');
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        voiceDictationErrorHandledRef.current = true;
        if (event.error === 'aborted') return; // parada manual (usuário clicou em parar) — sem aviso
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setCreationError('O microfone está bloqueado para este site. Permita o acesso ao microfone nas configurações do navegador e tente de novo.');
        } else if (event.error === 'no-speech') {
          setCreationError('Não conseguimos ouvir nada. Tente falar logo após clicar em "Ditar por Voz", bem próximo do microfone.');
        } else {
          setCreationError('Não foi possível usar o ditado por voz agora. Tente novamente ou digite a história.');
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

  // Parar gravação de voz automaticamente se o usuário mudar de etapa ou se o step não for 2
  // (etapa "Conte sua história")
  useEffect(() => {
    if (step !== 2 && isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Erro ao parar ditado de voz ao sair da etapa 2:", e);
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

  const handlePhoneChange = (input) => {
    const raw = typeof input === 'string' ? input : (input?.target?.value ?? '');
    const clean = normalizeBrazilPhoneDigits(raw).slice(0, 11);
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

    // Salva o telefone no pedido assim que atingir formato completo (11 dígitos para celular com WhatsApp)
    if (clean.length === 11 && orderId) {
      fetch('/api/orders/client-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          customerPhone: formatted,
          productionStatus: 'ETAPA_4'
        })
      }).catch(() => {});
    }
  };

  const isPhoneValid = (phone) => {
    const clean = normalizeBrazilPhoneDigits(phone);
    // DDD + 8 dígitos (sem o 9, esquecimento comum) ou 9 dígitos (padrão atual) e DDD real —
    // ver VALID_BRAZIL_DDDS.
    if (clean.length !== 10 && clean.length !== 11) return false;
    const ddd = clean.slice(0, 2);
    if (!VALID_BRAZIL_DDDS.has(ddd)) return false;
    return true;
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
      setCreationError("A imagem selecionada é muito grande. Escolha uma imagem de até 10MB.");
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
      setCreationError(mensagem);
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
            const uploadData = new FormData();
            uploadData.append('file', blob, 'cover.jpg');
            const uploadRes = await fetch('/api/media/upload?folder=covers', {
              method: 'POST',
              body: uploadData
            });
            if (!uploadRes.ok) {
              throw new Error('Falha no upload da foto de capa');
            }
            const resJson = await uploadRes.json();
            if (!resJson?.url) {
              throw new Error('URL da foto não retornada');
            }
            updateField('coverUrl', resJson.url);
          } catch (err) {
            console.error("Erro ao enviar foto de capa para o R2:", err);
            setCreationError("Falha ao enviar a foto de capa. Tente novamente.");
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

  // Checa se o usuário já atingiu o limite de gerações gratuitas consultando a cota real no servidor
  const checkUserLimit = async (phone, email) => {
    try {
      const digits = phone ? phone.replace(/\D/g, '') : '';
      const hasEmail = email && email.includes('@');
      // Sem telefone ou e-mail identificado, o cliente ainda está rascunhando e não deve ser travado
      if (digits.length < 10 && !hasEmail) {
        return { totalCount: 0, hasPaid: false, restantes: 5, cota: 5, isBlocked: false };
      }

      const params = new URLSearchParams();
      if (phone) params.set('phone', phone);
      if (email) params.set('email', email);

      const res = await fetch(`/api/orders/check-limit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return {
          totalCount: data.totalCount || 0,
          hasPaid: (data.pagos || 0) > 0,
          restantes: data.restantes,
          cota: data.cota,
          isBlocked: Boolean(data.manualBlock),
          manualBlock: Boolean(data.manualBlock),
          reason: data.reason || null
        };
      }
      return { totalCount: 0, hasPaid: false, restantes: null, cota: null, isBlocked: false };
    } catch (e) {
      console.warn("Erro ao verificar limite de gerações:", e);
      return { totalCount: 0, hasPaid: false, restantes: null, cota: null, isBlocked: false };
    }
  };

  // Função para reiniciar o formulário e criar uma nova música do zero
  const handleCreateNewSongFromScratch = async () => {
    if (confirm("Deseja criar uma nova música do zero? O progresso da composição atual será limpo.")) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nsmusic_order_draft');
      }
      setOrderId('');
      setTaskId('');
      setIsSelfTribute(false);
      setFormData({
        recipientType: '',
        honoreeName: '',
        relationship: '',
        customRelationship: '',
        occasion: '',
        story: '',
        importantMoments: '',
        musicStyle: '',
        musicMood: '',
        requiredNames: '',
        requiredPhrase: '',
        voiceType: '',
        coverUrl: '',
        customerName: formData.customerName || '',
        customerPhone: formData.customerPhone || '',
        customerEmail: formData.customerEmail || '',
        termsAccepted: true,
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

  // Step 4 -> 5: Save Order to Firestore first, then trigger lyrics generation
  const handleSaveAndGenerateLyrics = async () => {
    if (isSubmitting) return;

    // Validações rigorosas antes de iniciar a geração da letra
    if (!formData.occasion || !formData.honoreeName?.trim()) {
      setCreationError('Por favor, preencha a ocasião e o nome do homenageado na Etapa 1.');
      setStep(1);
      return;
    }
    if ((formData.story || '').trim().length < 50) {
      setCreationError('Por favor, conte a história com no mínimo 50 caracteres na Etapa 2 para que a letra fique linda e exclusiva.');
      setStep(2);
      return;
    }
    if (!formData.musicStyle || !formData.musicMood || !formData.voiceType) {
      setCreationError('Por favor, selecione o ritmo, clima e voz na Etapa 3.');
      setStep(3);
      return;
    }
    if (!formData.customerPhone || !isPhoneValid(formData.customerPhone)) {
      setCreationError('Por favor, informe um WhatsApp válido com DDD na Etapa 4 para receber o link da sua música.');
      setStep(4);
      return;
    }

    setIsSubmitting(true);
    try {
      // Verifica trava de bloqueio manual (blacklist) no servidor antes de prosseguir
      const { isBlocked, manualBlock } = await checkUserLimit(formData.customerPhone, formData.customerEmail);
      if (isBlocked || manualBlock) {
        setIsSubmitting(false);
        setCreationError('Este contato foi bloqueado para novas gerações na plataforma. Entre em contato com o suporte para mais informações.');
        return;
      }

      setStep(5);
      // Se a letra já foi gerada com sucesso anteriormente, apenas exibe a letra existente sem fazer nova requisição
      if (formData.lyricsStatus === 'generated' && formData.lyrics) {
        setIsSubmitting(false);
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
      const effectiveRelationship = (formData.relationship === 'Outro' && formData.customRelationship?.trim())
        ? formData.customRelationship.trim()
        : (formData.relationship || (isSelfTribute ? 'Eu mesmo' : ''));

      if (!currentOrderId) {
        try {
          const traffic = getStoredTrafficSource();
          const authToken = await auth.currentUser?.getIdToken?.();
          const referralCode = readReferralCode();
          const refParam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('orderRef') || '') : '';
          const oriParam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('origem') || '') : '';
          const effectiveOrderRef = formData.orderRef || refParam || null;
          const effectiveOrigem = formData.origem || oriParam || (refParam ? 'segunda_geracao' : null);
          const effectiveIsSecondGen = Boolean(formData.isSecondGeneration || (effectiveOrderRef && (effectiveOrigem === 'segunda_geracao' || effectiveOrigem === 'segunda_musica')));

          const orderRes = await fetch('/api/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
            body: JSON.stringify({
              ...formData,
              orderRef: effectiveOrderRef,
              origem: effectiveOrigem,
              isSecondGeneration: effectiveIsSecondGen,
              relationship: effectiveRelationship,
              recipientType: effectiveRelationship,
              customVoiceId: recognizedVoice?.voiceId || null,
              isCustomVoice: formData.voiceType === 'minha_voz',
              referralCode,
              ...traffic
            })
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
            const errData = await orderRes.json().catch(() => ({}));
            setIsSubmitting(false);
            updateField('lyricsStatus', 'idle');
            setCreationError(errData?.error || 'Este contato foi bloqueado para novas gerações na plataforma. Entre em contato com o suporte.');
            return;
          }
        } catch (orderErr) {
          console.error("Erro ao criar pedido via API Backend:", orderErr);
        }
      }

      if (currentOrderId) {
        await fetch('/api/orders/client-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: currentOrderId,
            customerName: formData.customerName,
            customerPhone: formData.customerPhone,
            coverUrl: formData.coverUrl,
            productionStatus: 'LETRA_GERADA'
          })
        }).catch(() => {});
      }

      // Call lyrics generation with lightweight text payload (stripping Base64 coverUrl to prevent Safari Load failed errors)
      const { coverUrl, ...lightweightFormData } = formData;
      lightweightFormData.relationship = effectiveRelationship;
      lightweightFormData.recipientType = effectiveRelationship;

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
          await fetch('/api/orders/client-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: currentOrderId,
              lyrics: data.lyrics,
              productionStatus: 'LETRA_GERADA'
            })
          }).catch(e => console.warn(e));
        }

        if (typeof window !== 'undefined' && window.fbq) {
          window.fbq('trackCustom', 'GenerateLyrics');
        }
        trackTikTok('GenerateLyrics');
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
      const effectiveRelationship = (formData.relationship === 'Outro' && formData.customRelationship?.trim())
        ? formData.customRelationship.trim()
        : (formData.relationship || (isSelfTribute ? 'Eu mesmo' : ''));

      const response = await fetch('/api/lyrics/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentLyrics: formData.lyrics,
          comment: formData.lyricsComment,
          formData: {
            ...formData,
            relationship: effectiveRelationship,
            recipientType: effectiveRelationship,
          }
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
        // Update lyrics version in Supabase
        if (orderId) {
          await fetch('/api/orders/client-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, lyrics: data.lyrics })
          }).catch(e => console.warn(e));
        }
      } else {
        throw new Error('Falha ao ajustar');
      }
    } catch (err) {
      console.error(err);
      updateField('lyricsStatus', 'generated');
    }
  };

  const handleSaveDirectLyrics = async () => {
    const trimmed = (editingLyricsText || '').trim();
    if (trimmed.length < 15) {
      alert('A letra precisa ter pelo menos 15 caracteres.');
      return;
    }
    updateField('lyrics', trimmed);
    setIsEditingLyricsDirectly(false);
    setLyricsSaveSuccess(true);
    setTimeout(() => setLyricsSaveSuccess(false), 4000);
    if (orderId) {
      try {
        await fetch('/api/orders/client-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, lyrics: trimmed }),
        });
      } catch (e) {
        console.warn('Erro ao sincronizar letra editada:', e);
      }
    }
  };

  // Step 9 Approval -> Move to Audio Generation preview screen (Step 10) or WhatsApp (Contingency)
  const handleApproveLyrics = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Se as músicas já foram geradas com sucesso anteriormente, apenas navega para a etapa de áudio
      if (formData.sunoStatus === 'generated' && formData.sunoTracks && formData.sunoTracks.length > 0) {
        setStep(6);
        setIsSubmitting(false);
        return;
      }

      let activeOrderId = orderId;
      if (!activeOrderId) {
        try {
          const effectiveRelationship = (formData.relationship === 'Outro' && formData.customRelationship?.trim())
            ? formData.customRelationship.trim()
            : (formData.relationship || (isSelfTribute ? 'Eu mesmo' : ''));

          const traffic = getStoredTrafficSource();
          const authToken = await auth.currentUser?.getIdToken?.();
          const referralCode = readReferralCode();
          const refParam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('orderRef') || '') : '';
          const oriParam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('origem') || '') : '';
          const effectiveOrderRef = formData.orderRef || refParam || null;
          const effectiveOrigem = formData.origem || oriParam || (refParam ? 'segunda_geracao' : null);
          const effectiveIsSecondGen = Boolean(formData.isSecondGeneration || (effectiveOrderRef && (effectiveOrigem === 'segunda_geracao' || effectiveOrigem === 'segunda_musica')));

          const createRes = await fetch('/api/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
            body: JSON.stringify({
              ...formData,
              orderRef: effectiveOrderRef,
              origem: effectiveOrigem,
              isSecondGeneration: effectiveIsSecondGen,
              relationship: effectiveRelationship,
              recipientType: effectiveRelationship,
              customVoiceId: recognizedVoice?.voiceId || null,
              isCustomVoice: formData.voiceType === 'minha_voz',
              referralCode,
              userId: auth.currentUser ? auth.currentUser.uid : null,
              ...traffic
            })
          });
          if (createRes.ok) {
            const createData = await createRes.json();
            if (createData.orderId) {
              activeOrderId = createData.orderId;
              setOrderId(createData.orderId);
            }
          } else if (createRes.status === 403) {
            const errData = await createRes.json().catch(() => ({}));
            setIsSubmitting(false);
            setCreationError(errData?.error || 'Este contato foi bloqueado para novas gerações na plataforma. Entre em contato com o suporte.');
            return;
          }
        } catch (e) {
          console.error("Erro ao criar pedido antes do Suno/Contingência:", e);
        }
      }

      if (activeOrderId && formData.lyrics) {
        await fetch('/api/orders/client-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: activeOrderId,
            lyrics: formData.lyrics,
            productionStatus: contingencyMode ? 'CONTINGENCIA_WHATSAPP' : 'LETRA_APROVADA'
          })
        }).catch(e => console.warn('[criar] Falha ao persistir letra aprovada:', e));
      }

      // Se o Modo de Contingência estiver ativo no painel Admin:
      if (contingencyMode) {
        const msgWhatsapp = `Olá! Aprovei a letra da minha música no NS Music e gostaria de produzir o áudio! 🎵\n\n` +
          `👤 *Cliente:* ${formData.customerName || 'Cliente'}\n` +
          `❤️ *Homenageado(a):* ${formData.honoreeName || 'Alguém especial'}\n` +
          `🎸 *Estilo Musical:* ${formData.musicStyle || 'Personalizado'}\n` +
          `🎤 *Tipo de Voz:* ${formData.voiceType || 'Padrão'}\n` +
          (activeOrderId ? `🔖 *Pedido:* #${activeOrderId}\n\n` : '\n') +
          `📜 *LETRA DA MÚSICA:*\n${formData.lyrics}`;

        const urlWhatsapp = linkWhatsapp(whatsappSuporte, msgWhatsapp);
        window.location.href = urlWhatsapp;
        return;
      }

      setStep(6);
      updateField('sunoStatus', 'generating');
      updateField('sunoProgress', 'Enviando composição de letra ao Suno AI...');

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
      trackTikTok('GenerateMusic');

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
    const maxAttempts = 108; // 540 seconds (9 minutos) max — acomoda failover automático após 3 min
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

          if (statusData.newTaskId && statusData.newTaskId !== activeTaskId) {
            activeTaskId = statusData.newTaskId;
          }

          if (statusData.status === 'COMPLETED' && statusData.tracks && statusData.tracks.length > 0) {
            setFormData(prev => ({ ...prev, sunoTracks: statusData.tracks }));
            clearInterval(pollIntervalRef.current);

            // Garante que o documento do pedido em orders no Firebase receba os links reais dos áudios
            if (targetOrder) {
              const primaryAudio = getRawAudioUrl(statusData.tracks[0]);
              const audioFiles = statusData.tracks.map(getRawAudioUrl).filter(Boolean);
              await fetch('/api/orders/client-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: targetOrder,
                  audioUrl: primaryAudio,
                  audioFiles: audioFiles,
                  productionStatus: 'AUDIO_GERADO'
                })
              }).catch(e => console.warn("Aviso ao atualizar ordem:", e));

              // Dispara garantia da notificação de música pronta no WhatsApp
              fetch('/api/whatsapp/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: targetOrder })
              }).catch(e => console.warn("[criar] Aviso ao disparar notificação:", e));

              // sunoStatus fica em 'generating' (tela de loading, com o CTA de WhatsApp já visível)
              // até aqui de propósito — só vira 'generated' (tela de prévia com os players, mais
              // abaixo) se não der pra redirecionar. A Kie.ai às vezes reporta "pronto" antes do
              // arquivo terminar de propagar na CDN deles.
              //
              // Achado 09/09/2026: antes disso o redirecionamento acontecia SEMPRE, mesmo quando
              // waitForAudioReady nunca confirmava o áudio — o cliente caía numa /entrega com o
              // player travado em "Preparando sua prévia...", achava que tinha dado falha e fechava
              // a aba sem clicar no WhatsApp. Agora só redireciona quando o áudio já respondeu de
              // verdade; sem confirmação, fica na tela in-page (mesmo fallback já usado quando não
              // há orderId, com os players tocando pelo proxy e o card de WhatsApp logo abaixo).
              updateField('sunoProgress', 'Finalizando e conferindo o áudio...');
              await waitForAudioReady(primaryAudio);
              updateField('sunoStatus', 'generated');
              setStep(6);
            } else {
              updateField('sunoStatus', 'generated');
              setStep(6);
            }
          } else if (statusData.status === 'ERROR') {
            // Falha definitiva da IA, já com a retentativa automática e failover do servidor esgotados
            clearInterval(pollIntervalRef.current);
            updateField('sunoStatus', 'error');
            updateField('sunoProgress', statusData.error || 'A geração da música falhou. Tente novamente.');
          } else if (statusData.providerStatus === 'FALLBACK_KIE' || statusData.fallback) {
            updateField('sunoProgress', 'Refinando áudio no estúdio complementar...');
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

  // Corta a prévia em 60 segundos — ver o comentário equivalente em src/app/entrega/page.jsx
  // (reversão de 21/09/2026: liberar a música inteira antes do pagamento derrubou a conversão).
  const handleAudioTimeUpdate = (e) => {
    const audio = e.target;
    if (audio.currentTime > 60) {
      audio.pause();
      audio.currentTime = 60;
    }
  };


  // A Kie.ai entrega primeiro uma URL de streaming temporaria e so depois o MP3 final. Esta tela e
  // onde o cliente ouve primeiro, entao ela segue tocando o stream (que funciona nos primeiros
  // minutos) enquanto pede a troca pela definitiva por tras. Quando a definitiva chega, as faixas
  // sao substituidas aqui mesmo, sem interromper nada — nesta tela nao ha onSnapshot.
  usePromoverAudio(
    orderId,
    { audioFiles: formData.sunoTracks.map((f) => (typeof f === 'string' ? f : f?.audio_url)).filter(Boolean) },
    (audioFiles) => {
      setFormData((prev) => ({ ...prev, sunoTracks: audioFiles.map((url) => ({ audio_url: url })) }));
    }
  );

  const syncOrderProgress = async (targetStep, currentFormData = formData) => {
    try {
      const stepStatusMap = {
        1: 'ETAPA_1',
        2: 'ETAPA_2',
        3: 'ETAPA_3',
        4: 'ETAPA_4',
        5: 'LETRA_GERADA'
      };
      const statusToSet = stepStatusMap[targetStep] || `ETAPA_${targetStep}`;
      const effectiveRelationship = (currentFormData.relationship === 'Outro' && currentFormData.customRelationship?.trim())
        ? currentFormData.customRelationship.trim()
        : (currentFormData.relationship || (isSelfTribute ? 'Eu mesmo' : ''));

      let currentOrderId = orderId;
      if (!currentOrderId) {
        if (!currentFormData.honoreeName?.trim() && !currentFormData.customerName?.trim()) return;
        const traffic = getStoredTrafficSource();
        const authToken = await auth.currentUser?.getIdToken?.().catch(() => null);
        const referralCode = readReferralCode();
        const refParam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('orderRef') || '') : '';
        const oriParam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('origem') || '') : '';
        const effectiveOrderRef = currentFormData.orderRef || refParam || null;
        const effectiveOrigem = currentFormData.origem || oriParam || (refParam ? 'segunda_geracao' : null);
        const effectiveIsSecondGen = Boolean(currentFormData.isSecondGeneration || (effectiveOrderRef && (effectiveOrigem === 'segunda_geracao' || effectiveOrigem === 'segunda_musica')));

        const orderRes = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({
            ...currentFormData,
            orderRef: effectiveOrderRef,
            origem: effectiveOrigem,
            isSecondGeneration: effectiveIsSecondGen,
            relationship: effectiveRelationship,
            recipientType: effectiveRelationship,
            productionStatus: statusToSet,
            customVoiceId: recognizedVoice?.voiceId || null,
            isCustomVoice: currentFormData.voiceType === 'minha_voz',
            referralCode,
            ...traffic
          })
        });

        if (orderRes.ok) {
          const orderData = await orderRes.json();
          if (orderData.orderId) {
            setOrderId(orderData.orderId);
            currentOrderId = orderData.orderId;
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
        }
      } else {
        await fetch('/api/orders/client-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: currentOrderId,
            customerName: currentFormData.customerName,
            customerPhone: currentFormData.customerPhone,
            customerEmail: currentFormData.customerEmail,
            honoreeName: currentFormData.honoreeName,
            relationship: effectiveRelationship,
            recipientType: effectiveRelationship,
            occasion: currentFormData.occasion,
            story: currentFormData.story,
            musicStyle: currentFormData.musicStyle,
            musicMood: currentFormData.musicMood,
            voiceType: currentFormData.voiceType,
            coverUrl: currentFormData.coverUrl,
            productionStatus: statusToSet
          })
        }).catch(err => console.warn('Erro ao atualizar etapa do pedido:', err));
      }
    } catch (e) {
      console.warn('Erro ao sincronizar progresso do pedido:', e);
    }
  };

  const nextStep = () => {
    setCreationError('');
    setShowValidation(false);
    const target = step + 1;
    setStep(target);
    syncOrderProgress(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const prevStep = () => {
    setCreationError('');
    setShowValidation(false);
    const target = Math.max(step - 1, 1);
    setStep(target);
    syncOrderProgress(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Grava lead na Etapa 1 caso o cliente preencha os dados e permaneça na etapa
  useEffect(() => {
    if (step === 1 && !orderId && formData.honoreeName?.trim() && formData.customerName?.trim() && formData.occasion) {
      const timer = setTimeout(() => {
        syncOrderProgress(1);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [step, orderId, formData.honoreeName, formData.customerName, formData.occasion]);

  const isNextDisabled = () => {
    // Upload da foto de capa em andamento: não avança enquanto não terminar
    if (isUploadingCover) return true;

    // Etapa 1: Ocasião + Nome de quem dedica + Nome do homenageado + Relação
    if (step === 1) {
      const hasOccasion = Boolean(formData.occasion);
      const hasCustomer = Boolean(formData.customerName?.trim());
      const hasHonoree = Boolean(formData.honoreeName?.trim());
      const hasRelationship = isSelfTribute
        ? true
        : Boolean(formData.relationship?.trim()) && (formData.relationship !== 'Outro' || Boolean(formData.customRelationship?.trim()));
      if (!hasOccasion || !hasCustomer || !hasHonoree || !hasRelationship) return true;
    }
    // Etapa 2: História (mínimo 50 caracteres válidos com trim)
    if (step === 2 && (formData.story || '').trim().length < 50) return true;
    // Etapa 3: Ritmo, Clima e Tipo de Voz
    if (step === 3 && (!formData.musicStyle || !formData.musicMood || !formData.voiceType)) return true;
    // Etapa 4: Resumo, Capa, WhatsApp válido, Termos aceitos e validação cruzada das etapas anteriores
    if (step === 4 && (
      !formData.customerName?.trim() ||
      !formData.honoreeName?.trim() ||
      (!formData.relationship?.trim() && !isSelfTribute) ||
      (formData.relationship === 'Outro' && !formData.customRelationship?.trim()) ||
      (formData.story || '').trim().length < 50 ||
      !formData.musicStyle ||
      !isPhoneValid(formData.customerPhone)
    )) return true;
    // Etapa 5: Geração / Aprovação de Letra
    if (step === 5 && formData.lyricsStatus !== 'generated') return true;
    // Etapa 6: Geração de Áudio Suno
    if (step === 6 && formData.sunoStatus !== 'generated') return true;
    // Etapa 7: Checkout PIX
    if (step === 7 && !formData.selectedPackage) return true;
    return false;
  };

  const getMissingSummary = (curStep, data, selfTribute) => {
    if (curStep === 1) {
      const missing = [];
      if (!data.occasion) missing.push('Ocasião');
      if (!selfTribute && !data.relationship?.trim()) missing.push('Relação');
      if (data.relationship === 'Outro' && !data.customRelationship?.trim()) missing.push('Especificar relação');
      if (!data.honoreeName?.trim()) missing.push('Nome homenageado');
      if (!data.customerName?.trim()) missing.push('Seu nome');
      return missing.length ? `Falta preencher: ${missing.join(', ')}` : '';
    }
    if (curStep === 2) {
      const len = (data.story || '').trim().length;
      if (len === 0) return 'Escreva pelo menos 50 caracteres da história';
      return `Faltam ${50 - len} caracteres para o mínimo (50)`;
    }
    if (curStep === 3) {
      const missing = [];
      if (!data.musicStyle) missing.push('Estilo');
      if (!data.musicMood) missing.push('Clima da música');
      if (!data.voiceType) missing.push('Voz');
      return missing.length ? `Falta selecionar: ${missing.join(' e ')}` : '';
    }
    if (curStep === 4) {
      if (!isPhoneValid(data.customerPhone)) return 'Informe um WhatsApp com DDD válido';
      return 'Confira os dados para continuar';
    }
    return '';
  };

  const renderWizardStep = () => (
    <WizardSteps
      step={step}
      formData={formData}
      updateField={updateField}
      selectFieldAndAdvance={selectFieldAndAdvance}
      showValidation={showValidation}
      isListening={isListening}
      toggleVoiceDictation={toggleVoiceDictation}
      appendStoryPrompt={appendStoryPrompt}
      isUploadingCover={isUploadingCover}
      handleImageUpload={handleImageUpload}
      handlePhoneChange={handlePhoneChange}
      phoneVerifyStatus={phoneVerifyStatus}
      phoneVerifyMessage={phoneVerifyMessage}
      recognizedVoice={recognizedVoice}
      checkingVoice={checkingVoice}
      isSelfTribute={isSelfTribute}
      setIsSelfTribute={setIsSelfTribute}
    />
  );

  const getSunoPhaseText = (percent) => {
    if (percent < 18) return 'Harmonizando a melodia e definindo o tom da voz...';
    if (percent < 38) return 'Gravando instrumentos, violões, piano e ritmo no estúdio...';
    if (percent < 65) return 'Ajustando a interpretação vocal com a emoção perfeita...';
    if (percent < 85) return 'Masterizando a faixa e aplicando efeitos de estúdio...';
    if (percent < 98) return 'Finalizando suas 2 versões exclusivas completas...';
    return 'Músicas prontas! Carregando suas prévias exclusivas...';
  };

  const copyPixAction = (targetEl) => {
    if (!pixInfo?.qrCode) return;
    try {
      if (targetEl && typeof targetEl.select === 'function') {
        targetEl.select();
      }
    } catch (_) {}

    let copiedOk = false;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(pixInfo.qrCode);
        copiedOk = true;
      }
    } catch (_) {}

    if (!copiedOk) {
      try {
        const tempArea = document.createElement('textarea');
        tempArea.value = pixInfo.qrCode;
        tempArea.setAttribute('readonly', '');
        tempArea.style.position = 'absolute';
        tempArea.style.left = '-9999px';
        document.body.appendChild(tempArea);
        tempArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempArea);
        copiedOk = true;
      } catch (_) {}
    }

    if (copiedOk) {
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
    }
  };

  const handleSelectPackage = (sku) => {
    setSelectedPackageSku(sku);
    setPixInfo(null);
    setPaymentErrorMessage('');
  };

  const renderWorkflowStep = () => {
    switch (step) {
      case 5: // Etapa 5: Geração de Letra & Edição / Opção "Já tenho minha letra" (Padrão Capivarinha Love)
        return (
          <div style={{ maxWidth: '34rem', margin: '0 auto' }}>
            {customLyricsMode ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '24px 20px', border: '1.5px solid #F1E4E8', boxShadow: '0 4px 18px rgba(0,0,0,0.03)' }}>
                <span className="wz-guide">5 DE 7 · A LETRA</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <h2 className="wz-t" style={{ fontSize: '1.35rem', margin: 0 }}>Colar Minha Própria Letra ✍️</h2>
                    <p className="wz-s" style={{ margin: '4px 0 0', fontSize: '0.86rem' }}>
                      Cole ou digite a composição preparada para {formData.honoreeName || 'alguém especial'}.
                    </p>
                  </div>
                  {formData.lyrics && (
                    <button
                      type="button"
                      onClick={() => setCustomLyricsMode(false)}
                      style={{ background: 'none', border: 'none', color: '#857D80', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', padding: '4px 6px' }}
                    >
                      ✕ Cancelar
                    </button>
                  )}
                </div>

                <textarea
                  value={pastedLyricsText}
                  onChange={(e) => setPastedLyricsText(e.target.value)}
                  placeholder={"Cole aqui a sua letra completa...\n\nExemplo:\n[Verso 1]\nLembro do dia em que nos conhecemos,\num sorriso que mudou o meu viver...\n\n[Refrão]\nVocê é minha vida, minha inspiração,\nessa canção é do meu coração..."}
                  className="wz-inp"
                  style={{
                    minHeight: '260px',
                    lineHeight: '1.6',
                    fontFamily: 'inherit',
                    marginBottom: '8px',
                    resize: 'vertical'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '0.78rem', color: '#857D80' }}>
                  <span>Dica: organize com [Verso] e [Refrão] para guiar a voz.</span>
                  <span>{(pastedLyricsText || '').length} caracteres</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const trimmed = (pastedLyricsText || '').trim();
                      if (trimmed.length < 15) {
                        setCreationError('Por favor, cole uma letra com pelo menos 15 caracteres.');
                        return;
                      }
                      updateField('lyrics', trimmed);
                      updateField('lyricsStatus', 'generated');
                      updateField('lyricsVersion', 1);
                      setCustomLyricsMode(false);
                      if (orderId) {
                        try {
                          await fetch('/api/orders/client-update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId, lyrics: trimmed })
                          });
                        } catch (e) {
                          console.warn('Erro ao sincronizar letra personalizada:', e);
                        }
                      }
                    }}
                    className="btn-wz-primary"
                    style={{ width: '100%' }}
                  >
                    Salvar e Usar Esta Letra
                  </button>

                  {formData.lyrics && (
                    <button
                      type="button"
                      onClick={() => setCustomLyricsMode(false)}
                      className="btn-wz-back"
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      Voltar para Letra Gerada por IA
                    </button>
                  )}
                </div>
              </div>
            ) : formData.lyricsStatus === 'generating' ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '20px', border: '1.5px solid #F1E4E8', boxShadow: '0 4px 18px rgba(0,0,0,0.03)' }}>
                <span className="wz-guide">5 DE 7 · COMPOSIÇÃO POÉTICA</span>
                <StudioLyricsAnimation />
                <h2 className="wz-t" style={{ fontSize: '1.35rem', marginTop: '16px' }}>
                  Escrevendo a sua letra... ✨
                </h2>
                <p style={{ color: '#E32B6D', fontSize: '0.94rem', fontWeight: '700', marginTop: '8px', minHeight: '30px' }}>
                  {studioLyricsPhrases[lyricsStepIdx]}
                </p>
                <p className="wz-s" style={{ margin: '8px auto 0', maxWidth: '420px' }}>
                  Nossa Inteligência Poética está rimando momentos e memórias para emocionar {formData.honoreeName || 'quem você ama'}.
                </p>

                <div style={{ marginTop: '24px', borderTop: '1px solid #F1E4E8', paddingTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setPastedLyricsText(formData.lyrics || '');
                      setCustomLyricsMode(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 18px',
                      borderRadius: '100px',
                      border: '1.5px dashed #E32B6D',
                      backgroundColor: '#FFF7F9',
                      color: '#B5124E',
                      fontSize: '0.86rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    <span>✍️</span>
                    <span>Já tenho minha letra pronta (Quero colar a minha)</span>
                  </button>
                </div>
              </div>
            ) : formData.lyricsStatus === 'error' ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1.5px solid #fecdd3', padding: '32px 20px', textAlign: 'center', boxShadow: '0 4px 18px rgba(0,0,0,0.03)' }}>
                <span className="wz-guide">5 DE 7 · COMPOSIÇÃO</span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#dc2626', margin: '8px 0' }}>
                  Não foi possível compor a letra agora
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 auto 16px', maxWidth: '420px' }}>
                  {formData.lyricsError || 'Ocorreu uma oscilação na conexão com o estúdio de composição. Tente novamente.'}
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button 
                    onClick={handleSaveAndGenerateLyrics}
                    className="btn-wz-primary"
                    style={{ flex: 'none', padding: '12px 24px' }}
                  >
                    Tentar Novamente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPastedLyricsText(formData.lyrics || '');
                      setCustomLyricsMode(true);
                    }}
                    className="btn-wz-back"
                    style={{ flex: 'none' }}
                  >
                    Colar Minha Própria Letra
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <span className="wz-guide">5 DE 7 · A LETRA</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <h1 className="wz-t" style={{ margin: 0 }}>Sua Letra Exclusiva ✨</h1>
                    <p className="wz-s" style={{ margin: '4px 0 0' }}>
                      Composta com amor para {formData.honoreeName || 'alguém especial'}. Se gostar, aprove para gravar!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPastedLyricsText(formData.lyrics || '');
                      setCustomLyricsMode(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '100px',
                      border: '1.5px solid #F1E4E8',
                      backgroundColor: '#ffffff',
                      color: '#1E1418',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    <span>✍️</span>
                    <span>Colar outra letra</span>
                  </button>
                </div>

                {contingencyMode && (
                  <div style={{ padding: '14px 16px', borderRadius: '16px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.3rem' }}>📲</span>
                    <div style={{ fontSize: '0.86rem', color: '#166534', fontWeight: '600' }}>
                      <strong>Produção via WhatsApp:</strong> Ao aprovar sua letra, nossa equipe gera a música no WhatsApp imediatamente!
                    </div>
                  </div>
                )}

                {/* Card da Letra */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1.5px solid #F1E4E8', padding: '20px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#B5124E', letterSpacing: '0.05em' }}>
                      LETRA DA MÚSICA · VERSÃO {formData.lyricsVersion || 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingLyricsDirectly) {
                          setIsEditingLyricsDirectly(false);
                        } else {
                          setEditingLyricsText(formData.lyrics || '');
                          setIsEditingLyricsDirectly(true);
                          setLyricsSaveSuccess(false);
                        }
                      }}
                      style={{
                        background: isEditingLyricsDirectly ? '#F1E4E8' : '#FFF7F9',
                        border: '1px solid #FCE4ED',
                        color: '#B5124E',
                        padding: '5px 12px',
                        borderRadius: '100px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      {isEditingLyricsDirectly ? '✕ Cancelar' : '✏️ Editar Letra'}
                    </button>
                  </div>

                  {lyricsSaveSuccess && (
                    <div style={{ padding: '10px 14px', borderRadius: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.84rem', fontWeight: '700', marginBottom: '12px' }}>
                      ✅ Letra atualizada! Essa versão será usada na gravação.
                    </div>
                  )}

                  {isEditingLyricsDirectly ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <textarea
                        value={editingLyricsText}
                        onChange={(e) => setEditingLyricsText(e.target.value)}
                        className="wz-inp"
                        style={{ minHeight: '320px', lineHeight: '1.7', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={handleSaveDirectLyrics}
                          className="btn-wz-primary"
                          style={{ padding: '10px' }}
                        >
                          💾 Salvar Letra
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingLyricsDirectly(false)}
                          className="btn-wz-back"
                          style={{ padding: '10px 16px' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, color: '#1E1418', fontSize: '0.94rem', fontFamily: 'inherit' }}>
                      {formData.lyrics}
                    </div>
                  )}
                </div>

                {/* Box de Ajustes com IA ou WhatsApp */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1.5px solid #F1E4E8', padding: '18px 20px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1rem' }}>✏️</span>
                    <label style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1E1418', margin: 0 }}>
                      Gostaria de mudar algo na composição?
                    </label>
                  </div>
                  <textarea
                    value={formData.lyricsComment}
                    onChange={(e) => updateField('lyricsComment', e.target.value)}
                    placeholder="Ex: mencione a nossa viagem para a praia no segundo verso..."
                    className="wz-inp"
                    style={{ minHeight: '80px', marginBottom: '10px', fontSize: '0.9rem' }}
                  />
                  <button
                    type="button"
                    onClick={requestLyricsAdjustment}
                    disabled={!formData.lyricsComment.trim()}
                    className="btn-wz-back"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Solicitar Ajuste Gratuito à IA
                  </button>
                </div>

                <div style={{ marginTop: '14px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleCreateNewSongFromScratch}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#857D80',
                      fontSize: '0.82rem',
                      fontWeight: '600',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: '6px 10px'
                    }}
                  >
                    🔄 Deseja recomeçar e fazer uma música do zero?
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case 6: // Etapa 6: Produção Musical Suno & Prévia com Barra de Porcentagem
        return (
          <div style={{ maxWidth: '34rem', margin: '0 auto' }}>
            {formData.sunoStatus !== 'generated' ? (
              <div className="suno-retention-box">
                <span className="wz-guide">6 DE 7 · ESTÚDIO MUSICAL</span>
                <StudioAudioAnimation />
                <h2 className="wz-t" style={{ fontSize: '1.4rem', marginTop: '12px' }}>
                  Gravando suas 2 versões... 🎙️
                </h2>

                <div className="suno-percent-badge">
                  {sunoProgressPercent}%
                </div>

                <div className="suno-progress-track">
                  <div className="suno-progress-fill" style={{ width: `${sunoProgressPercent}%` }} />
                </div>

                <p className="suno-phase-text">
                  {getSunoPhaseText(sunoProgressPercent)}
                </p>

                <div className="suno-retention-tip">
                  <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>⏳</span>
                  <div>
                    <strong style={{ color: '#B5124E', display: 'block', marginBottom: '3px' }}>
                      Fique nesta tela para ouvir em primeira mão!
                    </strong>
                    <span>
                      Tempo estimado: ~45 a 60 segundos. Seus 2 arranjos também serão enviados para o seu WhatsApp {formData.customerPhone}.
                    </span>
                  </div>
                </div>

                {audioDemorouDemais && formData.sunoStatus !== 'error' && (
                  <div style={{ marginTop: '16px', background: '#fffbeb', border: '1px solid #fde68a', padding: '14px', borderRadius: '14px', textAlign: 'left' }}>
                    <p style={{ fontWeight: '700', fontSize: '0.9rem', color: '#92400e', margin: '0 0 6px' }}>
                      Está demorando um pouco mais que o normal ⏳
                    </p>
                    <p style={{ fontSize: '0.82rem', color: '#78350f', margin: '0 0 10px', lineHeight: 1.4 }}>
                      Na maioria das vezes a música já ficou pronta no estúdio. Clique abaixo para conferir:
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioDemorouDemais(false);
                        if (orderId) checkOrderStatusInFirestore(orderId, taskId);
                      }}
                      className="btn-wz-primary"
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    >
                      🔍 Conferir se já ficou pronta
                    </button>
                  </div>
                )}

                {formData.sunoStatus === 'error' && (
                  <div style={{ marginTop: '16px', background: '#fef2f2', border: '1px solid #fecaca', padding: '14px', borderRadius: '14px', color: '#b91c1c' }}>
                    <p style={{ fontWeight: '700', fontSize: '0.9rem', margin: '0 0 6px' }}>Imprevisto no estúdio automático</p>
                    <p style={{ fontSize: '0.82rem', margin: '0 0 10px' }}>{formData.sunoProgress}</p>
                    <button
                      type="button"
                      onClick={handleApproveLyrics}
                      className="btn-wz-primary"
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    >
                      🔄 Tentar Novamente
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <span className="wz-guide">6 DE 7 · SUAS MÚSICAS ESTÃO PRONTAS</span>
                <h1 className="wz-t">Ouça suas prévias! 🎧</h1>
                <p className="wz-s">
                  Criamos 2 arranjos diferentes para {formData.honoreeName || 'alguém especial'}. Ambas completas estão inclusas no seu pacote!
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                  {/* Versão 1 Preview Card */}
                  <CustomAudioPreview
                    src={getAudioUrl(formData.sunoTracks[0])}
                    label={`Música ${formData.honoreeName || 'Personalizada'} (Arranjo 1)`}
                    badge={`VERSÃO 1 - ESTILO ${formData.musicStyle?.toUpperCase() || 'PRINCIPAL'}`}
                    isBonus={false}
                    orderId={orderId}
                  />

                  {/* Versão 2 Preview Card */}
                  {formData.sunoTracks[1] && (
                    <CustomAudioPreview
                      src={getAudioUrl(formData.sunoTracks[1])}
                      label={`Versão ${formData.honoreeName || 'Personalizada'} (Arranjo 2)`}
                      badge="VERSÃO 2 - ARRANJO ALTERNATIVO BÔNUS"
                      isBonus={true}
                      orderId={orderId}
                    />
                  )}
                </div>

                <div style={{ marginTop: '14px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleCreateNewSongFromScratch}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#857D80',
                      fontSize: '0.84rem',
                      fontWeight: '600',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: '8px 12px'
                    }}
                  >
                    🔄 Não gostou da prévia? Fazer outra música do zero
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case 7: // Etapa 7: Escolha do Presente & Pagamento (Padrão Capivarinha Love)
        if (formData.isSecondGeneration || formData.origem === 'segunda_geracao') {
          return (
            <div style={{ maxWidth: '34rem', margin: '0 auto', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '20px', border: '1.5px solid #86efac', padding: '32px 20px', boxShadow: '0 4px 18px rgba(16, 185, 129, 0.08)' }}>
              <span style={{ fontSize: '3rem', display: 'block', marginBottom: '8px' }}>🎉</span>
              <span className="wz-guide" style={{ color: '#059669' }}>2ª GERAÇÃO LIBERADA</span>
              <h2 className="wz-t" style={{ fontSize: '1.4rem', color: '#14532d', margin: '8px 0 10px' }}>
                Suas +2 Músicas Bônus Estão Prontas!
              </h2>
              <p className="wz-s" style={{ color: '#166534', margin: '0 auto 20px', maxWidth: '420px', lineHeight: 1.6 }}>
                Você concluiu suas 4 músicas completas inclusas no seu pacote. Você pode baixar todos os áudios e conferir seus presentes agora mesmo!
              </p>
              <Link
                href={`/entrega?orderId=${encodeURIComponent(orderId)}`}
                className="btn-wz-primary"
                style={{ display: 'inline-block', width: '100%', padding: '15px', textDecoration: 'none', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)' }}
              >
                Ver e Baixar Minhas Músicas no Painel →
              </Link>
            </div>
          );
        }

        return (
          <div style={{ maxWidth: '34rem', margin: '0 auto' }}>
            <span className="wz-guide">7 DE 7 · ESCOLHA SEU PRESENTE</span>
            <h1 className="wz-t" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🎁</span> Escolha o seu presente
            </h1>
            <p className="wz-s">
              Ao escolher qualquer opção, você libera o download imediato das suas músicas completas sem corte!
            </p>

            {paymentErrorMessage && (
              <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '14px', marginBottom: '16px', color: '#dc2626', fontWeight: 'bold', fontSize: '0.88rem', textAlign: 'center' }}>
                {paymentErrorMessage}
              </div>
            )}

            {/* Os 3 Cards do Presente Idênticos à Imagem do Usuário */}
            <div className="presente-list">
              {/* Card 1: 4 Músicas Personalizadas (R$ 9,99) */}
              <div
                className={`presente-card ${selectedPackageSku === 'audio_only' ? 'on' : ''}`}
                onClick={() => handleSelectPackage('audio_only')}
              >
                <div className="presente-radio">
                  {selectedPackageSku === 'audio_only' && <div className="presente-radio-dot" />}
                </div>
                <div className="presente-content">
                  <div className="presente-header">
                    <h3 className="presente-title">🎵 4 Músicas Personalizadas</h3>
                    <span className="presente-price">R$ 9,99</span>
                  </div>
                  <p className="presente-desc">
                    Estas 2 completas, sem corte + mais 2 liberadas depois do pagamento, com outra letra e outro estilo.
                  </p>
                </div>
              </div>

              {/* Card 2: 4 Músicas + Carta Virtual (R$ 13,90) */}
              <div
                className={`presente-card ${selectedPackageSku === 'combo_carta' ? 'on' : ''}`}
                onClick={() => handleSelectPackage('combo_carta')}
              >
                <div className="presente-radio">
                  {selectedPackageSku === 'combo_carta' && <div className="presente-radio-dot" />}
                </div>
                <div className="presente-content">
                  <div className="presente-header">
                    <h3 className="presente-title">💌 4 Músicas + Carta Virtual</h3>
                    <span className="presente-price">R$ 13,90</span>
                  </div>
                  <p className="presente-desc">
                    Suas 4 músicas + uma carta com envelope, foto colada e sua assinatura.
                  </p>
                </div>
              </div>

              {/* Card 3: 4 Músicas + Vídeo Homenagem (R$ 16,90) [MAIS ESCOLHIDO] */}
              <div
                className={`presente-card ${selectedPackageSku === 'combo' ? 'on' : ''}`}
                onClick={() => handleSelectPackage('combo')}
              >
                <span className="badge-mais-escolhido">MAIS ESCOLHIDO</span>
                <div className="presente-radio">
                  {selectedPackageSku === 'combo' && <div className="presente-radio-dot" />}
                </div>
                <div className="presente-content">
                  <div className="presente-header">
                    <h3 className="presente-title">🎬 4 Músicas + Vídeo Homenagem</h3>
                    <span className="presente-price">R$ 16,90</span>
                  </div>
                  <p className="presente-desc">
                    Suas 4 músicas + um lindo vídeo slideshow sincronizado com suas fotos para emocionar.
                  </p>
                </div>
              </div>

              {/* Card 4: 4 Músicas + Retrospectiva (R$ 19,90) [MAIS COMPLETO] */}
              <div
                className={`presente-card ${selectedPackageSku === 'combo_retrospectiva' ? 'on' : ''}`}
                onClick={() => handleSelectPackage('combo_retrospectiva')}
              >
                <span className="badge-mais-completo">MAIS COMPLETO</span>
                <div className="presente-radio">
                  {selectedPackageSku === 'combo_retrospectiva' && <div className="presente-radio-dot" />}
                </div>
                <div className="presente-content">
                  <div className="presente-header">
                    <h3 className="presente-title">💝 4 Músicas + Retrospectiva</h3>
                    <span className="presente-price">R$ 19,90</span>
                  </div>
                  <p className="presente-desc">
                    Suas 4 músicas tocando numa página só de vocês: fotos, linha do tempo, contador dos dias, jogos e carta.
                  </p>
                </div>
              </div>

              {/* Card 5: 4 Músicas + Minha Voz (R$ 24,90) [EXCLUSIVO IA] */}
              <div
                className={`presente-card ${selectedPackageSku === 'combo_voz' ? 'on' : ''}`}
                onClick={() => handleSelectPackage('combo_voz')}
              >
                <span className="badge-exclusivo">EXCLUSIVO IA</span>
                <div className="presente-radio">
                  {selectedPackageSku === 'combo_voz' && <div className="presente-radio-dot" />}
                </div>
                <div className="presente-content">
                  <div className="presente-header">
                    <h3 className="presente-title">🎙️ 4 Músicas + Minha Voz</h3>
                    <span className="presente-price">R$ 24,90</span>
                  </div>
                  <p className="presente-desc">
                    Suas 4 músicas cantadas no timbre da sua própria voz através de clonagem vocal por IA.
                  </p>
                </div>
              </div>
            </div>

            {/* Box de Pagamento PIX e Cartão */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1.5px solid #F1E4E8', padding: '22px 20px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                      borderRadius: '10px',
                      backgroundColor: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.15rem',
                      flexShrink: 0,
                    }}
                  >
                    ⚡
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', color: '#0f172a', fontWeight: '800', margin: 0 }}>
                      Pagamento via PIX Instantâneo
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700' }}>
                      ✓ Liberação automática e imediata
                    </span>
                  </div>
                </div>

                {/* Área de Pagamento PIX e Cartão Transparente */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '6px' }}>
                    {!pixInfo ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button
                          type="button"
                          disabled={isGeneratingPix || isPayingCard}
                          onClick={async () => {
                          setIsGeneratingPix(true);
                          setPaymentErrorMessage('');
                          if (!formData.customerPhone || !isPhoneValid(formData.customerPhone)) {
                            setPaymentErrorMessage('Por favor, informe um WhatsApp válido com DDD antes de gerar o PIX.');
                            setIsGeneratingPix(false);
                            return;
                          }
                          try {
                            if (orderId) {
                              // hasVideoAccess NUNCA é definido aqui: é um flag de acesso a produto pago
                              // e só pode ser concedido pelo servidor após confirmação de pagamento
                              // (ver C-09/A-07 em docs/audit/AUDIT_REPORT.md).
                              try {
                                await fetch('/api/orders/client-update', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    orderId,
                                    total: getTotalPrice(),
                                    package: formData.selectedPackage,
                                    pixRequestedAt: new Date().toISOString()
                                  })
                                });
                              } catch (e) {
                                console.warn(e);
                                setPaymentErrorMessage('Não foi possível salvar os dados do pedido. Verifique sua internet e tente novamente.');
                                setIsGeneratingPix(false);
                                return;
                              }
                            }

                            const sku = selectedPackageSku || 'combo';
                            // Retentativa compartilhada com o checkout de /entrega (ver
                            // src/lib/pixCheckout.js): a chamada à Efí falha de forma intermitente e
                            // insistir resolve, em vez de devolver um erro para o cliente que estava
                            // com o cartão na mão.
                            const resultado = await requestPixCharge({ orderId, sku });
                            if (resultado.ok) {
                              // IMPORTANTE: não gravar paymentId aqui. O servidor (/api/payments/create)
                              // já persiste o txid pendente em paymentIntentId. O campo paymentId só pode
                              // ser escrito pelo servidor após aprovação real (ver applyPaymentApproval em
                              // src/lib/payments.js) — gravá-lo aqui, ainda pendente, é o que permitia que
                              // /api/payments/status aprovasse o pedido sem nunca checar a Efí (bug da
                              // aprovação falsa).
                              setPixInfo(resultado.data);

                              if (typeof window !== 'undefined' && window.fbq) {
                                // Correspondência avançada manual: telefone é obrigatório e já validado
                                // aqui, e-mail é opcional e só entra quando preenchido.
                                pushAdvancedMatching(formData.customerPhone, formData.customerEmail);
                                // Valor real do carrinho (9.99 ou 16.89 com vídeo), não um fixo — combo
                                // era subcontado como se fosse sempre a música avulsa.
                                window.fbq('track', 'InitiateCheckout', { value: getTotalPrice(), currency: 'BRL' });
                              }

                              identifyTikTok(formData.customerPhone, formData.customerEmail, orderId);
                              trackTikTok('InitiateCheckout', {
                                contents: [
                                  {
                                    content_id: sku || 'audio_only',
                                    content_type: 'product',
                                    content_name: 'Música Personalizada com IA',
                                  },
                                ],
                                value: getTotalPrice(),
                                currency: 'BRL',
                              });
                            } else {
                              setPaymentErrorMessage(resultado.error);
                            }
                          } catch (err) {
                            console.error(err);
                            setPaymentErrorMessage('Falha ao conectar com o serviço de pagamento. Tente novamente.');
                          } finally {
                            setIsGeneratingPix(false);
                          }
                        }}
                        className="btn btn-primary"
                        style={{ padding: '16px', fontSize: '1.05rem', fontWeight: '800', borderRadius: '14px', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: '0 4px 16px rgba(5, 150, 105, 0.3)' }}
                      >
                        {isGeneratingPix ? '⏳ Gerando PIX...' : `⚡ Pagar com PIX (R$ ${getTotalPrice().toFixed(2).replace('.', ',')})`}
                      </button>

                      <button
                        type="button"
                        disabled={isGeneratingPix || isPayingCard}
                        onClick={handlePayWithCard}
                        style={{
                          padding: '16px',
                          fontSize: '1.05rem',
                          fontWeight: '800',
                          borderRadius: '14px',
                          background: '#ffffff',
                          color: '#1e293b',
                          border: '1.5px solid #cbd5e1',
                          cursor: (isGeneratingPix || isPayingCard) ? 'default' : 'pointer',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        {isPayingCard ? '⏳ Abrindo Checkout Seguro...' : `💳 Pagar com Cartão de Crédito (R$ ${getTotalPrice().toFixed(2).replace('.', ',')})`}
                      </button>
                    </div>
                  ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', background: '#f8fafc', padding: '24px 20px', borderRadius: '20px', border: '1.5px solid #e2e8f0', maxWidth: '100%' }}>
                        <span style={{ fontSize: '0.88rem', color: '#059669', fontWeight: '800', backgroundColor: '#ecfdf5', padding: '4px 14px', borderRadius: '999px', border: '1px solid #a7f3d0' }}>
                          ✅ QR Code PIX Gerado com Sucesso!
                        </span>

                        {pixPollingTimedOut && (
                          <div style={{ width: '100%', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', color: '#92400e', fontSize: '0.85rem', textAlign: 'center' }}>
                            Ainda não recebemos a confirmação automática deste pagamento. Se você já
                            pagou, use o botão &quot;Já Paguei&quot; abaixo para verificar manualmente.
                          </div>
                        )}

                        {/* QR Code como caminho principal: parte dos clientes não localizava o
                            botão de copiar e desistia do pagamento. */}
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '0.86rem', color: '#475569', marginBottom: '10px' }}>
                            Abra o app do seu banco e aponte a câmera para o QR Code:
                          </p>
                          <PixQrCode payload={pixInfo.qrCode} />
                        </div>

                        {(() => {
                          const copyPixAction = (targetEl) => {
                            if (!pixInfo?.qrCode) return;
                            try {
                              if (targetEl && typeof targetEl.select === 'function') {
                                targetEl.select();
                              }
                            } catch (_) {}

                            let copiedOk = false;
                            try {
                              if (navigator?.clipboard?.writeText) {
                                navigator.clipboard.writeText(pixInfo.qrCode);
                                copiedOk = true;
                              }
                            } catch (_) {}

                            if (!copiedOk) {
                              try {
                                const tempArea = document.createElement('textarea');
                                tempArea.value = pixInfo.qrCode;
                                tempArea.setAttribute('readonly', '');
                                tempArea.style.position = 'absolute';
                                tempArea.style.left = '-9999px';
                                document.body.appendChild(tempArea);
                                tempArea.select();
                                document.execCommand('copy');
                                document.body.removeChild(tempArea);
                              } catch (_) {}
                            }

                            setPixCopied(true);
                            setTimeout(() => setPixCopied(false), 3000);
                            if (orderId) {
                              fetch('/api/payments/pix-copied', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId }),
                              }).catch(() => {});
                            }
                          };

                          return (
                            <>
                              <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <label htmlFor="pix-copia-cola-criar" style={{ fontSize: '0.82rem', color: '#475569', fontWeight: '600', cursor: 'pointer' }}>
                                    Ou use o código PIX Copia e Cola:
                                  </label>
                                  <span style={{ fontSize: '0.72rem', color: pixCopied ? '#059669' : '#64748b', fontWeight: '600' }}>
                                    {pixCopied ? '✅ Copiado!' : '👆 Clique na caixa para copiar'}
                                  </span>
                                </div>
                                <textarea
                                  id="pix-copia-cola-criar"
                                  readOnly
                                  value={pixInfo.qrCode || ''}
                                  onClick={(e) => copyPixAction(e.target)}
                                  title="Clique para copiar o código Pix"
                                  style={{
                                    width: '100%',
                                    height: '70px',
                                    background: pixCopied ? '#ecfdf5' : '#FFFFFF',
                                    color: '#0f172a',
                                    border: `1.5px solid ${pixCopied ? '#059669' : '#cbd5e1'}`,
                                    borderRadius: '12px',
                                    padding: '10px 12px',
                                    fontSize: '0.78rem',
                                    fontFamily: 'monospace',
                                    resize: 'none',
                                    boxSizing: 'border-box',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                />
                              </div>

                              <button
                                type="button"
                                onClick={(e) => copyPixAction(e.currentTarget)}
                                style={{
                                  width: '100%',
                                  padding: '14px',
                                  borderRadius: '12px',
                                  border: 'none',
                                  background: pixCopied ? '#059669' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                  color: '#FFFFFF',
                                  fontWeight: '800',
                                  fontSize: '1rem',
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.25)'
                                }}
                              >
                                {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX'}
                              </button>
                            </>
                          );
                        })()}

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
                                  handlePaymentApproved(orderId);
                                  return;
                                }
                              }

                              // 2. Fallback: verifica se o pedido foi aprovado via API
                              if (orderId) {
                                const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
                                if (res.ok) {
                                  const json = await res.json();
                                  const orderData = json?.order;
                                  if (orderData && (orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO')) {
                                    handlePaymentApproved(orderId);
                                    return;
                                  }
                                }
                              }

                              setCreationError('🔄 Pagamento ainda em processamento. Se você já pagou, aguarde alguns segundos e tente novamente!');
                            } catch (e) {
                              setCreationError('Erro ao conectar com o servidor.');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
                            color: '#FFFFFF',
                            fontWeight: '800',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            marginTop: '4px',
                            boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)'
                          }}
                        >
                          ⚡ Já Fiz o Pagamento / Validar Agora
                        </button>

                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', width: '100%', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Prefere pagar no Cartão de Crédito? </span>
                          <button
                            type="button"
                            onClick={handlePayWithCard}
                            disabled={isPayingCard}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#67408b',
                              fontWeight: '700',
                              fontSize: '0.86rem',
                              textDecoration: 'underline',
                              cursor: isPayingCard ? 'default' : 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            {isPayingCard ? 'Abrindo Cartão...' : 'Clique aqui para pagar no Cartão 💳'}
                          </button>
                        </div>

                        <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '6px', textAlign: 'center', lineHeight: 1.4 }}>
                          A liberação é automática assim que o pagamento for confirmado. Não precisa enviar comprovante.
                        </p>
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
    <div className="nx-experience nx-creation" style={{ ...styles.wrapper, backgroundColor: '#faf8f5' }}>
      <header className="nx-header"><div className="nx-header-inner">
        <Link href="/" className="nx-brand"><Image src="/logo.png" alt="NS Music" width={44} height={44} priority /><span>Histórias que viram música.</span></Link>
        <Link href="/conta" className="nx-account-link">Minha conta</Link>
      </div></header>

      {/* Main content container */}
      <main className="criar-main" style={{ flex: 1, padding: '32px 0 100px 0', position: 'relative', zIndex: 1 }}>
        <div className="container criar-container" style={{ maxWidth: '1120px' }}>
          
          {/* Wizard step indicators (Estilo Capivarinha Love) */}
          {step <= TOTAL_JOURNEY_STEPS && (
            <div className="wz-top" style={{ maxWidth: '34rem', margin: '0 auto 1.25rem', padding: '0 4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {step > 1 && !(step === 6 && formData.sunoStatus === 'generating') ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className="wz-back"
                  aria-label="Voltar"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    border: '1px solid #F1E4E8',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    color: '#1E1418'
                  }}
                >
                  ←
                </button>
              ) : (
                <div style={{ width: '36px' }} />
              )}
              <div className="wz-track" style={{ flex: 1, height: '6px', background: '#F1E4E8', borderRadius: '6px', overflow: 'hidden' }}>
                <div className="wz-fill" style={{ width: `${(step / TOTAL_JOURNEY_STEPS) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #F0417E, #D01A5C)', borderRadius: '6px', transition: 'width 0.35s ease' }} />
              </div>
              <span className="wz-count" style={{ fontSize: '0.8rem', fontWeight: 800, color: '#857D80', whiteSpace: 'nowrap' }}>
                {step}/{TOTAL_JOURNEY_STEPS}
              </span>
            </div>
          )}

          {/* Form step renderers */}
          {creationError && <div className="nx-message nx-error" role="alert">{creationError}<br /><button type="button" className="nx-text-button" onClick={() => setCreationError('')}>Entendi</button></div>}
          <div style={{ marginTop: '16px' }} className="criar-step-content">
            {step <= TOTAL_FORM_STEPS ? renderWizardStep() : renderWorkflowStep()}
          </div>

          {/* Fixed Bottom Navigation Dock (Estilo Capivarinha Love) */}
          {formData.lyricsStatus !== 'generating' && formData.sunoStatus !== 'generating' && step < 7 && (
            <div
              className="criar-navigation-dock"
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 200,
                backgroundColor: 'rgba(255, 255, 255, 0.97)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderTop: '1.5px solid #F1E4E8',
                boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.06)',
                padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px)) 16px'
              }}
            >
              <div style={{ width: '100%', maxWidth: '34rem', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {step > 1 && (
                  <button 
                    onClick={prevStep} 
                    type="button"
                    className="btn-wz-back"
                    style={{
                      padding: '0.75rem 0.95rem',
                      fontSize: '0.86rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    ← Voltar
                  </button>
                )}

                <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
                  {step <= TOTAL_FORM_STEPS ? (
                    <button 
                      type="button"
                      onClick={() => {
                        if (isUploadingCover) return;
                        if (isNextDisabled()) {
                          setShowValidation(true);
                          setTimeout(() => {
                            const el = document.querySelector('[data-missing="true"]');
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              const input = el.querySelector('input, select, textarea');
                              if (input) input.focus();
                            }
                          }, 50);
                          return;
                        }
                        setShowValidation(false);
                        if (step === TOTAL_FORM_STEPS) {
                          handleSaveAndGenerateLyrics();
                        } else {
                          nextStep();
                        }
                      }}
                      disabled={isUploadingCover || (step === TOTAL_FORM_STEPS && isSubmitting)}
                      className="btn-wz-primary"
                      style={{
                        padding: '0.78rem 1rem',
                        fontSize: 'clamp(0.84rem, 3.8vw, 0.96rem)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {isUploadingCover
                        ? 'Enviando foto…'
                        : (step === TOTAL_FORM_STEPS && isSubmitting)
                          ? 'Criando sua letra...'
                          : ['Continuar para a história →', 'Escolher o som →', 'Revisar meu presente →', 'Criar minha letra →'][step - 1]}
                    </button>
                  ) : step === 5 ? (
                    <button
                      type="button"
                      onClick={handleApproveLyrics}
                      disabled={isNextDisabled() || isSubmitting}
                      className="btn-wz-primary"
                      style={{
                        padding: '0.78rem 0.85rem',
                        fontSize: 'clamp(0.8rem, 3.4vw, 0.94rem)',
                        letterSpacing: '-0.02em',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {isSubmitting ? 'Iniciando gravação...' : 'Aprovar Letra e Criar Música →'}
                    </button>
                  ) : step === 6 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStep(7);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="btn-wz-primary"
                      style={{
                        padding: '0.78rem 1rem',
                        fontSize: 'clamp(0.84rem, 3.8vw, 0.96rem)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Escolher Meu Presente →
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {showLimitModal && <section className="nx-card nx-form-column" role="status" style={{ marginBottom: 100 }}><h2>Vamos continuar por uma das suas músicas?</h2><p>Você pode acessar seus pedidos ou falar com a equipe sobre novas criações.</p><div className="nx-checkout-actions"><Link href="/conta" className="nx-button nx-primary">Ver minhas músicas</Link><a href={linkWhatsapp(whatsappSuporte, 'Olá! Preciso de ajuda para continuar minha criação.')} className="nx-button" target="_blank" rel="noopener noreferrer">Falar com a equipe</a><button className="nx-text-button" type="button" onClick={() => setShowLimitModal(false)}>Fechar aviso</button></div></section>}



    </div>
  );
}
