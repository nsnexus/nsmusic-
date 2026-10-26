'use client';

import React, { useState, useEffect, useRef } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import PixQrCode from './PixQrCode';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';
import { converterParaWavBlob } from '@/lib/audioWav';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min

export default function VozClienteAddonCard({ orderId, order }) {
  const whatsappSuporte = useWhatsappSuporte();
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loadingPix, setLoadingPix] = useState(false);
  const [pixError, setPixError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  // Estados de Voz
  const [customVoiceData, setCustomVoiceData] = useState(null);
  const [checkingVoice, setCheckingVoice] = useState(false);

  // Estados de Gravação
  const [modalAberto, setModalAberto] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [etapaGravacao, setEtapaGravacao] = useState(1); // 1 = Amostra 20s, 2 = Validação, 3 = Gerando
  const [amostraBlob, setAmostraBlob] = useState(null);
  const [amostraUrl, setAmostraUrl] = useState('');
  const [amostraR2Url, setAmostraR2Url] = useState('');
  const [fraseValidacao, setFraseValidacao] = useState('');
  const [phraseTaskId, setPhraseTaskId] = useState('');
  const [verificacaoBlob, setVerificacaoBlob] = useState(null);
  const [processandoVoz, setProcessandoVoz] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [musicaGeradaUrl, setMusicaGeradaUrl] = useState(
    order?.customVoiceAudioUrl ||
    order?.extras?.customVoiceAudioUrl ||
    ((order?.isCustomVoice || order?.voiceType === 'minha_voz' || order?.extras?.isCustomVoice) ? order?.audioUrl : '') ||
    ''
  );
  const [baixandoMp3, setBaixandoMp3] = useState(false);

  const baixarMusicaVoz = async (url) => {
    if (!url || baixandoMp3) return;
    setBaixandoMp3(true);
    const nomeHonoree = (order?.honoreeName || 'Homenagem').replace(/[^\w.\- ]/g, '_');
    const nomeArquivo = `Musica_Com_Minha_Voz_${nomeHonoree}.mp3`;

    // Usa o proxy oficial com parâmetro download para forçar Content-Disposition attachment
    const proxiedUrl = url.startsWith('/api/') || url.startsWith('blob:')
      ? url
      : `/api/audio/proxy?url=${encodeURIComponent(url)}&download=${encodeURIComponent(nomeArquivo)}`;

    try {
      // 1. Tenta baixar via fetch + Blob: força o navegador a salvar diretamente em disco sem abrir player
      const res = await fetch(proxiedUrl);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', nomeArquivo);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15000);
        return;
      }
    } catch (e) {
      console.warn('[VozClienteAddonCard] Fallback de download direto:', e);
    } finally {
      setBaixandoMp3(false);
    }

    // 2. Fallback direto disparando o link do proxy com download
    try {
      const link = document.createElement('a');
      link.href = proxiedUrl;
      link.setAttribute('download', nomeArquivo);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      window.location.href = proxiedUrl;
    }
  };

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const hasAccess = unlocked || order?.hasCustomVoiceAccess || order?.customVoiceAddonPaid || order?.extras?.customVoiceAddonPaid || order?.extras?.hasCustomVoiceAccess;
  const customerPhone = order?.customerPhone || order?.customer_phone || '';

  // Verifica se o cliente já possui voz cadastrada pelo telefone
  useEffect(() => {
    if (!customerPhone) return;
    setCheckingVoice(true);
    fetch(`/api/voice/check?phone=${encodeURIComponent(customerPhone)}`)
      .then(res => res.json())
      .then(data => {
        if (data.found && data.voice) {
          setCustomVoiceData(data.voice);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingVoice(false));
  }, [customerPhone]);

  // Polling do pagamento PIX do Add-on
  useEffect(() => {
    if (!orderId || !pixInfo.paymentId || hasAccess) return;

    setPollingTimedOut(false);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= PIX_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        setPollingTimedOut(true);
        return;
      }

      try {
        const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(pixInfo.paymentId)}&checkProvider=true`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'approved' || data.isPaid || data.order?.hasCustomVoiceAccess || data.order?.customVoiceAddonPaid) {
          clearInterval(interval);
          setUnlocked(true);
        }
      } catch (e) {}
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess]);

  const handleGerarPix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoadingPix(true);

    const resultado = await requestPixCharge(
      { orderId, sku: 'custom_voice_addon', isSecondaryPayment: true },
      { attempts: MAX_PIX_ATTEMPTS }
    );

    setLoadingPix(false);
    if (resultado.ok) {
      setPixInfo({ qrCode: resultado.data.qrCode || '', paymentId: resultado.data.paymentId || '' });
    } else {
      setPixError(resultado.error || 'Não foi possível gerar a chave PIX no momento.');
    }
  };

  // Funções de Gravação de Áudio
  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        try {
          const rawBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const blob = await converterParaWavBlob(rawBlob);
          const url = URL.createObjectURL(blob);
          if (etapaGravacao === 1) {
            setAmostraBlob(blob);
            setAmostraUrl(url);
          } else if (etapaGravacao === 2) {
            setVerificacaoBlob(blob);
          }
        } finally {
          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start(200);
      setGravando(true);
      setSegundos(0);
      timerRef.current = setInterval(() => {
        setSegundos(s => s + 1);
      }, 1000);
    } catch (err) {
      alert('Por favor, permita o acesso ao microfone para gravar sua voz.');
    }
  };

  const pararGravacao = () => {
    if (mediaRecorderRef.current && gravando) {
      mediaRecorderRef.current.stop();
      clearInterval(timerRef.current);
      setGravando(false);
    }
  };

  // Envia a amostra de 20s e pede a frase de validação à API
  const handleEnviarAmostra = async () => {
    if (!amostraBlob) return;
    setProcessandoVoz(true);
    setStatusMsg('Enviando áudio da sua voz para análise...');

    try {
      // 1. Upload da amostra no R2
      const fd = new FormData();
      const extAmostra = (amostraBlob?.type && amostraBlob.type.includes('wav')) ? 'wav' : 'webm';
      fd.append('file', amostraBlob, `amostra_voz.${extAmostra}`);
      const upRes = await fetch('/api/admin/voice/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.url) throw new Error(upData.error || 'Falha no upload da amostra.');

      setAmostraR2Url(upData.url);
      setStatusMsg('Gerando frase de segurança personalizada...');

      // 2. Solicita frase na Kie.ai
      const phraseRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_phrase', voiceUrl: upData.url })
      });
      const pData = await phraseRes.json();
      if (!phraseRes.ok || !pData.taskId) throw new Error(pData.error || 'Erro ao gerar frase de segurança.');

      setPhraseTaskId(pData.taskId);

      // Polling rápido para pegar a frase retornada
      setStatusMsg('Obtendo frase de validação...');
      let fraseObtida = '';
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const checkRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(pData.taskId)}&type=phrase`);
        if (!checkRes.ok) throw new Error((await checkRes.json()).error || 'Não foi possível consultar a frase de validação.');
        if (checkRes.ok) {
          const cData = await checkRes.json();
          if (cData.state === 'fail') throw new Error(cData.failMsg || 'A IA não conseguiu analisar a amostra de voz.');
          if (cData.phrase) {
            fraseObtida = cData.phrase;
            break;
          }
        }
      }

      if (!fraseObtida) throw new Error('A frase de validação ainda não ficou pronta. Tente novamente em instantes.');
      setFraseValidacao(fraseObtida);
      setEtapaGravacao(2);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setProcessandoVoz(false);
      setStatusMsg('');
    }
  };

  // Dispara a regeração da música com a voz e faz polling até concluir
  const iniciarGeracaoComVoz = async (targetVoiceId, optionalRecordingId = null) => {
    if (!targetVoiceId) {
      alert('Timbre de voz não encontrado. Por favor, grave a sua amostra.');
      return;
    }
    setProcessandoVoz(true);
    setStatusMsg('Iniciando composição com o seu timbre de voz...');

    try {
      const genRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_song',
          orderId: order?.id || orderId,
          voiceId: targetVoiceId,
          voiceRecordingId: optionalRecordingId || customVoiceData?.voiceRecordingId || undefined,
          phraseTaskId: phraseTaskId || undefined,
          prompt: order?.lyrics || '',
          style: order?.musicStyle || 'Acoustic Pop',
          title: `${order?.honoreeName || 'Música'} (Voz de ${order?.customerName || 'Cliente'})`
        })
      });
      const gData = await genRes.json();
      if (!genRes.ok || !gData.taskId) {
        const errorMsg = gData.error || '';
        if (errorMsg.toLowerCase().includes('voice persona') || errorMsg.toLowerCase().includes('regenerate voice')) {
          throw new Error('A Inteligência Artificial precisa que você regrave a sua amostra para ativar o timbre. Clique em "🔄 Gravar Novamente" e leia a frase indicada na tela.');
        }
        throw new Error(errorMsg || 'Falha ao iniciar composição na IA.');
      }

      const songTaskId = gData.taskId;
      setStatusMsg('A IA está compondo e cantando sua música com a sua voz... (leva de 1 a 2 minutos)');

      let musicaUrl = '';
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 4500));
        const pRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(songTaskId)}&type=generate`);
        if (!pRes.ok) throw new Error((await pRes.json()).error || 'Não foi possível consultar a música com sua voz.');
        if (pRes.ok) {
          const poll = await pRes.json();
          if (poll.status === 'COMPLETED' && poll.tracks && poll.tracks.length > 0) {
            musicaUrl = poll.tracks[0]?.audioUrl || poll.tracks[0]?.audio_url || poll.tracks[0];
            break;
          }
          if (poll.status === 'FAILED') {
            throw new Error('A IA não conseguiu concluir esta geração. Tente novamente.');
          }
        }

        // Também confere se a order foi atualizada pelo webhook
        if (i % 3 === 0 && (orderId || order?.id)) {
          try {
            const ordRes = await fetch(`/api/orders/${encodeURIComponent(order?.id || orderId)}`);
            if (ordRes.ok) {
              const ordData = await ordRes.json();
              if (ordData.order?.audioUrl && ordData.order.sunoTaskId === songTaskId) {
                musicaUrl = ordData.order.audioUrl;
                break;
              }
            }
          } catch (e) {}
        }
      }

      if (!musicaUrl) throw new Error('A música ainda está em processamento. Aguarde e consulte novamente; ela ainda não foi concluída.');
      setMusicaGeradaUrl(musicaUrl);
      setEtapaGravacao(3);
    } catch (err) {
      alert(`Erro ao gerar música com voz: ${err.message}`);
    } finally {
      setProcessandoVoz(false);
      setStatusMsg('');
    }
  };

  // Envia a frase lida e finaliza a criação da voz
  const handleFinalizarCriacao = async () => {
    if (!verificacaoBlob || !phraseTaskId) return;
    setProcessandoVoz(true);
    setStatusMsg('Sintetizando seu timbre de voz com Inteligência Artificial...');

    try {
      // 1. Upload do áudio de validação
      const fd = new FormData();
      const extVerif = (verificacaoBlob?.type && verificacaoBlob.type.includes('wav')) ? 'wav' : 'webm';
      fd.append('file', verificacaoBlob, `validacao_voz.${extVerif}`);
      const upRes = await fetch('/api/admin/voice/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.url) throw new Error(upData.error || 'Falha no upload da validação.');

      // 2. Criação do perfil de voz na Kie.ai
      const createRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_voice',
          phraseTaskId,
          voiceUrl: amostraR2Url || amostraUrl,
          verifyUrl: upData.url,
          voiceName: order?.customerName || 'Cliente'
        })
      });
      const cData = await createRes.json();
      if (!createRes.ok || !cData.taskId) {
        throw new Error(cData.error || 'Falha ao iniciar criação do timbre na IA.');
      }

      // 3. Polling da criação do Voice ID com detecção de falha
      setStatusMsg('Finalizando seu modelo de voz...');
      let createdVoiceId = '';
      let createdRecordId = '';
      let validationFailed = false;
      let failReason = '';

      for (let i = 0; i < 36; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const pRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(cData.taskId)}&type=job`);
        if (!pRes.ok) throw new Error((await pRes.json()).error || 'Não foi possível consultar a validação da voz.');
        if (pRes.ok) {
          const poll = await pRes.json();
          if (poll.state === 'fail' || poll.state === 'FAILED') {
            validationFailed = true;
            failReason = poll.failMsg || 'A gravação não coincidiu com a frase solicitada.';
            break;
          }
          if (poll.state === 'success' && (poll.voiceId || poll.personaId)) {
            createdVoiceId = poll.voiceId || poll.personaId;
            createdRecordId = poll.voiceRecordingId || '';
            break;
          }
        }
      }

      if (validationFailed || !createdVoiceId) {
        throw new Error(
          failReason
            ? `Validação de voz recusada pela IA: ${failReason}. Certifique-se de ler a frase exata da tela em voz alta, sem cantar outra música.`
            : 'A IA não conseguiu concluir a validação no tempo limite. Por favor, leia a frase da tela e tente novamente.'
        );
      }

      const finalVoiceId = createdVoiceId;

      // 4. Salva a voz no Supabase associando ao telefone do cliente
      await fetch('/api/admin/voice/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          phone: customerPhone,
          customerName: order?.customerName || 'Cliente',
          voiceId: finalVoiceId,
          voiceRecordingId: createdRecordId,
          sampleAudioUrl: amostraR2Url || upData.url,
          verifyAudioUrl: upData.url
        })
      });

      setCustomVoiceData({
        voiceId: finalVoiceId,
        voiceRecordingId: createdRecordId,
        customerName: order?.customerName || 'Cliente'
      });

      // 5. Inicia a regeração da música com a nova voz
      await iniciarGeracaoComVoz(finalVoiceId, createdRecordId);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setProcessandoVoz(false);
      setStatusMsg('');
    }
  };

  return (
    <div style={{
      marginTop: '16px',
      padding: '24px',
      borderRadius: '20px',
      background: '#ffffff',
      border: '1.5px solid #e2e8f0',
      boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)',
      color: '#0f172a'
    }}>
      {/* Cabeçalho do Card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '26px',
          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
          color: '#ffffff'
        }}>
          🎙️
        </div>
        <div>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#b45309',
            background: '#fef3c7',
            padding: '3px 8px',
            borderRadius: '6px'
          }}>
            Tecnologia Exclusiva de IA
          </span>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
            Cantar com a Minha Própria Voz
          </h3>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, margin: '0 0 18px' }}>
        Nossa Inteligência Artificial clona o seu timbre a partir de uma gravação rápida de 20 segundos e regera esta mesma música cantada exatamente por você!
      </p>

      {/* CASO JÁ TENHA ACESSO LIBERADO (PAGO) */}
      {hasAccess ? (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: '16px',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>✨</div>
          <h4 style={{ margin: '0 0 6px', fontSize: '1.15rem', color: '#92400e', fontWeight: '800' }}>
            Acesso VIP Liberado!
          </h4>

          {musicaGeradaUrl ? (
            <div style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '0.9rem', color: '#92400e', marginBottom: '12px', fontWeight: '700' }}>
                🎉 Sua versão exclusiva cantada por você está pronta!
              </p>
              <audio controls src={musicaGeradaUrl} style={{ width: '100%', marginBottom: '14px' }} />
              <button
                type="button"
                onClick={() => baixarMusicaVoz(musicaGeradaUrl)}
                disabled={baixandoMp3}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  fontWeight: '800',
                  fontSize: '0.92rem',
                  cursor: baixandoMp3 ? 'wait' : 'pointer',
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                }}
              >
                {baixandoMp3 ? '⏳ Baixando MP3...' : '⬇️ Baixar MP3 Cantado por Mim'}
              </button>
            </div>
          ) : (
            <div>
              {customVoiceData ? (
                <div style={{ marginBottom: '8px' }}>
                  <p style={{ fontSize: '0.88rem', color: '#92400e', marginBottom: '14px', lineHeight: 1.4 }}>
                    Identificamos o seu timbre de voz salvo (<strong>{customVoiceData.customerName}</strong>).
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '340px', margin: '0 auto' }}>
                    <button
                      type="button"
                      onClick={() => iniciarGeracaoComVoz(customVoiceData.voiceId, customVoiceData.voiceRecordingId)}
                      disabled={processandoVoz}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#fff',
                        border: 'none',
                        padding: '14px 20px',
                        borderRadius: '12px',
                        fontWeight: '800',
                        fontSize: '0.95rem',
                        cursor: processandoVoz ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                      }}
                    >
                      {processandoVoz ? statusMsg : '🎙️ Regerar Música com Minha Voz Salva'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEtapaGravacao(1); setModalAberto(true); }}
                      disabled={processandoVoz}
                      style={{
                        background: 'transparent',
                        color: '#b45309',
                        border: '1.5px solid #d97706',
                        padding: '10px 18px',
                        borderRadius: '12px',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 Gravar Novamente / Trocar Amostra
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: '16px' }}>
                    Grave uma amostra rápida de 20 segundos para a IA clonar o seu tom de voz.
                  </p>

                  <button
                    type="button"
                    onClick={() => { setEtapaGravacao(1); setModalAberto(true); }}
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#000',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '12px',
                      fontWeight: '800',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)'
                    }}
                  >
                    🎤 Gravar Minha Voz Agora
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* CASO NÃO TENHA PAGO (OFERTA DO ADD-ON) */
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            marginBottom: '16px',
            padding: '12px 16px',
            background: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: '12px'
          }}>
            <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0f172a' }}>R$ 14,90</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>taxa única de clonagem + regravação</span>
          </div>

          {pixInfo.qrCode ? (
            <div>
              <PixQrCode
                qrCodeText={pixInfo.qrCode}
                paymentId={pixInfo.paymentId}
                amount={14.90}
                orderNumber={order?.orderNumber}
              />
              {pollingTimedOut && (
                <p style={{ fontSize: '0.8rem', color: '#fbbf24', marginTop: '10px', textAlign: 'center' }}>
                  Já pagou? Aguarde alguns instantes ou atualize a página.
                </p>
              )}
            </div>
          ) : (
            <div>
              {pixError && (
                <p style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '10px' }}>{pixError}</p>
              )}
              <button
                type="button"
                onClick={handleGerarPix}
                disabled={loadingPix}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#000',
                  border: 'none',
                  padding: '14px',
                  borderRadius: '14px',
                  fontWeight: '800',
                  fontSize: '1rem',
                  cursor: loadingPix ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 15px rgba(245, 158, 11, 0.35)',
                  transition: 'opacity 0.2s'
                }}
              >
                {loadingPix ? 'Gerando Chave PIX...' : '✨ Quero a Música com a Minha Voz (R$ 14,90)'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE GRAVAÇÃO */}
      {modalAberto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '24px',
            maxWidth: '480px',
            width: '100%',
            padding: '28px',
            color: '#f4f4f5',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)'
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '1.3rem', color: '#fbbf24' }}>
              {etapaGravacao === 1 && 'Etapa 1 de 2: Amostra de Voz'}
              {etapaGravacao === 2 && 'Etapa 2 de 2: Confirmação da Suno'}
              {etapaGravacao === 3 && 'Tudo Pronto!'}
            </h3>

            {etapaGravacao === 1 && (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '20px' }}>
                  Fale ou cante normalmente por 20 segundos em um ambiente silencioso. Conte algo bonito sobre quem você está homenageando.
                </p>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: '800',
                    color: gravando ? '#ef4444' : '#fbbf24',
                    marginBottom: '12px'
                  }}>
                    {segundos}s {gravando && '🔴 Gravando...'}
                  </div>

                  {!gravando ? (
                    <button
                      type="button"
                      onClick={iniciarGravacao}
                      style={{
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      🎙️ Iniciar Gravação
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={pararGravacao}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      ⏹️ Parar Gravação
                    </button>
                  )}
                </div>

                {amostraUrl && !gravando && (
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '0.8rem', color: '#a1a1aa', margin: '0 0 6px' }}>Ouça como ficou:</p>
                    <audio controls src={amostraUrl} style={{ width: '100%', marginBottom: '12px' }} />
                    <button
                      type="button"
                      onClick={handleEnviarAmostra}
                      disabled={processandoVoz}
                      style={{
                        width: '100%',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        padding: '12px',
                        borderRadius: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {processandoVoz ? statusMsg : 'Avançar para Etapa 2 ➡️'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {etapaGravacao === 2 && (
              <div>
                <p style={{ fontSize: '0.88rem', color: '#fef08a', marginBottom: '14px', lineHeight: 1.5, background: 'rgba(234, 179, 8, 0.1)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                  ⚠️ <strong>Passo Obrigatório de Validação:</strong> Para a IA ativar o seu modelo vocal, leia <u>exatamente a frase abaixo em voz alta</u> com a sua voz natural (não cante outra música aqui):
                </p>

                <div style={{
                  background: '#27272a',
                  padding: '16px',
                  borderRadius: '12px',
                  fontStyle: 'italic',
                  color: '#fbbf24',
                  fontSize: '0.95rem',
                  marginBottom: '20px',
                  border: '1px solid #3f3f46'
                }}>
                  &ldquo;{fraseValidacao}&rdquo;
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: gravando ? '#ef4444' : '#fbbf24', marginBottom: '10px' }}>
                    {segundos}s {gravando && '🔴 Gravando...'}
                  </div>

                  {!gravando ? (
                    <button
                      type="button"
                      onClick={iniciarGravacao}
                      style={{
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      🎙️ Gravar Frase
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={pararGravacao}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      ⏹️ Parar Gravação
                    </button>
                  )}
                </div>

                {verificacaoBlob && !gravando && (
                  <button
                    type="button"
                    onClick={handleFinalizarCriacao}
                    disabled={processandoVoz}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#000',
                      border: 'none',
                      padding: '14px',
                      borderRadius: '12px',
                      fontWeight: '800',
                      fontSize: '1rem',
                      cursor: 'pointer'
                    }}
                  >
                    {processandoVoz ? statusMsg : '🚀 Treinar Voz e Gerar Música'}
                  </button>
                )}
              </div>
            )}

            {etapaGravacao === 3 && (
              <div>
                <p style={{ color: '#10b981', fontWeight: '700', fontSize: '1.1rem', marginBottom: '16px' }}>
                  🎉 Música cantada por você gerada com sucesso!
                </p>
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  style={{
                    background: '#3f3f46',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    cursor: 'pointer'
                  }}
                >
                  Fechar e Ouvir
                </button>
              </div>
            )}

            {!processandoVoz && (
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                style={{
                  background: 'transparent',
                  color: '#71717a',
                  border: 'none',
                  marginTop: '16px',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
