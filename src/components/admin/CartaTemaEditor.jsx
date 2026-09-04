'use client';

import { useRef, useState } from 'react';
import { CARTA_ASPECT_RATIO } from '@/lib/cartaModelo';

// Editor visual (arrastar + redimensionar) da caixa de texto sobre a imagem de fundo de um modelo
// de carta — pedido 04/09/2026: "vc mostra como ela ficaria... aí eu redimensiono a caixa do
// texto". Tudo em % do cartão (não px), pra bater exatamente com a mesma % usada depois na página
// pública (ver CARTA_ASPECT_RATIO/CAIXA_TEXTO_PADRAO em src/lib/cartaModelo.js).
//
// Sem biblioteca de drag-resize (nenhuma instalada no projeto) — Pointer Events cobrem mover
// (arrastar a caixa) e redimensionar (alça no canto) com ~40 linhas, sem dependência nova.

function clamp(valor, min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(Math.max(valor, lo), hi);
}

export default function CartaTemaEditor({ imagemUrl, caixaTexto, onChangeCaixa }) {
  const containerRef = useRef(null);
  const [arraste, setArraste] = useState(null); // { modo: 'mover'|'redimensionar', xInicial, yInicial, caixaInicial }

  const iniciarArraste = (e, modo) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArraste({ modo, xInicial: e.clientX, yInicial: e.clientY, caixaInicial: { ...caixaTexto } });
  };

  const mover = (e) => {
    if (!arraste || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - arraste.xInicial) / rect.width) * 100;
    const dy = ((e.clientY - arraste.yInicial) / rect.height) * 100;
    const c = arraste.caixaInicial;

    if (arraste.modo === 'mover') {
      onChangeCaixa({
        ...c,
        left: clamp(c.left + dx, 0, 100 - c.width),
        top: clamp(c.top + dy, 0, 100 - c.height),
      });
    } else {
      onChangeCaixa({
        ...c,
        width: clamp(c.width + dx, 12, 100 - c.left),
        height: clamp(c.height + dy, 8, 100 - c.top),
      });
    }
  };

  const soltar = () => setArraste(null);

  return (
    <div
      ref={containerRef}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: String(CARTA_ASPECT_RATIO),
        borderRadius: '10px',
        overflow: 'hidden',
        background: imagemUrl ? '#000' : 'repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 10px, #e2e8f0 10px, #e2e8f0 20px)',
      }}
    >
      {imagemUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagemUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {!imagemUrl && (
        <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', padding: '20px' }}>
          Envie uma imagem pra ver a prévia aqui
        </p>
      )}

      <div
        onPointerDown={(e) => iniciarArraste(e, 'mover')}
        style={{
          position: 'absolute',
          top: `${caixaTexto.top}%`,
          left: `${caixaTexto.left}%`,
          width: `${caixaTexto.width}%`,
          height: `${caixaTexto.height}%`,
          border: '2px dashed #22d3ee',
          background: 'rgba(34,211,238,0.14)',
          cursor: arraste?.modo === 'mover' ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '0.62rem', fontWeight: '800', color: '#0e7490', background: 'rgba(255,255,255,0.75)', padding: '1px 5px', borderRadius: '4px' }}>
          texto aqui
        </span>
        <div
          onPointerDown={(e) => iniciarArraste(e, 'redimensionar')}
          style={{
            position: 'absolute',
            bottom: '-8px',
            right: '-8px',
            width: '18px',
            height: '18px',
            borderRadius: '5px',
            background: '#22d3ee',
            border: '2px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            cursor: 'nwse-resize',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  );
}
