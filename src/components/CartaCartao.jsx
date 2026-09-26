'use client';

import { useState, useEffect } from 'react';
import { cartaTemaId, CARTA_ASPECT_RATIO, CAIXA_TEXTO_PADRAO } from '@/lib/cartaModelo';

// Cartão da carta em si (foto + texto + assinatura) — usado tanto na página pública (/carta) quanto
// no editor (CartaAddonCard).
export default function CartaCartao({ order, texto, remetente, honoree }) {
  const [tema, setTema] = useState(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const temaId = cartaTemaId(order || {});
        const res = await fetch('/api/carta/temas');
        if (res.ok) {
          const json = await res.json();
          const temaData = json?.temas?.[temaId];
          if (!ativo) return;
          setTema(temaData?.imagemUrl ? temaData : null);
        } else {
          if (!ativo) return;
          setTema(null);
        }
      } catch (e) {
        if (ativo) setTema(null);
      } finally {
        if (ativo) setCarregado(true);
      }
    })();
    return () => { ativo = false; };
  }, [order]);

  // Enquanto não sabe se tem tema, evita o "pulo" de layout: mostra o cartão simples direto (só
  // troca pro com imagem se/quando a busca confirmar que existe uma).
  const usarTema = carregado && tema?.imagemUrl;
  const caixa = tema?.caixaTexto || CAIXA_TEXTO_PADRAO;

  if (usarTema) {
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: String(CARTA_ASPECT_RATIO),
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tema.imagemUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div
          style={{
            position: 'absolute',
            top: `${caixa.top}%`,
            left: `${caixa.left}%`,
            width: `${caixa.width}%`,
            height: `${caixa.height}%`,
            overflowY: 'auto',
            padding: '4%',
            boxSizing: 'border-box',
          }}
        >
          <p style={{ whiteSpace: 'pre-wrap', fontSize: '1rem', lineHeight: '1.85', color: '#2b2118', margin: 0, textShadow: '0 1px 2px rgba(255,255,255,0.5)' }}>
            {texto}
          </p>
          {remetente && (
            <p style={{ marginTop: '18px', textAlign: 'right', fontFamily: 'cursive', fontSize: '1.3rem', color: '#5c3a1e' }}>
              {remetente}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Fallback: cartão de papel simples, comportamento de sempre (sem tema configurado ainda).
  return (
    <div
      style={{
        background: '#fffdf7',
        border: '1px solid #f1e6cf',
        borderRadius: '20px',
        padding: '32px 26px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.12), inset 0 0 40px rgba(180, 150, 90, 0.08)',
      }}
    >
      {order?.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={order.coverUrl}
          alt={honoree ? `Foto de ${honoree}` : 'Foto da homenagem'}
          style={{ width: '120px', height: '120px', objectFit: 'cover', float: 'right', marginLeft: '16px', marginBottom: '12px', border: '6px solid #fff', boxShadow: '0 6px 16px rgba(0,0,0,0.2)', transform: 'rotate(3deg)', borderRadius: '2px' }}
        />
      )}
      <p style={{ whiteSpace: 'pre-wrap', fontSize: '1rem', lineHeight: '1.9', color: '#3f3a2f', margin: 0 }}>
        {texto}
      </p>
      {remetente && (
        <p style={{ clear: 'both', marginTop: '22px', textAlign: 'right', fontFamily: 'cursive', fontSize: '1.35rem', color: '#8a6d3b' }}>
          {remetente}
        </p>
      )}
    </div>
  );
}
