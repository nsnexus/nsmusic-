import { describe, it, expect } from 'vitest';
import { normalizarSiteUrl, resolverSiteUrl, DOMINIO_CANONICO } from '@/lib/siteUrl';

// Esta função decide para onde a Kie.ai devolve a música pronta (`callBackUrl`). Se ela deixar
// passar um host errado, o callback bate num lugar que não existe, o webhook nunca chega e o
// cliente fica esperando uma música que já foi gerada e paga.
describe('siteUrl', () => {
  it('rejeita o que não serve como endereço público', () => {
    // *.pages.dev muda a cada deploy; localhost só existe na máquina de quem builda.
    expect(normalizarSiteUrl('https://5f36de58.nsmusic.pages.dev')).toBe('');
    expect(normalizarSiteUrl('http://localhost:3000')).toBe('');
    expect(normalizarSiteUrl('http://127.0.0.1:3000')).toBe('');
    expect(normalizarSiteUrl('')).toBe('');
    expect(normalizarSiteUrl(undefined)).toBe('');
    expect(normalizarSiteUrl(null)).toBe('');
  });

  it('tira barra final e espaço em volta', () => {
    expect(normalizarSiteUrl('  https://nsmusic.ia.br/  ')).toBe('https://nsmusic.ia.br');
    expect(normalizarSiteUrl('https://nsmusic.ia.br///')).toBe('https://nsmusic.ia.br');
  });

  it('cai no domínio canônico quando o env não serve', () => {
    expect(resolverSiteUrl('')).toBe(DOMINIO_CANONICO);
    expect(resolverSiteUrl('http://localhost:3000')).toBe(DOMINIO_CANONICO);
    expect(resolverSiteUrl('https://abc123.nsmusic.pages.dev')).toBe(DOMINIO_CANONICO);
  });

  it('respeita o env quando ele é um domínio público de verdade', () => {
    expect(resolverSiteUrl('https://nsmusic.ia.br')).toBe('https://nsmusic.ia.br');
  });

  it('o domínio canônico é https e sem barra final', () => {
    expect(DOMINIO_CANONICO).toMatch(/^https:\/\/[^/]+$/);
  });
});
