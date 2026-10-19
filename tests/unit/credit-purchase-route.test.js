import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ customer: null, reservation: null, reserveError: null, storedError: null, events: [], rpc: vi.fn(), create: vi.fn(), status: vi.fn(), approve: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireCustomer: async () => state.customer || { ok: false, status: 401, error: 'Entre na conta.' } }));
vi.mock('@/lib/efi', () => ({ createPixCharge: (...args) => { state.events.push('provider'); return state.create(...args); }, getChargeStatus: (...args) => state.status(...args) }));
vi.mock('@/lib/credits', () => ({ approveCreditPurchase: (...args) => state.approve(...args) }));
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => ({
  rpc: async (name, args) => { state.events.push('reserve'); state.rpc(name, args); return { data: state.reservation, error: state.reserveError }; },
  from: () => ({ eq() { return this; }, update: async () => ({ error: state.storedError }) }),
}) }));
const { POST } = await import('@/app/api/credits/purchase/route');
const request = body => new Request('https://example.test/api/credits/purchase', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  state.customer = { ok: true, uid: 'account-owner' }; state.reserveError = null; state.storedError = null; state.events = [];
  state.reservation = { id: 'reservation', package_sku: 'creditos_pos_compra_1', expected_amount: 4.99, txid: 'A'.repeat(32), status: 'PENDENTE' };
  state.rpc.mockReset(); state.create.mockReset(); state.status.mockReset(); state.approve.mockReset();
  state.status.mockResolvedValue(null); state.create.mockResolvedValue({ txid: 'A'.repeat(32), pixCopiaECola: 'pix-code', status: 'ATIVA' });
});
describe('compra segura de crédito adicional', () => {
  it('exige conta e não aceita preço ou quantidade fornecidos pelo cliente', async () => {
    state.customer = null;
    expect((await POST(request({ packageSku: 'creditos_pos_compra_1' }))).status).toBe(401);
    expect(state.create).not.toHaveBeenCalled();
    state.customer = { ok: true, uid: 'account-owner' };
    const res = await POST(request({ packageSku: 'creditos_pos_compra_1', orderId: 'paid-order', amount: 0.01, credits: 100, requestKey: 'request-12345' }));
    expect(res.status).toBe(200);
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 4.99, txid: 'A'.repeat(32) }), expect.any(Object));
    expect(state.events).toEqual(['reserve', 'provider']);
    expect(state.rpc.mock.calls[0][1]).toMatchObject({ p_user_id: 'account-owner', p_sku: 'creditos_pos_compra_1', p_order_id: 'paid-order' });
  });
  it('não cobra quando o servidor recusa a elegibilidade', async () => {
    state.reservation = null; state.reserveError = { message: 'offer_not_eligible' };
    expect((await POST(request({ packageSku: 'creditos_pos_compra_1', orderId: 'other-order' }))).status).toBe(409);
    expect(state.create).not.toHaveBeenCalled();
  });
  it('recupera a cobrança pendente sem criar outra', async () => {
    state.reservation.qr_code = 'existing-code';
    const res = await POST(request({ packageSku: 'creditos_pos_compra_1', orderId: 'paid-order' }));
    expect((await res.json()).qrCode).toBe('existing-code'); expect(state.create).not.toHaveBeenCalled();
  });
  it('concilia cobrança que foi paga antes de salvar o QR', async () => {
    state.status.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '4.99' }, pix: [{ valor: '4.99' }] });
    state.approve.mockResolvedValue({ approved: true });
    const res = await POST(request({ packageSku: 'creditos_pos_compra_1', orderId: 'paid-order' }));
    expect((await res.json()).status).toBe('approved');
    expect(state.approve).toHaveBeenCalledWith('A'.repeat(32), 4.99, expect.any(Object)); expect(state.create).not.toHaveBeenCalled();
  });
  it('não chama o provedor novamente quando a reserva já está aprovada', async () => {
    state.reservation.status = 'APROVADO';
    const res = await POST(request({ packageSku: 'creditos_pos_compra_1', orderId: 'paid-order' }));
    expect((await res.json()).status).toBe('approved'); expect(state.create).not.toHaveBeenCalled();
  });
  it('não confunde falha de autenticação PIX com elegibilidade de pacote normal', async () => {
    state.reservation.package_sku = 'creditos_5';
    const failure = new Error('Falha ao autenticar (HTTP 401): sensitive-provider-body');
    failure.efiStatus = 401;
    state.status.mockRejectedValue(failure);
    const response = await POST(request({ packageSku: 'creditos_5' }));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.code).toBe('CREDIT_PIX_PROVIDER_AUTH');
    expect(body.error).toContain('configuração');
    expect(body.error).not.toContain('oferta');
    expect(JSON.stringify(body)).not.toContain('sensitive-provider-body');
    expect(state.create).not.toHaveBeenCalled();
    expect(state.approve).not.toHaveBeenCalled();
  });
  it('identifica falha na reserva sem expor detalhes do banco', async () => {
    state.reservation = null; state.reserveError = { message: 'SQL internal-private-detail' };
    const response = await POST(request({ packageSku: 'creditos_1' }));
    const body = await response.json();
    expect(body.code).toBe('CREDIT_RESERVATION_FAILED');
    expect(JSON.stringify(body)).not.toContain('internal-private-detail');
  });
});
