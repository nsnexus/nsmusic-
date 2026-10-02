'use client';

import React from 'react';
import { getOrderPlatform, PLATFORMS } from '@/lib/trafficSource';

/**
 * Componente de ícone/badge para exibir a plataforma de tráfego de um pedido.
 * Suporta Meta (Facebook/Instagram), TikTok, Google, Orgânico e Direto com SVGs nítidos.
 */
export default function PlatformIcon({ order, platform, size = 15, showLabel = false, style = {} }) {
  const platKey = platform || (order ? getOrderPlatform(order) : 'facebook_ads');
  const info = PLATFORMS[platKey] || PLATFORMS.facebook_ads;

  // Informações de campanha se disponíveis no pedido
  const traffic = order?.extras?.traffic;
  const utmCampaign = traffic?.utm_campaign;
  const utmSource = traffic?.utm_source;
  const tooltipText = `Canal: ${info.name}${utmSource ? ` (${utmSource})` : ''}${utmCampaign ? ` • Campanha: ${utmCampaign}` : ''}`;

  const renderSvg = () => {
    switch (platKey) {
      case 'facebook_ads':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        );
      case 'tiktok_ads':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="#000000" aria-hidden="true">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.34 22a6.34 6.34 0 0 0 6.33-6.32V8.9a8.16 8.16 0 0 0 4.92 1.63V7.08a4.85 4.85 0 0 1-1-.39z" />
          </svg>
        );
      case 'google_ads':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.27 21.41 7.34 24 12 24z" />
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.27 2.59 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
          </svg>
        );
      case 'organico':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="#059669" aria-hidden="true">
            <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
          </svg>
        );
      case 'direto':
      default:
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="#64748b" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        );
    }
  };

  return (
    <span
      title={tooltipText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '3px 5px',
        borderRadius: '6px',
        backgroundColor: info.bgLight,
        border: `1px solid ${info.borderColor}`,
        verticalAlign: 'middle',
        cursor: 'help',
        flexShrink: 0,
        ...style,
      }}
    >
      {renderSvg()}
      {showLabel && (
        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: info.color, whiteSpace: 'nowrap' }}>
          {info.shortName}
        </span>
      )}
    </span>
  );
}
