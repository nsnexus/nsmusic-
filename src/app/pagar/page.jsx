'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPriceForSku } from '@/lib/pricing';
import { requestPixCharge } from '@/lib/pixCheckout';
import PixQrCode from '@/components/PixQrCode';

// Página "pague conforme o impacto emocional" — link avulso que o estúdio manda manualmente por
// WhatsApp (pedido do dono do estúdio, 02/09/2026), separada do checkout fixo de R$9,99 em
// /entrega pra não arriscar o funil principal. Preço mínimo é o da música (getPriceForSku
// 'audio_only'); pagando a partir do preço do combo, o vídeo vem de brinde. Sem segmento dinâmico
// ([id]) — usa query string, então não precisa de `export const runtime = 'edge'`
// (ver .claude/rules/frontend.md).
//
// Dois modos, na mesma página:
//  - COM `?orderId=`: pedido de verdade no sistema. Cobrança dinâmica na Efí (sku 'impacto', ver
//    /api/payments/create), aprovação e brinde de vídeo automáticos por
//    src/lib/payments.js:applyPaymentApproval, decidido pelo valor REAL confirmado — nunca pelo
//    que esta página exibe. Ao aprovar, libera a página de entrega (/entrega?orderId=).
//  - SEM `orderId` (música feita fora da plataforma, achado 02/09/2026 — não existe pedido no
//    Firestore pra vincular a cobrança): PIX estático (mesmo mecanismo de /apoie, sem confirmação
//    automática — não há webhook nem pedido pra gravar aprovação), usando a chave PRINCIPAL do
//    estúdio (não a de doação). `?nome=` personaliza o texto; sem confirmação automática, a
//    página pede que o cliente avise no WhatsApp depois de pagar.
const MIN_PRICE = getPriceForSku('audio_only');
const VIDEO_THRESHOLD = getPriceForSku('combo');
const SUGGESTED_AMOUNTS = [MIN_PRICE, VIDEO_THRESHOLD, 25, 50].filter((v, i, arr) => arr.indexOf(v) === i);

const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite usado no add-on de playback

function PagarContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || '';
  const nomeParam = searchParams.get('nome') || '';
  const standalone = !orderId;

  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(!standalone);
  const [orderError, setOrderError] = useState('');

  const [pixInfo, setPixInfo] = useState(null); // { qrCode, paymentId, amount }
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [approved, setApproved] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  // Estado do pedido ao vivo — mesmo padrão de /entrega, pra refletir aprovação assim que o
  // webhook/polling do servidor gravar, mesmo sem depender só do polling local abaixo. Só roda no
  // modo com pedido — no modo avulso não há documento nenhum pra escutar.
  useEffect(() => {
    if (standalone) return;
    const unsub = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        if (!snap.exists()) {
          setOrderError('Pedido não encontrado.');
          setOrder(null);
        } else {
          setOrder({ id: snap.id, ...snap.data() });
        }
        setOrderLoading(false);
      },
      (err) => {
        console.error('Erro ao carregar pedido:', err);
        setOrderError('Não foi possível carregar o pedido agora.');
        setOrderLoading(false);
      }
    );
    return () => unsub();
  }, [standalone, orderId]);

  const isPaid = Boolean(order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO' || approved);

  const generatePix = useCallback(async (amount) => {
    setPixLoading(true);
    setPixError('');
    setPollingTimedOut(false);

    if (standalone) {
      try {
        const res = await fetch('/api/support/pix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, useMainKey: true }),
        });
        const data = await res.json().catch(() => ({}));
        setPixLoading(false);
        if (!res.ok) {
          setPixError(data.error || 'Não foi possível gerar o PIX agora.');
          return;
        }
        setPixInfo({ qrCode: data.pixCopiaECola || '', paymentId: '', amount });
      } catch (e) {
        setPixLoading(false);
        setPixError('Falha de conexão. Tente novamente.');
      }
      return;
    }

    const resultado = await requestPixCharge({ orderId, sku: 'impacto', amount });
    setPixLoading(false);
    if (resultado.ok) {
      setPixInfo({ qrCode: resultado.data.qrCode || '', paymentId: resultado.data.paymentId || '', amount });
    } else {
      setPixError(resultado.error);
    }
  }, [standalone, orderId]);

  // Gera automaticamente o PIX no valor mínimo assim que a página carrega (ou, no modo com
  // pedido, assim que o pedido carrega) — "já vem gerado", sem precisar clicar em nada pra ver o QR.
  useEffect(() => {
    if (standalone) {
      if (!pixInfo && !pixLoading && !pixError) generatePix(MIN_PRICE);
      return;
    }
    if (order && !isPaid && !pixInfo && !pixLoading && !pixError) {
      generatePix(MIN_PRICE);
    }
  }, [standalone, order, isPaid, pixInfo, pixLoading, pixError, generatePix]);

  // Polling do pagamento — só existe no modo com pedido (cobrança dinâmica na Efí, com paymentId
  // pra consultar). No modo avulso o PIX é estático, sem nenhuma confirmação automática possível.
  // Cleanup obrigatório (ver .claude/rules/frontend.md).
  useEffect(() => {
    if (standalone || !orderId || !pixInfo?.paymentId || isPaid) return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= PIX_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        setPollingTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/payments/status?orderId=${orderId}&paymentId=${pixInfo.paymentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved' || data.status === 'PAGO' || data.status === 'PAGAMENTO_APROVADO') {
            setApproved(true);
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn('[Pagar] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [standalone, orderId, pixInfo?.paymentId, isPaid]);

  const handlePickAmount = (value) => {
    setCustomAmount('');
    if (value !== pixInfo?.amount) generatePix(value);
  };

  const handleCustomSubmit = () => {
    const parsed = parseFloat(String(customAmount).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < MIN_PRICE) {
      setPixError(`Digite um valor válido, no mínimo R$ ${MIN_PRICE.toFixed(2).replace('.', ',')}.`);
      return;
    }
    generatePix(Math.round(parsed * 100) / 100);
  };

  if (orderLoading) {
    return (
      <div style={pageWrapStyle}>
        <div className="glass-card" style={cardStyle}>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando seu pedido...</p>
        </div>
      </div>
    );
  }

  if (!standalone && (orderError || !order)) {
    return (
      <div style={pageWrapStyle}>
        <div className="glass-card" style={cardStyle}>
          <p style={{ textAlign: 'center', color: 'var(--error, #ef4444)', fontWeight: '600' }}>
            {orderError || 'Pedido não encontrado.'}
          </p>
        </div>
      </div>
    );
  }

  const honoreeName = (!standalone ? order?.honoreeName : nomeParam) || 'alguém especial';
  const hasVideo = Boolean(order?.hasVideoAccess || order?.videoAddonPaid);

  if (!standalone && isPaid) {
    return (
      <div style={pageWrapStyle}>
        <div className="glass-card" style={cardStyle}>
          <div style={{ fontSize: '2.4rem', textAlign: 'center', marginBottom: '10px' }}>🎉</div>
          <h1 style={titleStyle}>Pagamento confirmado!</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: '1.5' }}>
            Muito obrigado por apoiar a música de <strong>{honoreeName}</strong>! 💜
            {hasVideo && ' Seu Vídeo Homenagem também já está liberado.'}
          </p>
          <a
            href={`/entrega?orderId=${orderId}`}
            className="btn btn-primary"
            style={{ display: 'block', textAlign: 'center', padding: '13px', borderRadius: '10px', fontWeight: 'bold', textDecoration: 'none' }}
          >
            Acessar minha música
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrapStyle}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '8px' }}>🎶</div>
          <h1 style={titleStyle}>{standalone ? 'O NS Music agradece pela preferência! 💜' : `A música de ${honoreeName} tá pronta!`}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
            {standalone ? (
              <>
                Se essa homenagem te emocionou, contribua com o quanto achar justo pelo trabalho —
                o mínimo é o valor da música. A partir de <strong>R$ {VIDEO_THRESHOLD.toFixed(2).replace('.', ',')}</strong> você
                também ganha o <strong>Vídeo Homenagem</strong> de brinde, é só falar comigo depois de pagar! 🎬
              </>
            ) : (
              <>
                Se essa homenagem te emocionou, pague o quanto achar justo — o mínimo já libera sua
                música. A partir de <strong>R$ {VIDEO_THRESHOLD.toFixed(2).replace('.', ',')}</strong> você
                ganha o <strong>Vídeo Homenagem</strong> de brinde! 🎬
              </>
            )}
          </p>
        </div>

        <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
          <p style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Quanto você quer pagar?
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '14px' }}>
            {SUGGESTED_AMOUNTS.map((value) => {
              const active = pixInfo?.amount === value;
              const unlocksVideo = value >= VIDEO_THRESHOLD;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handlePickAmount(value)}
                  disabled={pixLoading}
                  style={{
                    padding: '12px 6px',
                    borderRadius: '10px',
                    border: active ? '2px solid var(--primary)' : '1.5px solid var(--border-color)',
                    background: active ? 'var(--primary-light)' : 'var(--bg-primary)',
                    color: active ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: '700',
                    fontSize: '0.88rem',
                    cursor: pixLoading ? 'default' : 'pointer',
                    textAlign: 'center',
                  }}
                >
                  R$ {value.toFixed(2).replace('.', ',')}
                  {value === MIN_PRICE && <div style={{ fontSize: '0.65rem', fontWeight: '500', opacity: 0.75 }}>mínimo</div>}
                  {unlocksVideo && value !== MIN_PRICE && <div style={{ fontSize: '0.65rem', fontWeight: '500', opacity: 0.75 }}>+ vídeo 🎬</div>}
                </button>
              );
            })}
          </div>

          <label htmlFor="custom-amount" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Ou digite outro valor:
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <input
              id="custom-amount"
              type="text"
              inputMode="decimal"
              placeholder={`Mín. R$ ${MIN_PRICE.toFixed(2).replace('.', ',')}`}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              style={{ flex: 1, padding: '11px 12px', borderRadius: '10px', border: '1.5px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--text-primary)', background: 'var(--bg-primary)', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={handleCustomSubmit}
              disabled={pixLoading || !customAmount}
              className="btn btn-secondary"
              style={{ padding: '11px 16px', borderRadius: '10px', fontWeight: '600', cursor: pixLoading ? 'default' : 'pointer' }}
            >
              Usar
            </button>
          </div>

          {pixError && (
            <p style={{ fontSize: '0.82rem', color: 'var(--error, #ef4444)', marginBottom: '12px' }}>{pixError}</p>
          )}

          {pixLoading && !pixInfo && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Gerando PIX...</p>
          )}

          {pixInfo?.qrCode && (
            <div style={{ textAlign: 'center', opacity: pixLoading ? 0.5 : 1 }}>
              <p style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--success)', marginBottom: '12px' }}>
                Escaneie pra pagar R$ {pixInfo.amount.toFixed(2).replace('.', ',')}
              </p>
              <div style={{ marginBottom: '12px' }}>
                <PixQrCode payload={pixInfo.qrCode} size={220} label="QR Code para pagamento via PIX" />
              </div>
              <div style={{ marginBottom: '10px', textAlign: 'left' }}>
                <label htmlFor="pix-copia-cola-impacto" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Ou use o código PIX Copia e Cola:
                </label>
                <textarea
                  id="pix-copia-cola-impacto"
                  readOnly
                  value={pixInfo.qrCode}
                  style={{ width: '100%', height: '64px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(pixInfo.qrCode);
                  setPixCopied(true);
                  setTimeout(() => setPixCopied(false), 3000);
                }}
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer', marginBottom: '12px' }}
              >
                {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX'}
              </button>
              {standalone ? (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Depois de pagar, me manda um print aqui no WhatsApp que eu confirmo e já te
                  entrego tudo certinho! 💜
                </p>
              ) : pollingTimedOut && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Ainda não identificamos o pagamento. Se já pagou, aguarde mais um instante.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const pageWrapStyle = { minHeight: '100vh', padding: '40px 16px', display: 'flex', justifyContent: 'center' };
const cardStyle = { maxWidth: '440px', width: '100%', padding: '28px', borderRadius: '16px' };
const titleStyle = { fontFamily: 'var(--font-family-title)', fontSize: '1.3rem', color: 'var(--text-primary)', textAlign: 'center', marginBottom: '10px' };

export default function PagarPage() {
  return (
    <Suspense fallback={
      <div style={pageWrapStyle}>
        <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
      </div>
    }>
      <PagarContent />
    </Suspense>
  );
}
