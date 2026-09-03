'use client';

import { useState } from 'react';
import PixQrCode from '@/components/PixQrCode';

// Página de apoio/gorjeta — PIX estático direto pra chave do estúdio (src/lib/pixStatic.js), sem
// nenhuma cobrança na Efí e sem produto nenhum atrelado. Sem segmento dinâmico ([id]), então não
// precisa de `export const runtime = 'edge'` aqui (ver .claude/rules/frontend.md) — só a rota de
// API que ela chama (api/support/pix) precisa.
const SUGGESTED_AMOUNTS = [5, 10, 20, 50];

export default function ApoiePage() {
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [pixInfo, setPixInfo] = useState(null); // { pixCopiaECola, amount }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const effectiveAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount.replace(',', '.')) : null);

  const handleSelectChip = (value) => {
    setSelectedAmount(value);
    setCustomAmount('');
    setError('');
  };

  const handleCustomChange = (e) => {
    setCustomAmount(e.target.value);
    setSelectedAmount(null);
    setError('');
  };

  const handleGenerate = async () => {
    if (!effectiveAmount || Number.isNaN(effectiveAmount) || effectiveAmount < 1) {
      setError('Escolha ou digite um valor válido (mínimo R$ 1,00).');
      return;
    }

    setLoading(true);
    setError('');
    setPixInfo(null);
    try {
      const res = await fetch('/api/support/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: effectiveAmount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Não foi possível gerar o PIX agora. Tente novamente.');
        return;
      }
      setPixInfo(data);
    } catch (err) {
      setError('Falha de conexão. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!pixInfo?.pixCopiaECola) return;
    navigator.clipboard.writeText(pixInfo.pixCopiaECola);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleReset = () => {
    setPixInfo(null);
    setSelectedAmount(null);
    setCustomAmount('');
    setError('');
  };

  return (
    <div style={{ minHeight: '100vh', padding: '40px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>💜</div>
          <h1 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.6rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Apoie o NS Music
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
            Gostou de alguma música ou quer só dar aquela força pro estúdio? Qualquer valor ajuda
            demais a manter o projeto rodando. Obrigado de coração! 🎶
          </p>
        </div>

        <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
          {!pixInfo ? (
            <>
              <p style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                Escolha um valor
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
                {SUGGESTED_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSelectChip(value)}
                    style={{
                      padding: '12px 4px',
                      borderRadius: '10px',
                      border: selectedAmount === value ? '2px solid var(--primary)' : '1.5px solid var(--border-color)',
                      background: selectedAmount === value ? 'var(--primary-light)' : 'var(--bg-primary)',
                      color: selectedAmount === value ? 'var(--primary)' : 'var(--text-primary)',
                      fontWeight: '700',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    R$ {value}
                  </button>
                ))}
              </div>

              <label htmlFor="custom-amount" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Ou digite outro valor:
              </label>
              <input
                id="custom-amount"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 15,00"
                value={customAmount}
                onChange={handleCustomChange}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border-color)',
                  fontSize: '0.95rem',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-primary)',
                  marginBottom: '16px',
                  boxSizing: 'border-box',
                }}
              />

              {error && (
                <p style={{ fontSize: '0.82rem', color: 'var(--error, #ef4444)', marginBottom: '12px' }}>{error}</p>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', padding: '13px', fontSize: '0.95rem', fontWeight: 'bold', border: 'none', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Gerando PIX...' : 'Gerar PIX'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--success)', marginBottom: '14px' }}>
                Chave gerada — R$ {pixInfo.amount.toFixed(2).replace('.', ',')}
              </p>

              <div style={{ marginBottom: '14px' }}>
                <PixQrCode payload={pixInfo.pixCopiaECola} size={220} label="QR Code para apoiar o NS Music via PIX" />
              </div>

              <div style={{ marginBottom: '12px', textAlign: 'left' }}>
                <label htmlFor="pix-copia-cola-apoie" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Ou use o código PIX Copia e Cola:
                </label>
                <textarea
                  id="pix-copia-cola-apoie"
                  readOnly
                  value={pixInfo.pixCopiaECola}
                  style={{ width: '100%', height: '70px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-primary"
                style={{ width: '100%', padding: '13px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer', marginBottom: '10px' }}
              >
                {copied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX'}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="btn btn-secondary"
                style={{ width: '100%', padding: '11px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}
              >
                Escolher outro valor
              </button>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '14px', lineHeight: '1.4' }}>
                Muito obrigado pelo apoio! 💜 Essa é uma doação direta e não gera nenhum produto ou
                acesso — é só uma forma de ajudar o estúdio a continuar.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
