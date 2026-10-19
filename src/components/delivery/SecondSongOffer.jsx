'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { auth, onAuthStateChanged } from '@/lib/authClient';
import PixQrCode from '@/components/PixQrCode';
import OrderClaim from '@/components/account/OrderClaim';

export default function SecondSongOffer({ orderId }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [offer, setOffer] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState(null);
  const [checking, setChecking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [balance, setBalance] = useState(null);
  const [needsClaim, setNeedsClaim] = useState(false);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState('');
  const requestKey = useRef(null);
  const lock = useRef(false);
  const redirect = `/entrega?orderId=${encodeURIComponent(orderId)}`;

  useEffect(() => onAuthStateChanged(auth, current => { setUser(current); setReady(true); setOffer(null); setSuccess(false); setPix(null); setMessage(''); }), []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const response = await fetch('/api/orders/claim', { method: 'POST', headers, body: JSON.stringify({ orderId }) });
        const claim = await response.json().catch(() => ({}));
        if (!response.ok) { if (response.status === 403) setNeedsClaim(true); throw new Error(claim.error || 'Não foi possível verificar seu pedido.'); }
        const res = await fetch(`/api/credits/offer?orderId=${encodeURIComponent(orderId)}`, { headers, cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Oferta indisponível agora.');
        if (!cancelled) setOffer(data);
      } catch (error) { if (!cancelled) setMessage(error.message); }
    };
    load();
    return () => { cancelled = true; };
  }, [user, orderId, retry]);

  const check = async () => {
    if (!pix?.paymentId || lock.current) return;
    lock.current = true; setChecking(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Entre novamente para consultar seu crédito.');
      const res = await fetch(`/api/credits/status?paymentId=${encodeURIComponent(pix.paymentId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível consultar agora.');
      if (data.status === 'approved') { setSuccess(true); setBalance(data.balance); setMessage(''); }
      else setMessage('Ainda aguardando a confirmação do PIX. Sua primeira música continua liberada.');
    } catch (error) { setMessage(error.message); }
    finally { lock.current = false; setChecking(false); }
  };

  useEffect(() => {
    if (!pix?.paymentId || success) return;
    let stopped = false;
    let timer;
    let tries = 0;
    const poll = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/credits/status?paymentId=${encodeURIComponent(pix.paymentId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!stopped && res.ok && data.status === 'approved') { setSuccess(true); setBalance(data.balance); setMessage(''); return; }
      } catch {}
      if (!stopped && ++tries < 150) timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 4000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [pix?.paymentId, success]);

  const buy = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`; return; }
      requestKey.current ||= crypto.randomUUID();
      const response = await fetch('/api/credits/purchase', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ packageSku: 'creditos_pos_compra_1', orderId, requestKey: requestKey.current }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o PIX.');
      if (data.status === 'approved') { setSuccess(true); return; }
      setPix(data);
    } catch (error) { setMessage(error.message); }
    finally { lock.current = false; setBusy(false); }
  };

  if (!ready || hidden || (offer && !offer.eligible && !offer.purchased)) return null;
  if (success || offer?.purchased) return <section className="nx-card"><p className="nx-message nx-success" role="status">Seu crédito para a próxima surpresa já está na carteira.{balance !== null ? ` Saldo: ${balance} crédito(s).` : ''}</p><div className="nx-checkout-actions"><Link className="nx-button nx-primary" href="/criar?novo=1">Criar próxima música</Link><Link className="nx-button" href="/conta">Usar depois</Link></div></section>;
  return <section className="nx-card" aria-label="Oferta opcional para sua próxima música">
    <div className="nx-second-offer" style={{ borderRadius: 14, padding: 20 }}><div><span className="nx-eyebrow">Uma próxima surpresa</span><h2>Já pensou em quem vai ser a próxima?</h2><p>Garanta <strong>1 crédito por R$ 4,99</strong> para sua próxima música. Use quando quiser: seus créditos não vencem.</p><p className="nx-helper">Compra adicional opcional. Sua música já está liberada. Uma utilização por conta elegível; o crédito também serve nos demais produtos da carteira.</p></div><div><div className="nx-offer-amount">R$ 4,99</div>{!user ? <Link className="nx-button nx-primary" href={`/login?redirect=${encodeURIComponent(redirect)}`}>Entrar e consultar oferta</Link> : <button type="button" className="nx-button nx-primary" disabled={busy || !offer?.eligible} onClick={buy}>{busy ? 'Preparando…' : !offer ? 'Verificando oferta…' : 'Confirmar 1 crédito por R$ 4,99'}</button>}<br /><button type="button" className="nx-text-button" onClick={() => setHidden(true)}>Agora não</button></div></div>
    {message && <p className="nx-message" role="status">{message}</p>}
    {needsClaim && user && <OrderClaim orderId={orderId} onClaim={() => { setNeedsClaim(false); setMessage(''); setRetry(value => value + 1); }} />}
    {pix?.qrCode && <><h3 style={{ marginTop: 20 }}>PIX da compra adicional · R$ 4,99</h3><div className="nx-checkout-actions"><button type="button" className="nx-button nx-primary" onClick={async () => { try { await navigator.clipboard.writeText(pix.qrCode); setMessage('Código da compra adicional copiado.'); } catch { setMessage('Selecione o código abaixo para copiar manualmente.'); } }}>Copiar PIX</button><button type="button" className="nx-button" disabled={checking} onClick={check}>{checking ? 'Consultando…' : 'Já paguei o crédito'}</button></div><textarea className="nx-pix-code" aria-label="Código PIX da compra adicional" readOnly value={pix.qrCode} /><details className="nx-details"><summary>Ver QR Code</summary><div className="nx-pix-qr"><PixQrCode payload={pix.qrCode} /></div></details></>}
  </section>;
}
