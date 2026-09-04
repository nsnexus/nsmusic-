'use client';

import { getPriceForSku } from '@/lib/pricing';

// Pop-up de oferta dos extras, exibido na página de entrega logo depois da música ficar pronta.
//
// Vira seletor de PACOTE de verdade (04/09/2026, achado: "clico e nada acontece, o valor não
// altera" — antes de pagar, escolher retrospectiva/carta só tentava rolar até um card que nem
// existia ainda, porque esses cards só aparecem depois de pago). Agora:
//   - antes de pagar (isPaid=false): cada opção mostra o preço do COMBO (música + aquele extra) e,
//     ao clicar, já gera o PIX daquele combo — dinâmico de verdade, preço muda na hora;
//   - depois de pago (isPaid=true): mostra o preço do add-on avulso;
//   - quem já comprou um extra some da lista sozinho (jaTem*) — não faz sentido oferecer de novo.
//
// Este componente NÃO cobra nada: ele só devolve a escolha (onSelect) pra página de entrega, que já
// sabe criar a cobrança certa. Preço sempre do catálogo do servidor (getPriceForSku), nunca escrito
// à mão aqui — número solto em texto foi exatamente o que deu divergência entre tela e cobrança em
// outros pontos do projeto.
const COMBO_SKU_POR_EXTRA = {
  video_addon: 'combo',
  carta_addon: 'combo_carta',
  retrospectiva_addon: 'combo_retrospectiva',
};

export default function ExtrasOfferModal({
  isOpen,
  onClose,
  onSelect,
  honoreeName = 'alguém especial',
  isPaid = false,
  jaTemVideo = false,
  jaTemCarta = false,
  jaTemRetrospectiva = false,
}) {
  if (!isOpen) return null;

  // Preço exibido: combo (música + extra) antes de pagar, add-on avulso depois — é literalmente o
  // que vai ser cobrado em cada caso, nunca um número "quase certo".
  const precoExibido = (sku) => {
    const skuReal = !isPaid && COMBO_SKU_POR_EXTRA[sku] ? COMBO_SKU_POR_EXTRA[sku] : sku;
    const preco = getPriceForSku(skuReal);
    return preco === null ? '' : `R$ ${preco.toFixed(2).replace('.', ',')}`;
  };

  const opcoes = [
    !jaTemVideo && {
      sku: 'video_addon',
      icone: '🎬',
      titulo: 'Vídeo Homenagem',
      desc: `Um clipe com 10 a 20 fotos de ${honoreeName} sincronizadas com a sua música.`,
      cor: '#ec4899',
    },
    !jaTemRetrospectiva && {
      sku: 'retrospectiva_addon',
      icone: '📖',
      titulo: 'Retrospectiva',
      desc: 'Uma página só de vocês, com a música tocando de fundo, linha do tempo, contador ao vivo e quiz. Um link pra mandar pra família.',
      cor: '#a855f7',
      destaque: true,
    },
    !jaTemCarta && {
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
            {isPaid ? 'Quer deixar essa homenagem ainda maior?' : 'Escolha o seu pacote'}
          </h3>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            {isPaid
              ? <>A música já está pronta. Esses extras usam a <strong>mesma história</strong> que você contou — é só escolher.</>
              : 'Pode levar só a música, ou já incluir um extra no mesmo pagamento — sai mais barato que comprar separado depois.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!isPaid && (
            <button
              type="button"
              onClick={() => onSelect('audio_only')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'left',
                padding: '14px',
                borderRadius: '14px',
                border: '1.5px solid var(--border-color)',
                background: 'var(--bg-primary)',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>🎵</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Só a música
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {precoExibido('audio_only')}
                </span>
              </span>
            </button>
          )}

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
                  {isPaid ? opcao.titulo : `Música + ${opcao.titulo}`}
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '6px' }}>
                  {opcao.desc}
                </span>
                <span style={{ display: 'inline-block', fontWeight: '800', fontSize: '0.95rem', color: opcao.cor }}>
                  {precoExibido(opcao.sku)}
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
