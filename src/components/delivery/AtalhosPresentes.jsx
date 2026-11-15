'use client';

import React from 'react';
import { Film, Mail, Images, Music, Mic2, AudioLines, Check } from 'lucide-react';

// Atalhos no topo da página paga para os presentes que o cliente já comprou.
// Todos os blocos têm o mesmo tamanho: ícone + rótulo curto + status.
const ITENS = {
  video: { Icone: Film, rotulo: 'Vídeo' },
  carta: { Icone: Mail, rotulo: 'Carta' },
  retrospectiva: { Icone: Images, rotulo: 'Retrospectiva' },
  voz: { Icone: AudioLines, rotulo: 'Minha voz' },
  karaoke: { Icone: Mic2, rotulo: 'Karaokê' },
  playback: { Icone: Music, rotulo: 'Playback' },
};

function estaPronto(item) {
  if (item.key === 'video') return item.action === 'Assistir e baixar';
  if (item.key === 'carta') return item.action === 'Ver ou editar carta';
  return false;
}

export default function AtalhosPresentes({ itens, onProduct }) {
  const lista = (itens || []).filter((i) => i.owned && ITENS[i.key]);
  if (lista.length === 0) return null;
  return (
    <section
      aria-label="Seus presentes"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', margin: '0 0 14px' }}
    >
      {lista.map((item) => {
        const { Icone, rotulo } = ITENS[item.key];
        const pronto = estaPronto(item);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onProduct(item.key)}
            aria-label={`${rotulo}: ${pronto ? 'ver' : 'criar'}`}
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '6px', height: '84px', minWidth: 0, padding: '8px 4px', borderRadius: '14px', cursor: 'pointer',
              border: '1px solid #e7e2ef', background: '#ffffff', color: '#1f1a24',
              boxShadow: '0 1px 2px rgba(31, 26, 36, 0.04)',
            }}
          >
            <span style={{ display: 'inline-flex', width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#f3effb', color: '#6d28d9' }}>
              <Icone size={18} aria-hidden="true" />
            </span>
            <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.2 }}>
              {rotulo}
            </span>
            {pronto && (
              <span aria-hidden="true" style={{ position: 'absolute', top: '6px', right: '6px', display: 'inline-flex', width: '16px', height: '16px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#059669', color: '#ffffff' }}>
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}
