'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Gift, Sparkles, CheckCircle2, Check, ArrowRight } from 'lucide-react';
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

  // Sincroniza se o pedido já vier com segunda música confirmada
  useEffect(() => {
    if (alreadyPurchased) setSuccess(true);
  }, [alreadyPurchased]);

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
      <section
        className="nx-card"
        style={{
          margin: '32px 0',
          border: '1.5px solid #86efac',
          borderRadius: '21px',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(16, 185, 129, 0.08)',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎉</div>
        <span
          style={{
            display: 'inline-block',
            fontSize: '0.72rem',
            fontWeight: '800',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#15803d',
            background: '#dcfce7',
            padding: '4px 12px',
            borderRadius: '999px',
            marginBottom: '10px',
          }}
        >
          Crédito Promocional Garantido
        </span>
        <h3 style={{ font: '1.8rem/1.25 Georgia, serif', color: '#14532d', margin: '0 0 10px' }}>
          Sua Próxima Música já está Desbloqueada!
        </h3>
        <p style={{ color: '#166534', fontSize: '0.95rem', maxWidth: '540px', margin: '0 auto 22px', lineHeight: 1.6 }}>
          Seu crédito promocional de <strong>R$ 4,99</strong> foi confirmado com sucesso. Ele não tem prazo de validade e você pode criar uma nova música personalizada agora mesmo ou quando desejar.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            className="nx-button nx-primary"
            href={`/criar?novo=1&origem=segunda_musica&orderRef=${encodeURIComponent(orderId)}`}
            style={{
              padding: '14px 28px',
              fontSize: '1rem',
              fontWeight: 'bold',
              background: '#059669',
              borderColor: '#059669',
              color: '#ffffff',
              borderRadius: '12px',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
            }}
          >
            ✨ Criar Minha Próxima Música Agora
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className="nx-card"
      aria-label="Oferta opcional para sua próxima música"
      style={{
        margin: '32px 0',
        border: '1.5px solid #e7d5df',
        borderRadius: '21px',
        background: '#ffffff',
        padding: '30px 28px',
        boxShadow: '0 4px 22px rgba(103, 64, 139, 0.06)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Cabeçalho com narrativa e oferta */}
        <div>
          <span
            className="nx-eyebrow"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f4edf8',
              color: '#67408b',
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: '800',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <><Gift size={14} style={{ color: "#67408b" }} aria-hidden="true" /><span>Presente VIP Pós-Compra · 50% OFF</span></>
          </span>

          <h2
            style={{
              font: '1.85rem/1.25 Georgia, serif',
              color: '#29232d',
              margin: '12px 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Já pensou em quem vai ser a próxima pessoa homenageada?
          </h2>

          <p
            style={{
              color: '#6c636f',
              fontSize: '0.96rem',
              lineHeight: 1.6,
              margin: '0 0 12px',
              maxWidth: '640px',
            }}
          >
            Por ser um cliente especial e ter adquirido o pacote completo, você desbloqueou o direito exclusivo de criar uma{' '}
            <strong style={{ color: '#67408b' }}>segunda música personalizada por apenas R$ 4,99</strong> (mais de 50% de desconto!).
          </p>

          {/* Comparativo de Preço */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '14px 0 8px' }}>
            <span style={{ fontSize: '1.1rem', color: '#8c828f', textDecoration: 'line-through', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>
              R$ 9,99
            </span>
            <span style={{ fontSize: '2.4rem', fontWeight: '850', color: '#059669', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              R$ 4,99
            </span>
            <span style={{ fontSize: '0.74rem', fontWeight: '800', background: '#dcfce7', color: '#15803d', padding: '3px 9px', borderRadius: '6px', letterSpacing: '0.02em' }}>
              ECONOMIZE R$ 5,00
            </span>
          </div>

          <p className="nx-helper" style={{ fontSize: '0.82rem', color: '#534b57', margin: '4px 0 0' }}>
            Compra adicional opcional. A sua música atual já está 100% liberada. Este crédito não tem prazo de validade e fica salvo na sua conta.
          </p>
        </div>

        {/* Bloco de Botão ou PIX */}
        {!pix?.qrCode ? (
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
              type="button"
              className="nx-button nx-primary"
              disabled={busy}
              onClick={handleBuy}
              style={{
                padding: '14px 26px',
                fontSize: '1rem',
                fontWeight: '700',
                borderRadius: '12px',
                cursor: busy ? 'default' : 'pointer',
                background: 'var(--nx-purple, #67408b)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 14px rgba(103, 64, 139, 0.25)',
              }}
            >
              {busy ? 'Gerando PIX de R$ 4,99…' : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><span>Quero 1 música por R$ 4,99</span><Sparkles size={17} aria-hidden="true" /></span>)}
            </button>
            <button
              type="button"
              className="nx-text-button"
              onClick={() => setHidden(true)}
              style={{ color: '#8c828f', fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Agora não
            </button>
          </div>
        ) : (
          <div
            style={{
              marginTop: '10px',
              background: '#faf8f5',
              border: '1.5px solid #e7d5df',
              padding: '22px',
              borderRadius: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#29232d', margin: 0 }}>
                PIX da Oferta Promocional · R$ 4,99
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><CheckCircle2 size={13} aria-hidden="true" /><span>Aprovação imediata</span></span>
              </span>
            </div>

            <p style={{ fontSize: '0.86rem', color: '#6c636f', marginBottom: '14px', lineHeight: 1.5 }}>
              Copie o código abaixo e pague no app do seu banco pelo <strong>PIX Copia e Cola</strong>. Assim que pagar, o crédito é liberado automaticamente:
            </p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="nx-button nx-primary"
                onClick={() => copyPixCode(pix.qrCode)}
                style={{
                  padding: '11px 20px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  borderRadius: '10px',
                  background: 'var(--nx-purple, #67408b)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {pixCopied ? '✅ Código Copiado!' : '📋 Copiar Código PIX'}
              </button>
              <button
                type="button"
                className="nx-button"
                disabled={checking}
                onClick={handleCheckNow}
                style={{
                  padding: '11px 18px',
                  fontSize: '0.9rem',
                  borderRadius: '10px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#29232d',
                  cursor: checking ? 'default' : 'pointer',
                }}
              >
                {checking ? 'Consultando…' : '🔄 Já paguei'}
              </button>
            </div>

            <textarea
              className="nx-pix-code"
              aria-label="Código PIX da compra adicional"
              readOnly
              value={pix.qrCode}
              onClick={(e) => {
                try { e.target.select(); } catch (_) {}
                copyPixCode(pix.qrCode);
              }}
              title="Clique para selecionar e copiar"
              style={{
                width: '100%',
                height: '70px',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                padding: '10px 12px',
                borderRadius: '10px',
                cursor: 'pointer',
                backgroundColor: '#ffffff',
                color: '#29232d',
                border: '1.5px solid #cbd5e1',
                resize: 'none',
              }}
            />

            <details className="nx-details" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e7d5df' }}>
              <summary style={{ color: '#67408b', cursor: 'pointer', fontSize: '0.86rem', fontWeight: '600' }}>
                Ver QR Code para escanear em outro celular
              </summary>
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                <PixQrCode payload={pix.qrCode} size={180} />
              </div>
            </details>
          </div>
        )}
      </div>

      {message && (
        <div style={{ marginTop: '14px' }}>
          <p
            className="nx-message"
            role="status"
            style={{
              fontSize: '0.86rem',
              color: message.startsWith('✅') ? '#059669' : '#dc2626',
              margin: 0,
              padding: '10px 14px',
              borderRadius: '10px',
              background: message.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${message.startsWith('✅') ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {message}
          </p>
        </div>
      )}
    </section>
  );
}
