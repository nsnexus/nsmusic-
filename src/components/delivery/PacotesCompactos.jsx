'use client';

import Image from 'next/image';
import { Check, Zap, Loader2 } from 'lucide-react';
import { deliveryPackages, formatBrl, seloRedes, SeloRedesEstilo } from '@/lib/deliveryPackages';

// Escolha do pacote no último passo do /criar, em lista compacta (pedido do dono, 19/11/2026):
// o cliente chega no pagamento e vê TODOS os pacotes e o botão de pagar sem rolar a tela, no
// celular. Cada linha: imagem, nome, o que vem junto e o preço. O Vídeo (combo) é o "mais comprado"
// e vem marcado; o Pacote Família fica em destaque no fim.
//
// Preço e nome vêm de deliveryPackages() → pricing.js: a tela nunca inventa valor.

const IMAGENS = {
  audio_only: '/icons/3d/musical-note.webp',
  combo_carta: '/icons/3d/love-letter.webp',
  combo: '/icons/3d/clapper-board.webp',
  combo_retrospectiva: '/icons/3d/framed-picture.webp',
  combo_voz: '/icons/3d/studio-microphone.webp',
};

function Radio({ marcado, cor = '#7c3aed' }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${marcado ? cor : '#cfc6d1'}`, background: marcado ? cor : '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {marcado && <Check size={12} color="#fff" strokeWidth={3.5} />}
    </span>
  );
}

function Linha({ pack, marcado, onSelect, disabled, gerando }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcado}
      disabled={disabled}
      onClick={onSelect}
      className="nx-pacote-linha"
      style={{
        position: 'relative', width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 8px', minHeight: '46px', borderRadius: '12px', textAlign: 'left', font: 'inherit', color: '#29232d',
        background: marcado ? '#f5f3ff' : '#ffffff',
        border: marcado ? '2px solid #7c3aed' : '1.5px solid #e7e0e8',
        boxShadow: marcado ? '0 4px 14px rgba(124, 58, 237, 0.18)' : 'none',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {pack.featured && pack.badge && (
        <span style={{ position: 'absolute', top: '-9px', right: '12px', background: '#7c3aed', color: '#fff', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em', padding: '2px 8px', borderRadius: '999px' }}>
          ⭐ {pack.badge}
        </span>
      )}
      <Radio marcado={marcado} />
      <Image src={IMAGENS[pack.sku] || IMAGENS.combo} alt="" width={30} height={30} unoptimized style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pack.curto}</span>
        <span style={{ display: 'block', fontSize: '0.7rem', color: '#5d5563', lineHeight: 1.25 }}>{pack.resumo}</span>
        {seloRedes(pack.sku) && <span style={SeloRedesEstilo(seloRedes(pack.sku).tipo)}>{seloRedes(pack.sku).texto}</span>}
      </span>
      <span style={{ flexShrink: 0, padding: '5px 8px', borderRadius: '999px', background: 'linear-gradient(180deg, #fde047 0%, #f59e0b 100%)', color: '#3b2504', fontWeight: 900, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {gerando ? 'Gerando PIX…' : formatBrl(pack.price)}
      </span>
    </button>
  );
}

function Familia({ pack, marcado, onSelect, disabled, gerando }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcado}
      disabled={disabled}
      onClick={onSelect}
      style={{
        position: 'relative', width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'stretch', gap: '10px',
        padding: '7px', marginTop: '4px', borderRadius: '16px', textAlign: 'left', font: 'inherit', color: '#fff', overflow: 'visible',
        background: 'linear-gradient(135deg, #4c1d95 0%, #7e22ce 55%, #be123c 100%)',
        border: marcado ? '3px solid #fbbf24' : '2px solid #f59e0b',
        boxShadow: marcado ? '0 0 0 3px rgba(251, 191, 36, 0.35), 0 8px 22px rgba(190, 18, 60, 0.35)' : '0 6px 18px rgba(124, 34, 206, 0.28)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.05em', padding: '2px 10px', borderRadius: '999px', border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
        🔥 OFERTA ESPECIAL
      </span>
      <span style={{ position: 'relative', width: '56px', minHeight: '68px', flexShrink: 0, borderRadius: '11px', overflow: 'hidden' }}>
        <Image src="/experiencia/familia.webp" alt="" fill sizes="56px" style={{ objectFit: 'cover' }} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '2px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Radio marcado={marcado} cor="#f59e0b" />
          <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fde68a', lineHeight: 1.1, whiteSpace: 'nowrap' }}>👑 {pack.curto}</span>
        </span>
        <span style={{ fontSize: '0.7rem', lineHeight: 1.25, color: '#f5f3ff' }}>{pack.resumo}</span>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#bbf7d0' }}>📲 Posta no Status, Reels e TikTok</span>
        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#fde047', lineHeight: 1.2 }}>+ 5 músicas extras, novas letras e estilos</span>
      </span>
      <span style={{ alignSelf: 'flex-end', flexShrink: 0, padding: '5px 9px', borderRadius: '11px', background: 'linear-gradient(180deg, #fde047 0%, #f59e0b 100%)', color: '#3b0764', fontWeight: 900, fontSize: '0.98rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {formatBrl(pack.price)}
      </span>
    </button>
  );
}

// `pagarAoEscolher`: tocar no pacote já gera o PIX (onSelect faz as duas coisas) e o botão "Pagar"
// some; o pacote tocado mostra "gerando PIX…" enquanto espera.
export default function PacotesCompactos({ selecionado, onSelect, onPagar, pagando, disabled, pagarAoEscolher = false }) {
  const pacotes = deliveryPackages();
  const familia = pacotes.find((p) => p.sku === 'combo_familia');
  const demais = pacotes.filter((p) => p.sku !== 'combo_familia');
  const escolhido = pacotes.find((p) => p.sku === selecionado) || pacotes.find((p) => p.sku === 'combo');

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto' }}>
      <div role="radiogroup" aria-label="Pacotes" style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {demais.map((pack) => (
          <Linha key={pack.sku} pack={pack} marcado={selecionado === pack.sku} gerando={pagarAoEscolher && pagando && selecionado === pack.sku} onSelect={() => onSelect(pack.sku)} disabled={disabled} />
        ))}
        {familia && <Familia pack={familia} marcado={selecionado === 'combo_familia'} gerando={pagarAoEscolher && pagando && selecionado === 'combo_familia'} onSelect={() => onSelect('combo_familia')} disabled={disabled} />}
      </div>

      {pagarAoEscolher ? (
        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: '0.74rem', color: '#6b6276' }}>
          👆 Toque no presente e o PIX aparece na hora · liberação automática
        </p>
      ) : (<>

      <button
        type="button"
        onClick={onPagar}
        disabled={disabled || pagando}
        aria-busy={pagando || undefined}
        className="nx-pay-anim"
        style={{
          width: '100%', boxSizing: 'border-box', marginTop: '9px', minHeight: '48px', padding: '12px 16px', borderRadius: '14px',
          border: 'none', background: '#059669', color: '#fff', fontWeight: 800, fontSize: '1.02rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: (disabled || pagando) ? 'default' : 'pointer',
          boxShadow: '0 6px 16px rgba(5, 150, 105, 0.3)',
        }}
      >
        {pagando
          ? (<><Loader2 size={18} aria-hidden="true" /> Preparando seu PIX…</>)
          : (<><Zap size={18} aria-hidden="true" /> Pagar {escolhido ? formatBrl(escolhido.price) : ''} com PIX</>)}
      </button>
      <p style={{ margin: '5px 0 0', textAlign: 'center', fontSize: '0.68rem', color: '#6b6276' }}>
        ⚡ Liberação automática · download em MP3, MP4 e PDF
      </p>
      </>)}
    </div>
  );
}
