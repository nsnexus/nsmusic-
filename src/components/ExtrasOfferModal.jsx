'use client';

import { useState } from 'react';
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
  // Estado antes do early return: hook tem que rodar sempre na mesma ordem.
  const [naoMostrarMais, setNaoMostrarMais] = useState(false);

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
      desc: `Clipe com as fotos de ${honoreeName} no ritmo da música.`,
      cor: '#ec4899',
    },
    !jaTemRetrospectiva && {
      sku: 'retrospectiva_addon',
      icone: '📖',
      titulo: 'Retrospectiva',
      desc: 'Página só de vocês, com linha do tempo, contador ao vivo e a música tocando.',
      cor: '#a855f7',
      destaque: true,
    },
    !jaTemCarta && {
      sku: 'carta_addon',
      icone: '💌',
      titulo: 'Carta Virtual',
      desc: 'Carta com envelope e foto, escrita a partir da mesma história.',
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
          padding: '18px 16px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>✨</div>
          <h3 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.2rem', color: 'var(--text-primary)', margin: '0 0 6px' }}>
            {isPaid ? 'Quer deixar essa homenagem ainda maior?' : 'Escolha o seu pacote'}
          </h3>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            {isPaid
              ? <>A música já está pronta. Esses extras usam a <strong>mesma história</strong> que você contou — é só escolher.</>
              : 'Leve só a música, ou inclua um extra no mesmo pagamento e pague menos que comprando depois.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {!isPaid && (
            <button
              type="button"
              onClick={() => onSelect('audio_only')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1.5px solid var(--border-color)',
                background: 'var(--bg-primary)',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🎵</span>
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
                padding: '10px 12px',
                borderRadius: '12px',
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
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{opcao.icone}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {isPaid ? opcao.titulo : `Música + ${opcao.titulo}`}
                </span>
                <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.35, marginBottom: '3px' }}>
                  {opcao.desc}
                </span>
                <span style={{ display: 'inline-block', fontWeight: '800', fontSize: '0.95rem', color: opcao.cor }}>
                  {precoExibido(opcao.sku)}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Saída com cara de botão. Antes era texto solto sem borda, e o dono do estúdio relatou
            não perceber que dava para clicar. */}
        <button
          type="button"
          onClick={() => onClose(naoMostrarMais)}
          style={{
            width: '100%',
            marginTop: '12px',
            padding: '10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Agora não, obrigado
        </button>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={naoMostrarMais}
            onChange={(e) => setNaoMostrarMais(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Não mostrar esta oferta de novo
        </label>
      </div>
    </div>
  );
}
