import { describe, it, expect } from 'vitest';
import { isInAppBrowser, isIOS } from '@/lib/inAppBrowser';

// Achado 20/09/2026: cliente reclamando que "não consegue baixar as músicas". O servidor estava
// certo (Content-Disposition: attachment verificado em produção) — quem bloqueia é o navegador
// embutido do app por onde o link chega.
describe('isInAppBrowser', () => {
  it('reconhece os navegadores embutidos por onde o link de entrega costuma chegar', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 WhatsApp/2.23')).toBe(true);
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
