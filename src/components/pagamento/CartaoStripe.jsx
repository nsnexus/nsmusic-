'use client';

// Pagamento com cartão DENTRO do site (Stripe Payment Element), no lugar do link da InfinitePay.
// Mostra Google Pay / Apple Pay quando o aparelho tem (carteiras de cartão, domínio registrado na Stripe).
//
// Fluxo: POST /api/payments/stripe/intent (valor pelo catálogo do servidor) → o cliente confirma aqui
// → GET /api/payments/status?paymentId=pi_... (o servidor reconsulta a Stripe e aprova pelo
// applyPaymentApproval). O webhook payment_intent.succeeded aprova também, se a aba fechar antes.
// Se a cobrança não abrir, `onFalhaAoAbrir` deixa quem chamou cair no checkout hospedado antigo.

import { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Loader2, Lock, X } from 'lucide-react';

const COR = '#d6336c';
const carregados = new Map();
function stripeDaChave(chave) {
  if (!carregados.has(chave)) carregados.set(chave, loadStripe(chave, { locale: 'pt-BR' }));
  return carregados.get(chave);
}

const reais = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Confere no servidor (que reconsulta a Stripe) até aprovar. */
async function confirmarNoServidor(orderId, paymentIntentId, tentativas = 12) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(paymentIntentId)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'approved') return true;
    } catch { /* tenta de novo */ }
    await espera(2500);
  }
  return false;
}

function Formulario({ orderId, paymentIntentId, valor, onPago }) {
  const stripe = useStripe();
  const elements = useElements();
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const pagar = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || enviando) return;
    setEnviando(true);
    setErro('');
    setAviso('');
    const retorno = `${window.location.origin}/entrega?orderId=${encodeURIComponent(orderId)}&paid=stripe`;
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: retorno },
      redirect: 'if_required',
    });
    if (error) {
      setErro(error.type === 'card_error' || error.type === 'validation_error'
        ? error.message
        : 'Não foi possível concluir o pagamento. Confira os dados ou tente outro cartão.');
      setEnviando(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      setAviso('Pagamento recebido! Liberando suas músicas…');
      const ok = await confirmarNoServidor(orderId, paymentIntent.id || paymentIntentId);
      if (ok) {
        onPago?.(paymentIntent.id || paymentIntentId);
        return;
      }
      setAviso('Seu pagamento foi recebido e está sendo confirmado. Em instantes a página libera as músicas.');
      setEnviando(false);
      return;
    }
    setErro('O pagamento não foi concluído. Tente de novo ou pague com Pix.');
    setEnviando(false);
  };

  return (
    <form onSubmit={pagar}>
      <PaymentElement
        onReady={() => setPronto(true)}
        options={{ layout: 'tabs', wallets: { googlePay: 'auto', applePay: 'auto' } }}
      />
      {!pronto ? (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: '0.9rem', margin: '12px 0 0' }}>
          <Loader2 size={16} aria-hidden="true" /> Carregando o formulário seguro…
        </p>
      ) : null}
      {erro ? <p role="alert" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.9rem' }}>{erro}</p> : null}
      {aviso ? <p role="status" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '0.9rem' }}>{aviso}</p> : null}
      <button
        type="submit"
        disabled={!stripe || !pronto || enviando}
        style={{ width: '100%', marginTop: 16, padding: '15px 16px', border: 'none', borderRadius: 14, background: `linear-gradient(135deg, ${COR}, #a61e4d)`, color: '#fff', fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: (!stripe || !pronto || enviando) ? 'default' : 'pointer', opacity: (!stripe || !pronto) ? 0.7 : 1 }}
      >
        {enviando ? <Loader2 size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
        {enviando ? 'Processando…' : `Pagar ${reais(valor)}`}
      </button>
      <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.8rem', margin: '10px 0 0' }}>Pagamento seguro processado pela Stripe</p>
    </form>
  );
}

/**
 * @param {{ orderId: string, sku: string, amount?: number, onPago: (paymentIntentId: string) => void,
 *   onFechar: () => void, onFalhaAoAbrir?: (mensagem: string) => void }} props
 */
export default function CartaoStripe({ orderId, sku, amount, onPago, onFechar, onFalhaAoAbrir }) {
  const [sessao, setSessao] = useState(null);
  const [erro, setErro] = useState('');
  const callbacks = useRef({ onPago, onFalhaAoAbrir });
  callbacks.current = { onPago, onFalhaAoAbrir };

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch('/api/payments/stripe/intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, sku, amount }),
        });
        const data = await res.json().catch(() => ({}));
        if (!ativo) return;
        if (!res.ok) throw new Error(data.error || 'Não foi possível abrir o pagamento com cartão.');
        if (data.status === 'succeeded') {
          // Já pago antes (ex.: voltou à página): só confirma e libera.
          if (await confirmarNoServidor(orderId, data.paymentIntentId, 3)) callbacks.current.onPago?.(data.paymentIntentId);
          return;
        }
        setSessao(data);
      } catch (e) {
        if (!ativo) return;
        if (callbacks.current.onFalhaAoAbrir) callbacks.current.onFalhaAoAbrir(e.message);
        else setErro(e.message);
      }
    })();
    return () => { ativo = false; };
  }, [orderId, sku, amount]);

  const opcoes = sessao ? {
    clientSecret: sessao.clientSecret,
    locale: 'pt-BR',
    appearance: {
      theme: 'stripe',
      variables: { colorPrimary: COR, borderRadius: '12px', fontSizeBase: '16px', colorText: '#1f1a24' },
    },
  } : null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cartao-titulo" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20, 12, 24, 0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', boxShadow: '0 -8px 30px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 id="cartao-titulo" style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'var(--font-family-title)' }}>Pagar com cartão</h2>
            {sessao ? <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>{reais(sessao.amount)} · libera na hora</span> : null}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: '#f3f4f6', borderRadius: 999, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {erro ? <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>{erro}</p> : null}
        {!sessao && !erro ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280' }}><Loader2 size={16} aria-hidden="true" /> Preparando o pagamento seguro…</p>
        ) : null}
        {sessao ? (
          <Elements stripe={stripeDaChave(sessao.publishableKey)} options={opcoes}>
            <Formulario orderId={orderId} paymentIntentId={sessao.paymentIntentId} valor={sessao.amount} onPago={(id) => callbacks.current.onPago?.(id)} />
          </Elements>
        ) : null}
      </div>
    </div>
  );
}
