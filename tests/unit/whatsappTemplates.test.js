import { describe, it, expect } from 'vitest';
import { resolveDeliveryUrl, resolveCriarUrl } from '@/lib/whatsappTemplates';

describe('resolveDeliveryUrl', () => {
  it('monta a URL de entrega a partir do orderId', () => {
    expect(resolveDeliveryUrl('abc123')).toMatch(/\/entrega\?orderId=abc123$/);
  });
});

describe('resolveCriarUrl', () => {
  it('monta a URL do wizard já com ?new=1 (limpa rascunho salvo, pedido 18/09/2026)', () => {
    expect(resolveCriarUrl()).toMatch(/\/criar\?new=1$/);
  });
});
