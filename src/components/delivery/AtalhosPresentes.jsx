'use client';

import React from 'react';
import { Film, Mail, Images, Music, Mic2, AudioLines } from 'lucide-react';

const ICONES = { video: Film, carta: Mail, retrospectiva: Images, playback: Music, karaoke: Mic2, voz: AudioLines };
const ROTULOS = {
  video: { novo: 'Criar vídeo', feito: 'Ver vídeo', sub: 'Enviar fotos' },
  carta: { novo: 'Escrever carta', feito: 'Ver carta', sub: 'Carta virtual' },
  retrospectiva: { novo: 'Montar retrospectiva', feito: 'Montar retrospectiva', sub: 'Fotos e datas' },
  playback: { novo: 'Playback', feito: 'Playback', sub: 'Ouvir e baixar' },
  karaoke: { novo: 'Karaokê', feito: 'Karaokê', sub: 'Cantar junto' },
  voz: { novo: 'Minha voz', feito: 'Minha voz', sub: 'Personalizar' },
};

// Atalhos no topo da página paga para os presentes que o cliente já comprou
// (vídeo, carta, retrospectiva), sem precisar procurar mais abaixo.
export default function AtalhosPresentes({ itens, onProduct }) {
  const lista = (itens || []).filter((i) => i.owned && ROTULOS[i.key]);
  if (lista.length === 0) return null;
  return (
    <section aria-label="Seus presentes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: '8px' }}>
      {lista.map((item) => {
        const Icone = ICONES[item.key];
        const feito = item.key === 'video' ? item.action === 'Assistir e baixar' : item.key === 'carta' ? item.action === 'Ver ou editar carta' : false;
        const r = ROTULOS[item.key];
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onProduct(item.key)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px',
              minHeight: '92px', padding: '12px', borderRadius: '16px', textAlign: 'left', cursor: 'pointer',
              border: feito ? '1.5px solid #e4e0ea' : '1.5px solid #6d28d9',
              background: feito ? '#ffffff' : '#f5f3ff', color: '#1f1a24',
            }}
          >
            <Icone size={22} aria-hidden="true" style={{ color: '#6d28d9' }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <strong style={{ fontSize: '0.88rem', lineHeight: 1.2 }}>{feito ? r.feito : r.novo}</strong>
              <span style={{ fontSize: '0.72rem', color: '#6c636f' }}>{r.sub}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
