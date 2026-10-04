import { describe, it, expect, vi, beforeEach } from 'vitest';

// updateTaskResult é chamado por duas vias concorrentes (webhook da Kie.ai e polling de
// /api/suno/status). Sem uma transação para reservar o envio de WhatsApp, as duas podiam disparar a
// mesma mensagem em paralelo — mesma classe de corrida já corrigida em src/lib/payments.js (ver M-06
// no AUDIT_REPORT.md, que também padronizou saveTask para usar merge:true).

let store;

vi.mock('@/lib/whatsapp', () => ({ sendMusicReadyTemplate: vi.fn().mockResolvedValue({ success: true }) }));

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async (id) => (store[id] ? { id, ...store[id] } : null)),
  updateOrder: vi.fn(async (id, updates) => {
    store[id] = { ...(store[id] || {}), ...updates };
    return { success: true };
  }),
  getSunoTask: vi.fn(async (id) => (store[id] ? { id, ...store[id] } : null)),
  saveSunoTask: vi.fn(async (id, status, result, orderId, extra) => {
    store[id] = { ...(store[id] || {}), id, status, result, orderId, ...extra };
    return true;
  }),
}));

const { updateTaskResult, saveTask } = await import('@/lib/db');

beforeEach(() => {
  store = {};
});

describe('updateTaskResult — idempotência do envio de WhatsApp', () => {
  it('envia WhatsApp uma única vez mesmo com duas chamadas concorrentes para o mesmo pedido', async () => {
    store['task1'] = { orderId: 'order1' };
    store['order1'] = { customerPhone: '5511999999999', whatsappRequested: true, customerName: 'Cliente', honoreeName: 'Alguém' };

    const result = { data: [{ id: 'audio1', audio_url: 'https://cdn1.suno.ai/audio1.mp3' }] };

    await Promise.all([
      updateTaskResult('task1', result),
      updateTaskResult('task1', result),
    ]);

    expect(store['order1'].whatsappSent).toBe(true);
    expect(store['order1'].whatsappSending).toBe(false);
  });

  it('não reenvia se whatsappSent já é true', async () => {
    store['task2'] = { orderId: 'order2' };
    store['order2'] = { customerPhone: '5511999999999', whatsappSent: true };

    const result = { data: [{ id: 'audio2', audio_url: 'https://cdn1.suno.ai/audio2.mp3' }] };
    await updateTaskResult('task2', result);

    // audioUrl/productionStatus ainda são atualizados; só o envio de WhatsApp é pulado.
    expect(store['order2'].audioUrl).toBeTruthy();
  });
});

describe('updateTaskResult — capa gerada pela Kie.ai (achado 28/08/2026)', () => {
  it('usa a capa da Kie.ai (image_url) quando o cliente não subiu foto própria', async () => {
    store['task4'] = { orderId: 'order4' };
    store['order4'] = { customerPhone: '5511999999999', coverUrl: '' };

    const result = { data: [{ id: 'audio4', audio_url: 'https://cdn1.suno.ai/audio4.mp3', image_url: 'https://kie.ai/cover4.jpg' }] };
    await updateTaskResult('task4', result);

    expect(store['order4'].coverUrl).toBe('https://kie.ai/cover4.jpg');
  });

  it('NUNCA sobrescreve a foto que o cliente já escolheu', async () => {
    store['task5'] = { orderId: 'order5' };
    store['order5'] = { customerPhone: '5511999999999', coverUrl: 'https://firebasestorage.example/minha-foto.jpg' };

    const result = { data: [{ id: 'audio5', audio_url: 'https://cdn1.suno.ai/audio5.mp3', image_url: 'https://kie.ai/cover5.jpg' }] };
    await updateTaskResult('task5', result);

    expect(store['order5'].coverUrl).toBe('https://firebasestorage.example/minha-foto.jpg');
  });
});

describe('saveTask', () => {
  it('usa merge:true e não apaga campos já existentes no documento', async () => {
    store['task3'] = { customPreExistingField: 'preserved' };
    await saveTask('task3', 'PROCESSING', null, 'order3');
    expect(store['task3'].customPreExistingField).toBe('preserved');
    expect(store['task3'].status).toBe('PROCESSING');
  });
});

describe('updateTaskResult — regeração e substituição de áudio', () => {
  it('substitui automaticamente o áudio anterior quando admin regera música (status GERANDO_AUDIO), mesmo se já havia áudio no R2', async () => {
    store['task_nova'] = { orderId: 'order_regerada' };
    store['order_regerada'] = {
      customerPhone: '5511999999999',
      productionStatus: 'GERANDO_AUDIO',
      sunoTaskId: 'task_nova',
      audioUrl: 'https://pub-r2.dev/audios/order_regerada/versao-1.mp3',
      audioFiles: ['https://pub-r2.dev/audios/order_regerada/versao-1.mp3'],
      audioIds: ['track_antigo_1'],
      audioArchivedAt: '2026-09-20T10:00:00.000Z'
    };

    const result = {
      data: [
        { id: 'track_novo_1', audio_url: 'https://tempfile.aiquickdraw.com/r/track_novo_1.mp3' },
        { id: 'track_novo_2', audio_url: 'https://tempfile.aiquickdraw.com/r/track_novo_2.mp3' }
      ]
    };

    await updateTaskResult('task_nova', result);

    expect(store['order_regerada'].audioUrl).toBe('https://tempfile.aiquickdraw.com/r/track_novo_1.mp3');
    expect(store['order_regerada'].audioFiles).toEqual([
      'https://tempfile.aiquickdraw.com/r/track_novo_1.mp3',
      'https://tempfile.aiquickdraw.com/r/track_novo_2.mp3'
    ]);
    expect(store['order_regerada'].audioIds).toEqual(['track_novo_1', 'track_novo_2']);
    expect(store['order_regerada'].productionStatus).toBe('AUDIO_GERADO');
  });

  it('substitui automaticamente o áudio se os IDs das novas faixas forem diferentes (novo trackId)', async () => {
    store['task_nova_2'] = { orderId: 'order_regerada_2' };
    store['order_regerada_2'] = {
      customerPhone: '5511999999999',
      productionStatus: 'AUDIO_GERADO',
      sunoTaskId: 'task_antiga',
      audioUrl: 'https://pub-r2.dev/audios/order_regerada_2/versao-1.mp3',
      audioFiles: ['https://pub-r2.dev/audios/order_regerada_2/versao-1.mp3'],
      audioIds: ['track_antigo_1'],
    };

    const result = {
      data: [
        { id: 'track_diferente_1', audio_url: 'https://tempfile.aiquickdraw.com/r/track_diferente_1.mp3' }
      ]
    };

    await updateTaskResult('task_nova_2', result);

    expect(store['order_regerada_2'].audioUrl).toBe('https://tempfile.aiquickdraw.com/r/track_diferente_1.mp3');
    expect(store['order_regerada_2'].audioIds).toEqual(['track_diferente_1']);
  });

  it('preserva a URL do R2 quando chega webhook atrasado com a MESMA faixa já arquivada', async () => {
    store['task_mesma'] = { orderId: 'order_mesma' };
    store['order_mesma'] = {
      customerPhone: '5511999999999',
      productionStatus: 'AUDIO_GERADO',
      sunoTaskId: 'task_mesma',
      audioUrl: 'https://pub-r2.dev/audios/order_mesma/versao-1.mp3',
      audioFiles: ['https://pub-r2.dev/audios/order_mesma/versao-1.mp3'],
      audioIds: ['track_mesmo_1'],
      audioArchivedAt: '2026-09-20T10:00:00.000Z'
    };

    const result = {
      data: [
        { id: 'track_mesmo_1', audio_url: 'https://tempfile.aiquickdraw.com/r/track_mesmo_1.mp3' }
      ]
    };

    await updateTaskResult('task_mesma', result);

    // Como é a MESMA faixa e já está arquivada no R2, preserva o R2 e não reverte para tempfile
    expect(store['order_mesma'].audioUrl).toBe('https://pub-r2.dev/audios/order_mesma/versao-1.mp3');
  });

  it('atualiza pedido quando recebe saída da Unifically com audio_url1 e audio_url2', async () => {
    store['task_unif'] = { orderId: 'order_unif' };
    store['order_unif'] = {
      customerPhone: '5511999999999',
      productionStatus: 'GERANDO_AUDIO',
    };

    const unifPayload = {
      status: 'completed',
      task_id: '96b69d7c-73d9-4a18-813c-9cf3e51ef5b4',
      audio_url1: 'https://files.unifically.com/audio/tf-wlAYfTcDIELE-803a43e8-312b-48ff-9a89-a884f7a81f0c.mp3',
      audio_url2: 'https://files.unifically.com/audio/tf-wqAzffcVIxVq-757f3834-c4b6-4d23-9789-3d281d7ae92e.mp3'
    };

    await updateTaskResult('task_unif', unifPayload);

    expect(store['order_unif'].productionStatus).toBe('AUDIO_GERADO');
    expect(store['order_unif'].audioFiles).toHaveLength(2);
    expect(store['order_unif'].audioFiles[0]).toBe('https://files.unifically.com/audio/tf-wlAYfTcDIELE-803a43e8-312b-48ff-9a89-a884f7a81f0c.mp3');
    expect(store['order_unif'].audioFiles[1]).toBe('https://files.unifically.com/audio/tf-wqAzffcVIxVq-757f3834-c4b6-4d23-9789-3d281d7ae92e.mp3');
  });
});
