'use client';

import { getPriceForSku } from '@/lib/pricing';

// Pop-up de oferta dos extras, exibido na página de entrega logo depois da música ficar pronta.
//
// Substitui o VideoOfferModal (que oferecia só o vídeo) por decisão do dono do estúdio em
// 03/09/2026: a mesma interrupção agora apresenta os três produtos de uma vez — vídeo, carta e
// retrospectiva. Interromper o cliente uma vez com três opções vende mais que interromper uma vez
// com uma só, e evita ter que criar um segundo pop-up pra cada produto novo.
//
// Este componente NÃO cobra nada: ele só devolve a escolha (onSelect) pra página de entrega, que já
// sabe criar a cobrança de cada SKU. Preço sempre do catálogo do servidor (getPriceForSku), nunca
// escrito à mão aqui — número solto em texto foi exatamente o que deu divergência entre tela e
// cobrança em outros pontos do projeto.
const formatarPreco = (sku) => {
  const preco = getPriceForSku(sku);
  return preco === null ? '' : `R$ ${preco.toFixed(2).replace('.', ',')}`;
};

export default function ExtrasOfferModal({ isOpen, onClose, onSelect, honoreeName = 'alguém especial', jaTemVideo = false }) {
  if (!isOpen) return null;

  const opcoes = [
    !jaTemVideo && {
      sku: 'video_addon',
      icone: '🎬',
      titulo: 'Vídeo Homenagem',
      desc: `Um clipe com 10 a 20 fotos de ${honoreeName} sincronizadas com a sua música.`,
      cor: '#ec4899',
    },
    {
      sku: 'retrospectiva_addon',
      icone: '📖',
      titulo: 'Retrospectiva',
      desc: 'Uma página só de vocês, com a música tocando de fundo, linha do tempo, contador ao vivo e quiz. Um link pra mandar pra família.',
      cor: '#a855f7',
      destaque: true,
    },
    {
      sku: 'carta_addon',
      icone: '💌',
      titulo: 'Carta Virtual',
      desc: 'Uma carta escrita a partir da mesma história da sua música, com envelope, foto e sua assinatura.',
      cor: '#f59e0b',
    },
  ].filter(Boolean);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000,
        overflowY: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Ofertas extras para o seu pedido"
    >
      <div
        className="glass-card"
        style={{
          maxWidth: '440px',
          width: '100%',
          background: '#fff',
          borderRadius: '18px',
          padding: '24px 20px',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '1.9rem', marginBottom: '4px' }}>✨</div>
          <h3 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.2rem', color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Quer deixar essa homenagem ainda maior?
          </h3>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            A música já está pronta. Esses extras usam a <strong>mesma história</strong> que você
            contou — é só escolher.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {opcoes.map((opcao) => (
            <button
              key={opcao.sku}
              type="button"
              onClick={() => onSelect(opcao.sku)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                textAlign: 'left',
                padding: '14px',
                borderRadius: '14px',
                border: `1.5px solid ${opcao.destaque ? opcao.cor : 'var(--border-color)'}`,
                background: opcao.destaque ? `${opcao.cor}12` : 'var(--bg-primary)',
                cursor: 'pointer',
                width: '100%',
                position: 'relative',
              }}
            >
              {opcao.destaque && (
                <span style={{ position: 'absolute', top: '-9px', right: '12px', background: opcao.cor, color: '#fff', fontSize: '0.62rem', fontWeight: '800', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.05em' }}>
                  MAIS COMPLETO
                </span>
              )}
              <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{opcao.icone}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {opcao.titulo}
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '6px' }}>
                  {opcao.desc}
                </span>
                <span style={{ display: 'inline-block', fontWeight: '800', fontSize: '0.95rem', color: opcao.cor }}>
                  {formatarPreco(opcao.sku)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', marginTop: '14px', padding: '11px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}
        >
          Agora não, obrigado
        </button>
      </div>
    </div>
  );
}
