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
