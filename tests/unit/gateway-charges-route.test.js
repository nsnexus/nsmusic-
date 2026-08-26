import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthenticate = vi.fn();
const mockCreateGatewayPixCharge = vi.fn();
const mockGetGatewayCharge = vi.fn();
const mockApplyGatewayPaymentApproval = vi.fn();

vi.mock('@/lib/gateway', () => ({
  authenticateGatewayRequest: (...args) => mockAuthenticate(...args),
  createGatewayPixCharge: (...args) => mockCreateGatewayPixCharge(...args),
  getGatewayCharge: (...args) => mockGetGatewayCharge(...args),
  applyGatewayPaymentApproval: (...args) => mockApplyGatewayPaymentApproval(...args),
}));

const mockGetChargeStatus = vi.fn();
vi.mock('@/lib/efi', () => ({
  getChargeStatus: (...args) => mockGetChargeStatus(...args),
}));

const { POST } = await import('@/app/api/gateway/v1/charges/route');
const { GET } = await import('@/app/api/gateway/v1/charges/[txid]/route');

function makePostReq(body, headers = {}) {
  return {
    headers: new Headers(headers),
    json: async () => body,
  };
}

function makeGetReq(headers = {}) {
  return {
    headers: new Headers(headers),
  };
}

beforeEach(() => {
  mockAuthenticate.mockReset();
  mockCreateGatewayPixCharge.mockReset();
  mockGetGatewayCharge.mockReset();
  mockApplyGatewayPaymentApproval.mockReset();
  mockGetChargeStatus.mockReset();
});

describe('POST /api/gateway/v1/charges', () => {
  it('retorna 401 se autenticação falhar', async () => {
    mockAuthenticate.mockReturnValue({ authorized: false, reason: 'invalid_api_key' });
    const req = makePostReq({ appId: 'test', externalOrderId: '1', amount: 10 });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 400 se campos obrigatórios faltarem', async () => {
    mockAuthenticate.mockReturnValue({ authorized: true });
    const req = makePostReq({ appId: 'test' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('retorna 201 com dados da cobrança Pix ao criar com sucesso', async () => {
    mockAuthenticate.mockReturnValue({ authorized: true });
    mockCreateGatewayPixCharge.mockResolvedValue({
      txid: 'TXID_TEST_999',
      pixCopiaECola: '000201...',
      status: 'PENDING',
      amount: 49.90,
      appId: 'metodo-21-dias',
      externalOrderId: 'PED_100',
      createdAt: '2026-08-26T12:00:00Z',
    });

    const req = makePostReq({
      appId: 'metodo-21-dias',
      externalOrderId: 'PED_100',
      amount: 49.90,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.txid).toBe('TXID_TEST_999');
    expect(data.pixCopiaECola).toBe('000201...');
  });
});

describe('GET /api/gateway/v1/charges/[txid]', () => {
  it('retorna 401 se não autorizado', async () => {
    mockAuthenticate.mockReturnValue({ authorized: false });
    const req = makeGetReq();
    const res = await GET(req, { params: { txid: 'TX1' } });
    expect(res.status).toBe(401);
  });

  it('retorna 404 se cobrança não for encontrada', async () => {
    mockAuthenticate.mockReturnValue({ authorized: true });
    mockGetGatewayCharge.mockResolvedValue(null);

    const req = makeGetReq();
    const res = await GET(req, { params: { txid: 'INEXISTENTE' } });
    expect(res.status).toBe(404);
  });

  it('retorna dados da cobrança e reconcilia com Efí se status PENDING', async () => {
    mockAuthenticate.mockReturnValue({ authorized: true });
    mockGetGatewayCharge
      .mockResolvedValueOnce({
        txid: 'TX1',
        appId: 'metodo-21',
        externalOrderId: 'PED_1',
        amount: 49.90,
        status: 'PENDING',
        createdAt: '2026-08-26T12:00:00Z',
      })
      .mockResolvedValueOnce({
        txid: 'TX1',
        appId: 'metodo-21',
        externalOrderId: 'PED_1',
        amount: 49.90,
        status: 'PAID',
        paidAt: '2026-08-26T12:05:00Z',
        createdAt: '2026-08-26T12:00:00Z',
      });

    mockGetChargeStatus.mockResolvedValue({
      status: 'CONCLUIDA',
      valor: { original: '49.90' },
    });

    const req = makeGetReq();
    const res = await GET(req, { params: { txid: 'TX1' } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockApplyGatewayPaymentApproval).toHaveBeenCalled();
    expect(data.status).toBe('PAID');
  });
});
