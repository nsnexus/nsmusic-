import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
let mockDocSnap = { exists: () => false, data: () => ({}) };

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async () => mockDocSnap,
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
}));

const mockCreatePixCharge = vi.fn();
vi.mock('@/lib/efi', () => ({
  createPixCharge: (...args) => mockCreatePixCharge(...args),
  generateTxid: (id) => `TXID_${id}_123456789012345678`,
}));

const {
  authenticateGatewayRequest,
  createGatewayPixCharge,
  getGatewayCharge,
  applyGatewayPaymentApproval,
  dispatchGatewayWebhook,
} = await import('@/lib/gateway');

beforeEach(() => {
  mockSetDoc.mockClear();
  mockUpdateDoc.mockClear();
  mockCreatePixCharge.mockReset();
  mockDocSnap = { exists: () => false, data: () => ({}) };
  delete process.env.GATEWAY_API_KEY;
});

describe('Gateway - authenticateGatewayRequest', () => {
  it('retorna não autorizado se GATEWAY_API_KEY não estiver configurada', () => {
    const req = { headers: new Map([['x-gateway-api-key', 'qualquer-coisa']]) };
    const auth = authenticateGatewayRequest(req);
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toBe('gateway_key_not_configured');
  });

  it('retorna não autorizado se chave enviada for inválida', () => {
    process.env.GATEWAY_API_KEY = 'secret-123';
    const req = { headers: new Map([['x-gateway-api-key', 'errada']]) };
    const auth = authenticateGatewayRequest(req);
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toBe('invalid_api_key');
  });

  it('autoriza com header x-gateway-api-key correto', () => {
    process.env.GATEWAY_API_KEY = 'secret-123';
    const req = { headers: new Map([['x-gateway-api-key', 'secret-123']]) };
    const auth = authenticateGatewayRequest(req);
    expect(auth.authorized).toBe(true);
  });

  it('autoriza com header Authorization: Bearer <chave> correto', () => {
    process.env.GATEWAY_API_KEY = 'secret-123';
    const req = { headers: new Map([['authorization', 'Bearer secret-123']]) };
    const auth = authenticateGatewayRequest(req);
    expect(auth.authorized).toBe(true);
  });
});

describe('Gateway - createGatewayPixCharge', () => {
  it('valida campos obrigatórios (appId, externalOrderId, amount)', async () => {
    await expect(createGatewayPixCharge({ externalOrderId: '123', amount: 10 })).rejects.toThrow(/appId é obrigatório/);
    await expect(createGatewayPixCharge({ appId: 'test', amount: 10 })).rejects.toThrow(/externalOrderId é obrigatório/);
    await expect(createGatewayPixCharge({ appId: 'test', externalOrderId: '123', amount: 0 })).rejects.toThrow(/amount deve ser um número positivo/);
  });

  it('cria cobrança na Efí e persiste no Firestore', async () => {
    mockCreatePixCharge.mockResolvedValue({
      txid: 'TXID_TEST_123',
      pixCopiaECola: '000201...',
      status: 'ATIVA',
    });

    const result = await createGatewayPixCharge({
      appId: 'metodo-21-dias',
      externalOrderId: 'PED_100',
      amount: 49.90,
      description: 'Plano 21 Dias',
      webhookUrl: 'https://cliente.com/webhook',
    });

    expect(mockCreatePixCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 49.90 }),
      expect.anything()
    );

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ col: 'gateway_charges' }),
      expect.objectContaining({
        appId: 'metodo-21-dias',
        externalOrderId: 'PED_100',
        amount: 49.90,
        status: 'PENDING',
        webhookUrl: 'https://cliente.com/webhook',
      })
    );

    expect(result.txid).toBe('TXID_TEST_123');
    expect(result.status).toBe('PENDING');
  });
});

describe('Gateway - applyGatewayPaymentApproval', () => {
  it('retorna não aplicado se cobrança não existir', async () => {
    mockDocSnap = { exists: () => false, data: () => ({}) };
    const result = await applyGatewayPaymentApproval('TXID_INEXISTENTE', { transaction_amount: 50 });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('charge_not_found');
  });

  it('idempotência: não reprocessa se status já for PAID', async () => {
    mockDocSnap = {
      exists: () => true,
      data: () => ({ txid: 'TXID_1', status: 'PAID', amount: 50 }),
    };

    const result = await applyGatewayPaymentApproval('TXID_1', { transaction_amount: 50 });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('already_processed');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('atualiza status para PAID e despacha webhook', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });

    mockDocSnap = {
      exists: () => true,
      data: () => ({
        txid: 'TXID_1',
        appId: 'metodo-21',
        externalOrderId: 'PED_1',
        status: 'PENDING',
        amount: 49.90,
        webhookUrl: 'https://cliente.com/webhook',
      }),
    };

    const result = await applyGatewayPaymentApproval('TXID_1', { transaction_amount: 49.90 });
    expect(result.applied).toBe(true);

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ col: 'gateway_charges' }),
      expect.objectContaining({ status: 'PAID', paidAmount: 49.90 })
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cliente.com/webhook',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"event":"payment.approved"'),
      })
    );

    fetchSpy.mockRestore();
  });
});
