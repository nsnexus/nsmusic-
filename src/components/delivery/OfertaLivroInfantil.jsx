'use client';

import { useEffect, useState } from 'react';
import { deveMostrarOfertaLivro, pedidoParaCrianca, primeiroNomeCrianca, LINK_CORUJA_LULU } from '@/lib/ofertaLivroInfantil';

// Pop-up da Coruja Lulu na entrega. Aparece alguns segundos depois de a música ser liberada (para
// não atrapalhar o primeiro play/download) e só uma vez por pedido neste aparelho.
const ATRASO_MS = 7000;
const chaveVisto = (id) => `nsmusic_oferta_livro_${id}`;

function jaViuNoAparelho(id) {
  try { return Boolean(window.localStorage.getItem(chaveVisto(id))); } catch (e) { return false; }
}
function marcarVisto(id) {
  try { window.localStorage.setItem(chaveVisto(id), new Date().toISOString()); } catch (e) { /* storage bloqueado: só não lembra */ }
}

export default function OfertaLivroInfantil({ order, orderId, pago }) {
  const [aberto, setAberto] = useState(false);
  const id = order?.id || orderId || '';
  // Booleano (e não o objeto `order`) nas dependências: a página recarrega o pedido de tempos em
  // tempos e um objeto novo reiniciaria o temporizador sem parar.
  const elegivel = pedidoParaCrianca(order);

  useEffect(() => {
    if (!id || !deveMostrarOfertaLivro({ relationship: elegivel ? 'Filho' : '' }, { pago, jaVisto: jaViuNoAparelho(id) })) return undefined;
    const t = setTimeout(() => { setAberto(true); marcarVisto(id); }, ATRASO_MS);
    return () => clearTimeout(t);
  }, [id, pago, elegivel]);

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  if (!aberto) return null;

  const nome = primeiroNomeCrianca(order);
  const menina = ['Filha', 'Neta', 'Sobrinha'].includes(order?.relationship || order?.recipientType);
  const fechar = () => setAberto(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="oferta-livro-titulo"
      onClick={fechar}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10, 4, 24, 0.72)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px',
        animation: 'ofertaLivroFade .25s ease-out',
      }}
    >
      <style>{`
        @keyframes ofertaLivroFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ofertaLivroSobe { from { transform: translateY(40px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes ofertaLivroVoa { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-8px) rotate(4deg) } }
        @media (min-width: 640px) { .oferta-livro-caixa { margin-bottom: auto; margin-top: auto } }
      `}</style>
      <div
        className="oferta-livro-caixa"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: '400px', borderRadius: '24px', overflow: 'hidden',
          background: 'linear-gradient(165deg, #2a1065 0%, #6b2cf5 55%, #a855f7 100%)', color: '#fff',
          boxShadow: '0 24px 60px rgba(107, 44, 245, 0.45)', animation: 'ofertaLivroSobe .35s ease-out',
          fontFamily: 'var(--font-family-body)',
        }}
      >
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          style={{
            position: 'absolute', top: '10px', right: '10px', width: '34px', height: '34px', borderRadius: '50%',
            border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: '18px', cursor: 'pointer',
          }}
        >
          ✕
        </button>

        <div style={{ padding: '26px 22px 8px', textAlign: 'center' }}>
          <div aria-hidden="true" style={{ fontSize: '56px', lineHeight: 1, animation: 'ofertaLivroVoa 3s ease-in-out infinite' }}>🦉📖</div>
          <p style={{ margin: '12px 0 4px', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>
            Novidade da família NS
          </p>
          <h2 id="oferta-livro-titulo" style={{ margin: 0, fontSize: '23px', lineHeight: 1.25, fontFamily: 'var(--font-family-title)' }}>
            {nome ? <>E se {nome} virasse {menina ? 'a heroína' : 'o herói'} de um livro? ✨</> : <>E se a criança virasse a estrela de um livro? ✨</>}
          </h2>
          <p style={{ margin: '12px 0 0', fontSize: '15px', lineHeight: 1.5, opacity: 0.95 }}>
            A <strong>Coruja Lulu</strong> cria um livro infantil ilustrado com a foto da criança, onde ela é a personagem principal da história.
          </p>
        </div>

        <ul style={{ listStyle: 'none', margin: '14px 22px 0', padding: '12px 14px', borderRadius: '16px', background: 'rgba(255,255,255,0.12)', fontSize: '14px', lineHeight: 1.7 }}>
          <li>📸 Ilustrações feitas a partir da foto</li>
          <li>📖 Uma história mágica feita só para ela</li>
          <li>⏱️ Fica pronto em 2 minutos</li>
        </ul>

        <div style={{ padding: '16px 22px 22px' }}>
          <a
            href={LINK_CORUJA_LULU}
            target="_blank"
            rel="noopener"
            onClick={fechar}
            style={{
              display: 'block', textAlign: 'center', textDecoration: 'none', fontWeight: 800, fontSize: '17px',
              padding: '15px', borderRadius: '14px', background: '#ffd84d', color: '#2a1065',
              boxShadow: '0 6px 0 #d4a900',
            }}
          >
            Ver a prévia grátis 🦉
          </a>
          <button
            type="button"
            onClick={fechar}
            style={{ display: 'block', width: '100%', marginTop: '12px', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.8)', fontSize: '14px', cursor: 'pointer' }}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
