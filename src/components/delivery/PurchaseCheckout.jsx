'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Zap, CreditCard, Loader2, Copy, CheckCircle2, Landmark } from 'lucide-react';
import PixQrCode from '@/components/PixQrCode';
import { copiarTexto } from '@/lib/copiarTexto';
import PacotesCompactos from './PacotesCompactos';
import { auth } from '@/lib/authClient';
import { requestPixCharge } from '@/lib/pixCheckout';
import { deliveryPackages, formatBrl } from '@/lib/deliveryPackages';
import { getPriceForSku } from '@/lib/pricing';

const MAX_AGE = 55 * 60 * 1000;

export default function PurchaseCheckout({ orderId, promo, onCharge, receiptStatus, onReceipt, onApproved }) {
  const catalog = deliveryPackages();
  // Pré-seleciona por padrão o pacote 'combo' (R$ 16,89 / R$ 16,90 — Música + Vídeo)
  const [selected, setSelected] = useState('combo');
  const [review, setReview] = useState(false);
  const [pix, setPix] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pixCopied, setPixCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [payingCard, setPayingCard] = useState(false);
  const busyRef = useRef(false);
  const panel = useRef(null);
  const summary = useRef(null);
  const attempts = useRef(0);
  const recovery = promo === '24h' || promo === '48h';
  const pack = recovery
    ? { sku: `recovery_combo_${promo}`, label: 'Sua oferta especial', price: getPriceForSku(`recovery_combo_${promo}`), includes: ['2 músicas completas em MP3 HD', 'Vídeo homenagem com fotos'] }
    : catalog.find(item => item.sku === selected) || catalog.find(item => item.sku === 'combo') || catalog[0];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`pixInfo_${orderId}`) || 'null');
      const allowedSku = recovery ? saved?.sku === `recovery_combo_${promo}` : catalog.some(item => item.sku === saved?.sku);
      if (saved?.qrCode && saved.generatedAt && Date.now() - new Date(saved.generatedAt).getTime() < MAX_AGE && allowedSku) {
        setPix(saved);
        setSelected(saved.sku);
        setReview(true);
        onCharge?.(saved);
      }
    } catch {}
    // Catalog and onCharge are derived render values; restore once per order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, promo]);

  useEffect(() => {
    if (review) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [review]);

  useEffect(() => {
    if (!pix?.paymentId) return;
    let stopped = false;
    let timer;
    attempts.current = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(pix.paymentId)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!stopped && response.ok && data.status === 'approved') { onApproved(); return; }
      } catch {}
      if (!stopped && ++attempts.current < 150) timer = setTimeout(poll, 4000);
      else if (!stopped) setMessage('A confirmação do PIX ainda não chegou. O sistema identifica o pagamento automaticamente assim que o banco processar.');
    };
    timer = setTimeout(poll, 4000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [orderId, pix?.paymentId, onApproved]);

  // `skuEscolhido`: quando o PIX é gerado no mesmo toque que escolhe o pacote (lista compacta), o
  // estado `selected` ainda não mudou nesta renderização — o SKU vem direto do toque.
  const generate = async (skuEscolhido) => {
    if (busyRef.current) return;
    const sku = typeof skuEscolhido === 'string' ? skuEscolhido : pack.sku;
    setReview(true);
    if (pix?.qrCode && pix.sku === sku && Date.now() - new Date(pix.generatedAt).getTime() < MAX_AGE) {
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await requestPixCharge({ orderId, sku });
      if (!result.ok) throw new Error(result.error);
      if (!result.data?.paymentId || !result.data?.qrCode) throw new Error('Não foi possível preparar o código PIX. Tente novamente.');
      const charge = { ...result.data, sku, generatedAt: new Date().toISOString() };
      setPix(charge);
      onCharge?.(charge);
      try { localStorage.setItem(`pixInfo_${orderId}`, JSON.stringify(charge)); } catch {}
      // Leva a tela até o código PIX (copiar e colar).
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => panel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
      }
    } catch (failure) {
      setError(failure.message || 'Não foi possível gerar o PIX. Tente novamente.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const check = async () => {
    if (checking || !pix?.paymentId) return;
    setChecking(true);
    setMessage('');
    try {
      const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(pix.paymentId)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('Não foi possível consultar agora.');
      if (data.status === 'approved') onApproved();
      else setMessage('Seu pagamento ainda está sendo processado. Você pode consultar novamente em alguns instantes.');
    } catch {
      setMessage('Falha de conexão. Sua música está salva; tente consultar novamente.');
    } finally {
      setChecking(false);
    }
  };

  const payWithCard = async () => {
    if (busyRef.current || payingCard) return;
    busyRef.current = true;
    setPayingCard(true);
    setError('');
    try {
      const res = await fetch('/api/payments/stripe/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          sku: pack.sku,
          successUrl: typeof window !== 'undefined' ? window.location.origin + '/entrega?orderId=' + encodeURIComponent(orderId) + '&session_id={CHECKOUT_SESSION_ID}&paid=stripe' : undefined,
          cancelUrl: typeof window !== 'undefined' ? window.location.origin + '/entrega?orderId=' + encodeURIComponent(orderId) + '&cancel=stripe' : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data?.error || 'Não foi possível iniciar o pagamento com cartão.');
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err?.message || 'Falha ao conectar com o serviço de pagamento com cartão.');
      setPayingCard(false);
      busyRef.current = false;
    }
  };

  // Toque no pacote = escolhe e já gera o PIX (pedido do dono, 19/11/2026: sem o botão extra).
  const escolherEPagar = sku => {
    if (busy || busyRef.current) return;
    // Tocar de novo no mesmo pacote com PIX ainda válido: reaproveita, não gera outra cobrança.
    if (sku === selected && pix?.qrCode && pix.sku === sku && Date.now() - new Date(pix.generatedAt).getTime() < MAX_AGE) {
      setReview(true);
      panel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      return;
    }
    choose(sku);
    generate(sku);
  };

  const choose = sku => {
    if (busy) return;
    setSelected(sku);
    setReview(false);
    setPix(null);
    setError('');
    setMessage('');
    // A lista compacta (PacotesCompactos) já mostra o botão de pagar logo abaixo: não rola a tela.
  };

  return (
    <section id="pagamento" aria-label="Escolher e comprar seu presente" style={{ marginTop: '32px' }}>
      <div className="nx-section-heading" style={{ marginBottom: '12px' }}>
        <h2 style={{ font: '1.5rem/1.2 var(--nx-display, Georgia, serif)', color: 'var(--nx-ink, #29232d)', margin: '0 0 4px' }}>
          Como você quer emocionar?
        </h2>
        <p style={{ color: 'var(--nx-soft, #6c636f)', fontSize: '0.82rem', margin: 0 }}>
          Todas liberam suas músicas completas, sem corte. Pagamento único, sem assinatura.
        </p>
      </div>

      {!recovery && (
        <PacotesCompactos
          selecionado={selected}
          onSelect={escolherEPagar}
          pagarAoEscolher
          pagando={busy}
          disabled={busy || payingCard}
        />
      )}

      {/* Fora da oferta de recuperação, a lista já é a escolha e o pagamento (tocar = PIX): o card
          "Seu pacote" repetia o pacote e o botão. Ficou só o atalho para cartão. */}
      {!recovery && (
        <button
          type="button"
          onClick={payWithCard}
          disabled={busy || payingCard}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', margin: '10px 0 0', padding: '8px', background: 'transparent', border: 'none', color: 'var(--nx-muted, #4e4653)', fontSize: '0.84rem', fontWeight: 600, textDecoration: 'underline', cursor: (busy || payingCard) ? 'default' : 'pointer' }}
        >
          {payingCard
            ? (<><Loader2 size={15} aria-hidden="true" /> Abrindo checkout seguro…</>)
            : (<><CreditCard size={15} aria-hidden="true" /> Prefere cartão de crédito? Pagar {formatBrl(pack.price)} no cartão</>)}
        </button>
      )}

      {/* Barra de Resumo e Ação de Compra (só na oferta de recuperação, que não mostra a lista) */}
      {recovery && (
      <div
        className="nx-card nx-checkout-summary"
        ref={summary}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#ffffff',
          border: '1.5px solid var(--nx-line, #e7e0e8)',
          borderRadius: '16px',
          padding: '22px 20px',
          margin: '24px 0 16px',
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--nx-purple, #67408b)' }}>
              Seu pacote
            </span>
            <div style={{ fontSize: '1.25rem', color: 'var(--nx-ink, #29232d)', margin: '4px 0 4px', fontWeight: '800' }}>
              <strong>{pack.label}</strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--nx-muted, #4e4653)' }}>
              {pack.includes.join(' · ')}
            </p>
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: '900', color: 'var(--nx-ink, #29232d)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {formatBrl(pack.price)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <button
            type="button"
            className="nx-button nx-primary nx-pay-anim"
            disabled={busy || payingCard}
            onClick={generate}
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              padding: '16px 20px',
              fontSize: '1.05rem',
              fontWeight: '800',
              borderRadius: '14px',
              background: 'var(--nx-pay, #059669)',
              color: '#ffffff',
              border: 'none',
              cursor: (busy || payingCard) ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              minHeight: '52px',
            }}
          >
            {busy ? (<><Loader2 size={18} aria-hidden="true" /><span>Preparando seu PIX…</span></>) : (<><Zap size={18} aria-hidden="true" /><span>Pagar Agora com PIX ({formatBrl(pack.price)})</span><ArrowRight size={18} aria-hidden="true" /></>)}
          </button>

          <button
            type="button"
            className="nx-button"
            disabled={busy || payingCard}
            onClick={payWithCard}
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              padding: '13px 20px',
              fontSize: '0.96rem',
              fontWeight: '700',
              borderRadius: '14px',
              background: '#ffffff',
              color: 'var(--nx-ink, #29232d)',
              border: '1.5px solid var(--nx-line, #cfc6d1)',
              cursor: (busy || payingCard) ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              minHeight: '46px',
            }}
          >
            {payingCard ? (<><Loader2 size={18} aria-hidden="true" /><span>Abrindo checkout seguro…</span></>) : (<><CreditCard size={18} aria-hidden="true" /><span>Pagar com Cartão de Crédito</span></>)}
          </button>
        </div>
      </div>
      )}

      {/* Painel de Checkout / PIX */}
      {review && (
        <div
          className="nx-card nx-checkout-panel"
          id="checkout-panel"
          ref={panel}
          style={{
            marginTop: '22px',
            border: '1.5px solid #e7d5df',
            borderRadius: '21px',
            background: '#ffffff',
            padding: '28px',
            boxShadow: '0 6px 24px rgba(103, 64, 139, 0.08)',
          }}
        >
          <span
            style={{ display: 'inline-block', fontSize: '0.86rem', fontWeight: 700, color: 'var(--nx-purple, #67408b)', marginBottom: '6px' }}
          >
            Pagamento do seu presente
          </span>
          <h2 style={{ font: '1.8rem/1.25 var(--nx-display, Georgia, serif)', color: 'var(--nx-ink, #29232d)', margin: '4px 0 12px' }}>
            {pack.label}
          </h2>

          <ul className="nx-checklist" style={{ padding: 0, margin: '0 0 14px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pack.includes.map(item => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.88rem', color: '#554b5a' }}>
                <span style={{ color: '#059669', fontWeight: 'bold' }}>✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="nx-checkout-total" style={{ fontSize: '1.9rem', fontWeight: '850', color: '#67408b', letterSpacing: '-0.03em', margin: '12px 0 16px' }}>
            {formatBrl(pack.price)}
          </div>

          {error && <p className="nx-message nx-error" role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.88rem' }}>{error}</p>}
          {busy && <p className="nx-message" role="status" style={{ background: '#faf5f8', border: '1px solid #e7d5df', color: '#67408b', padding: '10px 14px', borderRadius: '10px', fontSize: '0.88rem' }}>Preparando seu pagamento…</p>}

          {!pix && !busy && error && (
            <button
              type="button"
              className="nx-button nx-primary"
              onClick={generate}
              style={{ padding: '12px 24px', fontSize: '0.95rem', fontWeight: 'bold', borderRadius: '10px', background: '#67408b', color: '#ffffff', border: 'none', cursor: 'pointer' }}
            >
              Tentar PIX novamente
            </button>
          )}

          {pix?.qrCode && (
            <div style={{ marginTop: '18px', background: '#faf8f5', border: '1.5px solid #e7d5df', padding: '22px', borderRadius: '16px' }}>
              <p className="nx-helper" style={{ fontSize: '0.88rem', color: '#554b5a', margin: '0 0 14px', lineHeight: 1.5 }}>
                Copie o código abaixo, abra o aplicativo do seu banco e escolha <strong>PIX Copia e Cola</strong>. A aprovação é imediata:
              </p>

              <div className="nx-checkout-actions" style={{ marginBottom: '14px' }}>
                <button
                  type="button"
                  className="nx-button nx-primary"
                  onClick={async () => {
                    try {
                      if (typeof navigator !== 'undefined' && navigator.vibrate) {
                        navigator.vibrate([40, 30, 40]);
                      }
                      if (!(await copiarTexto(pix.qrCode))) throw new Error('copia_falhou');
                      setPixCopied(true);
                      setMessage('Código PIX copiado com sucesso! Abra o app do seu banco e escolha PIX Copia e Cola.');
                      setTimeout(() => setPixCopied(false), 4000);
                    } catch {
                      setError('Não foi possível copiar automaticamente. Selecione o código abaixo para copiar manualmente.');
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    fontSize: '1.05rem',
                    fontWeight: '800',
                    borderRadius: '12px',
                    background: 'var(--nx-pay, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: pixCopied
                      ? '0 4px 16px rgba(5, 150, 105, 0.4)'
                      : '0 4px 18px rgba(16, 185, 129, 0.45)',
                                        transition: 'all 0.2s ease',
                  }}
                >
                  {pixCopied ? (<><CheckCircle2 size={20} aria-hidden="true" /><span>Código PIX copiado!</span></>) : (<><Copy size={20} aria-hidden="true" /><span>Copiar código PIX</span></>)}
                </button>
              </div>

              {/* Guia Visual Rápido para Celular */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  margin: '12px 0 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 4px' }}>
                  <div style={{ marginBottom: '4px', color: 'var(--nx-purple, #67408b)' }}><Copy size={18} aria-hidden="true" /></div>
                  <strong style={{ fontSize: '0.72rem', color: '#1e293b', display: 'block', lineHeight: 1.2 }}>1. Copie o Código</strong>
                  <span style={{ fontSize: '0.64rem', color: '#64748b' }}>No botão acima</span>
                </div>
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 4px' }}>
                  <div style={{ marginBottom: '4px', color: 'var(--nx-purple, #67408b)' }}><Landmark size={18} aria-hidden="true" /></div>
                  <strong style={{ fontSize: '0.72rem', color: '#1e293b', display: 'block', lineHeight: 1.2 }}>2. Cole no Banco</strong>
                  <span style={{ fontSize: '0.64rem', color: '#64748b' }}>Pix Copia e Cola</span>
                </div>
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 4px' }}>
                  <div style={{ marginBottom: '4px', color: 'var(--nx-purple, #67408b)' }}><Zap size={18} aria-hidden="true" /></div>
                  <strong style={{ fontSize: '0.72rem', color: '#1e293b', display: 'block', lineHeight: 1.2 }}>3. Volte e Baixe</strong>
                  <span style={{ fontSize: '0.64rem', color: '#64748b' }}>Liberação imediata</span>
                </div>
              </div>

              {/* Botão de Verificação Manual para dar controle ao cliente */}
              <div style={{ marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={check}
                  disabled={checking}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    borderRadius: '10px',
                    backgroundColor: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    color: '#334155',
                    cursor: checking ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  {checking ? 'Consultando confirmação com o banco…' : '🔄 Já fiz o PIX · Verificar liberação agora'}
                </button>
              </div>

              <label className="nx-field" style={{ margin: '10px 0' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--nx-ink, #29232d)' }}>Código PIX Copia e Cola</span>
                <textarea
                  className="nx-pix-code"
                  readOnly
                  value={pix.qrCode}
                  onClick={async (e) => {
                    try { e.target.select(); } catch (_) {}
                    try {
                      if (!(await copiarTexto(pix.qrCode))) throw new Error('copia_falhou');
                      setMessage('Código PIX copiado. Cole no aplicativo do seu banco.');
                    } catch (_) {}
                  }}
                  title="Clique para selecionar e copiar"
                  style={{ width: '100%', height: '70px', fontSize: '0.78rem', fontFamily: 'monospace', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', backgroundColor: '#ffffff', color: 'var(--nx-ink, #29232d)', border: '1.5px solid #cbd5e1', resize: 'none' }}
                />
              </label>

              <details className="nx-details" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e7d5df' }}>
                <summary style={{ color: '#67408b', cursor: 'pointer', fontSize: '0.86rem', fontWeight: '600' }}>
                  Ver QR Code para pagar em outro aparelho
                </summary>
                <div className="nx-pix-qr" style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                  <PixQrCode payload={pix.qrCode} size={180} />
                </div>
              </details>

              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e7d5df', textAlign: 'center' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--nx-soft, #6c636f)' }}>Prefere pagar com Cartão de Crédito? </span>
                <button
                  type="button"
                  onClick={payWithCard}
                  disabled={payingCard || busy}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#67408b',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    textDecoration: 'underline',
                    cursor: (payingCard || busy) ? 'default' : 'pointer',
                    padding: '2px 4px',
                  }}
                >
                  {payingCard ? 'Abrindo Cartão…' : 'Prefere pagar no cartão de crédito?'}
                </button>
              </div>

              {pix.provider === 'static' && (
                <div style={{ marginTop: '16px' }}>
                  <p className="nx-message" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px', borderRadius: '8px', fontSize: '0.84rem' }}>
                    Após pagar este PIX de contingência, envie seu comprovante para conferência.
                  </p>
                  <label className="nx-field" style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>Anexar comprovante</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={receiptStatus === 'uploading'}
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) onReceipt(file);
                      }}
                    />
                  </label>
                  {receiptStatus === 'uploading' && <p role="status" style={{ fontSize: '0.82rem', color: '#67408b' }}>Conferindo seu comprovante…</p>}
                  {receiptStatus === 'failed' && <p className="nx-message nx-error" style={{ fontSize: '0.82rem' }}>Não conseguimos confirmar. Use o suporte no final da página para enviar o comprovante.</p>}
                </div>
              )}
            </div>
          )}

          {message && (
            <p className="nx-message" role="status" style={{ marginTop: '14px', background: message.startsWith('Código PIX') ? '#f0fdf4' : '#faf5f8', border: `1px solid ${message.startsWith('Código PIX') ? '#bbf7d0' : '#e7d5df'}`, color: message.startsWith('Código PIX') ? '#15803d' : '#29232d', padding: '10px 14px', borderRadius: '10px', fontSize: '0.86rem' }}>
              {message}
            </p>
          )}

          <p className="nx-helper" style={{ fontSize: '0.8rem', color: '#8c828f', marginTop: '14px', marginBottom: 0 }}>
            A liberação acontece quando o pagamento é confirmado. Sua música continua salva se você fechar esta página.
          </p>
        </div>
      )}
    </section>
  );
}
