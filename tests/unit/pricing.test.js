import { describe, it, expect } from 'vitest';
import { getPriceForSku, skuGrantsVideoAccess, skuGrantsCartaAccess, skuGrantsRetrospectivaAccess, skuApprovesMusic, SKU_PRICES } from '@/lib/pricing';

// Catálogo único de preços no servidor (ver C-05 no AUDIT_REPORT.md).

describe('getPriceForSku', () => {
  it('retorna o preço de catálogo para cada SKU conhecido', () => {
    expect(getPriceForSku('audio_only')).toBe(9.99);
    expect(getPriceForSku('combo')).toBe(16.89);
    expect(getPriceForSku('video_addon')).toBe(6.90);
    expect(getPriceForSku('playback_addon')).toBe(4.99);
    expect(getPriceForSku('carta_addon')).toBe(3.99);
    expect(getPriceForSku('retrospectiva_addon')).toBe(9.99);
    expect(getPriceForSku('combo_carta')).toBe(13.98);
    expect(getPriceForSku('combo_retrospectiva')).toBe(19.98);
  });

  it('retorna null para SKU desconhecido (nunca inventa um preço)', () => {
    expect(getPriceForSku('sku_inexistente')).toBeNull();
    expect(getPriceForSku('')).toBeNull();
    expect(getPriceForSku(undefined)).toBeNull();
  });

  it('não é influenciável por um valor arbitrário — só existe o que está no catálogo', () => {
    expect(Object.keys(SKU_PRICES)).toEqual(['audio_only', 'combo', 'video_addon', 'playback_addon', 'carta_addon', 'retrospectiva_addon', 'combo_carta', 'combo_retrospectiva', 'recovery_combo_24h', 'recovery_combo_48h']);
  });
});

describe('skuGrantsCartaAccess / skuGrantsRetrospectivaAccess', () => {
  it('combo_carta concede carta; combo_retrospectiva concede retrospectiva; nunca cruzado', () => {
    expect(skuGrantsCartaAccess('combo_carta')).toBe(true);
    expect(skuGrantsCartaAccess('combo_retrospectiva')).toBe(false);
    expect(skuGrantsRetrospectivaAccess('combo_retrospectiva')).toBe(true);
    expect(skuGrantsRetrospectivaAccess('combo_carta')).toBe(false);
  });

  it('add-ons isolados e audio_only não concedem nenhum dos dois', () => {
    expect(skuGrantsCartaAccess('carta_addon')).toBe(false);
    expect(skuGrantsRetrospectivaAccess('retrospectiva_addon')).toBe(false);
    expect(skuGrantsCartaAccess('audio_only')).toBe(false);
  });
});

describe('skuGrantsVideoAccess', () => {
  it('combo e video_addon concedem acesso a vídeo', () => {
    expect(skuGrantsVideoAccess('combo')).toBe(true);
    expect(skuGrantsVideoAccess('video_addon')).toBe(true);
  });

  it('audio_only não concede acesso a vídeo', () => {
    expect(skuGrantsVideoAccess('audio_only')).toBe(false);
  });

  it('playback_addon isolado não concede acesso a vídeo', () => {
    expect(skuGrantsVideoAccess('playback_addon')).toBe(false);
  });
});

describe('skuApprovesMusic', () => {
  it('audio_only e combo aprovam a música (paymentStatus)', () => {
    expect(skuApprovesMusic('audio_only')).toBe(true);
    expect(skuApprovesMusic('combo')).toBe(true);
  });

  it('combo_carta e combo_retrospectiva também aprovam a música — são combo, não add-on isolado', () => {
    expect(skuApprovesMusic('combo_carta')).toBe(true);
    expect(skuApprovesMusic('combo_retrospectiva')).toBe(true);
  });

  it('video_addon isolado NUNCA aprova a música — ver C-09 no AUDIT_REPORT.md', () => {
    expect(skuApprovesMusic('video_addon')).toBe(false);
  });

  it('playback_addon isolado NUNCA aprova a música — mesma regra do video_addon (C-09)', () => {
    expect(skuApprovesMusic('playback_addon')).toBe(false);
  });

  it('impacto (preço variável, /pagar) também aprova a música — piso é o preço da música', () => {
    expect(skuApprovesMusic('impacto')).toBe(true);
  });

  it('carta_addon isolado NUNCA aprova a música nem concede vídeo (C-09)', () => {
    expect(skuApprovesMusic('carta_addon')).toBe(false);
    expect(skuGrantsVideoAccess('carta_addon')).toBe(false);
  });
});
