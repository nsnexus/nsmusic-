'use client';

import { useState, useEffect, useCallback } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import PixQrCode from './PixQrCode';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min
const VIDEO_POLLING_MAX_ATTEMPTS = 60; // ~4min

export default function KaraokeAddonCard({ orderId, order }) {
  const whatsappSuporte = useWhatsappSuporte();
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  // Estados locais da renderização do karaokê
  const [localKaraokeStatus, setLocalKaraokeStatus] = useState(order?.karaokeStatus || null);
  const [localKaraokeUrl, setLocalKaraokeUrl] = useState(order?.karaokeUrl || null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [generationError, setGenerationError] = useState('');

  const hasAccess = unlocked || order?.hasKaraokeAccess || order?.karaokeAddonPaid;
  const currentKaraokeStatus = localKaraokeStatus || order?.karaokeStatus;
  const currentKaraokeUrl = localKaraokeUrl || order?.karaokeUrl;

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);

    const resultado = await requestPixCharge(
      { orderId, sku: 'karaoke_addon', isSecondaryPayment: true },
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
        console.warn('[KaraokeAddonCard] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess]);

  // Função para acionar a renderização do karaokê na VPS
  const handleTriggerGeneration = useCallback(async () => {
    if (!orderId || isTriggering) return;
    setIsTriggering(true);
    setGenerationError('');

    try {
      const res = await fetch('/api/karaoke/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setLocalKaraokeStatus('GERANDO');
      } else {
        setGenerationError(data.error || 'Não foi possível iniciar a geração do vídeo karaokê.');
      }
    } catch (e) {
      setGenerationError(e?.message || 'Erro de conexão ao solicitar o karaokê.');
    } finally {
      setIsTriggering(false);
    }
  }, [orderId, isTriggering]);

  // Disparo automático quando o acesso é liberado e o vídeo ainda não foi solicitado
  useEffect(() => {
    if (hasAccess && !currentKaraokeUrl && !currentKaraokeStatus) {
      handleTriggerGeneration();
    }
  }, [hasAccess, currentKaraokeUrl, currentKaraokeStatus, handleTriggerGeneration]);

  // Polling da geração do vídeo na VPS (quando status === 'GERANDO')
  useEffect(() => {
    if (!hasAccess || currentKaraokeUrl || currentKaraokeStatus !== 'GERANDO') return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= VIDEO_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const freshOrder = data?.order || data;
          if (freshOrder?.karaokeUrl) {
            setLocalKaraokeUrl(freshOrder.karaokeUrl);
            setLocalKaraokeStatus('CONCLUIDO');
            clearInterval(interval);
          } else if (freshOrder?.karaokeStatus === 'ERRO') {
            setLocalKaraokeStatus('ERRO');
            setGenerationError(freshOrder.karaokeError || 'Falha na renderização do karaokê.');
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn('[KaraokeAddonCard] Polling de vídeo falhou:', e?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [hasAccess, currentKaraokeUrl, currentKaraokeStatus, orderId]);

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(30, 20, 50, 0.95) 0%, rgba(20, 15, 35, 0.95) 100%)',
      border: '1px solid rgba(168, 85, 247, 0.4)',
      borderRadius: '20px',
      padding: '24px',
      marginTop: '20px',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Badge Superior */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.8rem' }}>🎤</span>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#fff', margin: 0 }}>
              Vídeo Karaokê Widescreen
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#c084fc', margin: '2px 0 0 0' }}>
              Playback instrumental + Letra sincronizada na TV
            </p>
          </div>
        </div>
        <span style={{
          backgroundColor: 'rgba(168, 85, 247, 0.2)',
          color: '#d8b4fe',
          border: '1px solid rgba(168, 85, 247, 0.5)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '0.75rem',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Full HD 1080p • 16:9
        </span>
      </div>

      {!hasAccess ? (
        // Estado: Oferta de Compra (Não Pago)
        <div>
          <p style={{ fontSize: '0.95rem', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '18px' }}>
            Transforme a música da sua homenagem em um <strong>show de karaokê na Smart TV</strong>! 
            Removemos a voz da música (mantendo o instrumental original impecável) e colocamos a letra sincronizada na tela 
            com as palavras acendendo em dourado no segundo exato de cantar.
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '18px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valor único promocional</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#34d399' }}>R$ 9,90</span>
                <span style={{ fontSize: '0.85rem', color: '#64748b', textDecoration: 'line-through' }}>R$ 29,90</span>
              </div>
            </div>

            {!pixInfo.qrCode && (
              <button
                type="button"
                onClick={handleGeneratePix}
                disabled={loading}
                className="btn btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #9333ea 0%, #7928ca 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(147, 51, 234, 0.4)'
                }}
              >
                {loading ? 'Gerando PIX...' : '🎤 Quero o Vídeo Karaokê'}
              </button>
            )}
          </div>

          {pixError && (
            <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '12px', textAlign: 'center' }}>
              ⚠️ {pixError}
            </div>
          )}

          {/* Card com o QR Code do PIX */}
          {pixInfo.qrCode && (
            <div style={{
              background: 'rgba(15, 10, 25, 0.9)',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              textAlign: 'center'
            }}>
              <h4 style={{ color: '#fff', fontSize: '1rem', fontWeight: '700', marginBottom: '8px' }}>
                Pague R$ 9,90 via PIX para liberar seu Karaokê
              </h4>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '16px' }}>
                Assim que você pagar, o vídeo karaokê começa a ser gerado automaticamente na hora.
              </p>

              <PixQrCode
                qrCodeText={pixInfo.qrCode}
                size={200}
                onCopied={() => setPixCopied(true)}
                copied={pixCopied}
                style={{ marginBottom: '16px' }}
              />

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(pixInfo.qrCode);
                    setPixCopied(true);
                    setTimeout(() => setPixCopied(false), 3000);
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem', padding: '8px 16px' }}
                >
                  {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX'}
                </button>
              </div>

              {pollingTimedOut && (
                <div style={{ marginTop: '16px', color: '#f59e0b', fontSize: '0.85rem' }}>
                  Ainda não detectamos o pagamento. Já pagou?{' '}
                  <a
                    href={linkWhatsapp(whatsappSuporte, `Olá! Paguei o Vídeo Karaokê do pedido ${orderId} mas ainda não atualizou.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#38bdf8', textDecoration: 'underline' }}
                  >
                    Falar com o suporte no WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // Estado: Recurso Liberado (Pago com Sucesso)
        <div>
          {currentKaraokeUrl ? (
            // Vídeo Pronto
            <div>
              <div style={{
                position: 'relative',
                borderRadius: '14px',
                overflow: 'hidden',
                background: '#000',
                marginBottom: '16px',
                aspectRatio: '16/9',
                boxShadow: '0 8px 25px rgba(0, 0, 0, 0.5)'
              }}>
                <video
                  src={currentKaraokeUrl}
                  poster={order?.coverUrl || undefined}
                  controls
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <a
                  href={currentKaraokeUrl}
                  download={`karaoke_${orderId}.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{
                    flex: '1',
                    minWidth: '200px',
                    padding: '12px 20px',
                    textAlign: 'center',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    borderRadius: '12px',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  ⬇️ Baixar Vídeo Karaokê (Full HD)
                </a>

                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Olha esse vídeo karaokê da nossa música personalizada! 🎤✨ ${currentKaraokeUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  📲 Compartilhar no WhatsApp
                </a>
              </div>
            </div>
          ) : currentKaraokeStatus === 'GERANDO' ? (
            // Vídeo em Processamento
            <div style={{
              textAlign: 'center',
              padding: '30px 20px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '16px',
              border: '1px dashed rgba(168, 85, 247, 0.4)'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px', animation: 'pulse 1.5s infinite' }}>
                🎬
              </div>
              <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '700', marginBottom: '8px' }}>
                Criando o seu Vídeo Karaokê...
              </h4>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem', maxWidth: '450px', margin: '0 auto 16px auto', lineHeight: '1.5' }}>
                Estamos isolando o playback instrumental, sincronizando cada palavra da letra e renderizando o vídeo em Full HD. 
                Leva cerca de 1 a 2 minutos. Esta página atualiza sozinha!
              </p>
              <div style={{
                width: '180px',
                height: '6px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                margin: '0 auto',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: '60%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #9333ea, #38bdf8)',
                  borderRadius: '3px',
                  animation: 'shimmer 2s infinite'
                }} />
              </div>
            </div>
          ) : (
            // Acesso liberado, mas ainda precisa disparar
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <p style={{ color: '#34d399', fontSize: '0.95rem', fontWeight: '600', marginBottom: '12px' }}>
                ✅ Pagamento do Karaokê confirmado!
              </p>
              {generationError && (
                <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '12px' }}>
                  {generationError}
                </p>
              )}
              <button
                type="button"
                onClick={handleTriggerGeneration}
                disabled={isTriggering}
                className="btn btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #9333ea 0%, #7928ca 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  cursor: isTriggering ? 'not-allowed' : 'pointer'
                }}
              >
                {isTriggering ? 'Iniciando...' : '🎬 Iniciar Geração do Karaokê Agora'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
