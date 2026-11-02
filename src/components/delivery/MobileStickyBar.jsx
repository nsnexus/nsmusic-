'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Zap } from 'lucide-react';

export default function MobileStickyBar({ onScrollToCheckout, price = 'R$ 9,99' }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Aparece após rolar 280px (quando passa da capa da música)
      const scrolled = window.scrollY > 280;
      // Esconde se o painel de pagamento já estiver bem no meio da tela
      const checkoutEl = document.getElementById('checkout-panel');
      if (checkoutEl) {
        const rect = checkoutEl.getBoundingClientRect();
        const inView = rect.top < window.innerHeight * 0.7 && rect.bottom > 100;
        setIsVisible(scrolled && !inView);
      } else {
        setIsVisible(scrolled);
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
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1.5px solid rgba(139, 92, 246, 0.25)',
          padding: '10px 16px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 24px rgba(15, 23, 42, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'stickyBarSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6d28d9', display: 'block' }}>
            Canção Completa Oficial
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '1.18rem', fontWeight: 900, color: '#1e1b4b', letterSpacing: '-0.02em' }}>
              {price}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
              · PIX Instantâneo
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onScrollToCheckout}
          style={{
            backgroundColor: '#059669',
            color: '#ffffff',
            border: 'none',
            borderRadius: '999px',
            padding: '12px 18px',
            fontSize: '0.92rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
            transition: 'transform 0.15s ease',
          }}
        >
          <Zap size={16} fill="#ffffff" />
          <span>Liberar Agora</span>
          <ArrowUpRight size={16} />
        </button>
      </div>
    </>
  );
}

