'use client';

import { useState, useEffect } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import PixQrCode from './PixQrCode';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite do add-on de vídeo

// Add-on "Gerar Playback" (instrumental sem voz, R$ 4,99) — mesmo padrão de pagamento do add-on de
// vídeo em entrega/page.jsx, extraído em componente próprio pra não engordar aquele arquivo (já
// acima do limite de 400 linhas, ver .claude/rules/frontend.md). A elegibilidade (pedido precisa ter
// sunoTaskId/audioIds) é decidida por quem renderiza este componente, não aqui.
//
// Depois de pago, a geração é automática no servidor (src/lib/payments.js:applyPaymentApproval) — o
// `order` vem ao vivo do onSnapshot que a página pai já mantém, então playbackStatus/playbackUrl
// chegam sozinhos quando o webhook da Kie.ai gravar, sem esse componente precisar escutar nada além
// do próprio pagamento.
export default function PlaybackAddonCard({ orderId, order }) {
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const hasAccess = unlocked || order?.hasPlaybackAccess || order?.playbackAddonPaid;

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);

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

  // Polling do pagamento — com cleanup obrigatório (ver .claude/rules/frontend.md).
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

  if (!hasAccess) {
    return (
      <div className="glass-card" style={{ padding: '20px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)', border: '1.5px solid rgba(139, 92, 246, 0.25)', marginTop: '16px' }}>
        {pixInfo.paymentId ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>
              Escaneie pra liberar o Playback (Instrumental)
            </p>
            <PixQrCode payload={pixInfo.qrCode} size={180} />
            {pollingTimedOut && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                Ainda não identificamos o pagamento. Se já pagou, aguarde mais um instante — a confirmação
                pode demorar um pouco.
              </p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: '1rem', marginBottom: '6px', fontFamily: 'var(--font-family-title)' }}>
              🎧 Gerar Playback (Instrumental)
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.4' }}>
              A versão da sua música sem voz, pronta pra cantar junto — por apenas <strong style={{ color: 'var(--success)' }}>R$ 4,99</strong>.
            </p>
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
              {loading ? 'Gerando cobrança...' : 'Gerar Playback — R$ 4,99'}
            </button>
          </div>
        )}
      </div>
    );
  }

  const status = order?.playbackStatus;

  return (
    <div className="glass-card" style={{ padding: '20px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)', border: '1.5px solid rgba(139, 92, 246, 0.25)', marginTop: '16px', textAlign: 'center' }}>
      {status === 'READY' && order?.playbackUrl ? (
        <>
          <h4 style={{ fontSize: '1rem', marginBottom: '10px', fontFamily: 'var(--font-family-title)' }}>
            🎧 Seu Playback está pronto!
          </h4>
          <audio controls src={order.playbackUrl} style={{ width: '100%', marginBottom: '10px' }} />
          <a
            href={order.playbackUrl}
            download={`playback-${order?.orderNumber || orderId}.mp3`}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none' }}
          >
            💾 Baixar Playback
          </a>
        </>
      ) : status === 'FAILED' ? (
        <>
          <p style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>
            Não conseguimos gerar seu playback agora 😕
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Seu pagamento está confirmado — fale com a gente pelo WhatsApp que resolvemos na hora.
          </p>
          <a
            href={`https://wa.me/559491081351?text=${encodeURIComponent(`Olá! Paguei o Playback (Instrumental) do pedido #${orderId} mas não recebi o arquivo.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none' }}
          >
            💬 Chamar no WhatsApp
          </a>
        </>
      ) : (
        <>
          <div style={{ width: '36px', height: '36px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Gerando seu playback instrumental — já aparece por aqui assim que estiver pronto.
          </p>
        </>
      )}
    </div>
  );
}
