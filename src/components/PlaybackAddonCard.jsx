'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import { buildAudioProxySrc } from '@/lib/audioProxy';
import PixQrCode from './PixQrCode';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s
const AUDIO_POLLING_MAX_ATTEMPTS = 60; // ~4min a cada 4s

export default function PlaybackAddonCard({ orderId, order }) {
  const whatsappSuporte = useWhatsappSuporte();
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  // Estados locais para a separação vocal por IA
  const [localPlaybackStatus, setLocalPlaybackStatus] = useState(order?.playbackStatus || null);
  const [localPlaybackUrl, setLocalPlaybackUrl] = useState(order?.playbackUrl || null);
  const [localVocalUrl, setLocalVocalUrl] = useState(order?.extras?.vocalUrl || order?.vocalUrl || null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [generationError, setGenerationError] = useState('');

  // Faixa escolhida pelo cliente
  const faixas = useMemo(() => Array.isArray(order?.audioIds) ? order.audioIds : [], [order?.audioIds]);
  const arquivosFaixas = useMemo(() => {
    if (!Array.isArray(order?.audioFiles)) return order?.audioUrl ? [order.audioUrl] : [];
    return order.audioFiles.map(f => typeof f === 'string' ? f : f?.url).filter(Boolean);
  }, [order?.audioFiles, order?.audioUrl]);
  const totalFaixas = Math.max(faixas.length, arquivosFaixas.length);
  const temEscolha = totalFaixas > 1;
  const [faixaEscolhida, setFaixaEscolhida] = useState(() => {
    if (order?.playbackChosenAudioId && Array.isArray(order?.audioIds)) {
      const idx = order.audioIds.indexOf(order.playbackChosenAudioId);
      if (idx !== -1) return idx;
    }
    return 0;
  });

  const hasAccess = unlocked || order?.hasPlaybackAccess || order?.playbackAddonPaid;
  const identificacao = order?.orderNumber || orderId;

  const currentPlaybackStatus = localPlaybackStatus || order?.playbackStatus;
  const currentPlaybackUrl = localPlaybackUrl || order?.playbackUrl;
  const currentVocalUrl = localVocalUrl || order?.extras?.vocalUrl || order?.vocalUrl;

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);

    if (temEscolha && faixas[faixaEscolhida]) {
      try {
        await fetch('/api/playback/choose-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, audioId: faixas[faixaEscolhida] }),
        });
      } catch (e) {
        console.warn('[PlaybackAddonCard] Falha ao salvar faixa escolhida:', e?.message);
      }
    }

    const resultado = await requestPixCharge(
      { orderId, sku: 'playback_addon', isSecondaryPayment: true },
      { attempts: MAX_PIX_ATTEMPTS }
    );

    setLoading(false);
    if (resultado.ok) {
      setPixInfo({ qrCode: resultado.data.qrCode || '', paymentId: resultado.data.paymentId || '' });
    } else {
      setPixError(resultado.error);
    }
  };

  // Polling do pagamento PIX
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
        const res = await fetch(`/api/payments/status?orderId=${orderId}&paymentId=${pixInfo.paymentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved' || data.status === 'PAGO' || data.status === 'PAGAMENTO_APROVADO') {
            setUnlocked(true);
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn('[PlaybackAddonCard] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess]);

  // Função para acionar a separação por IA na VPS com a faixa escolhida
  const triggerAiSeparation = useCallback(async (chosenIdx = faixaEscolhida) => {
    if (!orderId || isTriggering) return;
    setIsTriggering(true);
    setGenerationError('');

    try {
      const targetAudioId = faixas[chosenIdx] || (temEscolha && faixas[faixaEscolhida] ? faixas[faixaEscolhida] : (order?.playbackChosenAudioId || null));
      const targetAudioUrl = arquivosFaixas[chosenIdx] || arquivosFaixas[faixaEscolhida] || null;

      const res = await fetch('/api/playback/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          audioId: targetAudioId,
          audioUrl: targetAudioUrl,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (data.alreadyReady && data.playbackUrl) {
          setLocalPlaybackUrl(data.playbackUrl);
          setLocalPlaybackStatus('READY');
        } else {
          setLocalPlaybackStatus('GERANDO');
        }
      } else {
        setGenerationError(data?.error || 'Não foi possível iniciar a separação vocal agora.');
      }
    } catch (err) {
      console.warn('[PlaybackAddonCard] Erro ao disparar separação vocal:', err?.message);
      setGenerationError('Falha na comunicação com o servidor. Tente novamente.');
    } finally {
      setIsTriggering(false);
    }
  }, [orderId, isTriggering, temEscolha, faixas, faixaEscolhida, arquivosFaixas, order?.playbackChosenAudioId]);

  // Polling de status enquanto estiver GERANDO
  useEffect(() => {
    if (!hasAccess || currentPlaybackStatus !== 'GERANDO' || (currentPlaybackStatus === 'READY' && currentPlaybackUrl)) {
      return;
    }

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= AUDIO_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const freshOrder = data?.order;
          if (freshOrder?.playbackStatus === 'READY' && freshOrder?.playbackUrl) {
            setLocalPlaybackUrl(freshOrder.playbackUrl);
            setLocalVocalUrl(freshOrder.extras?.vocalUrl || freshOrder.vocalUrl || null);
            setLocalPlaybackStatus('READY');
            clearInterval(interval);
          } else if (freshOrder?.playbackStatus === 'FAILED') {
            setLocalPlaybackStatus('FAILED');
            setGenerationError(freshOrder.playbackError || 'Erro ao processar o áudio.');
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.warn('[PlaybackAddonCard] Polling do áudio falhou:', err?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [hasAccess, currentPlaybackStatus, currentPlaybackUrl, orderId]);

  const estiloCartao = {
    padding: '20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)',
    border: '1.5px solid rgba(139, 92, 246, 0.35)',
    marginTop: '16px',
    color: '#ffffff',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
  };

  // 1. Tela de Compra / PIX (Quando ainda não pagou)
  if (!hasAccess) {
    return (
      <div className="glass-card" style={estiloCartao}>
        {pixInfo.paymentId ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '10px', color: '#ffffff' }}>
              Escaneie pra liberar o Playback (Instrumental)
            </p>
            <PixQrCode payload={pixInfo.qrCode} size={180} label="QR Code para pagamento do Playback via PIX" />
            <div style={{ margin: '12px 0 10px', textAlign: 'left' }}>
              <label htmlFor="pix-copia-cola-playback" style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                Ou use o código PIX Copia e Cola:
              </label>
              <textarea
                id="pix-copia-cola-playback"
                readOnly
                value={pixInfo.qrCode}
                style={{ width: '100%', height: '60px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none' }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(pixInfo.qrCode);
                setPixCopied(true);
                setTimeout(() => setPixCopied(false), 3000);
              }}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
            >
              {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX (R$ 4,99)'}
            </button>
            <p style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '10px' }}>
              Assim que o pagamento for identificado, a nossa IA inicia a separação instrumental automaticamente!
            </p>
            {pollingTimedOut && (
              <p style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '10px' }}>
                Ainda não identificamos o pagamento. Se já pagou, aguarde mais um instante — a confirmação
                pode demorar alguns segundos.
              </p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: '1.05rem', marginBottom: '6px', fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
              🎧 Gerar Playback (Instrumental)
            </h4>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '14px', lineHeight: '1.4' }}>
              A versão da sua música sem voz, com arranjo instrumental isolado em estúdio por IA — por apenas <strong style={{ color: '#34d399' }}>R$ 4,99</strong>.
              <br />
              <span style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
                ✨ Você também ganha o download da faixa vocal acapella isolada!
              </span>
            </p>
            {temEscolha && (
              <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px', textAlign: 'center', color: '#ffffff' }}>
                  Qual das 2 versões você quer transformar em playback?
                </p>
                {faixas.map((id, i) => (
                  <label
                    key={id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1.5px solid ${faixaEscolhida === i ? 'var(--secondary)' : 'rgba(255,255,255,0.18)'}`,
                      backgroundColor: faixaEscolhida === i ? 'rgba(236, 72, 153, 0.18)' : 'rgba(0,0,0,0.3)',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="playback-faixa"
                        checked={faixaEscolhida === i}
                        onChange={() => setFaixaEscolhida(i)}
                      />
                      <span style={{ fontSize: '0.88rem', fontWeight: '600', color: '#ffffff' }}>Faixa {i + 1}</span>
                    </div>
                    {arquivosFaixas[i] && (
                      <audio controls src={buildAudioProxySrc(arquivosFaixas[i])} style={{ width: '100%', maxWidth: '100%', height: '36px' }} />
                    )}
                  </label>
                ))}
              </div>
            )}
            {pixError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--error, #ef4444)', marginBottom: '10px' }}>{pixError}</p>
            )}
            <button
              type="button"
              onClick={handleGeneratePix}
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: '10px 20px', fontSize: '0.88rem', fontWeight: 'bold', border: 'none', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Gerando cobrança...' : 'Liberar Playback — R$ 4,99'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // 2. Playback Pronto (Sucesso!)
  if ((currentPlaybackStatus === 'READY' || order?.playbackStatus === 'READY') && currentPlaybackUrl) {
    return (
      <div className="glass-card" style={{ ...estiloCartao, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: 'rgba(52, 211, 153, 0.2)', border: '1px solid #34d399', borderRadius: '20px', padding: '4px 14px', fontSize: '0.8rem', color: '#34d399', fontWeight: '700', marginBottom: '12px' }}>
          ✨ Playback Concluído
        </div>
        <h4 style={{ fontSize: '1.1rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
          🎧 Seu Playback Instrumental está pronto!
        </h4>
        <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '14px' }}>
          Áudio sem a voz original, pronto para você cantar junto ou usar como trilha:
        </p>
        <audio controls src={buildAudioProxySrc(currentPlaybackUrl)} style={{ width: '100%', marginBottom: '12px' }} />
        <a
          href={`/api/audio/proxy?url=${encodeURIComponent(currentPlaybackUrl)}&download=${encodeURIComponent(`playback-${identificacao}.mp3`)}`}
          download={`playback-${identificacao}.mp3`}
          className="btn btn-primary"
          style={{ padding: '10px 18px', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-block', marginBottom: currentVocalUrl ? '16px' : '0' }}
        >
          💾 Baixar Playback (Instrumental)
        </a>

        {/* Faixa vocal acapella isolada (bônus de estúdio) */}
        {currentVocalUrl && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.15)', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '700', color: '#a78bfa', marginBottom: '6px' }}>
              🎤 Faixa Vocal Isolada (Acapella Bônus)
            </p>
            <audio controls src={buildAudioProxySrc(currentVocalUrl)} style={{ width: '100%', marginBottom: '10px' }} />
            <a
              href={`/api/audio/proxy?url=${encodeURIComponent(currentVocalUrl)}&download=${encodeURIComponent(`vocal-${identificacao}.mp3`)}`}
              download={`vocal-${identificacao}.mp3`}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-block' }}
            >
              💾 Baixar Faixa Vocal
            </a>
          </div>
        )}
      </div>
    );
  }

  // 3. Em Processamento / Gerando na VPS
  if (currentPlaybackStatus === 'GERANDO' || isTriggering) {
    return (
      <div className="glass-card" style={{ ...estiloCartao, textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '10px', animation: 'spin 2s linear infinite' }}>
          ⏳
        </div>
        <h4 style={{ fontSize: '1.05rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
          🎧 Separando Voz e Instrumentos...
        </h4>
        <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '14px', lineHeight: 1.45 }}>
          Nossa inteligência artificial de estúdio está processando sua música na VPS para isolar o arranjo instrumental com máxima fidelidade.
        </p>
        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ width: '70%', height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
        </div>
        <p style={{ fontSize: '0.78rem', color: '#a78bfa' }}>
          ⏱️ Tempo estimado: cerca de 1 minuto. Esta página atualizará automaticamente assim que estiver pronto!
        </p>
      </div>
    );
  }

  // 4. Acesso Liberado (aguardando o cliente escolher a versão e acionar)
  const faixaInformada = temEscolha
    ? ` (faixa ${faixaEscolhida + 1})`
    : '';

  return (
    <div className="glass-card" style={{ ...estiloCartao, textAlign: 'center' }}>
      <div style={{ display: 'inline-block', background: 'rgba(52, 211, 153, 0.2)', border: '1px solid #34d399', borderRadius: '20px', padding: '4px 14px', fontSize: '0.8rem', color: '#34d399', fontWeight: '700', marginBottom: '12px' }}>
        ✅ Playback Liberado!
      </div>
      <h4 style={{ fontSize: '1.05rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
        Pronto para separar a voz do instrumental
      </h4>
      <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.45 }}>
        {temEscolha
          ? 'Escolha qual versão da sua música você deseja transformar em Playback Instrumental:'
          : 'Seu acesso está liberado! Clique abaixo para iniciar a separação vocal por IA de estúdio:'}
      </p>

      {temEscolha && (
        <div style={{ marginBottom: '16px', textAlign: 'left', maxWidth: '480px', margin: '0 auto 16px auto' }}>
          {arquivosFaixas.map((audioSrc, i) => (
            <label
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px 14px',
                borderRadius: '12px',
                border: `1.5px solid ${faixaEscolhida === i ? 'var(--secondary)' : 'rgba(255,255,255,0.18)'}`,
                backgroundColor: faixaEscolhida === i ? 'rgba(236, 72, 153, 0.22)' : 'rgba(0,0,0,0.3)',
                marginBottom: '10px',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    name="playback-faixa-paid"
                    checked={faixaEscolhida === i}
                    onChange={() => setFaixaEscolhida(i)}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#ffffff' }}>
                    Versão {i + 1}
                  </span>
                </div>
                {faixaEscolhida === i && (
                  <span style={{ fontSize: '0.75rem', color: '#ec4899', fontWeight: '600' }}>
                    ✓ Selecionada
                  </span>
                )}
              </div>
              {audioSrc && (
                <audio controls src={buildAudioProxySrc(audioSrc)} style={{ width: '100%', maxWidth: '100%', height: '36px' }} />
              )}
            </label>
          ))}
        </div>
      )}

      {generationError && (
        <p style={{ fontSize: '0.8rem', color: 'var(--error, #ef4444)', marginBottom: '12px' }}>
          {generationError}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => triggerAiSeparation(faixaEscolhida)}
          disabled={isTriggering}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: '0.95rem', fontWeight: 'bold', border: 'none', cursor: isTriggering ? 'default' : 'pointer' }}
        >
          {isTriggering
            ? 'Iniciando separação...'
            : temEscolha
              ? `🎧 Gerar Playback (Versão ${faixaEscolhida + 1})`
              : '✨ Gerar Playback com IA de Estúdio'}
        </button>

        <a
          href={linkWhatsapp(
            whatsappSuporte,
            `Olá! Paguei o Playback do pedido ${identificacao}${faixaInformada} e gostaria de suporte.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '0.8rem', color: '#cbd5e1', textDecoration: 'underline', marginTop: '6px' }}
        >
          💬 Falar com suporte no WhatsApp se preferir
        </a>
      </div>
    </div>
  );
}
