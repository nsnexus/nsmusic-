import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPixCharge } from '../../src/lib/pixCheckout';

// Retentativa da criação da cobrança PIX vista do navegador. Está no caminho que gera receita: uma
// regressão aqui devolve erro ao cliente que já estava com o app do banco aberto.

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('requestPixCharge', () => {
  it('devolve os dados da cobrança quando a primeira tentativa dá certo', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { qrCode: 'BR-CODE', paymentId: 'TX1' }));

    const resultado = await requestPixCharge({ orderId: 'pedido-1', sku: 'audio_only' });

    expect(resultado).toEqual({ ok: true, data: { qrCode: 'BR-CODE', paymentId: 'TX1' } });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('insiste depois de uma falha transitória e devolve o sucesso da tentativa seguinte', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(502, { error: 'Não foi possível gerar a cobrança PIX agora (cód. 429).' }))
      .mockResolvedValueOnce(jsonResponse(200, { qrCode: 'BR-CODE', paymentId: 'TX2' }));

    const resultado = await requestPixCharge(
      { orderId: 'pedido-1', sku: 'audio_only' },
      { attempts: 3 }
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.data.paymentId).toBe('TX2');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('não repete erro 4xx — é decisão do servidor e repetir não muda o resultado', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Pedido não encontrado.' }));

    const resultado = await requestPixCharge({ orderId: 'inexistente', sku: 'audio_only' });

    expect(resultado).toEqual({ ok: false, error: 'Pedido não encontrado.' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('desiste depois do limite de tentativas, preservando a mensagem do servidor', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'Não foi possível gerar a cobrança PIX agora (cód. 503). Tente novamente.' }));

    const resultado = await requestPixCharge(
      { orderId: 'pedido-1', sku: 'audio_only' },
      { attempts: 2 }
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain('cód. 503');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('trata falha de rede como transitória e ainda assim devolve resultado em vez de lançar', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const resultado = await requestPixCharge(
      { orderId: 'pedido-1', sku: 'audio_only' },
      { attempts: 2 }
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe('Não foi possível falar com o serviço de pagamento.');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('nunca envia valor no corpo — o preço é decidido pelo servidor a partir do sku (C-05)', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { qrCode: 'BR-CODE' }));

    await requestPixCharge({ orderId: 'pedido-1', sku: 'combo' });

    const corpo = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corpo).toEqual({ orderId: 'pedido-1', sku: 'combo', isSecondaryPayment: false });
    expect(corpo).not.toHaveProperty('amount');
    expect(corpo).not.toHaveProperty('totalAmount');
    expect(corpo).not.toHaveProperty('price');
  });
});
