'use client';

import { Zap, Loader2 } from 'lucide-react';
import { formatBrl } from '@/lib/deliveryPackages';

/**
 * Botão de pagamento que aparece logo abaixo do pacote escolhido, no celular.
 *
 * Existe porque, com a grade de pacotes em uma coluna, o botão principal de pagar ficava depois de
 * todos os cards: o cliente tocava no pacote, nada visível acontecia, e ele tinha que rolar para
 * achar onde gerar o PIX. Usado nos dois checkouts (/criar e /entrega) para que se comportem igual.
 * No desktop fica escondido via CSS (.nx-inline-pay), onde o resumo com o botão já está à vista.
 */
export default function InlinePayButton({ price, onClick, busy, disabled }) {
  return (
    <div className="nx-inline-pay" id="inline-pay">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className="nx-pay-anim"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '16px 20px',
          minHeight: '54px',
          fontSize: '1.05rem',
          fontWeight: 800,
          borderRadius: '14px',
          background: 'var(--nx-pay, #059669)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: '#ffffff',
          border: 'none',
          cursor: disabled || busy ? 'default' : 'pointer',
        }}
      >
        {busy ? (<><Loader2 size={18} aria-hidden="true" /><span>Preparando seu PIX…</span></>) : (<><Zap size={18} aria-hidden="true" /><span>Pagar com PIX ({formatBrl(price)})</span></>)}
      </button>
    </div>
  );
}
