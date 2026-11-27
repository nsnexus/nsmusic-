'use client';

// Pagamento com cartão DENTRO do site (Stripe Payment Element), no lugar do link da InfinitePay.
// Mostra Google Pay / Apple Pay quando o aparelho tem (carteiras de cartão, domínio registrado na Stripe).
//
// Fluxo (27/11/2026, "intent adiado" da Stripe): o formulário aparece NA HORA só com a chave pública
// (/api/payments/stripe/config, sem banco). A cobrança é criada quando o cliente toca em "Pagar"
// (POST /api/payments/stripe/intent, valor pelo catálogo do servidor) e confirmada aqui → GET
// /api/payments/status?paymentId=pi_... (o servidor reconsulta a Stripe e aprova pelo
// applyPaymentApproval). O webhook payment_intent.succeeded aprova também, se a aba fechar antes.
// Se não der para abrir, `onFalhaAoAbrir` deixa quem chamou cair no checkout hospedado antigo.

import { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Loader2, Lock, X } from 'lucide-react';
import { getPriceForSku } from '@/lib/pricing';

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

function Formulario({ orderId, sku, amount, valor, onPago, onFalhaAoAbrir }) {
  const stripe = useStripe();
  const elements = useElements();
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [semCobranca, setSemCobranca] = useState(false);

  const liberar = async (paymentIntentId) => {
    setAviso('Pagamento recebido! Liberando suas músicas…');
    if (await confirmarNoServidor(orderId, paymentIntentId)) {
      onPago?.(paymentIntentId);
      return;
    }
    setAviso('Seu pagamento foi recebido e está sendo confirmado. Em instantes a página libera as músicas.');
    setEnviando(false);
  };

  const pagar = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || enviando) return;
    setEnviando(true);
    setErro('');
    setAviso('');

    const { error: erroDosDados } = await elements.submit();
    if (erroDosDados) {
      setErro(erroDosDados.message || 'Confira os dados do cartão.');
      setEnviando(false);
      return;
    }

    let cobranca;
    try {
      const res = await fetch('/api/payments/stripe/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, sku, amount }),
      });
      cobranca = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(cobranca.error || 'Não foi possível iniciar o pagamento com cartão.');
    } catch (err) {
      setErro(err.message || 'Não foi possível iniciar o pagamento com cartão.');
      setSemCobranca(Boolean(onFalhaAoAbrir));
      setEnviando(false);
      return;
    }

    if (cobranca.status === 'succeeded') return liberar(cobranca.paymentIntentId);

    const centavos = Math.round(Number(cobranca.amount) * 100);
    if (centavos !== Math.round(Number(valor) * 100)) {
      elements.update({ amount: centavos });
      setErro(`O valor foi atualizado para ${reais(cobranca.amount)}. Confira e toque em Pagar de novo.`);
      setEnviando(false);
      return;
    }

    const retorno = `${window.location.origin}/entrega?orderId=${encodeURIComponent(orderId)}&paid=stripe`;
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret: cobranca.clientSecret,
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
      return liberar(paymentIntent.id || cobranca.paymentIntentId);
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
      {semCobranca ? (
        <button type="button" onClick={() => onFalhaAoAbrir?.('')} style={{ marginTop: 8, border: 'none', background: 'none', color: COR, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 4 }}>
          Pagar na página segura da Stripe
        </button>
      ) : null}
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

let chavePublica = null;
async function lerChavePublica() {
  if (chavePublica) return chavePublica;
  const res = await fetch('/api/payments/stripe/config');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.publishableKey) throw new Error(data.error || 'Pagamento com cartão indisponível.');
  chavePublica = data.publishableKey;
  return chavePublica;
}

/**
 * @param {{ orderId: string, sku: string, amount?: number, onPago: (paymentIntentId: string) => void,
 *   onFechar: () => void, onFalhaAoAbrir?: (mensagem: string) => void }} props
 */
export default function CartaoStripe({ orderId, sku, amount, onPago, onFechar, onFalhaAoAbrir, embutido = false }) {
  const [sessao, setSessao] = useState(null);
  const [erro, setErro] = useState('');
  const raiz = useRef(null);

  // Embutido: leva a tela até o formulário, que abre abaixo do botão tocado.
  useEffect(() => {
    if (embutido) raiz.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [embutido]);
  const callbacks = useRef({ onPago, onFalhaAoAbrir });
  callbacks.current = { onPago, onFalhaAoAbrir };

  const valor = sku === 'impacto' && Number(amount) > 0 ? Number(amount) : getPriceForSku(sku);

  useEffect(() => {
    let ativo = true;
    lerChavePublica()
      .then((chave) => { if (ativo) setSessao({ publishableKey: chave }); })
      .catch((e) => {
        if (!ativo) return;
        if (callbacks.current.onFalhaAoAbrir) callbacks.current.onFalhaAoAbrir(e.message);
        else setErro(e.message);
      });
    return () => { ativo = false; };
  }, []);

  const opcoes = sessao && valor > 0 ? {
    mode: 'payment',
    amount: Math.round(valor * 100),
    currency: 'brl',
    paymentMethodTypes: ['card'],
    locale: 'pt-BR',
    appearance: {
      theme: 'stripe',
      variables: { colorPrimary: COR, borderRadius: '12px', fontSizeBase: '16px', colorText: '#1f1a24' },
    },
  } : null;

  // Embutido (padrão das telas de pagamento desde 27/11/2026): o formulário aparece no corpo da
  // página, logo abaixo do botão de cartão, sem janela por cima. O modo janela fica para quem chamar
  // sem `embutido`.
  const caixa = embutido
    ? { width: '100%', boxSizing: 'border-box', marginTop: 12, background: '#fff', border: '1.5px solid #f0d5df', borderRadius: 16, padding: '16px 14px 18px', textAlign: 'left' }
    : { width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', boxShadow: '0 -8px 30px rgba(0,0,0,0.18)' };
  const Externo = embutido ? 'section' : 'div';
  const propsExterno = embutido
    ? { 'aria-labelledby': 'cartao-titulo', style: { width: '100%' } }
    : { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cartao-titulo', style: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20, 12, 24, 0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' } };

  return (
    <Externo ref={raiz} {...propsExterno}>
      <div style={caixa}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 id="cartao-titulo" style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'var(--font-family-title)', color: '#1f1a24' }}>Pagar com cartão</h2>
            {valor > 0 ? <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>{reais(valor)} · libera na hora</span> : null}
          </div>
          {embutido ? (
            <button type="button" onClick={onFechar} style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: '0.88rem', textDecoration: 'underline', cursor: 'pointer', padding: 4 }}>
              Escolher outra forma
            </button>
          ) : (
            <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: '#f3f4f6', borderRadius: 999, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {erro ? <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>{erro}</p> : null}
        {!sessao && !erro ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280' }}><Loader2 size={16} aria-hidden="true" /> Preparando o pagamento seguro…</p>
        ) : null}
        {opcoes ? (
          <Elements stripe={stripeDaChave(sessao.publishableKey)} options={opcoes}>
            <Formulario
              orderId={orderId}
              sku={sku}
              amount={amount}
              valor={valor}
              onPago={(id) => callbacks.current.onPago?.(id)}
              onFalhaAoAbrir={callbacks.current.onFalhaAoAbrir ? (m) => callbacks.current.onFalhaAoAbrir(m) : null}
            />
          </Elements>
        ) : null}
      </div>
    </Externo>
  );
}
