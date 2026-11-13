'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { auth, onAuthStateChanged, signOut } from '@/lib/authClient';
import { supabase } from '@/lib/supabase';

export default function ContaPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersPage, setOrdersPage] = useState(0);
  const [ordersMore, setOrdersMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSavedMsg, setPhoneSavedMsg] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const userPhone = user?.phone || user?.user_metadata?.phone || user?.user_metadata?.whatsapp || '';

  const handlePhoneInputChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 2) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    }
    if (raw.length > 7) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
    } else if (raw.length > 6) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
    }
    setPhoneInput(formatted);
  };

  const handleSavePhone = async (e) => {
    e.preventDefault();
    setPhoneError('');
    setPhoneSavedMsg('');
    const digits = phoneInput.replace(/\D/g, '');
    const clean = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (clean.length < 10 || clean.length > 11) {
      setPhoneError('Digite um celular válido com DDD (10 ou 11 dígitos).');
      return;
    }
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (ddd < 11 || ddd > 99) {
      setPhoneError('DDD inválido.');
      return;
    }
    const normalizedPhone = `55${clean}`;
    setSavingPhone(true);
    try {
      const { data, error: updateErr } = await supabase.auth.updateUser({
        data: {
          phone: normalizedPhone,
          whatsapp: normalizedPhone,
          customer_phone: normalizedPhone
        }
      });
      if (updateErr) throw updateErr;
      if (data?.user) setUser(data.user);
      setPhoneSavedMsg('WhatsApp cadastrado com sucesso!');
    } catch (err) {
      setPhoneError(err.message || 'Erro ao salvar WhatsApp.');
    } finally {
      setSavingPhone(false);
    }
  };

  const userRef = useRef(null);

  const loadOrders = useCallback(async (page = 0) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/orders/my-orders?page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar suas músicas.');
      setOrders(previous => (page ? [...previous, ...(data.orders || [])] : data.orders || []));
      setOrdersMore(Boolean(data.hasMore));
      setOrdersPage(page);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, current => {
      const prevUid = userRef.current?.uid;
      const nextUid = current?.uid;
      userRef.current = current;
      setUser(current);
      setAuthReady(true);
      if (prevUid !== nextUid) {
        setOrders([]);
      }
    });
  }, []);

  useEffect(() => {
    if (user) {
      loadOrders(0);
    }
  }, [user, loadOrders]);

  return (
    <div className="nx-experience">
      <header className="nx-header">
        <div className="nx-header-inner">
          <Link href="/" className="nx-brand">
            <Image src="/logo.png" alt="NS Music" width={44} height={44} priority />
            <span>Histórias que viram música.</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/" className="nx-text-button" style={{ textDecoration: 'none' }}>
              ← Início
            </Link>
            {user ? (
              <button type="button" className="nx-text-button" onClick={() => signOut(auth)}>
                Sair da conta
              </button>
            ) : (
              <Link href="/criar" className="nx-account-link">
                Criar música
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="nx-delivery-main">
        {!authReady ? (
          <p className="nx-message" role="status">Carregando sua conta…</p>
        ) : !user ? (
          <section className="nx-card nx-login-card">
            <Image src="/experiencia/familia.webp" alt="" width={640} height={426} sizes="(max-width: 640px) 85vw, 420px" />
            <span className="nx-eyebrow">Seu lugar de guardar emoções</span>
            <h1>Suas músicas.<br />Suas próximas histórias.</h1>
            <p>Entre com Google ou e-mail para acompanhar e acessar suas músicas guardadas na sua conta.</p>
            <Link className="nx-button nx-primary" href="/login?redirect=%2Fconta">
              Entrar ou criar minha conta
            </Link>
            <p className="nx-helper">
              Você continua podendo criar, ouvir a prévia e pagar sem cadastro. Para associar uma compra de visitante à sua conta, abra o link do pedido ou fale com nosso suporte.
            </p>
          </section>
        ) : (
          <>
            <span className="nx-eyebrow">Minha conta</span>
            <h1>Seus presentes<br />reunidos em um só lugar.</h1>

            {!userPhone && (
              <section className="nx-card" style={{ marginBottom: 24, border: '1.5px solid #3b82f6', background: '#eff6ff', padding: '20px 24px', borderRadius: '16px' }}>
                <span className="nx-eyebrow" style={{ color: '#2563eb', fontWeight: '700' }}>📲 Complete seu cadastro</span>
                <h2 style={{ fontSize: '1.25rem', color: '#1e3a8a', marginTop: 4, fontWeight: '800' }}>
                  Receba suas músicas e avisos no WhatsApp
                </h2>
                <p style={{ color: '#1e40af', fontSize: '0.88rem', margin: '6px 0 16px', lineHeight: '1.5' }}>
                  Informe seu número de WhatsApp com DDD para receber links de recuperação, aviso quando a música ficar pronta e suporte rápido.
                </p>
                <form onSubmit={handleSavePhone} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="tel"
                    placeholder="(11) 98888-7777"
                    value={phoneInput}
                    onChange={handlePhoneInputChange}
                    required
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #93c5fd',
                      fontSize: '0.9rem',
                      maxWidth: '220px',
                      color: '#0f172a',
                      background: '#ffffff'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={savingPhone}
                    className="nx-button nx-primary"
                    style={{ padding: '10px 18px', fontSize: '0.88rem' }}
                  >
                    {savingPhone ? 'Salvando...' : 'Salvar WhatsApp'}
                  </button>
                </form>
                {phoneError && <p style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 8 }}>⚠️ {phoneError}</p>}
                {phoneSavedMsg && <p style={{ color: '#16a34a', fontSize: '0.82rem', marginTop: 8 }}>✅ {phoneSavedMsg}</p>}
              </section>
            )}

            {error && (
              <p className="nx-message nx-error" role="alert">
                {error}<br />
                <button type="button" className="nx-text-button" onClick={() => loadOrders(0)}>
                  Tentar novamente
                </button>
              </p>
            )}
            {message && <p className="nx-message nx-success" role="status">{message}</p>}

            <div className="nx-section-heading">
              <h2>Presentes com a sua história</h2>
              <Link className="nx-button nx-primary" href="/criar?novo=1">
                Criar nova música
              </Link>
            </div>

            <div className="nx-library-grid">
              {orders.map(order => {
                const paid = ['PAGO', 'PAGAMENTO_APROVADO'].includes(order.paymentStatus);
                return (
                  <article className="nx-card" key={order.id}>
                    <Image
                      className="nx-library-cover"
                      src={order.coverUrl || '/experiencia/familia.webp'}
                      alt=""
                      width={640}
                      height={426}
                      unoptimized={Boolean(order.coverUrl)}
                      sizes="(max-width: 700px) 90vw, 330px"
                    />
                    <span className="nx-eyebrow">{paid ? 'Presente liberado' : 'Sua criação'}</span>
                    <h2>Para {order.honoreeName || 'alguém especial'}</h2>
                    <p className="nx-helper">{order.musicStyle || 'Música personalizada'} · {order.orderNumber}</p>
                    <Link className="nx-button nx-primary" href={`/entrega?orderId=${encodeURIComponent(order.id)}`}>
                      {paid ? 'Ouvir e acessar presente' : 'Acompanhar e ouvir prévia'}
                    </Link>
                  </article>
                );
              })}
            </div>

            {!loading && !orders.length && !error && (
              <div className="nx-card">
                <h2>Sua primeira história pode começar agora.</h2>
                <p>
                  As músicas vinculadas à sua conta aparecerão aqui. Se você comprou como visitante e quer adicionar este pedido à sua conta, entre em contato com nosso suporte no WhatsApp.
                </p>
                <Link className="nx-button" href="/criar">
                  Criar minha música
                </Link>
              </div>
            )}

            {ordersMore && (
              <button
                className="nx-button"
                type="button"
                disabled={loading}
                onClick={() => loadOrders(ordersPage + 1)}
              >
                Carregar mais músicas
              </button>
            )}

            {loading && <p className="nx-message" role="status">Carregando…</p>}
          </>
        )}
      </main>
    </div>
  );
}
