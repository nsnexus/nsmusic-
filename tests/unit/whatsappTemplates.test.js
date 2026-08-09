import { describe, it, expect } from 'vitest';
import { resolveDeliveryUrl } from '@/lib/whatsappTemplates';

describe('resolveDeliveryUrl', () => {
  it('monta a URL de entrega a partir do orderId', () => {
    expect(resolveDeliveryUrl('abc123')).toMatch(/\/entrega\?orderId=abc123$/);
  });
});
