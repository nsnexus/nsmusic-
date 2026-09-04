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
  const [pixCopied, setPixCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  // Faixa escolhida pelo cliente — achado 04/09/2026: a separação vocal da Kie.ai pode falhar numa
  // faixa específica mesmo com a música tocando normal, sem alternativa antes disso. `audioIds` só
  // tem mais de 1 item em pedidos gerados depois desse recurso existir (ver docs/audit e o plano do
  // add-on) — pedidos antigos simplesmente não mostram o seletor e usam a faixa 0 direto.
  const faixas = Array.isArray(order?.audioIds) ? order.audioIds : [];
  const arquivosFaixas = Array.isArray(order?.audioFiles) ? order.audioFiles : [];
  const temEscolha = faixas.length > 1;
  const [faixaEscolhida, setFaixaEscolhida] = useState(0);
  const [faixaRetry, setFaixaRetry] = useState(0);

  const handleRetry = async () => {
    if (!orderId) return;
    setRetrying(true);
    setRetryError('');
    try {
      const res = await fetch('/api/playback/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, audioId: faixas[faixaRetry] || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRetryError(data.error || 'Não foi possível tentar de novo agora.');
      }
      // Sucesso não precisa de estado local: o onSnapshot da página pai atualiza `order.playbackStatus`
      // pra PROCESSING assim que a rota grava no Firestore.
    } catch (e) {
      setRetryError('Erro de conexão. Tente novamente.');
    }
    setRetrying(false);
  };

  const hasAccess = unlocked || order?.hasPlaybackAccess || order?.playbackAddonPaid;

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);

    // Salva a faixa escolhida ANTES de cobrar — se falhar, segue mesmo assim (o servidor cai pra
    // faixa 0 por padrão, nunca bloqueia o pagamento por causa disso).
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
            <PixQrCode payload={pixInfo.qrCode} size={180} label="QR Code para pagamento do Playback via PIX" />
            <div style={{ margin: '12px 0 10px', textAlign: 'left' }}>
              <label htmlFor="pix-copia-cola-playback" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
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
            {temEscolha && (
              <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: '700', marginBottom: '8px', textAlign: 'center' }}>
                  Qual das 2 versões você quer transformar em playback?
                </p>
                {faixas.map((id, i) => (
                  <label
                    key={id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px',
                      border: `1.5px solid ${faixaEscolhida === i ? 'var(--primary)' : 'var(--border-color)'}`,
                      marginBottom: '8px', cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="playback-faixa"
                      checked={faixaEscolhida === i}
                      onChange={() => setFaixaEscolhida(i)}
                    />
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', minWidth: '58px' }}>Faixa {i + 1}</span>
                    {arquivosFaixas[i] && (
                      <audio controls src={arquivosFaixas[i]} style={{ flex: 1, height: '32px' }} />
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
            Seu pagamento está confirmado. Pode tentar gerar de novo, ou falar com a gente pelo WhatsApp.
          </p>
          {temEscolha && (
            <div style={{ marginBottom: '14px', textAlign: 'left' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: '700', marginBottom: '8px', textAlign: 'center' }}>
                Tentar com qual faixa?
              </p>
              {faixas.map((id, i) => (
                <label
                  key={id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '8px',
                    border: `1.5px solid ${faixaRetry === i ? 'var(--primary)' : 'var(--border-color)'}`,
                    marginBottom: '6px', cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="playback-faixa-retry"
                    checked={faixaRetry === i}
                    onChange={() => setFaixaRetry(i)}
                  />
                  <span style={{ fontSize: '0.78rem', fontWeight: '600', minWidth: '52px' }}>Faixa {i + 1}</span>
                  {arquivosFaixas[i] && (
                    <audio controls src={arquivosFaixas[i]} style={{ flex: 1, height: '30px' }} />
                  )}
                </label>
              ))}
            </div>
          )}
          {retryError && (
            <p style={{ fontSize: '0.78rem', color: 'var(--error, #ef4444)', marginBottom: '10px' }}>{retryError}</p>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.7 : 1 }}
            >
              {retrying ? 'Tentando...' : '🔁 Tentar gerar novamente'}
            </button>
            <a
              href={`https://wa.me/559491081351?text=${encodeURIComponent(`Olá! Paguei o Playback (Instrumental) do pedido #${orderId} mas não recebi o arquivo.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none' }}
            >
              💬 Chamar no WhatsApp
            </a>
          </div>
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
