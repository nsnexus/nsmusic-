'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Music, Mail, Film, Sparkles, Mic, Crown, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import PixQrCode from '@/components/PixQrCode';
import { auth } from '@/lib/authClient';
import { requestPixCharge } from '@/lib/pixCheckout';
import { deliveryPackages, formatBrl } from '@/lib/deliveryPackages';
import { getPriceForSku } from '@/lib/pricing';

const MAX_AGE = 55 * 60 * 1000;

const PACKAGE_METADATA = {
  audio_only: {
    icon: Music,
    tagline: 'Essencial em MP3 HD',
    tagColor: '#059669',
    tagBg: '#dcfce7',
  },
  combo_carta: {
    icon: Mail,
    tagline: 'Com Carta Virtual',
    tagColor: '#be185d',
    tagBg: '#fce7f3',
  },
  combo: {
    icon: Film,
    tagline: 'Economize R$ 6,90 no vídeo',
    tagColor: '#15803d',
    tagBg: '#dcfce7',
    badge: 'Mais Escolhido',
    badgeIcon: Crown,
    featured: true,
  },
  combo_retrospectiva: {
    icon: Sparkles,
    tagline: 'Vídeo + Carta + Linha do Tempo',
    tagColor: '#b45309',
    tagBg: '#fef3c7',
  },
  combo_voz: {
    icon: Mic,
    tagline: 'Voz Clonada por IA',
    tagColor: '#4338ca',
    tagBg: '#e0e7ff',
    badge: 'NOVO',
    badgeIcon: Sparkles,
  },
};

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
  const attempts = useRef(0);
  const recovery = promo === '24h' || promo === '48h';
  const pack = recovery
    ? { sku: `recovery_combo_${promo}`, label: 'Sua oferta especial', price: getPriceForSku(`recovery_combo_${promo}`), includes: ['2 versões completas em MP3', 'Vídeo homenagem com fotos'] }
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

  const generate = async () => {
    if (busyRef.current) return;
    setReview(true);
    if (pix?.qrCode && pix.sku === pack.sku && Date.now() - new Date(pix.generatedAt).getTime() < MAX_AGE) {
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await requestPixCharge({ orderId, sku: pack.sku });
      if (!result.ok) throw new Error(result.error);
      if (!result.data?.paymentId || !result.data?.qrCode) throw new Error('Não foi possível preparar o código PIX. Tente novamente.');
      const charge = { ...result.data, sku: pack.sku, generatedAt: new Date().toISOString() };
      setPix(charge);
      onCharge?.(charge);
      try { localStorage.setItem(`pixInfo_${orderId}`, JSON.stringify(charge)); } catch {}
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

  const choose = sku => {
    if (busy) return;
    setSelected(sku);
    setReview(false);
    setPix(null);
    setError('');
    setMessage('');
  };

  return (
    <section id="pagamento" aria-label="Escolher e comprar seu presente" style={{ marginTop: '32px' }}>
      <div className="nx-section-heading" style={{ marginBottom: '22px' }}>
        <h2 style={{ font: '1.9rem/1.2 Georgia, serif', color: '#29232d', margin: '0 0 8px' }}>
          Como você quer emocionar?
        </h2>
        <p style={{ color: '#6c636f', fontSize: '0.96rem', margin: 0 }}>
          Todas as opções incluem as duas versões completas em áudio MP3 HD. Pagamento único via PIX, sem assinatura.
        </p>
      </div>

      {!recovery && (
        <>
          <div className="nx-package-grid" role="group" aria-label="Pacotes">
            {catalog.slice(0, 4).map(item => {
              const isSelected = selected === item.sku;
              const meta = PACKAGE_METADATA[item.sku] || {};
              const MetaIcon = meta.icon;
              const isCombo = item.sku === 'combo';

              return (
                <button
                  type="button"
                  className={`nx-package${isCombo ? ' nx-package-featured' : ''}`}
                  key={item.sku}
                  aria-pressed={isSelected}
                  disabled={busy}
                  onClick={() => choose(item.sku)}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    padding: isCombo ? '44px 18px 20px' : '22px 18px 20px',
                    borderRadius: '20px',
                    border: isSelected
                      ? '2px solid #67408b'
                      : (isCombo ? '1.5px solid #d4bfe0' : '1.5px solid #e7d5df'),
                    background: isSelected
                      ? (isCombo ? '#faf5f8' : '#fcfaff')
                      : (isCombo ? '#faf7f9' : '#ffffff'),
                    boxShadow: isSelected
                      ? '0 10px 28px rgba(103, 64, 139, 0.18)'
                      : (isCombo ? '0 4px 18px rgba(103, 64, 139, 0.08)' : '0 2px 8px rgba(0, 0, 0, 0.02)'),
                    cursor: busy ? 'default' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  {/* Badge de Destaque para o Combo */}
                  {isCombo && (
                    <span
                      className="nx-package-badge"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: '14px',
                        right: '14px',
                        background: 'linear-gradient(90deg, #67408b 0%, #8b5cf6 100%)',
                        color: '#ffffff',
                        borderRadius: '0 0 10px 10px',
                        padding: '5px 12px',
                        fontSize: '0.68rem',
                        fontWeight: '800',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        boxShadow: '0 3px 10px rgba(103, 64, 139, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                      }}
                    >
                      <Crown size={12} aria-hidden="true" />
                      <span>Mais Escolhido</span>
                    </span>
                  )}

                  {/* Seletor Radio Circle com SVG */}
                  <div
                    style={{
                      position: 'absolute',
                      top: isCombo ? '38px' : '18px',
                      right: '16px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      border: isSelected ? '2px solid #67408b' : '2px solid #cbd5e1',
                      backgroundColor: isSelected ? '#67408b' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 0 0 3px rgba(103, 64, 139, 0.15)' : 'none',
                    }}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  <div>
                    {/* Eyebrow */}
                    <span
                      className="nx-eyebrow"
                      style={{
                        display: 'block',
                        fontSize: '0.68rem',
                        fontWeight: '800',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: isSelected ? '#67408b' : '#8c828f',
                        marginBottom: '4px',
                      }}
                    >
                      {item.eyebrow}
                    </span>

                    {/* Nome do Pacote com Ícone */}
                    <strong
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '1.08rem',
                        color: '#29232d',
                        margin: '2px 0 6px',
                        fontWeight: '800',
                        lineHeight: 1.25,
                      }}
                    >
                      {MetaIcon && <MetaIcon size={18} style={{ color: isSelected ? '#67408b' : '#524a56', flexShrink: 0 }} aria-hidden="true" />}
                      <span>{item.label}</span>
                    </strong>

                    {/* Tagline / Economia */}
                    {meta.tagline && (
                      <div
                        style={{
                          display: 'inline-block',
                          fontSize: '0.68rem',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: meta.tagBg || '#f4edf8',
                          color: meta.tagColor || '#67408b',
                          marginBottom: '10px',
                        }}
                      >
                        {meta.tagline}
                      </div>
                    )}

                    {/* Preço */}
                    <span
                      className="nx-package-price"
                      style={{
                        display: 'block',
                        fontSize: '1.75rem',
                        fontWeight: '850',
                        color: isSelected ? '#67408b' : '#29232d',
                        letterSpacing: '-0.035em',
                        margin: '4px 0 14px',
                      }}
                    >
                      {formatBrl(item.price)}
                    </span>
                  </div>

                  {/* Lista de Recursos Inclusos */}
                  <ul
                    style={{
                      padding: 0,
                      margin: 0,
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px',
                      borderTop: '1px solid #ede6f0',
                      paddingTop: '12px',
                    }}
                  >
                    {item.includes.map(line => (
                      <li
                        key={line}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '6px',
                          fontSize: '0.79rem',
                          color: '#554b5a',
                          lineHeight: 1.35,
                        }}
                      >
                        <span style={{ color: '#059669', fontWeight: 'bold', fontSize: '0.82rem', flexShrink: 0, marginTop: '-1px' }}>
                          ✓
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* Opção VIP: Clonagem de Voz */}
          <details
            className="nx-details"
            style={{
              marginTop: '18px',
              padding: '16px 20px',
              background: '#faf5f8',
              borderRadius: '16px',
              border: '1.5px solid #e7d5df',
            }}
          >
            <summary style={{ cursor: 'pointer', fontSize: '0.92rem', fontWeight: '700', color: '#67408b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mic size={17} aria-hidden="true" />
              <span>Também quero conhecer a opção com minha voz</span>
            </summary>
            <div style={{ marginTop: '10px' }}>
              <p className="nx-helper" style={{ margin: '0 0 12px', fontSize: '0.86rem', color: '#6c636f', lineHeight: 1.5 }}>
                Música + minha voz: <strong>{formatBrl(catalog[4].price)}</strong>. Você envia uma gravação de áudio de 30 segundos no WhatsApp após a compra para nossa IA clonar seu timbre cantando afinado. Este pacote não inclui carta, vídeo ou retrospectiva.
              </p>
              <button
                type="button"
                className="nx-button"
                disabled={busy}
                onClick={() => choose('combo_voz')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  fontWeight: '600',
                  background: selected === 'combo_voz' ? '#67408b' : '#ffffff',
                  color: selected === 'combo_voz' ? '#ffffff' : '#67408b',
                  border: '1.5px solid #67408b',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                {selected === 'combo_voz' ? '✓ Música + minha voz selecionado' : 'Escolher música + minha voz'}
              </button>
            </div>
          </details>
        </>
      )}

      {/* Barra de Resumo e Ação de Compra */}
      <div
        className="nx-card nx-checkout-summary"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          background: '#faf5f8',
          border: '1.5px solid #e7d5df',
          borderRadius: '18px',
          padding: '20px 24px',
          margin: '22px 0 16px',
          flexWrap: 'wrap',
          boxShadow: '0 4px 18px rgba(103, 64, 139, 0.06)',
        }}
      >
        <div>
          <span style={{ fontSize: '0.72rem', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#67408b' }}>
            Pacote Selecionado
          </span>
          <div style={{ font: '1.25rem/1.2 Georgia, serif', color: '#29232d', margin: '2px 0 4px', fontWeight: '700' }}>
            <strong>{pack.label} · {formatBrl(pack.price)}</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#6c636f' }}>
            {pack.includes.join(' · ')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="nx-button nx-primary"
            disabled={busy || payingCard}
            onClick={generate}
            style={{
              padding: '14px 26px',
              fontSize: '1rem',
              fontWeight: '700',
              borderRadius: '12px',
              background: 'var(--nx-purple, #67408b)',
              color: '#ffffff',
              border: 'none',
              cursor: (busy || payingCard) ? 'default' : 'pointer',
              boxShadow: '0 4px 14px rgba(103, 64, 139, 0.25)',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {busy ? 'Preparando seu PIX…' : (<><span style={{ marginRight: '6px' }}>Pagar Agora</span><ArrowRight size={18} aria-hidden="true" /></>)}
          </button>
        </div>
      </div>

      {/* Painel de Checkout / PIX */}
      {review && (
        <div
          className="nx-card nx-checkout-panel"
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
            className="nx-eyebrow"
            style={{
              display: 'inline-block',
              fontSize: '0.72rem',
              fontWeight: '800',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#67408b',
              marginBottom: '6px',
            }}
          >
            Pagamento do seu presente
          </span>
          <h2 style={{ font: '1.8rem/1.25 Georgia, serif', color: '#29232d', margin: '4px 0 12px' }}>
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
                      await navigator.clipboard.writeText(pix.qrCode);
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
                    background: pixCopied
                      ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {pixCopied ? '✅ Código PIX copiado!' : '📋 Copiar código PIX'}
                </button>
              </div>

              <label className="nx-field" style={{ margin: '10px 0' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#29232d' }}>Código PIX Copia e Cola</span>
                <textarea
                  className="nx-pix-code"
                  readOnly
                  value={pix.qrCode}
                  onClick={async (e) => {
                    try { e.target.select(); } catch (_) {}
                    try {
                      await navigator.clipboard.writeText(pix.qrCode);
                      setMessage('Código PIX copiado. Cole no aplicativo do seu banco.');
                    } catch (_) {}
                  }}
                  title="Clique para selecionar e copiar"
                  style={{ width: '100%', height: '70px', fontSize: '0.78rem', fontFamily: 'monospace', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', backgroundColor: '#ffffff', color: '#29232d', border: '1.5px solid #cbd5e1', resize: 'none' }}
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
