'use client';

export const runtime = 'edge';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { onAuthStateChanged, auth, getAdminAuthToken } from '@/lib/authClient';
import { formatToWhatsAppNumber } from '@/lib/whatsappTemplates';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';
import { hasPreviewTrackingData } from '@/lib/previewTracking';
import { buildSunoPayload } from '@/lib/sunoPayload';
import { buildAudioProxySrc } from '@/lib/audioProxy';
import PlatformIcon from '@/components/admin/PlatformIcon';
import OrderWhatsAppFeedbackCard from '@/components/admin/OrderWhatsAppFeedbackCard';
import { getOrderPlatform, PLATFORMS } from '@/lib/trafficSource';
import { isStripePayment, calculateStripeFee, calculateStripeNet, getPayoutStatus } from '@/lib/paymentFees';
import { isUSOrder } from '@/lib/country';
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
  const [customerName, setCustomerName] = useState('');
  const [honoreeName, setHonoreeName] = useState('');
  const [productionStatus, setProductionStatus] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioUrl2, setAudioUrl2] = useState('');
  const [wavUrl, setWavUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('PENDENTE');
  const [hasVideoAccess, setHasVideoAccess] = useState(false);
  // Liberação manual dos outros add-ons (cortesia/suporte) — mesmo padrão do vídeo, pedido
  // 04/09/2026: só dava pra liberar vídeo pelo painel, faltava playback/carta/retrospectiva.
  const [hasPlaybackAccess, setHasPlaybackAccess] = useState(false);
  const [hasCartaAccess, setHasCartaAccess] = useState(false);
  const [hasRetrospectivaAccess, setHasRetrospectivaAccess] = useState(false);
  const [hasKaraokeAccess, setHasKaraokeAccess] = useState(false);
  const [hasCustomVoiceAccess, setHasCustomVoiceAccess] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notifyCooldown, setNotifyCooldown] = useState(0);
  const [notifyMsg, setNotifyMsg] = useState('');
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [checkPaymentMsg, setCheckPaymentMsg] = useState('');
  const [copiedClientLink, setCopiedClientLink] = useState(false);
  const [copiedImpactLink, setCopiedImpactLink] = useState(false);
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);

  const [sunoPrompt, setSunoPrompt] = useState('');
  const [useCustomVoice, setUseCustomVoice] = useState(false);

  // Suno AI direct generation states
  const [generatingSuno, setGeneratingSuno] = useState(false);
  const [pollingStatus, setPollingStatus] = useState('');
  const [generatedTracks, setGeneratedTracks] = useState([]);
  const [sunoError, setSunoError] = useState('');

  // Estado para vinculação a conta de usuário
  const [orderUserId, setOrderUserId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccountUserId, setSelectedAccountUserId] = useState('');
  const [linkingAccountBusy, setLinkingAccountBusy] = useState(false);
  const [accountLinkingMsg, setAccountLinkingMsg] = useState('');
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');

  // Histórico de versões de áudio geradas
  const [audioHistory, setAudioHistory] = useState([]);
  const [restoringVersionId, setRestoringVersionId] = useState(null);
  const [expandedLyricsVersionId, setExpandedLyricsVersionId] = useState(null);

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
    if (notifyCooldown <= 0) return;
    const timer = setInterval(() => {
      setNotifyCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [notifyCooldown]);

  useEffect(() => {
    if (!user || !orderId) return;

    const fetchOrder = async () => {
      try {
        let data = null;
        let token = null;
        try {
          token = await getAdminAuthToken();
        } catch (e) {}
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.order) data = json.order;
        }

        if (data) {
          setOrder(data);
          setOrderUserId(data.userId || data.user_id || null);
          setCustomerName(data.customerName || data.customer_name || '');
          setHonoreeName(data.honoreeName || data.honoree_name || '');
          setProductionStatus(data.productionStatus || 'LETRA_APROVADA');
          setPaymentStatus(data.paymentStatus || 'PENDENTE');
          setHasVideoAccess(Boolean(data.hasVideoAccess || data.videoAddonPaid));
          setHasPlaybackAccess(Boolean(data.hasPlaybackAccess || data.playbackAddonPaid));
          setHasCartaAccess(Boolean(data.hasCartaAccess || data.cartaAddonPaid));
          setHasRetrospectivaAccess(Boolean(data.hasRetrospectivaAccess || data.retrospectivaAddonPaid));
          setHasKaraokeAccess(Boolean(data.hasKaraokeAccess || data.karaokeAddonPaid));
          setHasCustomVoiceAccess(Boolean(data.hasCustomVoiceAccess || data.customVoiceAddonPaid || data.extras?.hasCustomVoiceAccess || data.extras?.customVoiceAddonPaid));
          
          const isProxy = (u) => typeof u === 'string' && u.includes('/api/audio/proxy');
          let initialAudio1 = data.audioFiles?.[0] || data.audioUrl || '';
          let initialAudio2 = data.audioFiles?.[1] || '';
          if (isProxy(initialAudio1) || isProxy(initialAudio2)) {
            const hist = data.audioHistory || data.extras?.audioHistory || [];
            for (let i = hist.length - 1; i >= 0; i--) {
              const hFiles = hist[i]?.audioFiles;
              if (Array.isArray(hFiles)) {
                if (isProxy(initialAudio1) && hFiles[0] && !isProxy(hFiles[0])) initialAudio1 = hFiles[0];
                if (isProxy(initialAudio2) && hFiles[1] && !isProxy(hFiles[1])) initialAudio2 = hFiles[1];
                break;
              }
            }
          }
          setAudioUrl(initialAudio1);
          setAudioUrl2(initialAudio2);
          setWavUrl(data.wavFiles?.[0] || data.wavUrl || '');
          setVideoUrl(data.videoFile || data.videoUrl || '');
          setQrCodeUrl(data.qrCodeFile || data.qrCodeUrl || '');
          setLyrics(data.lyrics || data.sunoTracks?.[0]?.prompt || '');
          // Achado 04/09/2026: `value={sunoPrompt || getSunoStylePrompt()}` no input fazia o campo
          // "voltar pro que estava" sempre que ficava vazio no meio de uma edição (selecionar tudo e
          // apagar, por exemplo) — sem valor, o `||` recalculava o texto padrão na hora e reaparecia
          // ali, mesmo o campo ainda estando focado. Corrigido inicializando já com o valor final
          // (nunca string vazia) e o input passou a usar só o estado, sem fallback em tempo real.
          // Achado 12/09/2026 (dono do estúdio: "o prompt de estilo tá muito simples"): este fallback
          // era uma fórmula própria, bem mais pobre que buildSunoPayload (usada por /criar) — sempre
          // cravava "acoustic guitar" mesmo pra Funk/Trap/Eletrônica, e lia `data.emotion`, campo que
          // não existe no pedido (o real é `musicMood`), então "emotional" saía fixo sempre. Unificado
          // com a MESMA função usada na geração normal do cliente, pra nunca divergir (ver topo de
          // src/lib/sunoPayload.js).
          setSunoPrompt(data.sunoPrompt || buildSunoPayload(data).tags);
          const hasClonedVoice = Boolean(data.isCustomVoice || data.customVoiceId || data.extras?.isCustomVoice || data.extras?.customVoiceId);
          setUseCustomVoice(hasClonedVoice);
          if (Array.isArray(data.audioHistory)) {
            setAudioHistory(data.audioHistory);
          }
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
    fetchAccounts();
  }, [user, orderId]);

  const fetchAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const idToken = await getAdminAuthToken();
      const res = await fetch('/api/admin/accounts', {
        headers: { ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) }
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setAccounts(json.users || []);
      }
    } catch (err) {
      console.warn('Falha ao buscar contas no admin:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleLinkOrderToUser = async (targetUserId) => {
    const finalUserId = targetUserId || selectedAccountUserId;
    if (!finalUserId || !orderId) return;
    setLinkingAccountBusy(true);
    setAccountLinkingMsg('');
    try {
      const idToken = await getAdminAuthToken();
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          action: 'link_order',
          userId: finalUserId,
          orderId: order?.id || orderId
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao vincular pedido à conta');
      setOrderUserId(finalUserId);
      setOrder(prev => ({ ...prev, userId: finalUserId }));
      setAccountLinkingMsg(`✅ ${data.message || 'Pedido vinculado com sucesso!'}`);
      setShowAccountSelector(false);
      setSelectedAccountUserId('');
      fetchAccounts();
    } catch (err) {
      setAccountLinkingMsg(`❌ ${err.message}`);
    } finally {
      setLinkingAccountBusy(false);
    }
  };

  const handleUnlinkOrderFromUser = async () => {
    if (!orderId) return;
    if (!window.confirm('Deseja realmente desvincular este pedido da conta de usuário?')) return;
    setLinkingAccountBusy(true);
    setAccountLinkingMsg('');
    try {
      const idToken = await getAdminAuthToken();
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          action: 'unlink_order',
          orderId: order?.id || orderId
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao desvincular pedido');
      setOrderUserId(null);
      setOrder(prev => ({ ...prev, userId: null }));
      setAccountLinkingMsg(`✅ ${data.message || 'Pedido desvinculado com sucesso!'}`);
      fetchAccounts();
    } catch (err) {
      setAccountLinkingMsg(`❌ ${err.message}`);
    } finally {
      setLinkingAccountBusy(false);
    }
  };

  const handleSaveOrder = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setUpdating(true);
    setSuccessMsg('');

    const isProxyUrl = (u) => typeof u === 'string' && u.includes('/api/audio/proxy');
    const safeAudioUrl = isProxyUrl(audioUrl) ? (order?.audioUrl && !isProxyUrl(order.audioUrl) ? order.audioUrl : '') : audioUrl;
    const safeAudioUrl2 = isProxyUrl(audioUrl2) ? (order?.audioFiles?.[1] && !isProxyUrl(order.audioFiles[1]) ? order.audioFiles[1] : '') : audioUrl2;
    const safeAudioFiles = [safeAudioUrl, safeAudioUrl2].filter(Boolean);

    const updatePayload = {
      orderId,
      customerName,
      honoreeName,
      productionStatus,
      paymentStatus,
      hasVideoAccess,
      videoAddonPaid: hasVideoAccess,
      hasPlaybackAccess,
      playbackAddonPaid: hasPlaybackAccess,
      hasCartaAccess,
      cartaAddonPaid: hasCartaAccess,
      hasRetrospectivaAccess,
      retrospectivaAddonPaid: hasRetrospectivaAccess,
      hasKaraokeAccess,
      karaokeAddonPaid: hasKaraokeAccess,
      hasCustomVoiceAccess,
      customVoiceAddonPaid: hasCustomVoiceAccess,
      lyrics,
      audioUrl: safeAudioUrl,
      audioFiles: safeAudioFiles,
      audioHistory: audioHistory || [],
      wavUrl,
      wavFiles: wavUrl ? [wavUrl] : [],
      videoFile: videoUrl,
      videoUrl: videoUrl,
      qrCodeFile: qrCodeUrl,
      sunoPrompt,
      updatedAt: new Date().toISOString()
    };

    try {
      const token = await getAdminAuthToken();
      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(updatePayload)
      });
      if (!res.ok) {
        throw new Error('Falha ao atualizar pedido via API');
      }
      setOrder(prev => ({
        ...prev,
        customerName,
        honoreeName,
        productionStatus,
        paymentStatus,
        hasVideoAccess,
        videoAddonPaid: hasVideoAccess,
        hasPlaybackAccess,
        playbackAddonPaid: hasPlaybackAccess,
        hasCartaAccess,
        cartaAddonPaid: hasCartaAccess,
        hasRetrospectivaAccess,
        retrospectivaAddonPaid: hasRetrospectivaAccess,
        hasKaraokeAccess,
        karaokeAddonPaid: hasKaraokeAccess,
        hasCustomVoiceAccess,
        customVoiceAddonPaid: hasCustomVoiceAccess,
        lyrics,
        audioUrl,
        audioFiles: [audioUrl, audioUrl2].filter(Boolean),
        audioHistory,
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
    if (notifying || notifyCooldown > 0) return;
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
      if (res.ok) {
        setNotifyMsg('✅ Cliente notificado no WhatsApp!');
        setNotifyCooldown(15);
      } else {
        setNotifyMsg(`❌ ${data.error || 'Falha ao notificar.'}`);
      }
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
    let txid = order?.paymentIntentId || order?.extras?.paymentIntentId || order?.paymentId || order?.extras?.paymentId || order?.txid;
    const prevIds = order?.previousPaymentIntentIds || order?.extras?.previousPaymentIntentIds;
    if (!txid && Array.isArray(prevIds) && prevIds.length > 0) {
      txid = prevIds[prevIds.length - 1];
    }
    if (!txid) {
      txid = window.prompt('Este pedido ainda não tem identificador Pix (txid) registrado automaticamente. Se você tem o txid da cobrança na Efí, digite ou cole aqui:');
      if (!txid || !txid.trim()) {
        setCheckPaymentMsg('⚠️ Verificação cancelada: nenhum txid informado.');
        setTimeout(() => setCheckPaymentMsg(''), 4000);
        return;
      }
      txid = txid.trim();
    }

    setCheckingPayment(true);
    setCheckPaymentMsg('');
    try {
      const res = await fetch(`/api/payments/status?orderId=${orderId}&paymentId=${encodeURIComponent(txid)}`);
      const data = await res.json().catch(() => ({}));

      if (data.status === 'approved') {
        // A rota já rodou applyPaymentApproval (paymentStatus/paymentId/paidAt gravados de verdade)
        // — só falta refletir aqui na tela sem precisar recarregar a página inteira.
        const freshRes = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        if (freshRes.ok) {
          const freshJson = await freshRes.json();
          const freshData = freshJson?.order;
          if (freshData) {
            setOrder(freshData);
            setPaymentStatus(freshData.paymentStatus || 'PENDENTE');
            setHasVideoAccess(Boolean(freshData.hasVideoAccess || freshData.videoAddonPaid));
            setHasPlaybackAccess(Boolean(freshData.hasPlaybackAccess || freshData.playbackAddonPaid));
            setHasCartaAccess(Boolean(freshData.hasCartaAccess || freshData.cartaAddonPaid));
            setHasRetrospectivaAccess(Boolean(freshData.hasRetrospectivaAccess || freshData.retrospectivaAddonPaid));
            setHasKaraokeAccess(Boolean(freshData.hasKaraokeAccess || freshData.karaokeAddonPaid));
            setHasCustomVoiceAccess(Boolean(freshData.hasCustomVoiceAccess || freshData.customVoiceAddonPaid || freshData.extras?.hasCustomVoiceAccess || freshData.extras?.customVoiceAddonPaid));
            if (Array.isArray(freshData.audioHistory)) {
              setAudioHistory(freshData.audioHistory);
            }
          }
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

  // Link de "pague conforme o impacto emocional" (ver /pagar) — pra mandar manualmente por
  // WhatsApp depois de terminar a música do cliente. Separado do link de entrega normal.
  const handleCopyImpactLink = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/pagar?orderId=${orderId}`;
    navigator.clipboard.writeText(url);
    setCopiedImpactLink(true);
    setTimeout(() => setCopiedImpactLink(false), 3000);
  };

  const handleCopyLyrics = () => {
    if (typeof window === 'undefined') return;
    const textToCopy = lyrics || order?.lyrics || order?.sunoTracks?.[0]?.prompt || '';
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedLyrics(true);
    setTimeout(() => setCopiedLyrics(false), 3000);
  };

  const handleCopyTags = () => {
    if (typeof window === 'undefined') return;
    let tagsToCopy = sunoPrompt;
    if (!tagsToCopy && order) {
      try {
        tagsToCopy = buildSunoPayload(order).tags;
      } catch (e) {
        tagsToCopy = `${order.musicStyle || 'Pop'}, ${order.musicMood || 'Emocionante'}`;
      }
    }
    if (!tagsToCopy) return;
    navigator.clipboard.writeText(tagsToCopy);
    setCopiedTags(true);
    setTimeout(() => setCopiedTags(false), 3000);
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
      // 1. Tenta baixar via fetch + Blob: cria URL local blob: que o navegador obrigatoriamente
      // salva como arquivo para download no disco, sem jamais abrir o tocador de áudio
      const res = await fetch(downloadUrl);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15000);
        return;
      }
    } catch (e) {
      console.warn('[admin/pedidos] Fallback para download direto via link:', e);
    }

    try {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      console.warn('Erro ao iniciar o download:', err);
      // Abre em nova aba para nunca navegar para fora da página do painel admin
      window.open(downloadUrl, '_blank');
    }
  };

  const handleResetVideo = async () => {
    if (!window.confirm("Tem certeza que deseja resetar completamente o vídeo deste pedido? Isso apagará o status, o link atual e todas as fotos enviadas pela cliente.")) return;
    setUpdating(true);
    setSuccessMsg('');
    try {
      const token = await getAdminAuthToken();
      await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          orderId,
          videoUrl: '',
          videoFile: '',
          slideshowImages: [],
          videoStatus: '',
          videoProgress: 0
        })
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

  const handleRestoreVersion = async (version) => {
    if (!version || !Array.isArray(version.audioFiles) || version.audioFiles.length === 0) {
      alert('Esta versão não possui faixas de áudio válidas para restaurar.');
      return;
    }

    const versionLabel = `Versão ${version.version || ''}`;
    const confirmMsg = `Deseja restaurar a ${versionLabel} como o áudio ATIVO do pedido?\n\n` +
      `Isso atualizará os links de áudio na tela de entrega do cliente imediatamente para as faixas desta versão.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setRestoringVersionId(version.id);
    try {
      const newAudioUrl = version.audioFiles[0] || version.audioUrl || '';
      const newAudioUrl2 = version.audioFiles[1] || '';
      const newAudioFiles = [newAudioUrl, newAudioUrl2].filter(Boolean);

      const updatedHistory = (audioHistory || []).map((v) => ({
        ...v,
        active: v.id === version.id || v.version === version.version
      }));

      const token = await getAdminAuthToken();
      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          orderId,
          audioUrl: newAudioUrl,
          audioFiles: newAudioFiles,
          audioHistory: updatedHistory,
          updatedAt: new Date().toISOString()
        })
      });

      if (!res.ok) {
        throw new Error('Falha ao comunicar com o servidor ao restaurar versão.');
      }

      setAudioUrl(newAudioUrl);
      setAudioUrl2(newAudioUrl2);
      setAudioHistory(updatedHistory);
      setOrder(prev => ({
        ...prev,
        audioUrl: newAudioUrl,
        audioFiles: newAudioFiles,
        audioHistory: updatedHistory
      }));

      setSuccessMsg(`✅ ${versionLabel} restaurada com sucesso! O cliente já está ouvindo esta versão.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Erro ao restaurar versão:', err);
      alert(`❌ Erro ao restaurar versão: ${err.message}`);
    } finally {
      setRestoringVersionId(null);
    }
  };

  const handleSetTrackAsPrimary = async (url, label = 'Faixa') => {
    if (!url) return;
    if (!window.confirm(`Deseja definir "${label}" como o Áudio Principal (Versão 1) do pedido?`)) return;

    try {
      const newAudioFiles = [url, audioUrl2].filter(Boolean);
      const token = await getAdminAuthToken();
      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          orderId,
          audioUrl: url,
          audioFiles: newAudioFiles,
          updatedAt: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error('Falha ao atualizar.');

      setAudioUrl(url);
      setOrder(prev => ({ ...prev, audioUrl: url, audioFiles: newAudioFiles }));
      setSuccessMsg(`✅ "${label}" definida como Áudio Principal!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      alert(`❌ Erro ao definir áudio principal: ${e.message}`);
    }
  };

  const handleSetTrackAsSecondary = async (url, label = 'Faixa') => {
    if (!url) return;
    if (!window.confirm(`Deseja definir "${label}" como Áudio Secundário (Bônus) do pedido?`)) return;

    try {
      const newAudioFiles = [audioUrl, url].filter(Boolean);
      const token = await getAdminAuthToken();
      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          orderId,
          audioFiles: newAudioFiles,
          updatedAt: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error('Falha ao atualizar.');

      setAudioUrl2(url);
      setOrder(prev => ({ ...prev, audioFiles: newAudioFiles }));
      setSuccessMsg(`✅ "${label}" definida como Áudio Secundário!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      alert(`❌ Erro ao definir áudio secundário: ${e.message}`);
    }
  };

  const getSunoStylePrompt = () => buildSunoPayload(order || {}).tags;

  const setVoiceTag = (type) => {
    let current = sunoPrompt || getSunoStylePrompt();
    current = current
      .replace(/duet male and female vocalists, alternating verses, harmonized chorus/gi, '')
      .replace(/duet male and female vocalists/gi, '')
      .replace(/male lead vocal/gi, '')
      .replace(/female lead vocal/gi, '')
      .trim();

    let tagToAdd = '';
    if (type === 'masculina') tagToAdd = 'male lead vocal';
    else if (type === 'feminina') tagToAdd = 'female lead vocal';
    else if (type === 'dueto') tagToAdd = 'duet male and female vocalists';

    if (tagToAdd) {
      if (current.includes('brazilian portuguese lyrics')) {
        current = current.replace(/,?\s*brazilian portuguese lyrics/i, `, ${tagToAdd}, brazilian portuguese lyrics`);
      } else {
        current = `${current}, ${tagToAdd}`;
      }
    }
    current = current.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '').replace(/,\s*$/, '').trim();
    setSunoPrompt(current);
  };

  const handleDetachCustomVoice = async () => {
    if (!confirm('Deseja desvincular a voz clonada deste pedido? As próximas gerações usarão as vozes normais de estúdio do Suno.')) return;
    try {
      const token = await getAdminAuthToken();
      await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          orderId,
          isCustomVoice: false,
          customVoiceId: null,
          voiceType: 'solo',
          extras: {
            ...(order?.extras || {}),
            isCustomVoice: false,
            customVoiceId: null,
          }
        })
      });
      setUseCustomVoice(false);
      setOrder(prev => ({
        ...prev,
        isCustomVoice: false,
        customVoiceId: null,
        voiceType: 'solo',
        extras: { ...(prev?.extras || {}), isCustomVoice: false, customVoiceId: null }
      }));
      alert('Voz clonada desvinculada com sucesso!');
    } catch (e) {
      alert('Erro ao desvincular voz: ' + e.message);
    }
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

    const tagsFinal = sunoPrompt || getSunoStylePrompt();
    try {
      const token = await getAdminAuthToken();
      await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          orderId,
          sunoPrompt: tagsFinal,
          productionStatus: 'GERANDO_AUDIO'
        })
      });
      setProductionStatus('GERANDO_AUDIO');
    } catch (err) {
      console.warn('Falha ao salvar o prompt de estilo antes de gerar:', err.message);
    }

    try {
      const response = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: lyrics,
          tags: tagsFinal,
          orderId,
          useCustomVoice
        })
      });

      const rawResponse = await response.text();
      let data;
      try {
        data = JSON.parse(rawResponse);
      } catch (parseError) {
        const status = response.status ? `HTTP ${response.status}` : 'sem status HTTP';
        throw new Error(
          response.ok
            ? 'O servidor retornou uma resposta inválida ao iniciar a geração.'
            : `O servidor não conseguiu iniciar a geração (${status}). Tente novamente em instantes.`
        );
      }

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao iniciar geração.');
      }
      
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

            // Recarrega os dados consolidados do pedido para que o estado do React
            // reflita a substituição automática das faixas e a URL definitiva do R2
            try {
              const freshRes = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
              if (freshRes.ok) {
                const freshJson = await freshRes.json();
                const freshData = freshJson?.order;
                if (freshData) {
                  setOrder(freshData);
                  if (freshData.audioFiles?.[0] || freshData.audioUrl) {
                    setAudioUrl(freshData.audioFiles?.[0] || freshData.audioUrl);
                  }
                  if (freshData.audioFiles?.[1]) {
                    setAudioUrl2(freshData.audioFiles[1]);
                  }
                  if (freshData.productionStatus) {
                    setProductionStatus(freshData.productionStatus);
                  }
                  if (Array.isArray(freshData.audioHistory)) {
                    setAudioHistory(freshData.audioHistory);
                  }
                }
              }
            } catch (freshErr) {
              console.warn('[admin] Falha ao recarregar dados do pedido após nova geração:', freshErr?.message);
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
    <div className="admin-order-page-wrapper" style={styles.wrapper}>
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

      <main style={{ flex: 1, padding: '32px 0', width: '100%', maxWidth: '100vw', boxSizing: 'border-box' }}>
        <div className="container" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
          
          <div style={styles.titleRow}>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span>Pedido {order.orderNumber || orderId}</span>
                {isUSOrder(order) ? (
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    🇺🇸 Estados Unidos (Dólar USD)
                  </span>
                ) : (
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    backgroundColor: '#f0fdf4',
                    color: '#166534',
                    border: '1px solid #bbf7d0',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    🇧🇷 Brasil (Real BRL)
                  </span>
                )}
              </h1>
              <p style={{ color: '#475569', fontSize: '0.95rem', marginTop: '4px', fontWeight: '500' }}>
                Cliente: <strong style={{ color: '#0f172a' }}>{order.customerName}</strong> ({order.customerEmail || 'Sem e-mail'}) • <strong style={{ color: '#2563eb' }}>{order.customerPhone || 'Sem telefone'}</strong>
              </p>

              {/* Card de Vínculo de Conta de Usuário */}
              {(() => {
                const linkedUser = accounts.find(u => u.id === orderUserId);
                const orderEmail = (order.customerEmail || '').toLowerCase().trim();
                const orderPhoneDigits = (order.customerPhone || '').replace(/\D/g, '');
                const suggestedUser = !orderUserId && accounts.find(u => {
                  const uEmail = (u.email || '').toLowerCase().trim();
                  const uPhoneDigits = (u.phone || '').replace(/\D/g, '');
                  if (orderEmail && uEmail === orderEmail) return true;
                  if (orderPhoneDigits && uPhoneDigits && (uPhoneDigits.endsWith(orderPhoneDigits) || orderPhoneDigits.endsWith(uPhoneDigits))) return true;
                  return false;
                });

                const filteredAccountsForSearch = accounts.filter(u => {
                  if (!accountSearchQuery) return true;
                  const q = accountSearchQuery.toLowerCase();
                  return (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q) || (u.phone || '').includes(q);
                });

                return (
                  <div style={{
                    marginTop: '10px',
                    marginBottom: '12px',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: orderUserId ? '#f0fdf4' : '#fffbeb',
                    border: orderUserId ? '1.5px solid #86efac' : '1.5px solid #fde68a'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.1rem' }}>
                          {orderUserId ? '👤' : '⚠️'}
                        </span>
                        <div>
                          <div style={{ fontSize: '0.86rem', fontWeight: '800', color: orderUserId ? '#166534' : '#92400e' }}>
                            {orderUserId
                              ? `Conta Vinculada: ${linkedUser ? `${linkedUser.email} ${linkedUser.name ? `(${linkedUser.name})` : ''}` : `ID: ${orderUserId}`}`
                              : 'Pedido Avulso (Não vinculado a nenhuma conta de usuário)'}
                          </div>
                          {orderUserId && linkedUser && (
                            <div style={{ fontSize: '0.74rem', color: '#15803d' }}>
                              {linkedUser.orders?.length || 0} música(s) associada(s) à conta
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {orderUserId ? (
                          <button
                            type="button"
                            onClick={handleUnlinkOrderFromUser}
                            disabled={linkingAccountBusy}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              border: '1px solid #fca5a5',
                              background: '#fef2f2',
                              color: '#dc2626',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              cursor: linkingAccountBusy ? 'default' : 'pointer'
                            }}
                            title="Remover vínculo deste pedido com a conta"
                          >
                            {linkingAccountBusy ? 'Aguarde...' : 'Desvincular Conta'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowAccountSelector(prev => !prev)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#334155',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {showAccountSelector ? '✕ Fechar Seleção' : '🔗 Vincular a uma Conta'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sugestão Rápida se encontrar conta pelo e-mail ou telefone do pedido */}
                    {suggestedUser && !orderUserId && (
                      <div style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '6px'
                      }}>
                        <span style={{ fontSize: '0.8rem', color: '#1e40af' }}>
                          💡 <strong>Conta sugerida encontrada:</strong> {suggestedUser.email} {suggestedUser.name ? `(${suggestedUser.name})` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleLinkOrderToUser(suggestedUser.id)}
                          disabled={linkingAccountBusy}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#ffffff',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            cursor: linkingAccountBusy ? 'default' : 'pointer'
                          }}
                        >
                          {linkingAccountBusy ? 'Vinculando...' : '⚡ Vincular a esta conta agora'}
                        </button>
                      </div>
                    )}

                    {/* Caixa de seleção/busca manual de conta */}
                    {showAccountSelector && !orderUserId && (
                      <div style={{
                        marginTop: '12px',
                        padding: '12px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                          Selecione a conta cadastrada para vincular este pedido:
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder="Buscar conta por e-mail, nome..."
                            value={accountSearchQuery}
                            onChange={(e) => setAccountSearchQuery(e.target.value)}
                            style={{
                              flex: 1,
                              minWidth: '200px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '0.82rem'
                            }}
                          />
                          <select
                            value={selectedAccountUserId}
                            onChange={(e) => setSelectedAccountUserId(e.target.value)}
                            style={{
                              flex: 2,
                              minWidth: '220px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '0.82rem',
                              fontWeight: '600'
                            }}
                          >
                            <option value="">Selecione uma conta ({filteredAccountsForSearch.length} disponíveis)...</option>
                            {filteredAccountsForSearch.map(acc => (
                              <option key={acc.id} value={acc.id}>
                                {acc.email} {acc.name ? `(${acc.name})` : ''} ({acc.orders?.length || 0} música(s))
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleLinkOrderToUser(selectedAccountUserId)}
                            disabled={linkingAccountBusy || !selectedAccountUserId}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#2563eb',
                              color: '#ffffff',
                              fontSize: '0.82rem',
                              fontWeight: '700',
                              cursor: linkingAccountBusy || !selectedAccountUserId ? 'default' : 'pointer',
                              opacity: !selectedAccountUserId ? 0.6 : 1
                            }}
                          >
                            {linkingAccountBusy ? 'Vinculando...' : 'Confirmar Vínculo'}
                          </button>
                        </div>
                      </div>
                    )}

                    {accountLinkingMsg && (
                      <div style={{
                        marginTop: '8px',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        color: accountLinkingMsg.startsWith('✅') ? '#16a34a' : '#dc2626'
                      }}>
                        {accountLinkingMsg}
                      </div>
                    )}
                  </div>
                );
              })()}
              {(() => {
                const platKey = getOrderPlatform(order);
                const pInfo = PLATFORMS[platKey] || PLATFORMS.facebook_ads;
                return (
                  <div style={{ marginTop: '6px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <PlatformIcon order={order} size={16} showLabel={true} />
                    {order.utmCampaign && (
                      <span style={{ fontSize: '0.75rem', color: '#475569', backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        Campanha: <strong>{order.utmCampaign}</strong>
                      </span>
                    )}
                    {order.trafficSource ? (
                      <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '600' }}>
                        ✓ Rastreamento direto
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        (Atribuição histórica)
                      </span>
                    )}
                  </div>
                );
              })()}
              {/* Achado 09/09/2026: pedido do dono do estúdio pra saber se o cliente realmente ouviu
                  a prévia (ver src/lib/previewTracking.js) — ajuda a separar "não gostou" de "nunca
                  conseguiu carregar o áudio". */}
              <p style={{ fontSize: '0.85rem', marginTop: '4px', fontWeight: '600', color: order.previewListenedAt ? '#16a34a' : '#94a3b8' }}>
                {order.previewListenedAt
                  ? `🎧 Ouviu a prévia em ${new Date(order.previewListenedAt).toLocaleString('pt-BR')}`
                  : hasPreviewTrackingData(order)
                    ? '🔇 Ainda não deu play na prévia'
                    : '— Pedido de antes do rastreamento de prévia (09/09/2026), sem esse dado'}
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleCopyLyrics}
                  style={{
                    ...styles.quickActionBtn,
                    background: copiedLyrics ? '#059669' : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                    color: '#fff',
                    fontWeight: '700',
                    border: 'none',
                    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
                    cursor: 'pointer'
                  }}
                  title="Copiar a letra completa da música para gerar no Suno"
                >
                  {copiedLyrics ? '✅ Letra copiada!' : '📋 Copiar Letra'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyTags}
                  style={{
                    ...styles.quickActionBtn,
                    background: copiedTags ? '#059669' : 'linear-gradient(135deg, #db2777 0%, #9333ea 100%)',
                    color: '#fff',
                    fontWeight: '700',
                    border: 'none',
                    boxShadow: '0 2px 6px rgba(219, 39, 119, 0.25)',
                    cursor: 'pointer'
                  }}
                  title="Copiar prompt de estilo / tags musicais para colar no Suno"
                >
                  {copiedTags ? '✅ Tags copiadas!' : '🏷️ Copiar Tags / Estilo'}
                </button>
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
                <button
                  type="button"
                  onClick={handleCopyImpactLink}
                  title="Link avulso 'pague conforme o impacto emocional' — R$9,99 mínimo, vídeo de brinde a partir de R$16,89"
                  style={{ ...styles.quickActionBtn, background: '#e2e8f0', color: '#0f172a' }}
                >
                  {copiedImpactLink ? '✅ Link copiado!' : '💜 Copiar link de impacto (/pagar)'}
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

          <div className="admin-order-grid" style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            
            {/* Form principal */}
            <div className="admin-order-form-side" style={styles.formSide}>
              <form onSubmit={handleSaveOrder} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <div className="admin-card-responsive" style={styles.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ ...styles.cardTitle, margin: 0 }}>Gerenciamento de Produção</h3>
                    <button
                      type="submit"
                      disabled={updating}
                      style={{
                        padding: '10px 18px',
                        backgroundColor: '#7c3aed',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        cursor: updating ? 'not-allowed' : 'pointer',
                        opacity: updating ? 0.7 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 4px rgba(124, 58, 237, 0.25)'
                      }}
                    >
                      {updating ? 'Salvando...' : '💾 Salvar Alterações'}
                    </button>
                  </div>

                  <div className="admin-grid-2cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', minWidth: 0, maxWidth: '100%' }}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Nome do Cliente 👤</label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        style={styles.input}
                        placeholder="Nome do cliente"
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Nome do Homenageado 🎁</label>
                      <input
                        type="text"
                        value={honoreeName}
                        onChange={(e) => setHonoreeName(e.target.value)}
                        style={styles.input}
                        placeholder="Nome do homenageado"
                      />
                    </div>
                  </div>
                  
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

                    {/* Detalhamento do Método de Pagamento e Taxas */}
                    {(() => {
                      const isPaid = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO' || order.paidAt || order.videoAddonPaid;
                      if (!isPaid) return null;
                      const isCard = isStripePayment(order);
                      const gross = Number(order.paidAmount) || Number(order.total) || 9.99;
                      const fee = isCard ? calculateStripeFee(gross) : 0;
                      const net = isCard ? calculateStripeNet(gross) : gross;
                      const payout = isCard ? getPayoutStatus(order.paidAt || order.videoPaidAt || order.createdAt) : null;
                      return (
                        <div style={{ marginTop: '12px', padding: '12px', borderRadius: '10px', backgroundColor: isCard ? '#faf5ff' : '#f0fdfa', border: `1px solid ${isCard ? '#e9d5ff' : '#ccfbf1'}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: isCard ? '#7c3aed' : '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isCard ? '💳 Cartão de Crédito (Stripe)' : '⚡ PIX (Efí Bank)'}
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: isCard ? (payout?.isReleased ? '#dcfce7' : '#fef3c7') : '#dcfce7', color: isCard ? (payout?.isReleased ? '#15803d' : '#b45309') : '#15803d' }}>
                              {isCard ? (payout?.isReleased ? '✅ Repasse Liberado' : `⏳ Bloqueado D+30 (~${payout?.daysRemaining} dias)`) : '✅ Repasse Imediato (D+0)'}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '0.8rem' }}>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>Bruto Pago</span>
                              <strong style={{ color: '#0f172a' }}>R$ {gross.toFixed(2).replace('.', ',')}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>Taxa Stripe</span>
                              <strong style={{ color: isCard ? '#dc2626' : '#64748b' }}>{isCard ? `-R$ ${fee.toFixed(2).replace('.', ',')}` : 'R$ 0,00'}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>Líquido Real</span>
                              <strong style={{ color: '#059669', fontSize: '0.9rem' }}>R$ {net.toFixed(2).replace('.', ',')}</strong>
                            </div>
                          </div>
                          {isCard && payout?.releaseDate && !payout?.isReleased && (
                            <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: '#6d28d9' }}>
                              🗓️ Previsão de liberação no saldo Stripe: <strong>{payout.releaseDate.toLocaleDateString('pt-BR')}</strong> (30 dias após a compra).
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {order.paymentStatus !== 'PAGAMENTO_APROVADO' && order.paymentStatus !== 'PAGO' ? (
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
                    ) : (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={handleCheckPaymentNow}
                          disabled={checkingPayment}
                          style={{ ...styles.quickActionBtn, background: '#475569', color: '#fff', fontSize: '0.78rem', padding: '6px 10px', cursor: checkingPayment ? 'default' : 'pointer' }}
                          title="Reconsultar status na Efí"
                        >
                          {checkingPayment ? '⏳ Consultando...' : '🔄 Reconferir na Efí'}
                        </button>
                        {checkPaymentMsg && <p style={{ fontSize: '0.8rem', marginTop: '6px', width: '100%', color: checkPaymentMsg.startsWith('✅') ? '#059669' : checkPaymentMsg.startsWith('⏳') ? '#d97706' : '#dc2626' }}>{checkPaymentMsg}</p>}
                      </div>
                    )}

                    {(order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO') && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          type="button"
                          onClick={handleNotifyPayment}
                          disabled={notifying || notifyCooldown > 0}
                          style={{
                            ...styles.quickActionBtn,
                            background: (notifying || notifyCooldown > 0) ? '#94a3b8' : '#25D366',
                            color: '#fff',
                            cursor: (notifying || notifyCooldown > 0) ? 'default' : 'pointer',
                          }}
                        >
                          {notifying ? '⏳ Enviando...' : notifyCooldown > 0 ? `⏳ Aguarde (${notifyCooldown}s)` : '📲 Notificar cliente (pagamento aprovado)'}
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
                    <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasPlaybackAccess}
                        onChange={(e) => setHasPlaybackAccess(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      Liberar Playback (Instrumental) 🎧
                    </label>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                      Libera o acesso; a geração em si o cliente dispara pelo card de Playback em
                      /entrega (ou pelo botão &quot;Tentar gerar novamente&quot; se precisar).
                    </p>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasCartaAccess}
                        onChange={(e) => setHasCartaAccess(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      Liberar Carta Virtual 💌
                    </label>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                      Libera o acesso; se ainda não tiver texto, o cliente gera pelo card de Carta em
                      /entrega (botão aparece sozinho quando falta o texto).
                    </p>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasRetrospectivaAccess}
                        onChange={(e) => setHasRetrospectivaAccess(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      Liberar Retrospectiva 📖
                    </label>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                      Libera o acesso; o cliente monta o conteúdo (fotos, linha do tempo, quiz) pelo
                      card de Retrospectiva em /entrega.
                    </p>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasKaraokeAccess}
                        onChange={(e) => setHasKaraokeAccess(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      Liberar Vídeo Karaokê (Widescreen 16:9) 🎤
                    </label>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                      Libera o acesso ao vídeo karaokê; o cliente gera pelo card de Karaokê em /entrega.
                    </p>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasCustomVoiceAccess}
                        onChange={(e) => setHasCustomVoiceAccess(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      Liberar Clonagem de Voz (Minha Voz) 🎙️
                    </label>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                      Libera o acesso para o cliente gravar a amostra de 20s e regerar a música com a própria voz clonada sem pagar o add-on.
                    </p>
                  </div>

                  {/* Provedor de Música IA */}
                  <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: order?.sunoProvider === 'suno_local' ? '#f0f9ff' : order?.sunoProvider === 'kie' ? '#faf5ff' : '#f8fafc', border: order?.sunoProvider === 'suno_local' ? '1px solid #bae6fd' : order?.sunoProvider === 'kie' ? '1px solid #e9d5ff' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{order?.sunoProvider === 'suno_local' ? '🖥️' : order?.sunoProvider === 'kie' ? '🟣' : '🎵'}</span>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: '800', color: order?.sunoProvider === 'suno_local' ? '#0369a1' : order?.sunoProvider === 'kie' ? '#6d28d9' : '#334155' }}>
                        {order?.sunoProvider === 'suno_local' ? 'Gerado pelo Robô Local (Suno PC)' : order?.sunoProvider === 'kie' ? 'Gerado pela Kie.ai API' : order?.sunoProvider === 'unifically' ? 'Gerado pela Unifically' : 'Provedor de Música'}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                        {order?.sunoProvider === 'suno_local' ? 'Custo de API: R$ 0,00 (Assinatura própria do Suno no computador)' : order?.sunoProvider === 'kie' ? 'Custo de API: ~R$ 0,30 (Créditos consumidos na Kie.ai)' : 'Provedor registrado no pedido'}
                      </div>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Status da Produção ⚙️</label>
                    <select 
                      value={productionStatus} 
                      onChange={(e) => setProductionStatus(e.target.value)}
                      style={styles.select}
                    >
                      <option value="ETAPA_1">Etapa 1 (Pessoa)</option>
                      <option value="ETAPA_2">Etapa 2 (História)</option>
                      <option value="ETAPA_3">Etapa 3 (Som)</option>
                      <option value="ETAPA_4">Etapa 4 (Revisão)</option>
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
                    <div style={{ display: 'flex', gap: '8px', minWidth: 0, maxWidth: '100%' }}>
                      <input
                        type="text"
                        value={audioUrl}
                        onChange={(e) => setAudioUrl(e.target.value)}
                        placeholder="https://..."
                        style={{ ...styles.input, flex: 1, minWidth: 0 }}
                      />
                      {audioUrl && (
                        <button
                          type="button"
                          onClick={() => handleDownload(audioUrl, `${order.orderNumber || orderId}-versao1.mp3`)}
                          style={{
                            ...styles.quickActionBtn,
                            background: '#2563eb',
                            color: '#fff',
                            flexShrink: 0,
                            padding: '8px 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}
                          title="Baixar MP3 da Versão 1 para o computador"
                        >
                          ⬇️ Baixar MP3
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Áudio Secundário (Versão 2 Bônus - MP3 HD)</label>
                    <div style={{ display: 'flex', gap: '8px', minWidth: 0, maxWidth: '100%' }}>
                      <input
                        type="text"
                        value={audioUrl2}
                        onChange={(e) => setAudioUrl2(e.target.value)}
                        placeholder="https://..."
                        style={{ ...styles.input, flex: 1, minWidth: 0 }}
                      />
                      {audioUrl2 && (
                        <button
                          type="button"
                          onClick={() => handleDownload(audioUrl2, `${order.orderNumber || orderId}-versao2.mp3`)}
                          style={{
                            ...styles.quickActionBtn,
                            background: '#2563eb',
                            color: '#fff',
                            flexShrink: 0,
                            padding: '8px 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}
                          title="Baixar MP3 da Versão 2 para o computador"
                        >
                          ⬇️ Baixar MP3
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Arquivo WAV (Alta Definição)</label>
                    <div style={{ display: 'flex', gap: '8px', minWidth: 0, maxWidth: '100%' }}>
                      <input
                        type="text"
                        value={wavUrl}
                        onChange={(e) => setWavUrl(e.target.value)}
                        placeholder="https://..."
                        style={{ ...styles.input, flex: 1, minWidth: 0 }}
                      />
                      {wavUrl && (
                        <button
                          type="button"
                          onClick={() => handleDownload(wavUrl, `${order.orderNumber || orderId}.wav`)}
                          style={{
                            ...styles.quickActionBtn,
                            background: '#2563eb',
                            color: '#fff',
                            flexShrink: 0,
                            padding: '8px 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}
                          title="Baixar arquivo WAV para o computador"
                        >
                          ⬇️ Baixar WAV
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Link do Vídeo Homenagem (MP4)</label>
                    <input 
                      type="text" 
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
                      type="text" 
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
            <div className="admin-order-info-side" style={styles.infoSide}>
              
              {/* Suno AI card with auto generator */}
              <div className="admin-card-responsive" style={styles.card}>
                <h3 style={styles.cardTitle}>Prompts & Geração Suno AI 🤖</h3>
                
                <div style={{ marginBottom: '16px', minWidth: 0, maxWidth: '100%' }}>
                  <label style={styles.label}>Prompt de Estilo (Tags)</label>
                  <input
                    type="text"
                    value={sunoPrompt}
                    onChange={(e) => setSunoPrompt(e.target.value)}
                    style={{ ...styles.input, maxWidth: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Seletores rápidos de tipo de voz para o prompt */}
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>
                    🎤 Tipo de Voz no Prompt (Tags):
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setVoiceTag('masculina')}
                      style={{
                        fontSize: '0.75rem',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: sunoPrompt.includes('male lead vocal') && !sunoPrompt.includes('female') ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                        background: sunoPrompt.includes('male lead vocal') && !sunoPrompt.includes('female') ? '#eff6ff' : '#ffffff',
                        color: sunoPrompt.includes('male lead vocal') && !sunoPrompt.includes('female') ? '#1d4ed8' : '#334155',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      title="Força voz masculina no Suno (male lead vocal)"
                    >
                      👨 Masculina
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceTag('feminina')}
                      style={{
                        fontSize: '0.75rem',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: sunoPrompt.includes('female lead vocal') ? '1.5px solid #db2777' : '1px solid #cbd5e1',
                        background: sunoPrompt.includes('female lead vocal') ? '#fdf2f8' : '#ffffff',
                        color: sunoPrompt.includes('female lead vocal') ? '#be185d' : '#334155',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      title="Força voz feminina no Suno (female lead vocal)"
                    >
                      👩 Feminina
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceTag('dueto')}
                      style={{
                        fontSize: '0.75rem',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: sunoPrompt.includes('duet') ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                        background: sunoPrompt.includes('duet') ? '#f5f3ff' : '#ffffff',
                        color: sunoPrompt.includes('duet') ? '#6d28d9' : '#334155',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      title="Força dueto masculino e feminino no Suno"
                    >
                      👫 Dueto
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceTag('nenhuma')}
                      style={{
                        fontSize: '0.75rem',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#64748b',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                      title="Remove a especificação de gênero da voz e deixa a IA decidir"
                    >
                      🚫 Sem preferência
                    </button>
                  </div>
                </div>

                {/* Se o pedido possui Voz Clonada (Minha Voz) */}
                {Boolean(order?.customVoiceId || order?.isCustomVoice || order?.extras?.customVoiceId || order?.extras?.isCustomVoice) && (
                  <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: useCustomVoice ? '#f5f3ff' : '#f8fafc', border: `1.5px solid ${useCustomVoice ? '#c4b5fd' : '#cbd5e1'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: '700', color: useCustomVoice ? '#6d28d9' : '#475569', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={useCustomVoice}
                          onChange={(e) => setUseCustomVoice(e.target.checked)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        🎙️ Usar Voz Clonada da Cliente nesta geração
                      </label>
                      <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: useCustomVoice ? '#ede9fe' : '#e2e8f0', color: useCustomVoice ? '#5b21b6' : '#64748b', fontWeight: '700' }}>
                        {useCustomVoice ? 'Clonagem Ativa' : 'Voz Padrão Ativa'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '8px', flexWrap: 'wrap' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: useCustomVoice ? '#7c3aed' : '#059669', fontWeight: '600' }}>
                        {useCustomVoice
                          ? `Usando timbre clonado (Persona ID: ${order?.customVoiceId || order?.extras?.customVoiceId || 'Vinculada'}). Desmarque para gerar com voz padrão.`
                          : '✓ A próxima geração usará vozes normais do Suno (sem o timbre da cliente).'}
                      </p>
                      <button
                        type="button"
                        onClick={handleDetachCustomVoice}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.74rem', fontWeight: '700', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                      >
                        Desvincular voz permanentemente
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, maxWidth: '100%' }}>
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

                  <div style={{ display: 'flex', gap: '8px', minWidth: 0, maxWidth: '100%', flexWrap: 'wrap' }}>
                    <button 
                      type="button"
                      onClick={() => copyToClipboard(sunoPrompt || getSunoStylePrompt(), 'Prompt de estilo copiado!')}
                      style={{ fontSize: '0.8rem', padding: '8px 10px', flex: 1, minWidth: '120px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      📋 Copiar Tags
                    </button>
                    <button 
                      type="button"
                      onClick={() => copyToClipboard(lyrics, 'Letra da música copiada!')}
                      style={{ fontSize: '0.8rem', padding: '8px 10px', flex: 1, minWidth: '120px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      📋 Copiar Letra
                    </button>
                  </div>
                </div>

                {pollingStatus && (
                  <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '10px', borderRadius: '6px', border: '1px solid #ddd6fe', textAlign: 'center', fontWeight: 'bold', wordBreak: 'break-word', minWidth: 0, maxWidth: '100%' }}>
                    {pollingStatus}
                  </div>
                )}

                {sunoError && (
                  <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#dc2626', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '6px', border: '1px solid #fca5a5', textAlign: 'center', fontWeight: 'bold', wordBreak: 'break-word', minWidth: 0, maxWidth: '100%' }}>
                    ⚠️ {sunoError}
                  </div>
                )}

                {generatedTracks.length > 0 && (
                  <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#0f172a', fontWeight: 'bold' }}>Versões Geradas:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, maxWidth: '100%' }}>
                      {generatedTracks.map((track, idx) => (
                        <div key={track.id || idx} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a' }}>Versão {idx + 1} ({track.status})</span>
                          {track.audio_url ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, maxWidth: '100%' }}>
                              <audio src={buildAudioProxySrc(track.audio_url)} controls style={{ width: '100%', maxWidth: '100%', height: '36px', boxSizing: 'border-box' }} />
                              <button 
                                type="button" 
                                onClick={() => handleSetTrackAsPrimary(track.audio_url, `Versão Gerada ${idx + 1}`)}
                                style={{ fontSize: '0.8rem', padding: '8px 10px', width: '100%', maxWidth: '100%', backgroundColor: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
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

              {/* Card de Histórico de Versões de Música */}
              <div className="admin-card-responsive" style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                      Histórico de Versões 🎵
                    </h3>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#475569' }}>
                      {audioHistory.length} {audioHistory.length === 1 ? 'versão' : 'versões'}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '16px', lineHeight: '1.4' }}>
                  Todas as versões geradas pelo Suno AI ficam salvas aqui. Você pode ouvir qualquer faixa gerada anteriormente e restaurá-la com 1 clique caso o cliente prefira a versão anterior.
                </p>

                {audioHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '8px' }}>🎧</span>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                      Nenhuma versão anterior registrada no histórico ainda.
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                      Ao gerar novos áudios no Suno AI, eles aparecerão aqui com opção de restauração rápida.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, maxWidth: '100%' }}>
                    {audioHistory.map((ver, vIdx) => {
                      const isCurrentActive = ver.active || (
                        ver.audioUrl && (ver.audioUrl === audioUrl || (Array.isArray(ver.audioFiles) && ver.audioFiles.includes(audioUrl)))
                      );
                      const formattedDate = ver.createdAt
                        ? new Date(ver.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : 'Data n/d';
                      const tracksList = Array.isArray(ver.audioFiles) && ver.audioFiles.length > 0
                        ? ver.audioFiles
                        : (ver.audioUrl ? [ver.audioUrl] : []);

                      const isLyricsExpanded = expandedLyricsVersionId === ver.id;

                      return (
                        <div
                          key={ver.id || `ver-${vIdx}`}
                          className="admin-card-responsive"
                          style={{
                            padding: '16px',
                            backgroundColor: isCurrentActive ? '#f0fdf4' : '#ffffff',
                            borderRadius: '12px',
                            border: isCurrentActive ? '2px solid #86efac' : '1px solid #e2e8f0',
                            boxShadow: isCurrentActive ? '0 2px 8px rgba(34, 197, 94, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                            transition: 'all 0.2s ease',
                            minWidth: 0,
                            maxWidth: '100%',
                            boxSizing: 'border-box',
                            overflow: 'hidden'
                          }}
                        >
                          {/* Cabeçalho da versão */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.95rem', fontWeight: '800', color: isCurrentActive ? '#15803d' : '#0f172a' }}>
                                  {ver.label || `Versão ${ver.version || audioHistory.length - vIdx}`}
                                </span>
                                {isCurrentActive ? (
                                  <span style={{ fontSize: '0.7rem', fontWeight: '800', padding: '2px 8px', borderRadius: '6px', background: '#22c55e', color: '#ffffff', letterSpacing: '0.5px' }}>
                                    ⭐ ATIVA NO PEDIDO
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.7rem', fontWeight: '600', padding: '2px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#64748b' }}>
                                    Anterior
                                  </span>
                                )}
                                {ver.provider && (
                                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce', fontWeight: '600' }}>
                                    {ver.provider === 'suno_local' ? '🖥️ Suno PC' : ver.provider === 'kie' ? '🟣 Kie.ai' : ver.provider}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                Gerado em: {formattedDate} {ver.taskId ? `· ID: ${String(ver.taskId).slice(0, 8)}...` : ''}
                              </div>
                            </div>

                            {/* Botão de Restaurar Versão Inteira */}
                            {!isCurrentActive && (
                              <button
                                type="button"
                                onClick={() => handleRestoreVersion(ver)}
                                disabled={restoringVersionId === ver.id}
                                style={{
                                  fontSize: '0.78rem',
                                  padding: '6px 12px',
                                  backgroundColor: restoringVersionId === ver.id ? '#94a3b8' : '#7c3aed',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontWeight: '700',
                                  cursor: restoringVersionId === ver.id ? 'default' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 1px 3px rgba(124, 58, 237, 0.2)'
                                }}
                                title="Restaura esta versão inteira como ativa para o cliente"
                              >
                                {restoringVersionId === ver.id ? '⏳ Restaurando...' : '🔄 Restaurar esta Versão'}
                              </button>
                            )}
                          </div>

                          {/* Prompt de Estilo / Tags da versão */}
                          {(ver.tags || ver.sunoPrompt) && (
                            <div style={{ marginBottom: '10px', fontSize: '0.75rem', background: isCurrentActive ? '#ffffff' : '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
                              <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                                🏷️ <strong>Tags:</strong> {ver.tags || ver.sunoPrompt}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(ver.tags || ver.sunoPrompt, 'Tags da versão copiadas!')}
                                style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                              >
                                Copiar
                              </button>
                            </div>
                          )}

                          {/* Letra da versão (se salva e diferente) */}
                          {ver.lyrics && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedLyricsVersionId(isLyricsExpanded ? null : ver.id)}
                                  style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', padding: 0 }}
                                >
                                  {isLyricsExpanded ? '▼ Ocultar letra desta versão' : '▶ Ver letra usada nesta versão'}
                                </button>
                                {isLyricsExpanded && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLyrics(ver.lyrics);
                                      alert('Letra desta versão copiada para o campo de edição do pedido!');
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#059669', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                  >
                                    Usar esta letra no pedido
                                  </button>
                                )}
                              </div>
                              {isLyricsExpanded && (
                                <pre style={{ marginTop: '6px', padding: '10px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: '#334155', maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap', border: '1px solid #e2e8f0', fontFamily: 'inherit' }}>
                                  {ver.lyrics}
                                </pre>
                              )}
                            </div>
                          )}

                          {/* Faixas de Áudio desta versão */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, maxWidth: '100%' }}>
                            {tracksList.map((trackUrl, tIdx) => {
                              const isThisPrimary = trackUrl === audioUrl;
                              const isThisSecondary = trackUrl === audioUrl2;
                              const trackLabel = `Faixa ${tIdx + 1} ${tIdx === 0 ? '(Principal)' : '(Bônus)'}`;

                              return (
                                <div
                                  key={`${ver.id || vIdx}-t-${tIdx}`}
                                  style={{
                                    padding: '10px 12px',
                                    backgroundColor: isThisPrimary ? '#ecfdf5' : isThisSecondary ? '#eff6ff' : '#f8fafc',
                                    borderRadius: '8px',
                                    border: isThisPrimary ? '1px solid #a7f3d0' : isThisSecondary ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    minWidth: 0,
                                    maxWidth: '100%',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0f172a' }}>
                                      🎵 {trackLabel}
                                      {isThisPrimary && (
                                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#059669', fontWeight: '800' }}>
                                          [Áudio Principal Ativo]
                                        </span>
                                      )}
                                      {isThisSecondary && (
                                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#2563eb', fontWeight: '800' }}>
                                          [Bônus Ativo]
                                        </span>
                                      )}
                                    </span>
                                  </div>

                                  {/* Tocador de Áudio */}
                                  <audio
                                    src={buildAudioProxySrc(trackUrl)}
                                    controls
                                    preload="none"
                                    style={{ width: '100%', maxWidth: '100%', height: '36px', boxSizing: 'border-box' }}
                                  />

                                  {/* Botões rápidos de controle da faixa */}
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {!isThisPrimary && (
                                      <button
                                        type="button"
                                        onClick={() => handleSetTrackAsPrimary(trackUrl, `${ver.label || 'V' + ver.version} - ${trackLabel}`)}
                                        style={{
                                          fontSize: '0.72rem',
                                          padding: '4px 8px',
                                          backgroundColor: '#e0e7ff',
                                          color: '#3730a3',
                                          border: '1px solid #c7d2fe',
                                          borderRadius: '5px',
                                          fontWeight: '600',
                                          cursor: 'pointer'
                                        }}
                                        title="Define esta faixa isolada como o áudio principal do pedido"
                                      >
                                        ⭐ Usar como Principal
                                      </button>
                                    )}
                                    {!isThisSecondary && (
                                      <button
                                        type="button"
                                        onClick={() => handleSetTrackAsSecondary(trackUrl, `${ver.label || 'V' + ver.version} - ${trackLabel}`)}
                                        style={{
                                          fontSize: '0.72rem',
                                          padding: '4px 8px',
                                          backgroundColor: '#eff6ff',
                                          color: '#1d4ed8',
                                          border: '1px solid #bfdbfe',
                                          borderRadius: '5px',
                                          fontWeight: '600',
                                          cursor: 'pointer'
                                        }}
                                        title="Define esta faixa isolada como o áudio bônus do pedido"
                                      >
                                        ➕ Usar como Bônus
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDownload(trackUrl, `${order.orderNumber || orderId}-v${ver.version || vIdx + 1}-faixa${tIdx + 1}.mp3`)}
                                      style={{
                                        fontSize: '0.72rem',
                                        padding: '4px 8px',
                                        backgroundColor: '#f1f5f9',
                                        color: '#334155',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '5px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                      }}
                                      title="Baixar MP3 desta faixa"
                                    >
                                      ⬇️ Baixar MP3
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="admin-card-responsive" style={styles.card}>
                <h3 style={styles.cardTitle}>Dados do Homenageado</h3>
                <div style={styles.infoBlock}>
                  <span style={styles.infoLabel}>Nome da Pessoa Homenageada</span>
                  <p style={{ ...styles.infoVal, fontWeight: '800', fontSize: '1.15rem', color: '#7c3aed' }}>
                    {order.honoreeName || order.honoree_name || order.recipientName || 'Não informado'}
                  </p>
                </div>
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

              {/* Mensagem de Feedback e Ajuste para WhatsApp */}
              <OrderWhatsAppFeedbackCard order={order} />

              <div className="admin-card-responsive" style={styles.card}>
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
    maxWidth: '100vw',
    overflowX: 'hidden',
    boxSizing: 'border-box',
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
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  infoSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  card: {
    padding: '28px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
    marginBottom: '24px',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
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
    maxWidth: '100%',
    boxSizing: 'border-box',
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
    maxWidth: '100%',
    boxSizing: 'border-box',
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
    maxWidth: '100%',
    boxSizing: 'border-box',
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
