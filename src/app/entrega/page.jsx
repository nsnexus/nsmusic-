'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '@/lib/firebase';
import { primeAudioContext } from '@/lib/audioContext';
import VideoOfferModal from '@/components/VideoOfferModal';
import PixQrCode from '@/components/PixQrCode';
import { requestPixCharge } from '@/lib/pixCheckout';
import { styles } from './entregaStyles';

function EntregaContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id');
  const promo = searchParams.get('promo');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [rating, setRating] = useState(0);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewText, setReviewText] = useState('');

  // Estados de Cadastro de Conta
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Estados do Checkout PIX para pedidos pendentes
  const [pixInfo, setPixInfo] = useState({ qrCode: '', qrCodeBase64: '', paymentId: '' });
  const [pendingVideoPix, setPendingVideoPix] = useState(false);
  const [videoPixInfo, setVideoPixInfo] = useState({ qrCode: '', qrCodeBase64: '', paymentId: '' });
  const [pixLoading, setPixLoading] = useState(false);
  // Falha na geração do PIX principal. Além de mostrar o motivo na tela, é o que trava a retentativa
  // automática (ver o useEffect de geração) — sem isso o erro entra em laço infinito.
  const [pixError, setPixError] = useState('');
  const [pixCopied, setPixCopied] = useState(false);
  const [isPaidState, setIsPaidState] = useState(false);
  // Verificação automática de comprovante por IA (provisória — ver src/lib/receiptVerification.js).
  // 'idle' | 'uploading' | 'failed' — some depois de aprovado, pois a UI já muda pra "pago" via
  // onSnapshot assim que applyPaymentApproval grava o pedido.
  const [receiptStatus, setReceiptStatus] = useState('idle');
  const receiptInputRef = useRef(null);
  const [pixPollingTimedOut, setPixPollingTimedOut] = useState(false);
  const [videoPixPollingTimedOut, setVideoPixPollingTimedOut] = useState(false);
  // Máximo de tentativas do polling ativo (Efí + fallback Firestore): 150 × 4s = 10min. Depois disso
  // o onSnapshot em tempo real (ver useEffect abaixo) continua sendo a rede de segurança — só o
  // polling ativo para, para não rodar para sempre com a aba aberta (frontend.md). Auditoria de
  // fechamento, 2026-08-02.
  const PIX_POLLING_MAX_ATTEMPTS = 150;

  // Tentativas de CRIAR a cobrança (não confundir com o polling acima, que só consulta). A chamada à
  // Efí falha de forma intermitente e insistir resolve na prática — 3 tentativas com espera de 1,5s
  // e 3s cobrem isso sem deixar o cliente esperando demais quando a falha é real.
  const MAX_PIX_ATTEMPTS = 3;

  // Estados para Vídeo Homenagem com Fotos
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState([]);
  const [selectedVideoTrack, setSelectedVideoTrack] = useState('v1'); // 'v1' ou 'v2'
  const [photoError, setPhotoError] = useState('');
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');

  // Sincroniza fotos salvas do pedido no Firestore quando carregado
  useEffect(() => {
    if (order?.slideshowImages && Array.isArray(order.slideshowImages)) {
      setExistingPhotos(order.slideshowImages);
    }
  }, [order?.slideshowImages]);

  // Pop-up e Preço do Vídeo Homenagem
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState('audio_only'); // 'audio_only', 'combo' (16.89), 'video_addon' (6.90)
  const [hasVideoAccessState, setHasVideoAccessState] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Recupera videoPixInfo do localStorage ao carregar (idempotência ao recarregar página)
  useEffect(() => {
    if (mounted && orderId && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`videoPixInfo_${orderId}`);
        if (stored) {
          const data = JSON.parse(stored);
          setVideoPixInfo(data);
        }
      } catch (e) {
        console.warn('Erro ao carregar videoPixInfo do localStorage:', e);
      }
    }
  }, [mounted, orderId]);

  // Limpa videoPixInfo do localStorage quando pagamento de vídeo é confirmado
  useEffect(() => {
    if (order?.videoAddonPaid && typeof window !== 'undefined' && orderId) {
      localStorage.removeItem(`videoPixInfo_${orderId}`);
    }
  }, [order?.videoAddonPaid, orderId]);

  // Recupera o pixInfo da MÚSICA do localStorage ao carregar — mesma idempotência que já existia
  // para o vídeo (acima), agora também para a cobrança principal.
  //
  // Causa raiz de um incidente real (2026-08-13): sem isso, TODO recarregamento da página (celular
  // em segundo plano recarrega a aba com frequência) zerava pixInfo de volta para { qrCode: '' },
  // e o efeito de geração automática (mais abaixo) via isso como "nunca gerou PIX" e criava uma
  // cobrança NOVA na Efí — abandonando a anterior, que ficava pendurada — e reiniciava o polling do
  // zero para essa nova cobrança. Um único cliente com a aba reabrindo sozinha ao longo da madrugada
  // gerou uma sequência longa de cobranças e consultas repetidas à Efí, visível no painel deles,
  // possivelmente estourando limite de taxa da conta e explicando falhas de PIX em OUTROS pedidos.
  // A cobrança Pix expira em 1h na Efí (calendario.expiracao: 3600 em src/lib/efi.js). Restaurar um
  // código já expirado seria pior que gerar um novo — o app do banco recusaria o pagamento sem
  // explicação nenhuma. Margem de 55min (não 60) para nunca restaurar algo prestes a expirar no
  // meio da tentativa de pagamento do cliente.
  const PIX_RESTORE_MAX_AGE_MS = 55 * 60 * 1000;

  useEffect(() => {
    if (mounted && orderId && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`pixInfo_${orderId}`);
        if (stored) {
          const data = JSON.parse(stored);
          const idade = data?.generatedAt ? Date.now() - new Date(data.generatedAt).getTime() : Infinity;
          if (data?.qrCode && idade < PIX_RESTORE_MAX_AGE_MS) {
            setPixInfo(data);
          } else {
            localStorage.removeItem(`pixInfo_${orderId}`);
          }
        }
      } catch (e) {
        console.warn('Erro ao carregar pixInfo do localStorage:', e);
      }
    }
  }, [mounted, orderId]);

  // Persiste o pixInfo da música assim que uma cobrança é gerada — para o restore acima ter o que
  // recuperar no próximo carregamento da página. generatedAt não vem do servidor (a resposta de
  // /api/payments/create não inclui isso) — é carimbado aqui, no exato momento em que este cliente
  // recebeu a cobrança, tempo suficiente para o guard de expiração acima.
  useEffect(() => {
    if (orderId && pixInfo.qrCode && typeof window !== 'undefined') {
      const paraGravar = pixInfo.generatedAt ? pixInfo : { ...pixInfo, generatedAt: new Date().toISOString() };
      localStorage.setItem(`pixInfo_${orderId}`, JSON.stringify(paraGravar));
    }
  }, [orderId, pixInfo]);

  // Limpa pixInfo do localStorage quando o pagamento é confirmado — mesmo padrão do vídeo
  // (order?.videoAddonPaid acima). Não usa a constante `isPaid`: ela só é declarada mais abaixo
  // neste componente, e referenciá-la aqui em cima quebraria por uso antes da declaração.
  useEffect(() => {
    const paid = order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO';
    if (paid && typeof window !== 'undefined' && orderId) {
      localStorage.removeItem(`pixInfo_${orderId}`);
    }
  }, [order?.paymentStatus, orderId]);

  // Controle de acesso dinâmico. NUNCA derivar de searchParams — isso permitia liberar o produto só
  // com a URL /entrega?orderId=X&status=success, sem pagar (ver C-01 no AUDIT_REPORT.md). O parâmetro
  // de URL só pode, no máximo, disparar uma reconsulta ao servidor (ver useEffect de fetchOrder acima).
  const isPaid = isPaidState || order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO';
  // hasVideoAccess só pode vir de campos confirmados pelo servidor. `selectedPackage` é estado local
  // do React, setado só por clique do usuário (inclusive antes de qualquer pagamento) — usá-lo aqui
  // liberava o vídeo (renderizado e enviado ao Storage inteiramente pelo cliente, sem checagem de
  // servidor no caminho) sem o pedido ter `hasVideoAccess`/`videoAddonPaid` gravado (auditoria de
  // fechamento, 2026-08-02). Pagamento legítimo do combo já grava esses campos via applyPaymentApproval.
  const hasVideoAccess = hasVideoAccessState || order?.hasVideoAccess || order?.videoAddonPaid || order?.videoUrl;

  // Exibe o pop-up de oferta do vídeo automaticamente ao carregar a tela de entrega
  useEffect(() => {
    if (order && !order.videoUrl && !order.hasVideoAccess && !promo && typeof window !== 'undefined') {
      const dismissed = sessionStorage.getItem(`video_modal_dismissed_${orderId}`);
      if (!dismissed) {
        const timer = setTimeout(() => setShowVideoModal(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [order, orderId]);

  // O evento de Purchase (Facebook Pixel / Meta Ads) NÃO é mais disparado aqui no cliente — movido
  // pro servidor (src/lib/payments.js:applyPaymentApproval, via src/lib/metaCapi.js), no único ponto
  // de aprovação de pagamento. A versão anterior usava localStorage pra não contar a mesma venda duas
  // vezes, mas localStorage é por navegador: o link de entrega chega pelo WhatsApp, o cliente
  // frequentemente reabre no navegador embutido do WhatsApp (contexto diferente de onde pagou), e
  // cada reabertura sem o registro local disparava um Purchase novo. Resultado real (14-19/08/2026):
  // 25 vendas confirmadas no banco, 42 contadas no Pixel. Ver metaCapi.js para o motivo completo.

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchWithTimeout = (promise, ms = 8000) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
      ]);
    };

    const fetchOrder = async (attempt = 1) => {
      if (!orderId) {
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'orders', orderId);
        const docSnap = await fetchWithTimeout(getDoc(docRef));
        if (!cancelled && docSnap.exists()) {
          const data = docSnap.data();
          setOrder(data);
          if (data && data.customerEmail) {
            setAccountEmail(data.customerEmail);
          }

          // Se o pedido ainda consta como pendente no Firebase, consulta imediatamente a Efí
          if (data && data.paymentStatus !== 'PAGAMENTO_APROVADO' && data.paymentStatus !== 'PAGO') {
            const paymentIdQuery = data.paymentId ? `&paymentId=${data.paymentId}` : '';
            fetch(`/api/payments/status?orderId=${orderId}${paymentIdQuery}`)
              .then(res => res.ok ? res.json() : null)
              .then(statusData => {
                if (statusData && (statusData.status === 'approved' || statusData.status === 'PAGO' || statusData.status === 'PAGAMENTO_APROVADO')) {
                  setIsPaidState(true);
                  setOrder(prev => prev ? { ...prev, paymentStatus: 'PAGAMENTO_APROVADO' } : prev);
                }
              })
              .catch(e => console.warn("Aviso na checagem inicial de pagamento:", e));
          }
        }
      } catch (err) {
        console.error(`Erro ao buscar pedido (tentativa ${attempt}):`, err?.message || err);
        // Retry automático uma vez em caso de timeout ou falha de rede (comum no iOS Safari)
        if (!cancelled && attempt < 2) {
          console.log("Retentando busca do pedido...");
          return fetchOrder(attempt + 1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOrder();
    // Failsafe: garante que loading nunca fique true por mais de 12 segundos
    const failsafe = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 12000);

    return () => { cancelled = true; clearTimeout(failsafe); };
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

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0 || !orderId) return;

    setReviewSubmitting(true);
    setReviewError('');
    try {
      // A UI só mostra sucesso depois que a escrita realmente aconteceu (ver M-11/frontend.md:
      // "se a escrita no banco falhou, a UI não pode exibir sucesso").
      await updateDoc(doc(db, 'orders', orderId), {
        reviewRating: rating,
        reviewText: reviewText.trim(),
        reviewSubmittedAt: new Date().toISOString(),
      });
      setReviewSubmitted(true);
    } catch (err) {
      console.error('Erro ao salvar avaliação:', err);
      setReviewError('Não foi possível enviar sua avaliação agora. Tente novamente em instantes.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDownload = async (url, filename) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network error fetching audio file");
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

  // Liberação automática provisória a partir do comprovante Pix (ver aviso em
  // src/lib/receiptVerification.js). Se a IA não conseguir validar por qualquer motivo, o estado
  // volta a 'idle' e o botão manual de WhatsApp (já renderizado ao lado) continua disponível — nunca
  // trava o cliente sem saída.
  const handleReceiptUpload = async (file) => {
    if (!file || !orderId) return;
    setReceiptStatus('uploading');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/payments/verify-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          sku: pixInfo.sku || 'audio_only',
          imageBase64: base64,
          mimeType: file.type || 'image/jpeg',
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.approved) {
        // Não precisa mexer em mais nada aqui: applyPaymentApproval já gravou o pedido, e o
        // onSnapshot do pedido (useEffect mais acima) atualiza a tela sozinho para o estado "pago".
        return;
      }
      setReceiptStatus('failed');
    } catch (err) {
      console.warn('Erro ao enviar comprovante:', err.message);
      setReceiptStatus('failed');
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined' && orderId) {
      const sharePageUrl = `${window.location.origin}/homenagem?orderId=${orderId}`;
      navigator.clipboard.writeText(sharePageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleGeneratePix = async (customAmount = null, isSecondary = false) => {
    if (!order) return;
    if (isSecondary) setPendingVideoPix(true);
    else {
      setPixError('');
      setPixLoading(true);
    }

    // O valor a cobrar é decidido pelo servidor a partir do SKU (ver src/lib/pricing.js e C-05 no
    // AUDIT_REPORT.md) — o cliente só informa QUAL produto está comprando, nunca o preço.
    let sku;
    if (isSecondary) sku = 'video_addon';
    else if (promo === '48h') sku = 'recovery_combo_48h';
    else if (promo === '24h') sku = 'recovery_combo_24h';
    else if (typeof customAmount === 'number' && customAmount === 16.89) sku = 'combo';
    else sku = 'audio_only';

    // A retentativa vive em src/lib/pixCheckout.js, compartilhada com o checkout de /criar.
    const resultado = await requestPixCharge(
      { orderId, sku, isSecondaryPayment: isSecondary },
      { attempts: MAX_PIX_ATTEMPTS }
    );

    if (resultado.ok) {
      const data = resultado.data;
      if (isSecondary) {
        const videoPixData = {
          qrCode: data.qrCode || '',
          qrCodeBase64: data.qrCodeBase64 || '',
          paymentId: data.paymentId || ''
        };
        setVideoPixInfo(videoPixData);
        if (typeof window !== 'undefined' && orderId) {
          localStorage.setItem(`videoPixInfo_${orderId}`, JSON.stringify(videoPixData));
        }
      } else {
        setPixInfo({
          qrCode: data.qrCode || '',
          qrCodeBase64: data.qrCodeBase64 || '',
          paymentId: data.paymentId || '',
          provider: data.provider || '',
          sku
        });
        setPixLoading(false);
      }
      return;
    }

    // Erro do fluxo principal vira estado na tela, nunca alert: o alert era reaberto a cada
    // retentativa automática (ver o useEffect de geração), empilhando pop-ups por cima da página e
    // deixando o cliente sem nenhum caminho para pagar.
    if (isSecondary) {
      alert(resultado.error);
      setPendingVideoPix(false);
    } else {
      setPixError(resultado.error);
      setPixLoading(false);
    }
  };

  // Gera o PIX automaticamente se o pedido não estiver pago.
  //
  // `!pixError` no guarda é o que impede o laço infinito: sem ele, uma falha zerava pixLoading com
  // pixInfo.qrCode ainda vazio, o efeito disparava de novo na hora e o cliente via o mesmo erro
  // repetidamente, sem nunca conseguir pagar. Com a trava, a falha para o ciclo e a retomada passa a
  // ser explícita, pelo botão "Tentar novamente" (que limpa pixError).
  useEffect(() => {
    if (order && !isPaid && !pixInfo.qrCode && !pixLoading && !pixError) {
      handleGeneratePix();
    }
  }, [order, isPaid, pixInfo.qrCode, pixLoading, pixError]);

  // Polling em tempo real para confirmação de pagamento PIX (Áudio Principal) com fallback Firestore
  useEffect(() => {
    if (!orderId || isPaid) return;

    setPixPollingTimedOut(false);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= PIX_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        setPixPollingTimedOut(true);
        return;
      }

      // 1. Tenta via API backend (consulta a Efí)
      try {
        const paymentIdQuery = pixInfo.paymentId ? `&paymentId=${pixInfo.paymentId}` : '';
        const res = await fetch(`/api/payments/status?orderId=${orderId}${paymentIdQuery}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved' || data.status === 'PAGO' || data.status === 'PAGAMENTO_APROVADO') {
            // A gravação em Firestore já aconteceu no servidor, dentro de /api/payments/status
            // (ver src/lib/payments.js:applyPaymentApproval) — o cliente só espelha o estado local
            // (ver C-01/payments.md: paymentStatus nunca pode ser escrito a partir de 'use client').
            setIsPaidState(true);
            setOrder(prev => prev ? { ...prev, paymentStatus: 'PAGAMENTO_APROVADO' } : prev);
            clearInterval(interval);
            return;
          }
        }
      } catch (e) {
        console.warn("Erro no fetch do status do PIX (tentando fallback Firestore):", e);
      }

      // 2. Fallback: verifica diretamente no Firestore se o webhook já atualizou
      // Executa SEMPRE, independentemente do resultado do fetch acima
      try {
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          if (orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO') {
            setIsPaidState(true);
            setOrder(orderData);
            clearInterval(interval);
            return;
          }
        }
      } catch (fbErr) {
        console.warn("Erro no fallback Firestore do PIX:", fbErr);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, isPaid, pixInfo.paymentId]);

  // Polling em tempo real para confirmação de pagamento do VÍDEO ADDON (R$ 6,90) com fallback Firestore
  useEffect(() => {
    if (!orderId || !videoPixInfo.paymentId) return;

    setVideoPixPollingTimedOut(false);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= PIX_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        setVideoPixPollingTimedOut(true);
        return;
      }

      // 1. Tenta via API backend
      try {
        const res = await fetch(`/api/payments/status?orderId=${orderId}&paymentId=${videoPixInfo.paymentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved' || data.status === 'PAGO' || data.status === 'PAGAMENTO_APROVADO') {
            // Idem ao polling da música: a gravação de hasVideoAccess/videoAddonPaid já aconteceu no
            // servidor — o cliente nunca concede acesso a produto pago diretamente (ver C-09/A-07).
            setHasVideoAccessState(true);
            setPendingVideoPix(false);
            setVideoPixInfo({ qrCode: '', qrCodeBase64: '', paymentId: '' });
            setOrder(prev => prev ? { ...prev, hasVideoAccess: true, videoAddonPaid: true } : prev);
            clearInterval(interval);
            return;
          }
        }
      } catch (e) {
        console.warn("Erro no fetch do status do PIX do vídeo (tentando fallback Firestore):", e);
      }

      // 2. Fallback: verifica diretamente no Firestore se o webhook já atualizou o acesso ao vídeo
      // Executa SEMPRE, independentemente do resultado do fetch acima
      try {
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          if (orderData.hasVideoAccess || orderData.videoAddonPaid) {
            setHasVideoAccessState(true);
            setPendingVideoPix(false);
            setVideoPixInfo({ qrCode: '', qrCodeBase64: '', paymentId: '' });
            setOrder(orderData);
            clearInterval(interval);
            return;
          }
        }
      } catch (fbErr) {
        console.warn("Erro no fallback Firestore do PIX do vídeo:", fbErr);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, videoPixInfo.paymentId]);

  // Escuta atualizações do Firestore em tempo real para o pedido (garante sincronia instantânea do webhook)
  useEffect(() => {
    if (!orderId) return;
    const unsubscribe = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOrder(data);
        if (data.paymentStatus === 'PAGAMENTO_APROVADO' || data.paymentStatus === 'PAGO') {
          setIsPaidState(true);
        }
        if (data.hasVideoAccess || data.videoAddonPaid) {
          setHasVideoAccessState(true);
          setPendingVideoPix(false);
          setVideoPixInfo({ qrCode: '', qrCodeBase64: '', paymentId: '' });
        }
      }
    });
    return () => unsubscribe();
  }, [orderId]);

  const handleAudioTimeUpdate = (e) => {
    const audio = e.target;
    if (!isPaid && audio.currentTime > 60) {
      audio.pause();
      audio.currentTime = 60;
      alert("🔒 Prévia de 60 segundos finalizada! Efetue o pagamento de R$ 9,99 abaixo para liberar as versões completas e os downloads em MP3 HD.");
    }
  };

  // Precisa ser calculado aqui (antes dos hooks abaixo, que dependem dele) em vez de depois dos
  // early returns de `loading`/`order` — hooks têm que rodar sempre na mesma ordem em todo render.
  const formatAudioUrl = (url, trackId = '') => {
    if (!url) return '';
    if (typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('/api/'))) return url;
    const idParam = trackId ? `&id=${encodeURIComponent(trackId)}` : '';
    return `/api/audio/proxy?url=${encodeURIComponent(url)}${idParam}`;
  };
  // Extrai trackId das faixas do Suno quando disponível (para fallback de CDN no proxy)
  const primaryTrackId = order?.sunoTracks?.[0]?.trackId || '';
  const secondTrackId = order?.sunoTracks?.[1]?.trackId || '';
  const primaryAudioUrl = formatAudioUrl(order?.audioUrl || (order?.audioFiles && order.audioFiles[0]) || '', primaryTrackId);
  const secondAudioUrl = formatAudioUrl(order?.audioFiles && order.audioFiles[1] ? order.audioFiles[1] : '', secondTrackId);

  // A URL do áudio às vezes fica pronta no pedido antes do arquivo terminar de propagar na CDN da
  // Kie.ai — e nem sempre isso dispara `onError` no <audio> (às vezes ele só fica "pendurado", sem
  // tocar e sem erro nenhum). Por isso a prévia fica escondida atrás de um estado de carregamento
  // até o navegador confirmar de verdade que consegue tocar (`onCanPlay`), com um "cão de guarda"
  // que recarrega proativamente se isso não acontecer a tempo — não só reagindo a erro explícito.
  const AUDIO_READY_TIMEOUT_MS = 6000;
  const AUDIO_MAX_LOAD_ATTEMPTS = 6;
  const [audioReadyState, setAudioReadyState] = useState({ primary: 'loading', second: 'loading' });
  const audioLoadAttemptsRef = useRef({ primary: 0, second: 0 });
  const audioWatchdogRef = useRef({ primary: null, second: null });
  const primaryAudioElRef = useRef(null);
  const secondAudioElRef = useRef(null);

  const audioElRefFor = (slot) => (slot === 'primary' ? primaryAudioElRef : secondAudioElRef);

  const clearAudioWatchdog = (slot) => {
    if (audioWatchdogRef.current[slot]) {
      clearTimeout(audioWatchdogRef.current[slot]);
      audioWatchdogRef.current[slot] = null;
    }
  };

  const armAudioWatchdog = (slot) => {
    clearAudioWatchdog(slot);
    audioWatchdogRef.current[slot] = setTimeout(() => {
      const attempts = audioLoadAttemptsRef.current[slot];
      if (attempts >= AUDIO_MAX_LOAD_ATTEMPTS) {
        setAudioReadyState((prev) => ({ ...prev, [slot]: 'failed' }));
        return;
      }
      audioLoadAttemptsRef.current[slot] = attempts + 1;
      setAudioReadyState((prev) => ({ ...prev, [slot]: 'retrying' }));
      const el = audioElRefFor(slot).current;
      if (el) el.load();
      armAudioWatchdog(slot);
    }, AUDIO_READY_TIMEOUT_MS);
  };

  const handleAudioReady = (slot) => {
    clearAudioWatchdog(slot);
    setAudioReadyState((prev) => ({ ...prev, [slot]: 'ready' }));
  };

  const handleAudioError = (slot) => {
    clearAudioWatchdog(slot);
    const attempts = audioLoadAttemptsRef.current[slot];
    if (attempts >= AUDIO_MAX_LOAD_ATTEMPTS) {
      setAudioReadyState((prev) => ({ ...prev, [slot]: 'failed' }));
      return;
    }
    audioLoadAttemptsRef.current[slot] = attempts + 1;
    setAudioReadyState((prev) => ({ ...prev, [slot]: 'retrying' }));
    setTimeout(() => {
      const el = audioElRefFor(slot).current;
      if (el) el.load();
      armAudioWatchdog(slot);
    }, 2000 * attempts);
  };

  const handleAudioRetryClick = (slot) => {
    audioLoadAttemptsRef.current[slot] = 0;
    setAudioReadyState((prev) => ({ ...prev, [slot]: 'loading' }));
    const el = audioElRefFor(slot).current;
    if (el) el.load();
    armAudioWatchdog(slot);
  };

  // Reinicia o "cão de guarda" sempre que a URL da faixa mudar (nova música carregada no pedido).
  useEffect(() => {
    if (!primaryAudioUrl) return;
    audioLoadAttemptsRef.current.primary = 0;
    setAudioReadyState((prev) => ({ ...prev, primary: 'loading' }));
    armAudioWatchdog('primary');
    return () => clearAudioWatchdog('primary');
  }, [primaryAudioUrl]);

  useEffect(() => {
    if (!secondAudioUrl) return;
    audioLoadAttemptsRef.current.second = 0;
    setAudioReadyState((prev) => ({ ...prev, second: 'loading' }));
    armAudioWatchdog('second');
    return () => clearAudioWatchdog('second');
  }, [secondAudioUrl]);

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
      <div style={{ ...styles.wrapper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '16px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>Pedido não encontrado 🔍</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Verifique o link ou entre em contato com o suporte do estúdio.</p>
        <Link href="/" className="btn btn-primary">Voltar ao início</Link>
      </div>
    );
  }

  // Safe client-side URLs
  const sharePageUrl = mounted && typeof window !== 'undefined' ? `${window.location.origin}/homenagem?orderId=${orderId}` : '';
  const qrCodeUrl = sharePageUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(sharePageUrl)}` : '';

  // Default beautiful dynamic cover
  const coverUrl = order?.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop';

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
              <Image src="/logo.png" alt="NSMusic" width={40} height={40} style={{ height: '40px', width: 'auto' }} priority />
            </Link>
            <Link href="/criar" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
              ✨ Criar Nova Música
            </Link>
            <Link href="/minhas-musicas" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
              🎵 Minhas Músicas
            </Link>
          </div>
          <span 
            style={{
              ...styles.statusBadge,
              color: isPaid ? 'var(--success)' : 'var(--warning)',
              borderColor: isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              backgroundColor: isPaid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)'
            }}
          >
            {isPaid ? '✨ Entrega Liberada' : '⏳ Aguardando Pagamento (R$ 9,99)'}
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
                    {/* color precisa ser explícito aqui: a regra global h1-h6 (globals.css) sempre
                        vence sobre a cor herdada do coverOverlay, deixando o título ilegível em cima
                        da foto escura (relato do usuário, 2026-08-02). */}
                    <h2 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.4rem', color: '#FFFFFF' }}>
                      Melodia para {order?.honoreeName}
                    </h2>
                    <p style={{ fontSize: '0.85rem', opacity: 0.8, color: '#FFFFFF' }}>Uma homenagem de {order?.customerName}</p>
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
                    {audioReadyState.primary !== 'ready' && (
                      <div style={{ padding: '20px 0', textAlign: 'center' }}>
                        {audioReadyState.primary === 'failed' ? (
                          <>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                              Não conseguimos carregar o áudio agora. Isso costuma resolver em instantes.
                            </p>
                            <button type="button" onClick={() => handleAudioRetryClick('primary')} className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
                              Tentar novamente
                            </button>
                          </>
                        ) : (
                          <>
                            <div style={styles.spinner} />
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '10px' }}>Preparando sua prévia...</p>
                          </>
                        )}
                      </div>
                    )}
                    <audio
                      key={primaryAudioUrl}
                      ref={primaryAudioElRef}
                      controls
                      autoPlay={!isPaid}
                      controlsList={!isPaid ? "nodownload noplaybackrate" : undefined}
                      onContextMenu={(e) => !isPaid && e.preventDefault()}
                      onTimeUpdate={handleAudioTimeUpdate}
                      onCanPlay={() => handleAudioReady('primary')}
                      onError={() => handleAudioError('primary')}
                      style={{ ...styles.audioTag, display: audioReadyState.primary === 'ready' ? 'block' : 'none' }}
                      src={primaryAudioUrl}
                    >
                      Seu navegador não suporta.
                    </audio>

                    {isPaid && audioReadyState.primary === 'ready' && (
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
                    {audioReadyState.second !== 'ready' && (
                      <div style={{ padding: '20px 0', textAlign: 'center' }}>
                        {audioReadyState.second === 'failed' ? (
                          <>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                              Não conseguimos carregar o áudio agora. Isso costuma resolver em instantes.
                            </p>
                            <button type="button" onClick={() => handleAudioRetryClick('second')} className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: '0.85rem' }}>
                              Tentar novamente
                            </button>
                          </>
                        ) : (
                          <>
                            <div style={styles.spinner} />
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '10px' }}>Preparando sua prévia...</p>
                          </>
                        )}
                      </div>
                    )}
                    <audio
                      key={secondAudioUrl}
                      ref={secondAudioElRef}
                      controls
                      controlsList={!isPaid ? "nodownload noplaybackrate" : undefined}
                      onContextMenu={(e) => !isPaid && e.preventDefault()}
                      onTimeUpdate={handleAudioTimeUpdate}
                      onCanPlay={() => handleAudioReady('second')}
                      onError={() => handleAudioError('second')}
                      style={{ ...styles.audioTag, display: audioReadyState.second === 'ready' ? 'block' : 'none' }}
                      src={secondAudioUrl}
                    >
                      Seu navegador não suporta.
                    </audio>

                    {isPaid && audioReadyState.second === 'ready' && (
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

                {/* Card: Não gostou do resultado? Chame no WhatsApp */}
                {!isPaid && (
                  <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '16px', marginTop: '16px', border: '1px solid rgba(37, 211, 102, 0.3)', background: 'rgba(37, 211, 102, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                      <h5 style={{ fontSize: '0.96rem', fontWeight: '700', color: '#10b981', margin: '0 0 4px 0' }}>
                        🤔 Não gostou do resultado da música?
                      </h5>
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                        Nos chame no WhatsApp que fazemos do seu jeito com nossos produtores!
                      </p>
                    </div>
                    <a
                      href={`https://wa.me/559491081351?text=${encodeURIComponent(`Olá! Ouvi a prévia do pedido #${orderId || ''} (${order?.honoreeName || 'música personalizada'}) e gostaria de ajuda para fazer do meu jeito.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 18px',
                        fontSize: '0.88rem',
                        fontWeight: '700',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                        color: '#ffffff',
                        textDecoration: 'none',
                        boxShadow: '0 3px 12px rgba(37, 211, 102, 0.25)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span>Falar no WhatsApp 📲</span>
                    </a>
                  </div>
                )}

                {/* SEÇÃO VÍDEO HOMENAGEM (10 A 20 FOTOS) */}
                {isPaid && (
                  <div className="glass-card" style={{ padding: '24px', borderRadius: '16px', marginTop: '20px', border: '1.5px solid rgba(236, 72, 153, 0.3)', background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.06) 0%, rgba(168, 85, 247, 0.08) 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '1.8rem' }}>🎬</span>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, fontFamily: 'var(--font-family-title)', color: 'var(--text-primary)' }}>
                          Vídeo Homenagem com Suas Fotos (MP4)
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                          {hasVideoAccess || order?.hasVideoAccess ? 'Envie entre 10 e 20 fotos para gerar um vídeo especial sincronizado com a música!' : 'Adicione o Vídeo Homenagem ao seu pedido por apenas +R$ 6,90!'}
                        </p>
                      </div>
                    </div>

                    {(!hasVideoAccess && !order?.hasVideoAccess) && (pendingVideoPix || videoPixInfo.qrCode) ? (
                      <div style={{ marginTop: '14px', backgroundColor: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#10b981', marginBottom: '12px' }}>
                          ⚡ Pague R$ 6,90 via PIX para liberar o Vídeo Homenagem
                        </p>
                        {!videoPixInfo.qrCode ? (
                          <div style={{ padding: '20px 0' }}>
                            <div style={styles.spinner} />
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Gerando PIX com aprovação instantânea...</p>
                          </div>
                        ) : (
                          <>
                            <div style={{ marginBottom: '12px' }}>
                              <PixQrCode
                                payload={videoPixInfo.qrCode}
                                size={200}
                                label="QR Code para pagamento do Vídeo Homenagem via PIX"
                              />
                            </div>
                            <div style={{ marginBottom: '10px', textAlign: 'left' }}>
                              <label htmlFor="pix-copia-cola-video" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                Ou use o código PIX Copia e Cola:
                              </label>
                              <textarea
                                id="pix-copia-cola-video"
                                readOnly
                                value={videoPixInfo.qrCode}
                                style={{ width: '100%', height: '64px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none' }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(videoPixInfo.qrCode);
                                setPixCopied(true);
                                setTimeout(() => setPixCopied(false), 3000);
                              }}
                              className="btn btn-primary"
                              style={{ width: '100%', padding: '12px', borderRadius: '8px', fontWeight: 'bold', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', border: 'none', color: '#fff', cursor: 'pointer' }}
                            >
                              {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX (R$ 6,90)'}
                            </button>
                          </>
                        )}
                        {videoPixPollingTimedOut && (
                          <div style={{ width: '100%', marginTop: '10px', padding: '10px 14px', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: '10px', color: '#facc15', fontSize: '0.8rem', textAlign: 'center' }}>
                            Ainda não recebemos a confirmação deste pagamento. Se você já pagou,
                            atualize a página em alguns instantes.
                          </div>
                        )}
                      </div>
                    ) : !hasVideoAccess && !order?.hasVideoAccess && !order?.videoUrl ? (
                      <div style={{ marginTop: '14px', backgroundColor: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          Crie um filme inesquecível com 10 a 20 fotos de <strong>{order?.honoreeName || 'alguém especial'}</strong> sincronizadas com a música!
                        </p>
                        <button
                          type="button"
                          disabled={pendingVideoPix}
                          onClick={() => {
                            setSelectedPackage('video_addon');
                            setPendingVideoPix(true);
                            handleGeneratePix(6.90, true);
                          }}
                          className="btn btn-primary"
                          style={{ padding: '12px 20px', fontSize: '0.92rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', border: 'none', cursor: 'pointer', opacity: pendingVideoPix ? 0.6 : 1 }}
                        >
                          {pendingVideoPix ? 'Gerando PIX...' : '✨ Adicionar Vídeo Homenagem (+ R$ 6,90)'}
                        </button>
                      </div>
                    ) : order?.videoUrl ? (
                      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ borderRadius: '12px', overflow: 'hidden', backgroundColor: '#000', border: '1px solid var(--border-color)' }}>
                          <video src={order.videoUrl} controls style={{ width: '100%', maxHeight: '350px', objectFit: 'contain' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              // A extensão precisa bater com o container real do arquivo (mp4 ou
                              // webm, conforme o que o navegador conseguiu gravar — ver
                              // src/lib/videoGenerator.js) para o WhatsApp reconhecer o arquivo
                              // baixado. O fetch passa pelo /api/image-proxy (mesma origem) porque
                              // buscar a URL do Firebase Storage direto costuma esbarrar em CORS,
                              // o que fazia handleDownload cair no fallback de abrir em nova aba
                              // em vez de baixar.
                              const videoExt = order.videoUrl.split('?')[0].split('.').pop().toLowerCase();
                              const ext = videoExt === 'webm' ? 'webm' : 'mp4';
                              const proxiedUrl = `/api/image-proxy?url=${encodeURIComponent(order.videoUrl)}`;
                              handleDownload(proxiedUrl, `Homenagem_${order?.honoreeName || 'Video'}.${ext}`);
                            }}
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '10px', fontSize: '0.88rem', textAlign: 'center', border: 'none', cursor: 'pointer', minWidth: '160px' }}
                          >
                            ⬇ Baixar Vídeo HD
                          </button>
                          <a 
                            href={`/homenagem?orderId=${orderId}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn btn-secondary" 
                            style={{ flex: 1, padding: '10px', fontSize: '0.88rem', textAlign: 'center', textDecoration: 'none', minWidth: '160px' }}
                          >
                            ✨ Ver Página do Homenageado
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: '16px' }}>
                        {isUploadingPhotos ? (
                          <div style={{ textAlign: 'center', padding: '24px 14px', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: '12px' }}>
                            <div style={styles.spinner} />
                            <p style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '14px', color: 'var(--primary)' }}>
                              {uploadProgressMsg || 'Processando e gerando seu vídeo slideshow MP4...'}
                            </p>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                              ⚡ Gravação em andamento. Mantenha esta aba aberta por alguns segundos enquanto renderizamos em HD!
                            </p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Grade de fotos já enviadas / selecionadas */}
                            {(existingPhotos.length > 0 || newPhotoFiles.length > 0) && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <span style={{ fontSize: '0.88rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                    📸 Fotos Selecionadas: {existingPhotos.length + newPhotoFiles.length} de 20
                                  </span>
                                  <span style={{ fontSize: '0.78rem', color: (existingPhotos.length + newPhotoFiles.length < 10 || existingPhotos.length + newPhotoFiles.length > 20) ? 'var(--warning)' : 'var(--success)' }}>
                                    (Mínimo 10 | Máximo 20)
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px', maxHeight: '220px', overflowY: 'auto', padding: '6px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                  {/* Fotos remotas salvas no Firestore */}
                                  {existingPhotos.map((url, idx) => (
                                    <div key={`existing-${idx}`} style={{ position: 'relative', width: '100%', height: '75px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(236, 72, 153, 0.4)' }}>
                                      <img src={url} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      <button
                                        type="button"
                                        title="Remover foto"
                                        onClick={async () => {
                                          const updated = existingPhotos.filter((_, i) => i !== idx);
                                          setExistingPhotos(updated);
                                          if (orderId) {
                                            await updateDoc(doc(db, 'orders', orderId), {
                                              slideshowImages: updated,
                                              updatedAt: new Date().toISOString()
                                            }).catch(e => console.warn(e));
                                          }
                                        }}
                                        style={{ position: 'absolute', top: '3px', right: '3px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}

                                  {/* Novas fotos locais pendentes de upload */}
                                  {newPhotoFiles.map((file, idx) => {
                                    const previewUrl = URL.createObjectURL(file);
                                    return (
                                      <div key={`new-${idx}`} style={{ position: 'relative', width: '100%', height: '75px', borderRadius: '8px', overflow: 'hidden', border: '1.5px dashed #3b82f6' }}>
                                        <img src={previewUrl} alt={`Foto Nova ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <button
                                          type="button"
                                          title="Remover foto"
                                          onClick={() => {
                                            setNewPhotoFiles(prev => prev.filter((_, i) => i !== idx));
                                          }}
                                          style={{ position: 'absolute', top: '3px', right: '3px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Botão de Selecionar / Adicionar Mais Fotos */}
                            {(existingPhotos.length + newPhotoFiles.length < 20) && (
                              <label 
                                style={{ 
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  padding: (existingPhotos.length > 0 || newPhotoFiles.length > 0) ? '12px' : '20px', 
                                  border: '2px dashed rgba(236, 72, 153, 0.4)', 
                                  borderRadius: '12px', 
                                  backgroundColor: 'rgba(0,0,0,0.2)', 
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <span style={{ fontSize: (existingPhotos.length > 0 || newPhotoFiles.length > 0) ? '1.4rem' : '2rem', marginBottom: '4px' }}>📸</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                  {(existingPhotos.length > 0 || newPhotoFiles.length > 0) ? '+ Adicionar Mais Fotos' : 'Clique aqui para escolher 10 a 20 fotos'}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {(existingPhotos.length > 0 || newPhotoFiles.length > 0) ? `Faltam ${Math.max(0, 10 - (existingPhotos.length + newPhotoFiles.length))} foto(s) para o mínimo` : '(Mínimo 10 fotos | Máximo 20 fotos)'}
                                </span>
                                <input 
                                  type="file" 
                                  multiple 
                                  accept="image/png, image/jpeg, image/webp" 
                                  style={{ display: 'none' }}
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    const total = existingPhotos.length + newPhotoFiles.length + files.length;
                                    if (total > 20) {
                                      setPhotoError(`O limite máximo é de 20 fotos (Você já tem ${existingPhotos.length + newPhotoFiles.length} fotos e tentou adicionar mais ${files.length}).`);
                                    } else {
                                      setPhotoError('');
                                      setNewPhotoFiles(prev => [...prev, ...files]);
                                    }
                                  }}
                                />
                              </label>
                            )}

                            {photoError && (
                              <p style={{ fontSize: '0.82rem', color: 'var(--danger)', margin: 0, textAlign: 'center', fontWeight: 'bold' }}>
                                ⚠️ {photoError}
                              </p>
                            )}

                            {/* Seletor da Versão de Áudio (caso o pedido tenha mais de 1 versão) */}
                            {secondAudioUrl && (
                              <div style={{ backgroundColor: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                                  🎵 Escolha qual versão da música tocar no vídeo:
                                </p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedVideoTrack('v1')}
                                    style={{
                                      flex: 1,
                                      padding: '8px 10px',
                                      borderRadius: '8px',
                                      border: selectedVideoTrack === 'v1' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                      backgroundColor: selectedVideoTrack === 'v1' ? 'rgba(236, 72, 153, 0.18)' : 'rgba(0,0,0,0.2)',
                                      color: selectedVideoTrack === 'v1' ? '#fff' : 'var(--text-secondary)',
                                      fontWeight: 'bold',
                                      fontSize: '0.82rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {selectedVideoTrack === 'v1' ? '✓ ' : ''}Versão 1 (Principal)
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setSelectedVideoTrack('v2')}
                                    style={{
                                      flex: 1,
                                      padding: '8px 10px',
                                      borderRadius: '8px',
                                      border: selectedVideoTrack === 'v2' ? '2px solid var(--secondary)' : '1px solid var(--border-color)',
                                      backgroundColor: selectedVideoTrack === 'v2' ? 'rgba(168, 85, 247, 0.18)' : 'rgba(0,0,0,0.2)',
                                      color: selectedVideoTrack === 'v2' ? '#fff' : 'var(--text-secondary)',
                                      fontWeight: 'bold',
                                      fontSize: '0.82rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {selectedVideoTrack === 'v2' ? '✓ ' : ''}Versão 2 (Bônus)
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Aviso de troca de aba — a causa mais comum de vídeo mudo é o usuário
                                trocar de aba durante a geração, o que estrangula o requestAnimationFrame
                                e dessincroniza áudio/vídeo. */}
                            {(existingPhotos.length + newPhotoFiles.length >= 10 && existingPhotos.length + newPhotoFiles.length <= 20) && (
                              <div style={{
                                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                                border: '1px solid rgba(251, 191, 36, 0.35)',
                                borderRadius: '10px',
                                padding: '10px 14px',
                                marginBottom: '8px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px'
                              }}>
                                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
                                <p style={{
                                  margin: 0,
                                  fontSize: '0.8rem',
                                  color: '#fbbf24',
                                  lineHeight: '1.4'
                                }}>
                                  <strong>Importante:</strong> Durante a geração do vídeo, <strong>não troque de aba</strong> nem minimize o navegador.
                                  Isso pode fazer o vídeo sair sem áudio. O processo leva alguns minutos.
                                </p>
                              </div>
                            )}

                            {/* Botão de Criação / Re-geração do Vídeo */}
                            {(existingPhotos.length + newPhotoFiles.length >= 10 && existingPhotos.length + newPhotoFiles.length <= 20) && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const totalCount = existingPhotos.length + newPhotoFiles.length;
                                  if (!orderId || totalCount < 10) return;

                                  // Destrava o áudio AQUI, síncrono e antes de qualquer await: o
                                  // upload das fotos leva minutos e, quando a renderização enfim
                                  // começa, o navegador já não autoriza iniciar áudio — era essa a
                                  // causa dos vídeos entregues mudos (ver src/lib/audioContext.js).
                                  primeAudioContext();

                                  setIsUploadingPhotos(true);
                                  setPhotoError('');
                                  try {
                                    const finalUrls = [...existingPhotos];

                                    // Upload de novas fotos locais caso existam
                                    if (newPhotoFiles.length > 0) {
                                      setUploadProgressMsg('Enviando novas fotos para o servidor...');
                                      for (let i = 0; i < newPhotoFiles.length; i++) {
                                        const file = newPhotoFiles[i];
                                        setUploadProgressMsg(`Enviando foto ${i + 1} de ${newPhotoFiles.length}...`);
                                        const fileRef = ref(storage, `orders/${orderId}/photos/${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
                                        await uploadBytes(fileRef, file);
                                        const url = await getDownloadURL(fileRef);
                                        finalUrls.push(url);
                                      }
                                      setExistingPhotos(finalUrls);
                                      setNewPhotoFiles([]);
                                    }

                                    // Salva lista final no Firestore
                                    await updateDoc(doc(db, 'orders', orderId), {
                                      slideshowImages: finalUrls,
                                      videoStatus: 'GERANDO',
                                      updatedAt: new Date().toISOString()
                                    }).catch(e => console.warn(e));

                                    setUploadProgressMsg('Gerando vídeo slideshow MP4 HD em silêncio... 10%');

                                    // Define a faixa de áudio escolhida pelo usuário
                                    const targetAudioUrl = selectedVideoTrack === 'v2' && secondAudioUrl ? secondAudioUrl : primaryAudioUrl;

                                    // Renderiza o vídeo usando o módulo client-side (silencioso e sem CORS).
                                    // Import dinâmico: videoGenerator.js só é baixado por quem realmente
                                    // gera um vídeo, não entra no bundle inicial de /entrega (ver B-08/Lote 6).
                                    const { createSlideshowVideo } = await import('@/lib/videoGenerator');
                                    const generatedVideoUrl = await createSlideshowVideo(
                                      orderId,
                                      finalUrls,
                                      targetAudioUrl,
                                      order,
                                      (percent) => setUploadProgressMsg(`Renderizando vídeo MP4 HD... ${percent}%`)
                                    );

                                    setOrder(prev => prev ? { ...prev, videoUrl: generatedVideoUrl, videoStatus: 'CONCLUIDO', slideshowImages: [] } : prev);
                                    setExistingPhotos([]);

                                    // Com o vídeo já gerado e salvo, as fotos originais não servem mais
                                    // pra nada — apaga da Storage pra não acumular espaço. Falha aqui não
                                    // pode derrubar o sucesso da geração do vídeo (por isso o catch próprio
                                    // e sem re-throw).
                                    try {
                                      await Promise.all(
                                        finalUrls.map((url) => deleteObject(ref(storage, url)).catch((e) => {
                                          console.warn('Falha ao apagar foto do slideshow:', e?.message);
                                        }))
                                      );
                                      await updateDoc(doc(db, 'orders', orderId), {
                                        slideshowImages: [],
                                        updatedAt: new Date().toISOString()
                                      });
                                    } catch (cleanupErr) {
                                      console.warn('Falha ao limpar fotos do slideshow:', cleanupErr?.message);
                                    }

                                    alert("🎉 Seu Vídeo Homenagem foi gerado com sucesso!");
                                  } catch (err) {
                                    console.error("Erro no envio/geração do vídeo:", err);
                                    setPhotoError(err.message || "Erro ao gerar vídeo. Tente novamente.");
                                  } finally {
                                    setIsUploadingPhotos(false);
                                  }
                                }}
                                className="btn btn-primary"
                                style={{ padding: '12px', fontSize: '0.95rem', fontWeight: 'bold', width: '100%', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' }}
                              >
                                🎬 Criar Vídeo Homenagem MP4 ({existingPhotos.length + newPhotoFiles.length} Fotos)
                              </button>
                            )}
                          </div>
                        )}
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
                        <a href={`/homenagem?orderId=${orderId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none', textAlign: 'center' }}>
                          👁 Página do Homenageado
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
                        {promo ? '🎁 Oferta Especial Liberada!' : 'Liberar Músicas Completas em MP3 HD'}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {promo === '48h' ? (
                          <>Pague apenas <strong style={{ color: 'var(--success)', fontSize: '1.1rem' }}>R$ 6,99</strong> para liberar as 2 versões completas e <strong>ganhe o Vídeo Homenagem de brinde!</strong></>
                        ) : promo === '24h' ? (
                          <>Pague apenas <strong style={{ color: 'var(--success)', fontSize: '1.1rem' }}>R$ 9,99</strong> para liberar as 2 versões completas e <strong>ganhe o Vídeo Homenagem de brinde!</strong></>
                        ) : (
                          <>Pague apenas <strong style={{ color: 'var(--success)', fontSize: '1.1rem' }}>R$ 9,99</strong> para liberar o download das 2 versões completas sem corte e a página especial de presente!</>
                        )}
                      </p>
                    </div>

                    {pixLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <div style={styles.spinner} />
                        <p style={{ fontSize: '0.85rem', marginTop: '10px', color: 'var(--text-muted)' }}>Gerando PIX com aprovação instantânea...</p>
                      </div>
                    ) : pixError ? (
                      /* Estado de erro visível e com saída. Antes desta tela a falha só existia como
                         alert, que voltava a cada retentativa automática e deixava o cliente sem
                         nenhum caminho — nem pagar, nem entender o que aconteceu. */
                      <div style={{ textAlign: 'center', padding: '8px 4px' }}>
                        <p style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                          {pixError}
                        </p>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                          Sua música está salva e o pedido continua valendo. Tente de novo em alguns
                          instantes — se continuar, fale com o suporte pelo WhatsApp que a gente
                          libera manualmente.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleGeneratePix()}
                          className="btn btn-primary"
                          style={{ width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', border: 'none', color: '#fff', cursor: 'pointer' }}
                        >
                          🔄 Tentar gerar o PIX novamente
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
                        {pixInfo.qrCode ? (
                          <div style={{ width: '100%' }}>
                            {/* QR Code como caminho principal: parte dos clientes não localizava o
                                botão de copiar e desistia do pagamento. O copia-e-cola continua
                                abaixo para quem paga pelo computador. */}
                            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                Abra o app do seu banco e aponte a câmera para o QR Code:
                              </p>
                              <PixQrCode payload={pixInfo.qrCode} />
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                              <label htmlFor="pix-copia-cola-musica" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                Ou use o código PIX Copia e Cola:
                              </label>
                              <textarea
                                id="pix-copia-cola-musica"
                                readOnly
                                value={pixInfo.qrCode}
                                style={{ width: '100%', height: '70px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', fontFamily: 'monospace', resize: 'none' }}
                              />
                            </div>

                            {/* Banner paliativo — só aparece se caiu pro fallback estático */}
                            {pixInfo.provider === 'static' && (
                              <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: '10px', padding: '12px 14px', marginBottom: '4px', textAlign: 'center' }}>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400e', fontWeight: '600' }}>
                                  ⚠️ Após pagar, anexe o comprovante abaixo para liberar automaticamente.
                                </p>
                              </div>
                            )}

                            {receiptStatus === 'failed' && (
                              <div style={{ background: '#fee2e2', border: '1.5px solid #ef4444', borderRadius: '10px', padding: '12px 14px', marginBottom: '4px', textAlign: 'center' }}>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b', fontWeight: '600' }}>
                                  Não conseguimos confirmar automaticamente. Manda pra gente pelo WhatsApp que liberamos na mão.
                                </p>
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(pixInfo.qrCode);
                                  setPixCopied(true);
                                  setTimeout(() => setPixCopied(false), 3000);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '14px',
                                  borderRadius: '10px',
                                  border: 'none',
                                  background: pixCopied ? 'var(--success)' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                  color: '#FFFFFF',
                                  fontWeight: 'bold',
                                  fontSize: '0.95rem',
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)'
                                }}
                              >
                                {pixCopied ? '✅ Copiado!' : '📋 Copiar PIX'}
                              </button>
                            </div>

                            {pixInfo.provider === 'static' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                                <input
                                  ref={receiptInputRef}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  style={{ display: 'none' }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleReceiptUpload(file);
                                    e.target.value = '';
                                  }}
                                />
                                {/* Passo 1: tenta liberar automático primeiro. O botão do WhatsApp só
                                    aparece depois de uma falha confirmada (receiptStatus === 'failed'),
                                    para não competir com a tentativa automática. */}
                                <button
                                  type="button"
                                  disabled={receiptStatus === 'uploading'}
                                  onClick={() => receiptInputRef.current?.click()}
                                  style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: receiptStatus === 'uploading' ? 'var(--border-color)' : 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                                    color: '#FFFFFF',
                                    fontWeight: 'bold',
                                    fontSize: '0.95rem',
                                    cursor: receiptStatus === 'uploading' ? 'default' : 'pointer',
                                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
                                  }}
                                >
                                  {receiptStatus === 'uploading' ? '⏳ Analisando...' : '📎 Anexar comprovante'}
                                </button>

                                {receiptStatus === 'failed' && (
                                  <a
                                    href={`https://wa.me/5594991064043?text=${encodeURIComponent(`Olá! Acabei de pagar o pedido *#${orderId}* (R$ ${order?.totalPrice?.toFixed(2) || '9,99'}). Segue o comprovante:`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      width: '100%',
                                      padding: '14px',
                                      borderRadius: '10px',
                                      border: 'none',
                                      background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                                      color: '#FFFFFF',
                                      fontWeight: 'bold',
                                      fontSize: '0.95rem',
                                      cursor: 'pointer',
                                      boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)',
                                      textDecoration: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px'
                                    }}
                                  >
                                    📲 Mandar no WhatsApp
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                        ) : (
                          <button
                            type="button"
                            onClick={handleGeneratePix}
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                          >
                            💚 Gerar PIX (R$ {promo === '48h' ? '6,99' : '9,99'})
                          </button>
                        )}

                        {pixPollingTimedOut && (
                          <div style={{ width: '100%', padding: '12px 16px', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: '10px', color: '#facc15', fontSize: '0.85rem', textAlign: 'center' }}>
                            Ainda não recebemos a confirmação automática deste pagamento. Se você já
                            pagou, atualize a página em alguns instantes.
                          </div>
                        )}

                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'center' }}>
                          {pixInfo.provider === 'static'
                            ? 'Anexe o comprovante logo após pagar para liberar na hora.'
                            : 'A liberação é automática assim que o pagamento for confirmado — não precisa enviar comprovante.'}
                        </p>
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

          {/* Modal Pop-up de Oferta do Vídeo Homenagem (R$ 6,90) */}
          <VideoOfferModal
            isOpen={showVideoModal}
            honoreeName={order?.honoreeName || 'alguém especial'}
            onClose={() => {
              setShowVideoModal(false);
              if (typeof window !== 'undefined' && orderId) {
                sessionStorage.setItem(`video_modal_dismissed_${orderId}`, 'true');
              }
            }}
            onSelectVideoOption={(wantsVideo) => {
              setShowVideoModal(false);
              if (typeof window !== 'undefined' && orderId) {
                sessionStorage.setItem(`video_modal_dismissed_${orderId}`, 'true');
              }
              if (wantsVideo) {
                if (isPaid) {
                  setSelectedPackage('video_addon');
                  setPendingVideoPix(true);
                  handleGeneratePix(6.90, true);
                } else {
                  setSelectedPackage('combo');
                  handleGeneratePix(16.89);
                }
              }
            }}
          />

          {/* Gerenciamento de Conta */}
          {isPaid && (
            (currentUser && (order.userId === currentUser.uid || order.customerEmail === currentUser.email)) ? (
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
            ) : (!currentUser ? (
              <div className="glass-card" style={{ padding: '28px', marginBottom: '32px', border: '1px solid rgba(124, 58, 237, 0.3)', background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <span style={{ background: 'rgba(124, 58, 237, 0.2)', color: 'var(--secondary)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      🔐 SUA CONTA NSMUSIC
                    </span>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '8px' }}>Crie sua senha para salvar suas músicas</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Crie uma senha para acessar <strong>{order?.customerEmail || 'sua conta'}</strong> e veja todas as suas músicas no painel <strong>Minhas Músicas</strong> sempre que quiser!
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
            ) : null)
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

                  <div style={styles.starsContainer} role="radiogroup" aria-label="Avaliação de 1 a 5 estrelas">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        aria-label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                        aria-pressed={rating >= star}
                        style={{
                          ...styles.starBtn,
                          color: rating >= star ? 'var(--warning)' : 'var(--text-muted)'
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <label htmlFor="reviewText" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                    Comentário sobre a música (opcional)
                  </label>
                  <textarea
                    id="reviewText"
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Escreva como foi a reação de quem ouviu ou o que você achou das versões..."
                    style={styles.reviewTextarea}
                  />

                  {reviewError && (
                    <p style={{ color: 'var(--danger, #dc2626)', fontSize: '0.85rem', marginBottom: '8px' }}>{reviewError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={rating === 0 || reviewSubmitting}
                    className="btn btn-primary"
                    style={{ alignSelf: 'flex-start', padding: '12px 24px', fontSize: '0.9rem', opacity: reviewSubmitting ? 0.7 : 1 }}
                  >
                    {reviewSubmitting ? 'Enviando...' : 'Enviar Avaliação'}
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
