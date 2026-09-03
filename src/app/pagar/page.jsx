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
// 'audio_only'); pagando a partir do preço do combo, o vídeo vem de brinde — ver
// src/lib/payments.js:applyPaymentApproval, que decide isso pelo valor REAL confirmado na Efí,
// nunca pelo que esta página exibe. Sem segmento dinâmico ([id]) — usa `?orderId=` em query string,
// então não precisa de `export const runtime = 'edge'` (ver .claude/rules/frontend.md).
const MIN_PRICE = getPriceForSku('audio_only');
const VIDEO_THRESHOLD = getPriceForSku('combo');
const SUGGESTED_AMOUNTS = [MIN_PRICE, VIDEO_THRESHOLD, 25, 50].filter((v, i, arr) => arr.indexOf(v) === i);

const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite usado no add-on de playback

function PagarContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || '';

  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState('');

  const [pixInfo, setPixInfo] = useState(null); // { qrCode, paymentId, amount }
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [approved, setApproved] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  // Estado do pedido ao vivo — mesmo padrão de /entrega, pra refletir aprovação assim que o
  // webhook/polling do servidor gravar, mesmo sem depender só do polling local abaixo.
  useEffect(() => {
    if (!orderId) {
      setOrderLoading(false);
      setOrderError('Link inválido — falta o identificador do pedido.');
      return;
    }
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
  }, [orderId]);

  const isPaid = Boolean(order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO' || approved);

  const generatePix = useCallback(async (amount) => {
    if (!orderId) return;
    setPixLoading(true);
    setPixError('');
    setPollingTimedOut(false);
    const resultado = await requestPixCharge({ orderId, sku: 'impacto', amount });
    setPixLoading(false);
    if (resultado.ok) {
      setPixInfo({ qrCode: resultado.data.qrCode || '', paymentId: resultado.data.paymentId || '', amount });
    } else {
      setPixError(resultado.error);
    }
  }, [orderId]);

  // Gera automaticamente o PIX no valor mínimo assim que o pedido carrega — "já vem gerado",
  // sem o cliente precisar clicar em nada pra ver o QR Code.
  useEffect(() => {
    if (order && !isPaid && !pixInfo && !pixLoading && !pixError) {
      generatePix(MIN_PRICE);
    }
  }, [order, isPaid, pixInfo, pixLoading, pixError, generatePix]);

  // Polling do pagamento — com cleanup obrigatório (ver .claude/rules/frontend.md).
  useEffect(() => {
    if (!orderId || !pixInfo?.paymentId || isPaid) return;

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
  }, [orderId, pixInfo?.paymentId, isPaid]);

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

  if (orderError || !order) {
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

  const honoreeName = order.honoreeName || 'alguém especial';
  const hasVideo = Boolean(order.hasVideoAccess || order.videoAddonPaid);

  if (isPaid) {
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
          <h1 style={titleStyle}>A música de {honoreeName} tá pronta!</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
            Se essa homenagem te emocionou, pague o quanto achar justo — o mínimo já libera sua
            música. A partir de <strong>R$ {VIDEO_THRESHOLD.toFixed(2).replace('.', ',')}</strong> você
            ganha o <strong>Vídeo Homenagem</strong> de brinde! 🎬
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
              {pollingTimedOut && (
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
