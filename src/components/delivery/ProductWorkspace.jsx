'use client';

import Image from 'next/image';
import Link from 'next/link';

const products = {
  video: { title: 'Suas memórias, em movimento.', description: 'Escolha as fotos, combine com a sua música e transforme tudo em um presente para guardar.' },
  carta: { title: 'Palavras que ficam.', description: 'Dê o seu toque à carta, escolha a apresentação e prepare uma surpresa com a sua música.' },
  retrospectiva: { title: 'Uma história para reviver.', description: 'Reúna fotos, datas e lembranças em uma página feita para compartilhar.' },
};

export default function ProductWorkspace({ product, honoree, onProduct, children }) {
  const current = products[product];
  return <div className="nx-experience nx-product-workspace">
    <header className="nx-header"><div className="nx-header-inner"><Link href="/" className="nx-brand"><Image src="/logo.png" alt="NS Music" width={44} height={44} /><span>Histórias que viram música.</span></Link><Link href="/conta" className="nx-account-link">Minha conta</Link></div></header>
    <main className="nx-product-main">
      <button type="button" className="nx-text-button nx-back-link" onClick={() => onProduct('musica')}>← Voltar à minha música</button>
      <nav className="nx-product-nav" aria-label="Personalizar meu presente">{[['video', 'Vídeo'], ['carta', 'Carta'], ['retrospectiva', 'Retrospectiva']].map(([key, label]) => <button type="button" key={key} aria-current={product === key ? 'page' : undefined} onClick={() => onProduct(key)}>{label}</button>)}</nav>
      <div className="nx-product-heading"><span className="nx-eyebrow">{honoree ? `Seu presente para ${honoree}` : 'Do seu jeito, com carinho'}</span><h1>{current.title}</h1><p>{current.description}</p></div>
      {children}
      <footer className="nx-product-footer"><Image src="/logo.png" alt="NS Music" width={28} height={28} /><span>Um presente com a sua história.</span><button type="button" className="nx-text-button" onClick={() => onProduct('musica')}>Voltar à música</button></footer>
    </main>
  </div>;
}
