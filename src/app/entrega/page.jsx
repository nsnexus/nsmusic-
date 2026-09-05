'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { primeAudioContext } from '@/lib/audioContext';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';
import ExtrasOfferModal from '@/components/ExtrasOfferModal';
import ExtrasVitrine from '@/components/ExtrasVitrine';
import PixQrCode from '@/components/PixQrCode';
import PlaybackAddonCard from '@/components/PlaybackAddonCard';
import CartaAddonCard from '@/components/CartaAddonCard';
import RetrospectivaAddonCard from '@/components/RetrospectivaAddonCard';
import { requestPixCharge } from '@/lib/pixCheckout';
import { compressImage } from '@/lib/imageCompress';
import { getPriceForSku } from '@/lib/pricing';
import { styles } from './entregaStyles';

function EntregaContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id');
  const promo = searchParams.get('promo');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
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
  // Abas dos produtos depois de pago (pedido 04/09/2026) — antes tudo ficava empilhado numa rolagem
  // só; 'musica' cobre também o Playback (instrumental), por ser derivado da mesma faixa.
  const [abaProduto, setAbaProduto] = useState('musica');
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
  const jaTemRetrospectiva = Boolean(order?.hasRetrospectivaAccess || order?.retrospectivaAddonPaid);
  const jaTemCarta = Boolean(order?.hasCartaAccess || order?.cartaAddonPaid);

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


  // Acrescenta ?download=<nome> à URL do proxy: é o que faz o servidor mandar Content-Disposition e
  // o navegador BAIXAR em vez de tocar (ver src/app/api/audio/proxy/route.js).
  const withDownloadFlag = (url, filename) => {
    if (!url || !url.startsWith('/api/')) return url;
    return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`;
  };

  const handleDownload = async (url, filename) => {
    // Link direto para o proxy, com Content-Disposition — não baixa os ~5 MB para a memória da aba
    // antes de salvar, e continua sendo download (não vira player) mesmo se algo der errado no meio.
    // A versão anterior buscava o arquivo por fetch e, em qualquer falha, caía num window.open que
    // só ABRIA a música numa aba nova: o cliente clicava em "Baixar" e ouvia em vez de baixar.
    const downloadUrl = withDownloadFlag(url, filename);
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

  // `explicitSku` substitui o antigo `customAmount` (achado 04/09/2026: comparar o valor em dinheiro
  // com 16.89 pra "adivinhar" que era o SKU `combo` já era frágil, e quebrava de vez ao adicionar
  // combo_carta/combo_retrospectiva — dois SKUs novos não tinham como cair nesse `if` de valor
  // fixo). Quem chama agora diz o SKU direto; sem ele, cai no comportamento de sempre
  // (promoção de recuperação, ou audio_only).
  const handleGeneratePix = async (explicitSku = null, isSecondary = false) => {
    if (!order) return;
    if (isSecondary) setPendingVideoPix(true);
    else {
      setPixError('');
      setPixLoading(true);
    }

    // O valor a cobrar é decidido pelo servidor a partir do SKU (ver src/lib/pricing.js e C-05 no
    // AUDIT_REPORT.md) — o cliente só informa QUAL produto está comprando, nunca o preço.
    let sku;
    if (explicitSku) sku = explicitSku;
    else if (isSecondary) sku = 'video_addon';
    else if (promo === '48h') sku = 'recovery_combo_48h';
    else if (promo === '24h') sku = 'recovery_combo_24h';
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
    // AUDIO_CACHE_VERSION quebra o cache do navegador (incidente 28/08/2026: a CDN de origem
    // devolveu 200 com corpo vazio e o proxy mandava "immutable, 1 ano" — o arquivo VAZIO ficou
    // preso no navegador de quem abriu a página naquela janela, e continuava quebrado mesmo depois
    // da origem voltar). Incrementar esta constante é o único jeito de invalidar remotamente o que
    // já está cacheado no cliente. Ver src/lib/audioCacheVersion.js.
    return `/api/audio/proxy?url=${encodeURIComponent(url)}${idParam}&v=${AUDIO_CACHE_VERSION}`;
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
        <div className="entrega-header-container">
          <div className="entrega-header-nav">
            <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
              <Image src="/logo.png" alt="NSMusic" width={36} height={36} style={{ height: '36px', width: 'auto' }} priority />
            </Link>
            <Link href="/criar" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', minHeight: '36px' }}>
              ✨ Nova Música
            </Link>
            <Link href="/minhas-musicas" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', minHeight: '36px' }}>
              🎵 Minhas Músicas
            </Link>
          </div>
          <span 
            className="entrega-status-badge"
            style={{
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
      <main className="entrega-main">
        <div className="entrega-container">

          {/* Abas dos produtos — só depois de pago (antes só existe a música/prévia, um produto só). */}
          {isPaid && (
            <div className="entrega-tabs" role="tablist">
              {[
                { id: 'musica', label: '🎵 Música' },
                { id: 'retrospectiva', label: '📖 Retrospectiva' },
                { id: 'carta', label: '💌 Carta' },
              ].map((aba) => (
                <button
                  key={aba.id}
                  type="button"
                  role="tab"
                  aria-selected={abaProduto === aba.id}
                  onClick={() => setAbaProduto(aba.id)}
                  className={`entrega-tab-btn ${abaProduto === aba.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    boxShadow: abaProduto === aba.id ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
                    border: 'none',
                  }}
                >
                  {aba.label}
                </button>
              ))}
            </div>
          )}

          {(!isPaid || abaProduto === 'musica') && (
          <div
            style={isPaid ? {
              ...styles.deliveryCard,
              backgroundColor: '#0c0616',
              border: '1px solid rgba(236, 72, 153, 0.22)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
              position: 'relative',
              overflow: 'hidden',
            } : styles.deliveryCard}
            className="entrega-card glass-card"
          >
            {/* Clima "homenagem" (achado 04/09/2026, pedido pra bater com o visual de /homenagem):
                brilho radial + corações flutuando de fundo, só quando pago — a prévia continua no
                tema claro de sempre, sem mexer no funil de pagamento. */}
            {isPaid && (
              <>
                <div aria-hidden="true" style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '140%', height: '360px', background: 'radial-gradient(circle, rgba(236,72,153,0.16) 0%, rgba(168,85,247,0.1) 50%, transparent 72%)', pointerEvents: 'none' }} />
                {['💗', '✨', '🎵', '💜', '⭐'].map((s, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: `${8 + i * 19}%`,
                      left: i % 2 === 0 ? `${4 + i * 3}%` : undefined,
                      right: i % 2 === 1 ? `${4 + i * 2}%` : undefined,
                      fontSize: '1.1rem',
                      opacity: 0.35,
                      pointerEvents: 'none',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </>
            )}

            <div className="entrega-grid" style={isPaid ? { position: 'relative', zIndex: 1 } : undefined}>

              {/* SLOT 1 (Desktop: Col 1 Top / Mobile: Item 1): Capa, Players & WhatsApp */}
              <div className="entrega-grid-col-1-top" style={styles.mediaSide}>
                {isPaid && (
                  <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
                    <h2 style={{ fontFamily: 'var(--font-family-gala)', fontWeight: '800', fontSize: '1.5rem', color: '#fff', margin: '0 0 4px', lineHeight: 1.25 }}>
                      Uma Homenagem para <span className="hero-sublinhado" style={{ color: '#f472b6' }}>
                        {order?.honoreeName}
                        <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
                          <defs>
                            <linearGradient id="tracoEntrega" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#f472b6" />
                              <stop offset="100%" stopColor="#a855f7" />
                            </linearGradient>
                          </defs>
                          <path d="M4 10 C 70 3, 150 2, 296 6" fill="none" stroke="url(#tracoEntrega)" strokeWidth="6" strokeLinecap="round" />
                        </svg>
                      </span>
                    </h2>
                    <p style={{ fontSize: '0.88rem', color: '#cbd5e1', margin: 0 }}>
                      De <strong style={{ color: '#fff' }}>{order?.customerName}</strong> com todo carinho e amor ❤️
                    </p>
                  </div>
                )}
                <div style={isPaid ? { ...styles.coverWrapper, boxShadow: '0 16px 40px rgba(236,72,153,0.22)', border: '1.5px solid rgba(255,255,255,0.12)' } : styles.coverWrapper}>
                  <img src={coverUrl} alt="Capa da música" style={styles.coverImg} />
                  {!isPaid && (
                    <div style={styles.coverOverlay}>
                      {/* color precisa ser explícito aqui: a regra global h1-h6 (globals.css) sempre
                          vence sobre a cor herdada do coverOverlay, deixando o título ilegível em cima
                          da foto escura (relato do usuário, 2026-08-02). */}
                      <h2 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.4rem', color: '#FFFFFF' }}>
                        Melodia para {order?.honoreeName}
                      </h2>
                      <p style={{ fontSize: '0.85rem', opacity: 0.8, color: '#FFFFFF' }}>Uma homenagem de {order?.customerName}</p>
                    </div>
                  )}
                </div>

                {/* Audio Player 1 (Prévia de 60s se pendente, Completo se pago) */}
                {primaryAudioUrl && (
                  <div style={isPaid ? { ...styles.audioPlayerContainer, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)' } : styles.audioPlayerContainer} className="glass-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '700', color: isPaid ? '#f1f5f9' : 'var(--primary)' }}>
                        {isPaid ? '🎧 Versão 1' : '🎧 Prévia (Versão 1 — 60 segundos)'}
                      </h4>
                      {isPaid && (
                        <span style={{ fontSize: '0.7rem', color: '#f472b6', backgroundColor: 'rgba(236,72,153,0.12)', padding: '3px 9px', borderRadius: '10px', border: '1px solid rgba(236,72,153,0.3)', fontWeight: '700' }}>
                          Estúdio NSMusic
                        </span>
                      )}
                    </div>
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
                  <div style={isPaid ? { ...styles.audioPlayerContainer, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)' } : styles.audioPlayerContainer} className="glass-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '700', color: isPaid ? '#f1f5f9' : 'var(--secondary)' }}>
                        {isPaid ? '🎧 Versão 2' : '🎧 Prévia (Versão 2 — 60 segundos Bônus)'}
                      </h4>
                      {isPaid && (
                        <span style={{ fontSize: '0.7rem', color: '#c084fc', backgroundColor: 'rgba(168,85,247,0.12)', padding: '3px 9px', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.3)', fontWeight: '700' }}>
                          Estúdio NSMusic
                        </span>
                      )}
                    </div>
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
                          className="btn"
                          style={{ ...styles.downloadBtn, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}
                        >
                          ⬇ Baixar MP3 (V2 Bônus)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Card: Não gostou do resultado? Chame no WhatsApp */}
                {!isPaid && (
                  <div className="entrega-whatsapp-card glass-card">
                    <div style={{ flex: 1 }}>
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
                      className="entrega-whatsapp-btn"
                    >
                      <span>Falar no WhatsApp 📲</span>
                    </a>
                  </div>
                )}
              </div>

              {/* SLOT 2 (Desktop: Col 2 Top / Mobile: Item 2): Letra Oficial da Música */}
              <div className="entrega-grid-col-2-top" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div
                  style={isPaid ? { ...styles.lyricsSide, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'none' } : styles.lyricsSide}
                  className="entrega-lyrics-card glass-card"
                >
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', fontFamily: isPaid ? 'var(--font-family-gala)' : 'var(--font-family-title)', color: isPaid ? '#f472b6' : 'var(--primary)' }}>
                    Letra Oficial 📜
                  </h3>
                  <pre style={isPaid ? { ...styles.lyricsText, color: '#e2e8f0' } : styles.lyricsText}>{order.lyrics || 'Letra ainda não gerada para esta composição.'}</pre>
                </div>
              </div>

              {/* SLOT 3 (Desktop: Col 1 Bottom / Mobile: Item 3): Checkout PIX ou Vídeo/QR/Playback */}
              <div className="entrega-grid-col-1-bottom" style={styles.mediaSide}>

                {/* SEÇÃO VÍDEO HOMENAGEM (10 A 20 FOTOS) */}
                {isPaid && (
                  <div className="glass-card" style={{ padding: '24px', borderRadius: '16px', marginTop: '20px', border: '1.5px solid rgba(236, 72, 153, 0.35)', background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '1.8rem' }}>🎬</span>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
                          Vídeo Homenagem com Suas Fotos (MP4)
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: 0 }}>
                          {hasVideoAccess || order?.hasVideoAccess ? 'Envie entre 10 e 20 fotos para gerar um vídeo especial sincronizado com a música!' : 'Adicione o Vídeo Homenagem ao seu pedido por apenas +R$ 6,90!'}
                        </p>
                      </div>
                    </div>

                    {(!hasVideoAccess && !order?.hasVideoAccess) && (pendingVideoPix || videoPixInfo.qrCode) ? (
                      <div style={{ marginTop: '14px', backgroundColor: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#10b981', marginBottom: '12px' }}>
                          ⚡ Pague R$ 6,90 via PIX para liberar o Vídeo Homenagem
                        </p>
                        {!videoPixInfo.qrCode ? (
                          <div style={{ padding: '20px 0' }}>
                            <div style={styles.spinner} />
                            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '8px' }}>Gerando PIX com aprovação instantânea...</p>
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
                              <label htmlFor="pix-copia-cola-video" style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
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
                      <div style={{ marginTop: '14px', backgroundColor: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.92rem', color: '#e2e8f0', marginBottom: '12px', lineHeight: '1.5' }}>
                          Crie um filme inesquecível com 10 a 20 fotos de <strong style={{ color: '#ffffff' }}>{order?.honoreeName || 'alguém especial'}</strong> sincronizadas com a música!
                        </p>
                        <button
                          type="button"
                          disabled={pendingVideoPix}
                          onClick={() => {
                            setSelectedPackage('video_addon');
                            setPendingVideoPix(true);
                            handleGeneratePix('video_addon', true);
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
                              const nomeArquivo = `Homenagem_${order?.honoreeName || 'Video'}.${ext}`;
                              const proxiedUrl = `/api/image-proxy?url=${encodeURIComponent(order.videoUrl)}`;

                              // O proxy roda no Edge e não aguenta arquivo muito grande (achado
                              // 03/09/2026: um vídeo de 136 MB estourava o limite de memória do
                              // Worker, a rota devolvia JSON de erro e o navegador salvava esse
                              // JSON — o cliente recebia um ".json" em vez do vídeo). Conferir
                              // ANTES com HEAD: se o proxy não conseguir servir, manda o link
                              // direto do Storage, que ao menos abre o vídeo pra salvar na mão.
                              (async () => {
                                let proxyOk = false;
                                try {
                                  const teste = await fetch(proxiedUrl, { method: 'HEAD' });
                                  proxyOk = teste.ok && !(teste.headers.get('content-type') || '').includes('application/json');
                                } catch (e) {
                                  proxyOk = false;
                                }

                                if (proxyOk) {
                                  handleDownload(proxiedUrl, nomeArquivo);
                                } else {
                                  console.warn('[entrega] Proxy não conseguiu servir o vídeo; abrindo o arquivo direto.');
                                  window.open(order.videoUrl, '_blank', 'noopener');
                                }
                              })();
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
                            <p style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '14px', color: '#ffffff' }}>
                              {uploadProgressMsg || 'Processando e gerando seu vídeo slideshow MP4...'}
                            </p>
                            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '6px' }}>
                              ⚡ Gravação em andamento. Mantenha esta aba aberta por alguns segundos enquanto renderizamos em HD!
                            </p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {(existingPhotos.length > 0 || newPhotoFiles.length > 0) && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <span style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#ffffff' }}>
                                    📸 Fotos Selecionadas: {existingPhotos.length + newPhotoFiles.length} de 20
                                  </span>
                                  <span style={{ fontSize: '0.78rem', color: (existingPhotos.length + newPhotoFiles.length < 10 || existingPhotos.length + newPhotoFiles.length > 20) ? 'var(--warning)' : 'var(--success)' }}>
                                    (Mínimo 10 | Máximo 20)
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px', maxHeight: '220px', overflowY: 'auto', padding: '6px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
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

                            {(existingPhotos.length + newPhotoFiles.length < 20) && (
                              <label 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  gap: '8px', 
                                  padding: '12px', 
                                  backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                                  border: '1.5px dashed #3b82f6', 
                                  borderRadius: '10px', 
                                  cursor: 'pointer', 
                                  color: '#60a5fa', 
                                  fontWeight: 'bold', 
                                  fontSize: '0.85rem' 
                                }}
                              >
                                <span>➕ Adicionar Fotos ({20 - (existingPhotos.length + newPhotoFiles.length)} vagas restantes)</span>
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

                            {secondAudioUrl && (
                              <div style={{ backgroundColor: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold', margin: '0 0 8px 0', color: '#ffffff' }}>
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
                                      color: selectedVideoTrack === 'v1' ? '#fff' : '#cbd5e1',
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
                                      color: selectedVideoTrack === 'v2' ? '#fff' : '#cbd5e1',
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
                                        // Comprime antes de subir: upload muito mais rápido no 4G,
                                        // menos memória durante a renderização do vídeo e menos
                                        // Storage (as fotos agora ficam guardadas pra Retrospectiva).
                                        // Nunca falha o upload por causa disso — em erro devolve o
                                        // arquivo original (ver src/lib/imageCompress.js).
                                        const arquivo = await compressImage(file);
                                        const fileRef = ref(storage, `orders/${orderId}/photos/${Date.now()}_${i}_${arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
                                        await uploadBytes(fileRef, arquivo);
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
                  <div className="entrega-qr-card glass-card">
                    <div style={{ flex: 1, width: '100%' }}>
                      <h4 style={{ fontSize: '1rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)' }}>Compartilhar Homenagem 🎁</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Envie o link exclusivo ou salve o QR Code para compartilhar essa linda homenagem diretamente com quem você ama!
                      </p>
                      <div className="entrega-qr-buttons">
                        <button onClick={handleCopyLink} className="btn btn-primary" style={{ padding: '9px 14px', fontSize: '0.82rem', border: 'none', cursor: 'pointer', flex: 1 }}>
                          {copied ? '✅ Link Copiado!' : '🔗 Copiar Link'}
                        </button>
                        <a href={`/homenagem?orderId=${orderId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '9px 14px', fontSize: '0.82rem', textDecoration: 'none', textAlign: 'center', flex: 1 }}>
                          👁 Página do Homenageado
                        </a>
                        <a href={qrCodeUrl} download={`qrcode-${order?.orderNumber}.png`} className="btn btn-secondary" style={{ padding: '9px 14px', fontSize: '0.82rem', textDecoration: 'none', textAlign: 'center', flex: 1 }}>
                          💾 Salvar QR Code
                        </a>
                      </div>
                    </div>
                    <img src={qrCodeUrl} alt="QR Code" style={styles.qrImg} />
                  </div>
                ) : null}

                {/* Add-on de playback (instrumental) — só pra pedidos com sunoTaskId/audioIds
                    gravados na geração (pedidos anteriores a este recurso não têm esses campos). */}
                {isPaid && order?.audioIds?.length > 0 && order?.sunoTaskId && (
                  <PlaybackAddonCard orderId={orderId} order={order} />
                )}

                {!isPaid && (
                  /* SE PENDENTE: Bloco de Pagamento PIX Instantâneo */
                  <div className="glass-card" style={{ padding: '24px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.08) 0%, rgba(16, 185, 129, 0.12) 100%)', border: '1.5px solid rgba(16, 185, 129, 0.3)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '2rem' }}>⚡</span>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginTop: '6px', color: 'var(--text-primary)' }}>
                        {promo ? '🎁 Oferta Especial Liberada!' : 'Liberar Músicas Completas em MP3 HD'}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {promo === '48h' ? (
                          <>Pague apenas <strong style={{ color: 'var(--success)', fontSize: '1.1rem' }}>R$ 6,90</strong> para liberar as 2 versões completas e <strong>ganhe o Vídeo Homenagem de brinde!</strong></>
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

              {/* SLOT 4 (Desktop: Col 2 Bottom / Mobile: Item 4): ExtrasVitrine e Banners */}
              <div className="entrega-grid-col-2-bottom" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Vitrine dos extras enquanto o cliente decide o pagamento da música. Sem botão de
                    compra de propósito — ver o comentário em ExtrasVitrine.jsx (add-on isolado não
                    aprova a música, então comprar aqui deixaria o cliente sem o produto principal). */}
                {!isPaid && <ExtrasVitrine />}

                {/* Banner interativo da Retrospectiva — só aparece se o cliente AINDA NÃO comprou */}
                {!jaTemRetrospectiva && (
                  <div
                    onClick={() => {
                      setAbaProduto('retrospectiva');
                      if (typeof window !== 'undefined') {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setAbaProduto('retrospectiva');
                        if (typeof window !== 'undefined') {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }
                    }}
                    className="glass-card"
                    style={{
                      cursor: 'pointer',
                      padding: '16px',
                      borderRadius: '16px',
                      border: '1px solid rgba(236, 72, 153, 0.35)',
                      background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.25) 0%, rgba(236, 72, 153, 0.15) 100%)',
                      textAlign: 'center',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    aria-label="Ir para a aba da Retrospectiva"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '1.2rem' }}>📖</span>
                      <span style={{ fontFamily: 'var(--font-family-gala)', fontWeight: '700', fontSize: '1rem', color: '#f472b6', letterSpacing: '0.03em' }}>
                        Conheça a sua Retrospectiva
                      </span>
                      <span style={{ color: '#f472b6', fontSize: '0.9rem' }}>➔</span>
                    </div>

                    <div style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', margin: '0 auto' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/como-funciona-retrospectiva.jpg"
                        alt="Como funciona a sua Retrospectiva — Toque para acessar"
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                      />
                    </div>

                    <p style={{ margin: '12px 0 4px', fontSize: '0.85rem', color: '#fff', fontWeight: '600' }}>
                      ✨ Toque aqui para ver e montar a sua Retrospectiva
                    </p>
                  </div>
                )}

                {/* Banner interativo da Cartinha — só aparece se o cliente AINDA NÃO comprou */}
                {!jaTemCarta && (
                  <div
                    onClick={() => {
                      setAbaProduto('carta');
                      if (typeof window !== 'undefined') {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setAbaProduto('carta');
                        if (typeof window !== 'undefined') {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }
                    }}
                    className="glass-card"
                    style={{
                      cursor: 'pointer',
                      padding: '16px',
                      borderRadius: '16px',
                      border: '1px solid rgba(236, 72, 153, 0.35)',
                      background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.25) 0%, rgba(236, 72, 153, 0.15) 100%)',
                      textAlign: 'center',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    aria-label="Ir para a aba da Cartinha Virtual"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '1.2rem' }}>💌</span>
                      <span style={{ fontFamily: 'var(--font-family-gala)', fontWeight: '700', fontSize: '1rem', color: '#f472b6', letterSpacing: '0.03em' }}>
                        Conheça a sua Cartinha Virtual
                      </span>
                      <span style={{ color: '#f472b6', fontSize: '0.9rem' }}>➔</span>
                    </div>

                    <div style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', margin: '0 auto' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/como-funciona-cartinha.jpg"
                        alt="Como funciona a sua Cartinha Virtual — Toque para acessar"
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                      />
                    </div>

                    <p style={{ margin: '12px 0 4px', fontSize: '0.85rem', color: '#fff', fontWeight: '600' }}>
                      ✨ Toque aqui para ver e criar a sua Cartinha
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
          )}

          {/* Aba Retrospectiva — add-on isolado da música, tem sua própria página compartilhável
              (/retrospectiva). id preservado pro scroll do pop-up de extras em pedidos antigos que
              ainda apontem pra cá. */}
          {isPaid && abaProduto === 'retrospectiva' && (
            <div id="card-retrospectiva"><RetrospectivaAddonCard orderId={orderId} order={order} /></div>
          )}

          {/* Aba Carta — add-on com envelope animado e música */}
          {isPaid && abaProduto === 'carta' && (
            <div id="card-carta"><CartaAddonCard orderId={orderId} order={order} /></div>
          )}

          {/* Pop-up de extras: vídeo, retrospectiva e carta na mesma interrupção (substituiu o
              VideoOfferModal, que oferecia só o vídeo — decisão do dono do estúdio, 03/09/2026).
              Virou seletor de PACOTE de verdade em 04/09/2026 — achado: antes de pagar, clicar em
              retrospectiva/carta só tentava rolar até um card que nem existia ainda (só aparece com
              isPaid), então "clicava e nada acontecia". Agora, se ainda não pagou, cada opção gera
              o combo certo na hora (preço muda de verdade); se já pagou, some do pop-up (jaTem*) e,
              nos raros casos em que ainda aparecer, cai no card do add-on já visível. */}
          <ExtrasOfferModal
            isOpen={showVideoModal}
            honoreeName={order?.honoreeName || 'alguém especial'}
            isPaid={isPaid}
            jaTemVideo={Boolean(hasVideoAccess || order?.hasVideoAccess)}
            jaTemCarta={jaTemCarta}
            jaTemRetrospectiva={jaTemRetrospectiva}
            onClose={() => {
              setShowVideoModal(false);
              if (typeof window !== 'undefined' && orderId) {
                sessionStorage.setItem(`video_modal_dismissed_${orderId}`, 'true');
              }
            }}
            onSelect={(sku) => {
              setShowVideoModal(false);
              if (typeof window !== 'undefined' && orderId) {
                sessionStorage.setItem(`video_modal_dismissed_${orderId}`, 'true');
              }

              // 'audio_only' = "só a música", a escolha explícita de não levar nenhum extra — segue
              // o fluxo padrão (que já está rodando por baixo do pop-up) sem gerar nada novo.
              if (sku === 'audio_only') return;

              const combosPreDePagamento = {
                video_addon: 'combo',
                carta_addon: 'combo_carta',
                retrospectiva_addon: 'combo_retrospectiva',
              };

              if (!isPaid) {
                // Antes de pagar a música, o extra entra como combo (um pagamento só, mais barato
                // pro cliente que os dois avulsos) — mesma regra que já existia só pro vídeo.
                setSelectedPackage(combosPreDePagamento[sku] || 'audio_only');
                handleGeneratePix(combosPreDePagamento[sku]);
                return;
              }

              if (sku === 'video_addon') {
                setSelectedPackage('video_addon');
                setPendingVideoPix(true);
                handleGeneratePix('video_addon', true);
                return;
              }

              // Retrospectiva e carta pós-pagamento são add-ons cujo card mora na aba própria dele
              // (ver abaProduto) — os cards cuidam da própria cobrança. Trocar de aba é mais honesto
              // que abrir uma segunda cobrança por cima.
              setAbaProduto(sku === 'retrospectiva_addon' ? 'retrospectiva' : 'carta');
            }}
          />



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
