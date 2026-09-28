import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A Cloud API (API oficial da Meta) entrou em 27/09/2026 como RESERVA de envio, com escopo
// fechado: só "música pronta" e "pagamento confirmado". O que estes testes fixam é a fronteira
// desse escopo — ela não pode entrar quando os provedores principais deram conta, nem quando a
// trava anti-spam barrou o disparo de propósito (senão a reserva vira o spam que a trava evita).

const enviarMusicaProntaCloudMock = vi.fn();
const enviarPagamentoConfirmadoCloudMock = vi.fn();
let cloudEnabled = true;

vi.mock('@/lib/whatsappCloudApi.js', () => ({
  getCloudApiConfig: () => ({ enabled: cloudEnabled }),
  enviarMusicaProntaCloud: (...a) => enviarMusicaProntaCloudMock(...a),
  enviarPagamentoConfirmadoCloud: (...a) => enviarPagamentoConfirmadoCloudMock(...a),
}));

const { sendMusicReadyTemplate, sendPaymentApprovedTemplate } = await import('@/lib/whatsapp');

// Telefone diferente por teste: a trava de "pagamento confirmado" guarda 15 minutos por número em
// memória do processo, então reusar o mesmo número faria o segundo caso cair no cooldown.
let seq = 0;
const novoTelefone = () => `55119777760${String(seq++).padStart(2, '0')}`;
const envSalvo = {};

// O guard central bloqueia todo disparo enquanto detecta ambiente de teste — é essa proteção que
// impede o suite de mandar WhatsApp de verdade. Para exercitar o caminho de fallback é preciso
// desligá-la nos testes que precisam, e religar depois.
function fingirProducao() {
  for (const k of ['NODE_ENV', 'VITEST', 'CI', 'IS_TEST']) {
    envSalvo[k] = process.env[k];
    delete process.env[k];
  }
  process.env.NODE_ENV = 'production';
}
function restaurarAmbiente() {
  for (const k of ['NODE_ENV', 'VITEST', 'CI', 'IS_TEST']) {
    if (envSalvo[k] === undefined) delete process.env[k];
    else process.env[k] = envSalvo[k];
  }
}

beforeEach(() => {
  enviarMusicaProntaCloudMock.mockReset();
  enviarPagamentoConfirmadoCloudMock.mockReset();
  cloudEnabled = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  restaurarAmbiente();
  vi.restoreAllMocks();
});

describe('Cloud API como reserva de envio', () => {
  it('música pronta: sem Evolution nem W-API, sai pela Cloud API', async () => {
    const telefone = novoTelefone();
    fingirProducao();
    enviarMusicaProntaCloudMock.mockResolvedValue({ success: true, provider: 'cloud_api' });

    const r = await sendMusicReadyTemplate(telefone, {
      customerName: 'Maria Aparecida da Silva',
      honoreeName: 'Dona Léo',
      deliveryUrl: 'https://nsmusic.ia.br/entrega?orderId=abc',
    }, {});

    expect(r.success).toBe(true);
    expect(r.provider).toBe('cloud_api');
    // Template da Meta com nome completo fica artificial; só o primeiro nome vai.
    expect(enviarMusicaProntaCloudMock).toHaveBeenCalledWith(telefone, {
      cliente: 'Maria',
      homenageado: 'Dona Léo',
      link: 'https://nsmusic.ia.br/entrega?orderId=abc',
    }, {});
  });

  it('pagamento confirmado: sem Evolution nem W-API, sai pela Cloud API', async () => {
    const telefone = novoTelefone();
    fingirProducao();
    enviarPagamentoConfirmadoCloudMock.mockResolvedValue({ success: true, provider: 'cloud_api' });

    const r = await sendPaymentApprovedTemplate(telefone, {
      customerName: 'João',
      honoreeName: 'Vovó Ana',
      deliveryUrl: 'https://nsmusic.ia.br/entrega?orderId=xyz',
      audioUrls: ['https://cdn/1.mp3'],
    }, {});

    expect(r.success).toBe(true);
    expect(enviarPagamentoConfirmadoCloudMock).toHaveBeenCalledTimes(1);
  });

  it('disparo barrado pela trava anti-spam NÃO aciona a Cloud API', async () => {
    const telefone = novoTelefone();
    // Ambiente de teste é justamente um dos casos que o guard bloqueia.
    const r = await sendMusicReadyTemplate(telefone, { customerName: 'Maria' }, {});

    expect(r.success).toBe(true);
    expect(r.ignored).toBeTruthy();
    expect(enviarMusicaProntaCloudMock).not.toHaveBeenCalled();
  });

  it('Cloud API não configurada não quebra o envio', async () => {
    const telefone = novoTelefone();
    fingirProducao();
    cloudEnabled = false;

    const r = await sendMusicReadyTemplate(telefone, { customerName: 'Maria' }, {});

    expect(r.success).toBe(false);
    expect(enviarMusicaProntaCloudMock).not.toHaveBeenCalled();
  });

  it('falha nos dois lados devolve os dois motivos', async () => {
    const telefone = novoTelefone();
    fingirProducao();
    enviarPagamentoConfirmadoCloudMock.mockResolvedValue({ success: false, error: 'template não aprovado' });

    const r = await sendPaymentApprovedTemplate(telefone, { customerName: 'João' }, {});

    expect(r.success).toBe(false);
    expect(r.error).toContain('cloud_api: template não aprovado');
  });
});
