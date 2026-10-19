'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { auth, onAuthStateChanged, signOut } from '@/lib/authClient';
import { CREDIT_PACKAGES } from '@/lib/pricing';
import { formatBrl } from '@/lib/deliveryPackages';
import ReferralCard from '@/components/account/ReferralCard';
import PixQrCode from '@/components/PixQrCode';

export default function ContaPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState('musicas');
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersPage, setOrdersPage] = useState(0);
  const [ordersMore, setOrdersMore] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [pix, setPix] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestKey = useRef(null);
  const purchaseLock = useRef(false);

  useEffect(() => {
    return onAuthStateChanged(auth, current => { setUser(current); setAuthReady(true); setAccount(null); setOrders([]); setPix(null); });
  }, []);

  const load = useCallback(async (activeTab, page = 0) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    setLoading(true); setError('');
    try {
      const route = activeTab === 'musicas' ? '/api/orders/my-orders' : '/api/credits/account';
      const response = await fetch(`${route}?page=${page}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar sua conta.');
      if (activeTab === 'musicas') {
        setOrders(previous => page ? [...previous, ...(data.orders || [])] : data.orders || []);
        setOrdersMore(data.hasMore); setOrdersPage(page);
      } else {
        setAccount(previous => page ? { ...data, ledger: [...(previous?.ledger || []), ...data.ledger] } : data);
        setLedgerPage(page);
      }
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user && tab !== 'indicacoes') load(tab); }, [user, tab, load]);

  const checkCredits = useCallback(async (automatic = false) => {
    if (!pix?.paymentId) return;
    if (!automatic) setChecking(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const response = await fetch(`/api/credits/status?paymentId=${encodeURIComponent(pix.paymentId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o pagamento.');
      if (data.status === 'approved') { setPix(null); requestKey.current = null; setMessage('Pagamento confirmado. Seus créditos foram adicionados.'); await load('creditos'); }
      else if (!automatic) setMessage('Ainda aguardando a confirmação do PIX.');
    } catch (failure) { if (!automatic) setError(failure.message); }
    finally { if (!automatic) setChecking(false); }
  }, [pix?.paymentId, load]);

  useEffect(() => {
    if (!pix?.paymentId) return;
    let tries = 0;
    const timer = setInterval(() => { if (++tries > 150) clearInterval(timer); else checkCredits(true); }, 4000);
    return () => clearInterval(timer);
  }, [pix?.paymentId, checkCredits]);

  const buy = async sku => {
    if (purchaseLock.current) return;
    purchaseLock.current = true; setBuying(true); setError(''); setMessage('');
    try {
      const token = await auth.currentUser?.getIdToken();
      requestKey.current ||= { sku, key: crypto.randomUUID() };
      if (requestKey.current.sku !== sku) requestKey.current = { sku, key: crypto.randomUUID() };
      const response = await fetch('/api/credits/purchase', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ packageSku: sku, requestKey: requestKey.current.key }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o PIX.');
      if (data.status === 'approved') { setMessage('Esta compra já foi confirmada. Seu saldo está atualizado.'); requestKey.current = null; await load('creditos'); }
      else setPix(data);
    } catch (failure) { setError(failure.message); }
    finally { purchaseLock.current = false; setBuying(false); }
  };

  return <div className="nx-experience">
    <header className="nx-header"><div className="nx-header-inner"><Link href="/" className="nx-brand"><Image src="/logo.png" alt="NS Music" width={44} height={44} priority /><span>Histórias que viram música.</span></Link>{user ? <button type="button" className="nx-text-button" onClick={() => signOut(auth)}>Sair da conta</button> : <Link href="/criar" className="nx-account-link">Criar música</Link>}</div></header>
    <main className="nx-delivery-main">
      {!authReady ? <p className="nx-message" role="status">Carregando sua conta…</p> : !user ? <section className="nx-card nx-login-card"><Image src="/experiencia/familia.webp" alt="" width={640} height={426} sizes="(max-width: 640px) 85vw, 420px" /><span className="nx-eyebrow">Seu lugar de guardar emoções</span><h1>Suas músicas.<br />Suas próximas histórias.</h1><p>Entre com Google ou e-mail para guardar músicas, usar créditos e acompanhar suas indicações.</p><Link className="nx-button nx-primary" href="/login?redirect=%2Fconta">Entrar ou criar minha conta</Link><p className="nx-helper">Você continua podendo criar, ouvir a prévia e pagar sem cadastro. Para guardar uma compra visitante, entre pela página do pedido no aparelho onde ele foi criado.</p></section> : <>
        <span className="nx-eyebrow">Minha conta</span><h1>Seu próximo presente<br />começa por aqui.</h1>
        <nav className="nx-account-tabs" aria-label="Áreas da conta">{[['musicas','Minhas músicas'],['creditos','Créditos'],['indicacoes','Indicações']].map(([id,label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setError(''); setMessage(''); }}>{label}</button>)}</nav>
        {error && <p className="nx-message nx-error" role="alert">{error}<br /><button type="button" className="nx-text-button" onClick={() => load(tab)}>Tentar novamente</button></p>}
        {message && <p className="nx-message nx-success" role="status">{message}</p>}
        {tab === 'musicas' && <>
          <div className="nx-section-heading"><h2>Presentes com a sua história</h2><Link className="nx-button nx-primary" href="/criar?novo=1">Criar nova música</Link></div>
          <div className="nx-library-grid">{orders.map(order => { const paid = ['PAGO','PAGAMENTO_APROVADO'].includes(order.paymentStatus); return <article className="nx-card" key={order.id}><Image className="nx-library-cover" src={order.coverUrl || '/experiencia/familia.webp'} alt="" width={640} height={426} unoptimized={Boolean(order.coverUrl)} sizes="(max-width: 700px) 90vw, 330px" /><span className="nx-eyebrow">{paid ? 'Presente liberado' : 'Sua criação'}</span><h2>Para {order.honoreeName || 'alguém especial'}</h2><p className="nx-helper">{order.musicStyle || 'Música personalizada'} · {order.orderNumber}</p><Link className="nx-button nx-primary" href={`/entrega?orderId=${encodeURIComponent(order.id)}`}>{paid ? 'Ouvir e acessar presente' : 'Acompanhar e ouvir prévia'}</Link></article>; })}</div>
          {!loading && !orders.length && !error && <div className="nx-card"><h2>Sua primeira história pode começar agora.</h2><p>As músicas vinculadas à sua conta aparecerão aqui. Comprou como visitante? Abra o link do pedido no aparelho da criação e entre na conta para guardar o presente. Para pedidos antigos ou outro aparelho, fale com o suporte.</p><Link className="nx-button" href="/criar">Criar minha música</Link></div>}
          {ordersMore && <button className="nx-button" type="button" disabled={loading} onClick={() => load('musicas', ordersPage + 1)}>Carregar mais músicas</button>}
        </>}
        {tab === 'creditos' && <>
          <section className="nx-card nx-wallet-balance"><span className="nx-eyebrow">Seus créditos não vencem</span><h2>{account ? Number(account.balance).toLocaleString('pt-BR') : '…'} crédito(s)</h2><p>Música e demais produtos avulsos: 1 crédito cada. Carta virtual: 0,5. Combos somam os produtos incluídos.</p><Link className="nx-button nx-primary" href="/criar?novo=1">Criar minha próxima música</Link></section>
          <div className="nx-section-heading"><h2>Mais histórias para presentear</h2><p>Créditos ficam na sua carteira e são usados quando você confirma a compra de um produto.</p></div>
          <div className="nx-credit-packages">{Object.entries(CREDIT_PACKAGES).filter(([,pack]) => !pack.postPurchase).map(([sku,pack]) => <article className="nx-card" key={sku}><h3>{pack.label}</h3><div className="nx-package-price">{formatBrl(pack.price)}</div><p className="nx-helper">{formatBrl(pack.price / pack.credits)} por crédito</p><button type="button" className="nx-button nx-primary" disabled={buying} onClick={() => buy(sku)}>{buying ? 'Preparando…' : 'Comprar créditos'}</button></article>)}</div>
          {pix?.qrCode && <section className="nx-card" style={{ marginTop: 22 }}><h2>PIX de créditos · {formatBrl(pix.package.price)}</h2><p className="nx-helper">Compra de {pix.package.label}. Copie o código e pague no aplicativo do seu banco.</p><div className="nx-checkout-actions"><button type="button" className="nx-button nx-primary" onClick={async () => { try { await navigator.clipboard.writeText(pix.qrCode); setMessage('Código PIX copiado.'); } catch { setError('Copie o código manualmente pelo campo abaixo.'); } }}>Copiar código PIX</button><button type="button" className="nx-button" disabled={checking} onClick={() => checkCredits(false)}>{checking ? 'Consultando…' : 'Já paguei'}</button></div><textarea className="nx-pix-code" readOnly aria-label="Código PIX de créditos" value={pix.qrCode} /><details className="nx-details"><summary>Ver QR Code</summary><div className="nx-pix-qr"><PixQrCode payload={pix.qrCode} /></div></details></section>}
          <div className="nx-section-heading"><h2>Histórico da carteira</h2></div><div className="nx-card">{account?.ledger?.length ? account.ledger.map(entry => <div className="nx-ledger-row" key={entry.id}><span>{({compra:'Compra de créditos',indicacao:'Indicação confirmada',bonus_indicacoes:'Bônus de indicações',resgate:'Produto adquirido'})[entry.reason] || 'Movimentação'}<small>{new Date(entry.created_at).toLocaleDateString('pt-BR')}</small></span><strong>{Number(entry.amount)>0?'+':''}{Number(entry.amount).toLocaleString('pt-BR')} crédito(s)</strong></div>) : <p className="nx-helper">Seus movimentos aparecerão aqui.</p>}{account?.ledgerHasMore && <button type="button" className="nx-button" disabled={loading} onClick={() => load('creditos', ledgerPage + 1)}>Ver movimentos anteriores</button>}</div>
        </>}
        {tab === 'indicacoes' && <ReferralCard detailed />}
        {loading && <p className="nx-message" role="status">Carregando…</p>}
      </>}
    </main>
  </div>;
}
