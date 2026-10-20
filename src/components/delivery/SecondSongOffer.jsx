'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PixQrCode from '@/components/PixQrCode';

export default function SecondSongOffer({ orderId, order }) {
  const hasVideo = Boolean(order?.hasVideoAccess || order?.videoAddonPaid || order?.videoUrl || order?.has_video_access);
  const paidAmount = Number(order?.paidAmount || order?.expectedAmount || order?.extras?.paidAmount || order?.extras?.expectedAmount || 0);
  const isEligibleOrder = Boolean(hasVideo || paidAmount >= 16.89);

  // Já possui segunda música paga?
  const alreadyPurchased = Boolean(
    order?.hasSecondSongAccess ||
    order?.secondSongPaid ||
    order?.extras?.hasSecondSongAccess ||
    order?.extras?.secondSongPaid
  );

  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [success, setSuccess] = useState(alreadyPurchased);
  const [message, setMessage] = useState('');
  const lock = useRef(false);

  // Polling automático do PIX da segunda música
  useEffect(() => {
    if (!pix?.paymentId || success) return;
    let stopped = false;
    let timer;
    let tries = 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(pix.paymentId)}`, {
          cache: 'no-store'
        });
        const data = await res.json().catch(() => ({}));
        if (!stopped && (data.status === 'approved' || data.isApproved || data.order?.hasSecondSongAccess || data.order?.secondSongPaid)) {
          setSuccess(true);
          setMessage('');
          return;
        }
      } catch {}
      if (!stopped && ++tries < 120) {
        timer = setTimeout(poll, 3500);
      }
    };

    timer = setTimeout(poll, 3500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pix?.paymentId, success, orderId]);

  const copyPixCode = async (code) => {
    if (!code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setPixCopied(true);
      setMessage('✅ Código PIX copiado com sucesso!');
      setTimeout(() => setPixCopied(false), 3000);
    } catch {
      setMessage('Selecione o código abaixo para copiar manualmente.');
    }
  };

  const handleBuy = async () => {
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          sku: 'segunda_musica',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível gerar a chave PIX agora. Tente novamente.');
      }

      if (data.status === 'approved') {
        setSuccess(true);
        return;
      }

      setPix(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const handleCheckNow = async () => {
    if (!pix?.paymentId || checking) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(pix.paymentId)}`, {
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === 'approved' || data.isApproved || data.order?.hasSecondSongAccess || data.order?.secondSongPaid) {
        setSuccess(true);
        setMessage('');
      } else {
        setMessage('⏳ Pagamento ainda não identificado. Se acabou de pagar, aguarde alguns instantes...');
      }
    } catch (error) {
      setMessage(error.message || 'Erro ao consultar status.');
    } finally {
      setChecking(false);
    }
  };

  if (hidden || (order && !isEligibleOrder)) {
    return null;
  }

  if (success) {
    return (
      <section className="nx-card" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 78, 59, 0.25) 100%)', border: '1px solid #10b981', borderRadius: '14px', padding: '24px', textAlign: 'center', margin: '24px 0' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎉</div>
        <h3 style={{ color: '#10b981', fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px' }}>
          Oferta de Segunda Música Confirmada!
        </h3>
        <p style={{ color: '#e2e8f0', fontSize: '0.95rem', marginBottom: '18px', lineHeight: 1.5 }}>
          Seu crédito promocional de <strong>R$ 4,99</strong> já está garantido. Você pode criar uma nova música personalizada agora mesmo ou quando quiser!
        </p>
        <div className="nx-checkout-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            className="nx-button nx-primary btn btn-primary"
            href={`/criar?novo=1&origem=segunda_musica&orderRef=${encodeURIComponent(orderId)}`}
            style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', textDecoration: 'none' }}
          >
            ✨ Criar Minha Próxima Música Agora
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="nx-card" aria-label="Oferta opcional para sua próxima música" style={{ margin: '24px 0', border: '1px solid rgba(236, 72, 153, 0.35)', borderRadius: '14px', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(30, 15, 45, 0.8) 0%, rgba(15, 10, 25, 0.95) 100%)' }}>
      <div className="nx-second-offer" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <span className="nx-eyebrow" style={{ color: '#ec4899', fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🎁 Oferta VIP Pós-Compra
          </span>
          <h2 style={{ color: '#ffffff', fontSize: '1.35rem', fontWeight: '800', marginTop: '6px', marginBottom: '10px' }}>
            Já pensou em quem vai ser a próxima pessoa homenageada?
          </h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.92rem', lineHeight: 1.5, marginBottom: '8px' }}>
            Por ser um cliente especial e ter adquirido o pacote completo, você desbloqueou o direito de criar uma <strong style={{ color: '#34d399' }}>segunda música por apenas R$ 4,99</strong> (mais de 50% de desconto!).
          </p>
          <p className="nx-helper" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Compra adicional opcional. A sua música atual já está 100% liberada. Este crédito não tem prazo de validade.
          </p>
        </div>

        <div>
          <div className="nx-offer-amount" style={{ fontSize: '1.6rem', fontWeight: '900', color: '#34d399', marginBottom: '12px' }}>
            R$ 4,99
          </div>
          
          {!pix?.qrCode ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="nx-button nx-primary btn btn-primary"
                disabled={busy}
                onClick={handleBuy}
                style={{ padding: '12px 20px', fontSize: '0.95rem', fontWeight: 'bold', cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? 'Gerando PIX de R$ 4,99...' : '✨ Quero 1 Música por R$ 4,99'}
              </button>
              <button
                type="button"
                className="nx-text-button"
                onClick={() => setHidden(true)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Agora não
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '16px', background: 'rgba(0, 0, 0, 0.3)', padding: '16px', borderRadius: '10px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
                PIX da Oferta Promocional · R$ 4,99
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '12px' }}>
                Copie o código abaixo ou clique diretamente nele para pagar pelo aplicativo do seu banco:
              </p>

              <div className="nx-checkout-actions" style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="nx-button nx-primary btn btn-primary"
                  onClick={() => copyPixCode(pix.qrCode)}
                  style={{ padding: '10px 18px', fontSize: '0.88rem', fontWeight: 'bold' }}
                >
                  {pixCopied ? '✅ Código Copiado!' : '📋 Copiar Código PIX'}
                </button>
                <button
                  type="button"
                  className="nx-button btn"
                  disabled={checking}
                  onClick={handleCheckNow}
                  style={{ padding: '10px 16px', fontSize: '0.88rem' }}
                >
                  {checking ? 'Consultando...' : '🔄 Já paguei'}
                </button>
              </div>

              <textarea
                className="nx-pix-code"
                aria-label="Código PIX da compra adicional"
                readOnly
                value={pix.qrCode}
                onClick={(e) => {
                  e.target.select();
                  copyPixCode(pix.qrCode);
                }}
                title="Clique para selecionar e copiar"
                style={{ width: '100%', height: '80px', fontSize: '0.78rem', padding: '8px', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#0f172a', color: '#38bdf8', border: '1px solid #334155' }}
              />

              <details className="nx-details" style={{ marginTop: '12px' }}>
                <summary style={{ color: '#a78bfa', cursor: 'pointer', fontSize: '0.85rem' }}>Ver QR Code na tela</summary>
                <div className="nx-pix-qr" style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
                  <PixQrCode payload={pix.qrCode} />
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div style={{ padding: '0 24px 16px' }}>
          <p className="nx-message" role="status" style={{ fontSize: '0.85rem', color: message.startsWith('✅') ? '#34d399' : '#f87171', margin: 0 }}>
            {message}
          </p>
        </div>
      )}
    </section>
  );
}
