'use client';

import React, { useState, useEffect, useRef } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import PixQrCode from './PixQrCode';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';

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
  const [fraseValidacao, setFraseValidacao] = useState('');
  const [phraseTaskId, setPhraseTaskId] = useState('');
  const [verificacaoBlob, setVerificacaoBlob] = useState(null);
  const [processandoVoz, setProcessandoVoz] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [musicaGeradaUrl, setMusicaGeradaUrl] = useState(order?.customVoiceAudioUrl || order?.extras?.customVoiceAudioUrl || '');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const hasAccess = unlocked || order?.hasCustomVoiceAccess || order?.customVoiceAddonPaid || order?.extras?.customVoiceAddonPaid;
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
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        if (etapaGravacao === 1) {
          setAmostraBlob(blob);
          setAmostraUrl(url);
        } else if (etapaGravacao === 2) {
          setVerificacaoBlob(blob);
        }
        stream.getTracks().forEach(t => t.stop());
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
      fd.append('file', amostraBlob, 'amostra_voz.webm');
      const upRes = await fetch('/api/admin/voice/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.url) throw new Error(upData.error || 'Falha no upload da amostra.');

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
        if (checkRes.ok) {
          const cData = await checkRes.json();
          if (cData.phrase) {
            fraseObtida = cData.phrase;
            break;
          }
        }
      }

      setFraseValidacao(fraseObtida || 'Eu autorizo a criação da minha voz personalizada para minha música.');
      setEtapaGravacao(2);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setProcessandoVoz(false);
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
      fd.append('file', verificacaoBlob, 'validacao_voz.webm');
      const upRes = await fetch('/api/admin/voice/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.url) throw new Error(upData.error || 'Falha no upload da validação.');

      // 2. Criação do perfil de voz
      const createRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_voice',
          phraseTaskId,
          verifyUrl: upData.url,
          voiceName: order?.customerName || 'Cliente'
        })
      });
      const cData = await createRes.json();
      if (!createRes.ok || !cData.taskId) throw new Error(cData.error || 'Falha ao criar voz.');

      // 3. Polling da criação do Voice ID
      setStatusMsg('Finalizando seu modelo de voz...');
      let createdVoiceId = '';
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const pRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(cData.taskId)}&type=job`);
        if (pRes.ok) {
          const poll = await pRes.json();
          if (poll.voiceId || poll.personaId) {
            createdVoiceId = poll.voiceId || poll.personaId;
            break;
          }
        }
      }

      const finalVoiceId = createdVoiceId || cData.taskId;

      // 4. Salva a voz no Supabase associando ao telefone do cliente
      await fetch('/api/admin/voice/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          phone: customerPhone,
          customerName: order?.customerName || 'Cliente',
          voiceId: finalVoiceId,
          sampleAudioUrl: amostraUrl,
          verifyAudioUrl: upData.url
        })
      });

      // 5. Inicia a regeração da música com a nova voz
      setStatusMsg('Regerando sua música cantada com a sua voz...');
      const genRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_song',
          voiceId: finalVoiceId,
          prompt: order?.lyrics || '',
          style: order?.musicStyle || 'Acoustic Pop',
          title: `${order?.honoreeName || 'Música'} (Voz de ${order?.customerName || 'Cliente'})`
        })
      });
      const gData = await genRes.json();
      if (gData.tracks && gData.tracks.length > 0) {
        setMusicaGeradaUrl(gData.tracks[0]);
      }

      setEtapaGravacao(3);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setProcessandoVoz(false);
    }
  };

  return (
    <div style={{
      marginTop: '24px',
      padding: '24px',
      borderRadius: '20px',
      background: 'linear-gradient(145deg, #18181b, #09090b)',
      border: '1px solid #27272a',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
      color: '#f4f4f5'
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
          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
        }}>
          🎙️
        </div>
        <div>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#fbbf24',
            background: 'rgba(251, 191, 36, 0.1)',
            padding: '3px 8px',
            borderRadius: '6px'
          }}>
            Tecnologia Exclusiva de IA
          </span>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: '800', color: '#ffffff' }}>
            Cantar com a Minha Própria Voz
          </h3>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: '#a1a1aa', lineHeight: 1.5, margin: '0 0 18px' }}>
        Nossa Inteligência Artificial clona o seu timbre a partir de uma gravação rápida de 20 segundos e regera esta mesma música cantada exatamente por você!
      </p>

      {/* CASO JÁ TENHA ACESSO LIBERADO (PAGO) */}
      {hasAccess ? (
        <div style={{
          background: 'rgba(245, 158, 11, 0.06)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '16px',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>✨</div>
          <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#fbbf24', fontWeight: '700' }}>
            Acesso VIP Liberado!
          </h4>

          {musicaGeradaUrl ? (
            <div style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '0.9rem', color: '#e4e4e7', marginBottom: '12px' }}>
                🎉 Sua versão exclusiva cantada por você está pronta!
              </p>
              <audio controls src={musicaGeradaUrl} style={{ width: '100%', marginBottom: '14px' }} />
              <a
                href={musicaGeradaUrl}
                download
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  fontWeight: '700',
                  textDecoration: 'none',
                  fontSize: '0.9rem'
                }}
              >
                ⬇️ Baixar MP3 Cantado por Mim
              </a>
            </div>
          ) : (
            <div>
              {customVoiceData ? (
                <p style={{ fontSize: '0.85rem', color: '#d4d4d8', marginBottom: '16px' }}>
                  Encontramos seu timbre <strong>{customVoiceData.customerName}</strong> associado a este número.
                </p>
              ) : (
                <p style={{ fontSize: '0.85rem', color: '#d4d4d8', marginBottom: '16px' }}>
                  Grave uma amostra rápida de 20 segundos para a IA clonar o seu tom de voz.
                </p>
              )}

              <button
                type="button"
                onClick={() => setModalAberto(true)}
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
                🎤 {customVoiceData ? 'Gerar com Minha Voz / Regravar' : 'Gravar Minha Voz Agora'}
              </button>
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
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '12px'
          }}>
            <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ffffff' }}>R$ 24,90</span>
            <span style={{ fontSize: '0.8rem', color: '#71717a' }}>taxa única de clonagem + regravação</span>
          </div>

          {pixInfo.qrCode ? (
            <div>
              <PixQrCode
                qrCodeText={pixInfo.qrCode}
                paymentId={pixInfo.paymentId}
                amount={24.90}
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
                {loadingPix ? 'Gerando Chave PIX...' : '✨ Quero a Música com a Minha Voz (R$ 24,90)'}
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
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '14px' }}>
                  Por segurança e validação do modelo de IA, leia a frase abaixo em voz alta:
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
