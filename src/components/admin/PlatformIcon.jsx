'use client';

import React from 'react';
import { getOrderPlatform, PLATFORMS } from '@/lib/trafficSource';

/**
 * Componente de ícone/badge para exibir a plataforma de tráfego de um pedido.
 * Suporta Meta (Facebook/Instagram), TikTok, Google, Orgânico e Direto com SVGs nítidos.
 */
export default function PlatformIcon({ order, platform, size = 15, showLabel = false, bare = false, style = {} }) {
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
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="12" fill="#1877F2" />
            <path
              d="M16.5 12.05H13.88V21H10.19V12.05H8.44V8.92H10.19V6.66C10.19 5.22 10.87 3 13.91 3L16.5 3.01V6.05H14.62C14.3 6.05 13.88 6.21 13.88 6.9V8.92H16.53L16.5 12.05Z"
              fill="#ffffff"
            />
          </svg>
        );
      case 'tiktok_ads':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="#000000" />
            <path
              d="M17.5 8.2c-.9-.6-1.5-1.6-1.6-2.7h-2.6v11.2c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3 1-2.3 2.3-2.3c.25 0 .5.04.7.12V11.8c-.23-.03-.47-.05-.7-.05-2.8 0-5.1 2.3-5.1 5.1s2.3 5.1 5.1 5.1 5.1-2.3 5.1-5.1v-5.3c1.1.8 2.5 1.3 3.9 1.3V10.1c-.9 0-1.8-.3-2.4-.9z"
              fill="#ffffff"
            />
          </svg>
        );
      case 'google_ads':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.64 15.65L10.37 5.73C11.53 3.73 14.08 3.05 16.08 4.21C18.08 5.37 18.76 7.92 17.6 9.92L11.87 19.84C10.71 21.84 8.16 22.52 6.16 21.36C4.16 20.2 3.48 17.65 4.64 15.65Z"
              fill="#4285F4"
            />
            <circle cx="6.16" cy="18.5" r="3.1" fill="#FBBC04" />
            <path
              d="M20.12 16.63L16.27 10C15.42 8.52 13.52 8.01 12.04 8.86C10.56 9.71 10.05 11.61 10.9 13.09L14.75 19.72C15.6 21.2 17.5 21.71 18.98 20.86C20.46 20.01 20.97 18.11 20.12 16.63Z"
              fill="#34A853"
            />
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
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        );
    }
  };

  if (bare) {
    return (
      <span
        title={tooltipText}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style,
        }}
      >
        {renderSvg()}
        {showLabel && (
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: info.color, whiteSpace: 'nowrap', marginLeft: '6px' }}>
            {info.shortName}
          </span>
        )}
      </span>
    );
  }

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
