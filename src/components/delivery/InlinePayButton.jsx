'use client';

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
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '16px 20px',
          minHeight: '54px',
          fontSize: '1.05rem',
          fontWeight: 800,
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          color: '#ffffff',
          border: 'none',
          cursor: disabled || busy ? 'default' : 'pointer',
          boxShadow: '0 6px 18px rgba(5, 150, 105, 0.35)',
        }}
      >
        {busy ? '⏳ Preparando seu PIX…' : `⚡ Pagar com PIX (${formatBrl(price)})`}
      </button>
    </div>
  );
}
