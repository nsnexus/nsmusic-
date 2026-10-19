'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PixQrCode from '@/components/PixQrCode';
import { auth } from '@/lib/authClient';
import { requestPixCharge } from '@/lib/pixCheckout';
import { deliveryPackages, formatBrl } from '@/lib/deliveryPackages';
import { getPriceForSku } from '@/lib/pricing';
import OrderClaim from '@/components/account/OrderClaim';

const MAX_AGE = 55 * 60 * 1000;
export default function PurchaseCheckout({ orderId, promo, onCharge, receiptStatus, onReceipt, onApproved }) {
  const catalog = deliveryPackages();
  const [selected, setSelected] = useState('audio_only');
  const [review, setReview] = useState(false);
  const [pix, setPix] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [balance, setBalance] = useState(null);
  const [needsClaim, setNeedsClaim] = useState(false);
  const busyRef = useRef(false);
  const panel = useRef(null);
  const attempts = useRef(0);
  const recovery = promo === '24h' || promo === '48h';
  const pack = recovery ? { sku: `recovery_combo_${promo}`, label: 'Sua oferta especial', price: getPriceForSku(`recovery_combo_${promo}`), includes: ['2 versões completas em MP3', 'Vídeo homenagem com fotos'] } : catalog.find(item => item.sku === selected) || catalog[0];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`pixInfo_${orderId}`) || 'null');
      if (saved?.qrCode && saved.generatedAt && Date.now() - new Date(saved.generatedAt).getTime() < MAX_AGE && (catalog.some(item => item.sku === saved.sku) || saved.sku === `recovery_combo_${promo}`)) {
        setPix(saved); setSelected(saved.sku); setReview(true); onCharge?.(saved);
      }
    } catch {}
    // Catalog and onCharge are derived render values; restore once per order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, promo]);

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
      else if (!stopped) setMessage('A confirmação ainda não chegou. Se você já pagou, use “Já paguei” para consultar novamente.');
    };
    timer = setTimeout(poll, 4000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [orderId, pix?.paymentId, onApproved]);

  const generate = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await requestPixCharge({ orderId, sku: pack.sku });
      if (!result.ok) throw new Error(result.error);
      const charge = { ...result.data, sku: pack.sku, generatedAt: new Date().toISOString() };
      setPix(charge); onCharge?.(charge);
      try { localStorage.setItem(`pixInfo_${orderId}`, JSON.stringify(charge)); } catch {}
    } catch (failure) { setError(failure.message || 'Não foi possível gerar o PIX. Tente novamente.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const check = async () => {
    if (checking || !pix?.paymentId) return;
    setChecking(true); setMessage('');
    try {
      const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(pix.paymentId)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('Não foi possível consultar agora.');
      if (data.status === 'approved') onApproved();
      else setMessage('Seu pagamento ainda está sendo processado. Você pode consultar novamente em alguns instantes.');
    } catch { setMessage('Falha de conexão. Sua música está salva; tente consultar novamente.'); }
    finally { setChecking(false); }
  };
  const useCredits = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { window.location.href = `/login?redirect=${encodeURIComponent(`/entrega?orderId=${orderId}`)}`; return; }
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const claim = await fetch('/api/orders/claim', { method: 'POST', headers, body: JSON.stringify({ orderId }) });
      const claimed = await claim.json().catch(() => ({}));
      if (!claim.ok) { if (claim.status === 403) setNeedsClaim(true); throw new Error(claimed.error || 'Não foi possível verificar seu pedido.'); }
      const account = await fetch('/api/credits/account', { headers, cache: 'no-store' });
      const summary = await account.json().catch(() => ({}));
      if (!account.ok) throw new Error(summary.error || 'Não foi possível consultar o saldo.');
      setBalance(summary.balance);
      if (Number(summary.balance) < pack.credits) throw new Error(`Você tem ${summary.balance} crédito(s). Este pacote precisa de ${pack.credits}. Você também pode pagar com PIX.`);
      const response = await fetch('/api/credits/redeem', { method: 'POST', headers, body: JSON.stringify({ orderId, sku: pack.sku }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error === 'saldo_insuficiente' ? 'Seu saldo mudou. Consulte sua conta e tente novamente.' : result.error || 'Não foi possível usar seus créditos.');
      onApproved();
    } catch (failure) { setError(failure.message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const choose = sku => { if (busy) return; setSelected(sku); setReview(false); setPix(null); setError(''); setMessage(''); setBalance(null); };

  return <section id="pagamento" aria-label="Escolher e comprar seu presente">
    <div className="nx-section-heading"><h2>Como você quer emocionar?</h2><p>Todas as opções incluem as duas versões completas. Pagamento único, sem assinatura.</p></div>
    {!recovery && <><div className="nx-package-grid" role="group" aria-label="Pacotes">{catalog.slice(0, 4).map(item => <button type="button" className="nx-package" key={item.sku} aria-pressed={selected === item.sku} disabled={busy} onClick={() => choose(item.sku)}><span className="nx-eyebrow">{item.eyebrow}</span><strong>{item.label}</strong><span className="nx-package-price">{formatBrl(item.price)}</span><ul>{item.includes.map(line => <li key={line}>{line}</li>)}</ul></button>)}</div><details className="nx-details"><summary>Também quero conhecer a opção com minha voz</summary><p className="nx-helper">Música + minha voz: {formatBrl(catalog[4].price)}. Você envia uma gravação para personalizar o timbre após a compra. Este pacote não inclui carta, vídeo ou retrospectiva.</p><button type="button" className="nx-button" disabled={busy} onClick={() => choose('combo_voz')}>Escolher música + minha voz</button></details></>}
    <div className="nx-card nx-checkout-summary"><div><strong>{pack.label} · {formatBrl(pack.price)}</strong><p>{pack.includes.join(' · ')}</p></div><button type="button" className="nx-button nx-primary" disabled={busy} onClick={() => { setReview(true); setTimeout(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); }}>Revisar meu presente →</button></div>
    {review && <div className="nx-card nx-checkout-panel" ref={panel}>
      <span className="nx-eyebrow">Confira seu presente</span><h2>{pack.label}</h2><ul className="nx-checklist">{pack.includes.map(item => <li key={item}>{item}</li>)}</ul><div className="nx-checkout-total">{formatBrl(pack.price)}</div>
      {error && <p className="nx-message nx-error" role="alert">{error}</p>}
      {busy && <p className="nx-message" role="status">Preparando seu pagamento…</p>}
      {!pix && <div className="nx-checkout-actions"><button type="button" className="nx-button nx-primary" disabled={busy} onClick={generate}>Gerar PIX de {formatBrl(pack.price)}</button>{!recovery && <button type="button" className="nx-button" disabled={busy} onClick={useCredits}>Confirmar uso de {pack.credits} crédito(s)</button>}</div>}
      {balance !== null && <p className="nx-helper">Saldo consultado: {balance} crédito(s). Créditos não vencem. <Link href="/conta">Minha conta</Link></p>}
      {needsClaim && <OrderClaim orderId={orderId} onClaim={() => { setNeedsClaim(false); setError(''); setMessage('Pedido vinculado. Você já pode confirmar o uso dos créditos.'); }} />}
      {pix?.qrCode && <><p className="nx-helper">Copie o código, abra o aplicativo do seu banco e escolha PIX Copia e Cola. Depois de pagar, volte para esta página.</p><div className="nx-checkout-actions"><button type="button" className="nx-button nx-primary" onClick={async () => { try { await navigator.clipboard.writeText(pix.qrCode); setMessage('Código PIX copiado. Cole no aplicativo do seu banco.'); } catch { setError('Não foi possível copiar. Selecione o código abaixo para copiar manualmente.'); } }}>Copiar código PIX</button><button type="button" className="nx-button" onClick={check} disabled={checking}>{checking ? 'Consultando…' : 'Já paguei'}</button></div><label className="nx-field"><span>Código PIX Copia e Cola</span><textarea className="nx-pix-code" readOnly value={pix.qrCode} /></label><details className="nx-details"><summary>Ver QR Code para pagar em outro aparelho</summary><div className="nx-pix-qr"><PixQrCode payload={pix.qrCode} /></div></details>{pix.provider === 'static' && <><p className="nx-message">Após pagar este PIX de contingência, envie seu comprovante para conferência.</p><label className="nx-field"><span>Anexar comprovante</span><input type="file" accept="image/*,application/pdf" disabled={receiptStatus === 'uploading'} onChange={event => { const file = event.target.files?.[0]; if (file) onReceipt(file); }} /></label>{receiptStatus === 'uploading' && <p role="status">Conferindo seu comprovante…</p>}{receiptStatus === 'failed' && <p className="nx-message nx-error">Não conseguimos confirmar. Use o suporte no final da página para enviar o comprovante.</p>}</>}</>}
      {message && <p className="nx-message" role="status">{message}</p>}
      <p className="nx-helper">A liberação acontece quando o pagamento é confirmado. Sua música continua salva se você fechar esta página.</p>
    </div>}
  </section>;
}
