'use client';

import React from 'react';
import { Music, Mail, Film, Sparkles, Mic, Crown } from 'lucide-react';
import { formatBrl } from '@/lib/deliveryPackages';

const PACKAGE_CONFIG = {
  audio_only: {
    icon: Music,
    color: '#34d399', // esmeralda vibrante
    bgGlow: 'rgba(52, 211, 153, 0.16)',
    borderGlow: 'rgba(52, 211, 153, 0.45)',
    tagline: 'Essencial em MP3 HD',
  },
  combo_carta: {
    icon: Mail,
    color: '#f472b6', // rosa vibrante
    bgGlow: 'rgba(244, 114, 182, 0.16)',
    borderGlow: 'rgba(244, 114, 182, 0.45)',
    tagline: 'Com Carta Virtual & Envelope',
  },
  combo: {
    icon: Film,
    color: '#c084fc', // violeta vibrante
    bgGlow: 'rgba(192, 132, 252, 0.20)',
    borderGlow: 'rgba(192, 132, 252, 0.55)',
    tagline: 'Economize R$ 6,90 no vídeo',
    badgeGradient: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
    badgeIcon: Crown,
  },
  combo_retrospectiva: {
    icon: Sparkles,
    color: '#fbbf24', // âmbar/dourado vibrante
    bgGlow: 'rgba(251, 191, 36, 0.18)',
    borderGlow: 'rgba(251, 191, 36, 0.50)',
    tagline: 'Vídeo + Carta + Linha do Tempo',
    badgeGradient: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
    badgeIcon: Sparkles,
  },
  combo_voz: {
    icon: Mic,
    color: '#38bdf8', // azul celeste / ciano
    bgGlow: 'rgba(56, 189, 248, 0.18)',
    borderGlow: 'rgba(56, 189, 248, 0.50)',
    tagline: 'Clonagem Vocal por IA',
    badgeGradient: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
    badgeIcon: Sparkles,
  },
};

export default function PackageCard({ pack, isSelected, onSelect, disabled }) {
  const cfg = PACKAGE_CONFIG[pack.sku] || PACKAGE_CONFIG.combo;
  const IconComponent = cfg.icon;
  const BadgeIcon = cfg.badgeIcon;

  return (
    <button
      key={pack.sku}
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={onSelect}
      className={`nx-package nx-dark-package-card ${isSelected ? 'is-selected' : ''}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
        borderRadius: '22px',
        padding: '24px 20px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '270px',
        cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        background: isSelected
          ? 'linear-gradient(155deg, #181d33 0%, #0f1322 100%)'
          : 'linear-gradient(155deg, #121626 0%, #0d101c 100%)',
        border: isSelected
          ? `2px solid ${cfg.color}`
          : '1.5px solid rgba(255, 255, 255, 0.09)',
        boxShadow: isSelected
          ? `0 14px 34px ${cfg.bgGlow}, 0 0 0 1px ${cfg.borderGlow}`
          : '0 4px 18px rgba(0, 0, 0, 0.25)',
        transform: isSelected ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Ícone Gigante Translúcido / Marca d'água no Canto Inferior Direito (Inspirado no print) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '-20px',
          right: '-20px',
          width: '124px',
          height: '124px',
          opacity: isSelected ? 0.15 : 0.065,
          color: isSelected ? cfg.color : '#ffffff',
          pointerEvents: 'none',
          zIndex: 0,
          transform: 'rotate(-8deg)',
          transition: 'all 0.25s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconComponent size={124} strokeWidth={1.3} />
      </div>

      {/* Topo do Card: Badge do Ícone à Esquerda e Selo/Radio à Direita */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Badge do Ícone com Cantos Arredondados (Igual ao print) */}
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '14px',
            backgroundColor: isSelected ? cfg.bgGlow : 'rgba(255, 255, 255, 0.06)',
            border: isSelected ? `1px solid ${cfg.borderGlow}` : '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: cfg.color,
            boxShadow: isSelected ? `0 0 16px ${cfg.bgGlow}` : 'none',
            transition: 'all 0.25s ease',
            flexShrink: 0,
          }}
        >
          <IconComponent size={24} strokeWidth={2.2} />
        </div>

        {/* Selo Destaque (se houver) e Radio de Seleção */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {pack.badge && (
            <span
              style={{
                background: cfg.badgeGradient || 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                color: '#ffffff',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '0.66rem',
                fontWeight: '800',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {BadgeIcon && <BadgeIcon size={11} strokeWidth={2.5} />}
              <span>{pack.badge}</span>
            </span>
          )}

          {/* Seletor Radio Circle */}
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              border: isSelected ? `2px solid ${cfg.color}` : '2px solid rgba(255, 255, 255, 0.25)',
              backgroundColor: isSelected ? cfg.color : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              boxShadow: isSelected ? `0 0 10px ${cfg.bgGlow}` : 'none',
              flexShrink: 0,
            }}
          >
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0b0f19" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Informações Principais */}
      <div style={{ position: 'relative', zIndex: 1, marginTop: '16px', marginBottom: '14px' }}>
        <span
          style={{
            display: 'block',
            fontSize: '0.68rem',
            fontWeight: '800',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isSelected ? cfg.color : '#94a3b8',
            marginBottom: '4px',
          }}
        >
          {pack.eyebrow}
        </span>

        <h3
          style={{
            fontSize: '1.14rem',
            fontWeight: '800',
            color: '#ffffff',
            margin: '2px 0 6px',
            lineHeight: 1.25,
          }}
        >
          {pack.label}
        </h3>

        <p
          style={{
            fontSize: '0.82rem',
            color: '#94a3b8',
            lineHeight: 1.45,
            margin: '0 0 12px',
            minHeight: '36px',
          }}
        >
          {pack.desc}
        </p>

        {/* Preço */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '4px 0 0' }}>
          <span
            style={{
              fontSize: '1.75rem',
              fontWeight: '900',
              color: '#ffffff',
              letterSpacing: '-0.03em',
            }}
          >
            {formatBrl(pack.price)}
          </span>
          <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: '600' }}>
            / pagamento único
          </span>
        </div>
      </div>

      {/* Lista de Recursos Inclusos */}
      <ul
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 0,
          margin: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '7px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '12px',
        }}
      >
        {pack.includes.map((line, idx) => (
          <li
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '7px',
              fontSize: '0.78rem',
              color: '#cbd5e1',
              lineHeight: 1.35,
            }}
          >
            <span
              style={{
                color: '#34d399',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                flexShrink: 0,
                marginTop: '-1px',
              }}
            >
              ✓
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
