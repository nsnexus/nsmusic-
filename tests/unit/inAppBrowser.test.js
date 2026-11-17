import { describe, it, expect } from 'vitest';
import { isInAppBrowser, isIOS, isAndroid, getChromeIntentUrl } from '@/lib/inAppBrowser';

// Achado 20/09/2026: cliente reclamando que "não consegue baixar as músicas". O servidor estava
// certo (Content-Disposition: attachment verificado em produção) — quem bloqueia é o navegador
// embutido do app por onde o link chega.
describe('isInAppBrowser', () => {
  it('reconhece os navegadores embutidos por onde o link de entrega costuma chegar', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 WhatsApp/2.23')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Mobile; WA4A/2.24.1) AppleWebKit/537.36')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; U; Android 13; pt-br; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0.0.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/440.0]')).toBe(true);
  });

  it('não marca navegador de verdade como embutido', () => {
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile Safari/537.36')).toBe(false);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1')).toBe(false);
  });

  it('sem user agent devolve false (SSR) em vez de quebrar', () => {
    expect(isInAppBrowser('')).toBe(false);
  });
});

describe('isIOS', () => {
  it('distingue iOS de Android', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(true);
    expect(isIOS('Mozilla/5.0 (Linux; Android 13)')).toBe(false);
  });
});

describe('isAndroid', () => {
  it('distingue Android de iOS', () => {
    expect(isAndroid('Mozilla/5.0 (Linux; Android 13; Pixel 7)')).toBe(true);
    expect(isAndroid('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(false);
    expect(isAndroid('')).toBe(false);
  });
});

describe('getChromeIntentUrl', () => {
  it('monta a intent URI do Chrome com scheme https e fallback', () => {
    const url = 'https://nsmusic.ia.br/entrega?orderId=123';
    const intent = getChromeIntentUrl(url);
    expect(intent).toContain('intent://nsmusic.ia.br/entrega?orderId=123#Intent;');
    expect(intent).toContain('package=com.android.chrome');
    expect(intent).toContain('scheme=https');
    expect(intent).toContain('S.browser_fallback_url=https%3A%2F%2Fnsmusic.ia.br%2Fentrega%3ForderId%3D123');
  });
});

// Achado 16/11/2026: no Android o WhatsApp abre o link numa aba do Chrome com User-Agent normal;
// o único sinal é o referrer "android-app://com.whatsapp/".
describe('aba aberta por um app (Chrome Custom Tab)', () => {
  it('reconhece WhatsApp e Instagram pelo referrer', async () => {
    const { appQueAbriuAPagina, isAbaAbertaPorApp } = await import('@/lib/inAppBrowser');
    expect(appQueAbriuAPagina('android-app://com.whatsapp/')).toBe('com.whatsapp');
    expect(appQueAbriuAPagina('android-app://com.instagram.android/')).toBe('com.instagram.android');
    expect(isAbaAbertaPorApp('android-app://com.whatsapp.w4b/')).toBe(true);
  });

  it('não confunde com o próprio navegador, a busca do Google ou um site comum', async () => {
    const { appQueAbriuAPagina, isAbaAbertaPorApp } = await import('@/lib/inAppBrowser');
    expect(appQueAbriuAPagina('android-app://com.android.chrome/')).toBe('');
    expect(appQueAbriuAPagina('android-app://com.google.android.googlequicksearchbox/')).toBe('');
    expect(isAbaAbertaPorApp('https://www.google.com/')).toBe(false);
    expect(isAbaAbertaPorApp('')).toBe(false);
  });
});
