'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Zap } from 'lucide-react';
import { formatBrl } from '@/lib/deliveryPackages';
import { getPriceForSku } from '@/lib/pricing';

export default function MobileStickyBar({ onScrollToCheckout }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Visível desde o topo: antes só aparecia depois de 260px de rolagem, e quem terminava a
      // prévia sem rolar não via nenhum botão de compra na tela.
      // Esconde se o painel de pagamento já estiver visível na tela
      const checkoutEl = document.getElementById('checkout-panel') || document.getElementById('pagamento');
      if (checkoutEl) {
        const rect = checkoutEl.getBoundingClientRect();
        const inView = rect.top < window.innerHeight * 0.75 && rect.bottom > 80;
        setIsVisible(!inView);
      } else {
        setIsVisible(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <>
      <style>{`
        @media (min-width: 768px) {
          .impeccable-mobile-sticky-bar {
            display: none !important;
          }
        }
        @keyframes stickyBarSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        className="impeccable-mobile-sticky-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 90,
          backgroundColor: '#ffffff',
          borderTop: '1px solid rgba(139, 92, 246, 0.2)',
          padding: '10px 16px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.12)',
          display: 'flex',
          alignItems: 'center',
          animation: 'stickyBarSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <button
          type="button"
          onClick={onScrollToCheckout}
          style={{
            width: '100%',
            backgroundColor: '#059669',
            color: '#ffffff',
            border: 'none',
            borderRadius: '14px',
            padding: '14px 20px',
            fontSize: '0.96rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
            letterSpacing: '0.01em',
            transition: 'transform 0.15s ease',
          }}
        >
          <Zap size={18} fill="#ffffff" />
          <span>Liberar música completa · {formatBrl(getPriceForSku('audio_only'))}</span>
          <ArrowUpRight size={18} />
        </button>
      </div>
    </>
  );
}
