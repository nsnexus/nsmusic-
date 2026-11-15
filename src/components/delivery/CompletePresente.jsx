'use client';

import React from 'react';
import { Film, Mail, Images, Music, Mic2, AudioLines } from 'lucide-react';
import { getPriceForSku } from '@/lib/pricing';

// Vitrine dos complementos que o cliente ainda não tem. O preço aqui é só rótulo: quem cobra é
// o servidor, a partir do sku (ver src/lib/pricing.js).
const CATALOGO = [
  { key: 'video', sku: 'video_addon', Icone: Film, titulo: 'Vídeo homenagem', desc: 'Suas fotos em vídeo com a música' },
  { key: 'carta', sku: 'carta_addon', Icone: Mail, titulo: 'Carta virtual', desc: 'Uma carta escrita para acompanhar' },
  { key: 'retrospectiva', sku: 'retrospectiva_addon', Icone: Images, titulo: 'Retrospectiva', desc: 'Linha do tempo com fotos e datas' },
  { key: 'voz', sku: 'custom_voice_addon', Icone: AudioLines, titulo: 'Cantada com a sua voz', desc: 'A música com a sua própria voz' },
  { key: 'karaoke', sku: 'karaoke_addon', Icone: Mic2, titulo: 'Vídeo karaokê', desc: 'Letra na tela para cantar junto' },
  { key: 'playback', sku: 'playback_addon', Icone: Music, titulo: 'Playback instrumental', desc: 'Só a base, sem voz' },
];

function formatarPreco(valor) {
  return typeof valor === 'number' ? `R$ ${valor.toFixed(2).replace('.', ',')}` : null;
}

export default function CompletePresente({ itens, onProduct }) {
  const donos = new Set((itens || []).filter((i) => i.owned).map((i) => i.key));
  const lista = CATALOGO.filter((c) => !donos.has(c.key));
  if (lista.length === 0) return null;
  return (
    <section aria-labelledby="complete-presente-t" style={{ marginTop: '4px' }}>
      <h2 id="complete-presente-t" style={{ margin: '0 0 4px', fontSize: '1.15rem' }}>Deixe o presente ainda mais especial</h2>
      <p style={{ margin: '0 0 12px', fontSize: '0.86rem', color: '#6c636f' }}>Toque para ver como fica e o valor antes de comprar.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
        {lista.map(({ key, sku, Icone, titulo, desc }) => {
          const preco = formatarPreco(getPriceForSku(sku));
          return (
            <button
              key={key}
              type="button"
              onClick={() => onProduct(key)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '14px', borderRadius: '16px', border: '1.5px solid #e4e0ea', background: '#ffffff', textAlign: 'left', cursor: 'pointer', color: '#1f1a24' }}
            >
              <span style={{ display: 'inline-flex', width: '38px', height: '38px', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', background: '#f5f3ff', color: '#6d28d9' }}>
                <Icone size={20} aria-hidden="true" />
              </span>
              <strong style={{ fontSize: '0.92rem', lineHeight: 1.2 }}>{titulo}</strong>
              <span style={{ fontSize: '0.78rem', color: '#6c636f', lineHeight: 1.3 }}>{desc}</span>
              <span style={{ marginTop: 'auto', display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#6d28d9' }}>
                {preco && <span>{preco}</span>}
                <span>Ver →</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
