import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreditCostForSku, getCreditPackage } from '@/lib/pricing';
import { confirmedPixAmount } from '@/lib/confirmedPixAmount';
import { hashOrderClaim, claimCookieName, claimOrderForCustomer } from '@/lib/orderClaim';

describe('catálogo de créditos e oferta', () => {
  it('mantém o pacote normal e exige SKU próprio para a oferta', () => {
    expect(getCreditPackage('creditos_1').price).toBe(9.99);
    expect(getCreditPackage('creditos_pos_compra_1')).toMatchObject({ credits: 1, price: 4.99, postPurchase: true });
    expect(getCreditPackage('creditos_5').price).toBe(29.90);
    expect(getCreditPackage('creditos_10').price).toBe(49.90);
  });
  it('não concede combo inteiro pelo custo de um único produto', () => {
    expect(getCreditCostForSku('carta_addon')).toBe(0.5);
    expect(getCreditCostForSku('audio_only')).toBe(1);
    expect(getCreditCostForSku('combo_carta')).toBe(1.5);
    expect(getCreditCostForSku('combo')).toBe(2.5);
    expect(getCreditCostForSku('combo_retrospectiva')).toBe(3.5);
    expect(getCreditCostForSku('combo_voz')).toBe(2);
    for (const sku of ['__proto__','constructor','invalido']) { expect(getCreditCostForSku(sku)).toBeNull(); expect(getCreditPackage(sku)).toBeNull(); }
  });
});

describe('crédito depende do valor efetivamente recebido', () => {
  it('não aprova só pelo valor original da cobrança', () => {
    expect(confirmedPixAmount({ status: 'CONCLUIDA', valor: { original: '4.99' } })).toBe(0);
    expect(confirmedPixAmount({ status: 'ATIVA', pix: [{ valor: '4.99' }] })).toBe(0);
  });
  it('soma recebimentos verificados e rejeita valores não finitos', () => {
    expect(confirmedPixAmount({ status: 'CONCLUIDA', pix: [{ valor: '2.00' }, { valor: '2.99' }] })).toBe(4.99);
    expect(confirmedPixAmount({ status: 'CONCLUIDA', pix: [{ valor: 'NaN' }] })).toBe(0);
    expect(confirmedPixAmount({ status: 'CONCLUIDA', pix: [{ valor: '-4.99' }] })).toBe(0);
  });
});

describe('vínculo de compra visitante', () => {
  it('identificador do pedido não é prova de posse', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: { claimed: false }, error: null })) };
    const req = new Request('https://example.test/api/orders/claim');
    expect(await claimOrderForCustomer(req, supabase, 'account', 'order1')).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith('claim_order_for_customer', { p_user_id: 'account', p_order_id: 'order1', p_claim_hash: '' });
  });
  it('manda somente hash do cookie e nunca o segredo original ao banco', async () => {
    const secret = 'a'.repeat(64);
    const supabase = { rpc: vi.fn(async () => ({ data: { claimed: true }, error: null })) };
    const req = new Request('https://example.test/api/orders/claim', { headers: { cookie: `nsmusic_claim_order1=${secret}` } });
    expect(await claimOrderForCustomer(req, supabase, 'account', 'order1')).toBe(true);
    expect(supabase.rpc.mock.calls[0][1].p_claim_hash).toBe(await hashOrderClaim(secret));
    expect(supabase.rpc.mock.calls[0][1].p_claim_hash).not.toBe(secret);
    expect(claimCookieName('../other')).toBeNull();
  });
});

describe('atribuição de indicação no navegador', () => {
  beforeEach(() => vi.unstubAllGlobals());
  it('preserva o primeiro código por 30 dias mesmo mudando de URL', async () => {
    const memory = new Map();
    const localStorage = { getItem: key => memory.get(key) || null, setItem: (key,value) => memory.set(key,value), removeItem: key => memory.delete(key) };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('window', { location: { search: '?ref=firstcode1' } });
    const { readReferralCode } = await import('@/lib/referralTracking');
    expect(readReferralCode()).toBe('firstcode1');
    window.location.search = '?ref=secondcode';
    expect(readReferralCode()).toBe('firstcode1');
    window.location.search = '';
    expect(readReferralCode()).toBe('firstcode1');
    vi.unstubAllGlobals();
  });
});
