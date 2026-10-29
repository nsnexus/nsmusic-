import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCloudApiConfig, enviarPagamentoConfirmadoCloud } from '@/lib/whatsappCloudApi';

describe('confirmacao_pagamento_v2 - Envio de confirmação de pagamento oficial', () => {
  const envMock = {
    WHATSAPP_ACCESS_TOKEN: 'fake-token-123',
    WHATSAPP_PHONE_NUMBER_ID: 'fake-phone-id-456',
  };

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('configuração padrão utiliza o template confirmacao_pagamento_v2', () => {
    const config = getCloudApiConfig(envMock);
    expect(config.enabled).toBe(true);
    expect(config.templatePagamentoV2).toBe('confirmacao_pagamento_v2');
    expect(config.templatePagamento).toBe('confirmacao_pagamento_v2');
  });

  it('enviarPagamentoConfirmadoCloud envia com banner e 2 botões de download direto para a Meta', async () => {
    let capturedBody = null;

    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      if (url.includes('messages')) {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [{ id: 'wamid.12345' }],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const res = await enviarPagamentoConfirmadoCloud(
      '5511999998888',
      {
        cliente: 'Narciso',
        homenageado: 'Maria',
        link: 'https://nsmusic.nsnexus.com.br/entrega?orderId=NS-123',
        orderId: 'NS-123',
      },
      envMock
    );

    expect(res.success).toBe(true);
    expect(res.provider).toBe('cloud_api');
    expect(capturedBody).toBeTruthy();
    expect(capturedBody.template.name).toBe('confirmacao_pagamento_v2');
    expect(capturedBody.template.language.code).toBe('pt_BR');

    // Header com imagem do banner oficial
    const headerComponent = capturedBody.template.components.find((c) => c.type === 'header');
    expect(headerComponent).toBeTruthy();
    expect(headerComponent.parameters[0].image.link).toBe('https://nsmusic.ia.br/banner-whatsapp.jpg');

    // Body com variáveis: [cliente, homenageado, linkEntrega]
    const bodyComponent = capturedBody.template.components.find((c) => c.type === 'body');
    expect(bodyComponent).toBeTruthy();
    expect(bodyComponent.parameters).toEqual([
      { type: 'text', text: 'Narciso' },
      { type: 'text', text: 'Maria' },
      { type: 'text', text: 'https://nsmusic.nsnexus.com.br/entrega?orderId=NS-123' },
    ]);

    // Botões dinâmicos de download: index 0 (v1) e index 1 (v2)
    const buttonComponents = capturedBody.template.components.filter((c) => c.type === 'button');
    expect(buttonComponents.length).toBe(2);
    expect(buttonComponents[0]).toEqual({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: 'NS-123' }],
    });
    expect(buttonComponents[1]).toEqual({
      type: 'button',
      sub_type: 'url',
      index: '1',
      parameters: [{ type: 'text', text: 'NS-123' }],
    });
  });

  it('trata valores vazios de cliente e homenageado com fallbacks amigáveis', async () => {
    let capturedBody = null;

    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      if (url.includes('messages')) {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [{ id: 'wamid.12345' }],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const res = await enviarPagamentoConfirmadoCloud(
      '5511999998888',
      {
        cliente: '',
        homenageado: null,
        orderId: 'NS-456',
      },
      envMock
    );

    expect(res.success).toBe(true);
    const bodyComponent = capturedBody.template.components.find((c) => c.type === 'body');
    expect(bodyComponent.parameters[0].text).toBe('Cliente');
    expect(bodyComponent.parameters[1].text).toBe('alguém especial');
    expect(bodyComponent.parameters[2].text).toBe('https://nsmusic.ia.br/entrega?orderId=NS-456');
  });
});
