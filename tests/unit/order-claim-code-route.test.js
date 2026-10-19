import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ user: null, order: null, reserved: true, claimed: true, rpc: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireCustomer: async () => state.user || { ok: false, status: 401, error: 'Faça login.' } }));
vi.mock('@/lib/whatsapp', () => ({ getEvolutionConfig: async () => ({ enabled: true, baseUrl: 'https://whatsapp.example.test', instanceName: 'test', token: 'test-key' }), formatToWhatsAppNumber: phone => phone }));
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => ({
  rpc: async (name, args) => { state.rpc(name, args); return { data: name === 'verify_order_claim_code' ? { claimed: state.claimed, orderId: 'order1' } : state.reserved, error: null }; },
  from: () => ({ select() { return this; }, eq() { return this; }, is() { return this; }, maybeSingle: async () => ({ data: state.order, error: null }) }),
}) }));
const { POST } = await import('@/app/api/orders/claim-code/route');
const request = body => new Request('https://example.test/api/orders/claim-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { state.user = { ok: true, uid: 'account-owner' }; state.order = { id: 'order1', user_id: null, customer_phone: '5511999990000' }; state.reserved = true; state.claimed = true; state.rpc.mockClear(); state.send.mockReset(); state.send.mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', state.send); });
afterEach(() => vi.unstubAllGlobals());
describe('prova de posse por WhatsApp', () => {
  it('não envia código para cliente não autenticado', async () => {
    state.user = null;
    expect((await POST(request({ action: 'request', orderId: 'order1' }))).status).toBe(401);
    expect(state.send).not.toHaveBeenCalled();
  });
  it('usa apenas o número salvo no pedido e nunca devolve o código na resposta', async () => {
    const response = await POST(request({ action: 'request', orderId: 'order1', phone: 'forged-phone' }));
    expect(response.status).toBe(200);
    const sent = JSON.parse(state.send.mock.calls[0][1].body);
    expect(sent.number).toBe('5511999990000');
    const code = sent.text.match(/\b\d{6}\b/)[0];
    const output = JSON.stringify(await response.json());
    expect(output).not.toContain(code); expect(output).not.toContain(sent.number);
    const reservation = state.rpc.mock.calls[0][1];
    expect(reservation.p_code_hash).toMatch(/^[a-f0-9]{64}$/); expect(reservation.p_phone_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(reservation.p_code_hash).not.toBe(code);
  });
  it('bloqueia reenvio recusado pelo limitador antes de chamar o provedor', async () => {
    state.reserved = false;
    expect((await POST(request({ action: 'request', orderId: 'order1' }))).status).toBe(429);
    expect(state.send).not.toHaveBeenCalled();
  });
  it('não permite reivindicar um pedido já pertencente a outra conta', async () => {
    state.order.user_id = 'another-account';
    expect((await POST(request({ action: 'request', orderId: 'order1' }))).status).toBe(403);
    expect(state.send).not.toHaveBeenCalled();
  });
  it('rejeita código inválido, expirado ou consumido e não recompensa indicação', async () => {
    state.claimed = false;
    const response = await POST(request({ action: 'verify', challengeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', code: '123456' }));
    expect(response.status).toBe(403);
    expect(state.rpc.mock.calls).toHaveLength(1);
    expect(state.rpc.mock.calls[0][1].p_user_id).toBe('account-owner');
  });
});
