'use client';

import React from 'react';
import { Music, Mail, Film, Sparkles, Mic, Check, Users } from 'lucide-react';
import { formatBrl } from '@/lib/deliveryPackages';

const ICONS = {
  audio_only: Music,
  combo_carta: Mail,
  combo: Film,
  combo_retrospectiva: Sparkles,
  combo_voz: Mic,
  combo_familia: Users,
};

export default function PackageCard({ pack, isSelected, onSelect, disabled }) {
  const IconComponent = ICONS[pack.sku] || Film;

  return (
    <button
      key={pack.sku}
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={onSelect}
      className={`nx-package ${isSelected ? 'is-selected' : ''}`}
      style={{
        position: 'relative',
        textAlign: 'left',
        borderRadius: '16px',
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        cursor: disabled ? 'default' : 'pointer',
        background: isSelected ? '#ffffff' : 'var(--nx-paper, #faf8f5)',
        border: isSelected ? '2px solid var(--nx-purple, #67408b)' : '1.5px solid var(--nx-line, #e7e0e8)',
        color: 'var(--nx-ink, #29232d)',
        font: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--nx-purple, #67408b)', fontSize: '0.86rem', fontWeight: 700 }}>
          <IconComponent size={18} aria-hidden="true" />
          {pack.eyebrow}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          {pack.badge && (
            <span style={{ background: 'var(--nx-purple, #67408b)', color: '#ffffff', borderRadius: '999px', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 800 }}>
              {pack.badge}
            </span>
          )}
          <span
            aria-hidden="true"
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              border: isSelected ? '2px solid var(--nx-purple, #67408b)' : '2px solid var(--nx-line, #cfc6d1)',
              background: isSelected ? 'var(--nx-purple, #67408b)' : 'transparent',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isSelected && <Check size={13} color="#ffffff" strokeWidth={3} />}
          </span>
        </span>
      </div>

      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 6px', lineHeight: 1.25 }}>{pack.label}</h3>
        <p style={{ fontSize: '0.86rem', color: 'var(--nx-muted, #4e4653)', lineHeight: 1.45, margin: 0 }}>{pack.desc}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {formatBrl(pack.price)}
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--nx-soft, #6c636f)', fontWeight: 600 }}>pagamento único</span>
      </div>

      <ul style={{ padding: '12px 0 0', margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '7px', borderTop: '1px solid var(--nx-line, #e7e0e8)' }}>
        {pack.includes.map((line, idx) => (
          <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: 'var(--nx-muted, #4e4653)', lineHeight: 1.35 }}>
            <Check size={15} color="var(--nx-pay, #059669)" strokeWidth={3} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
