import { describe, it, expect, vi, beforeEach } from 'vitest';

// updateTaskResult é chamado por duas vias concorrentes (webhook da Kie.ai e polling de
// /api/suno/status). Sem uma transação para reservar o envio de WhatsApp, as duas podiam disparar a
// mesma mensagem em paralelo — mesma classe de corrida já corrigida em src/lib/payments.js (ver M-06
// no AUDIT_REPORT.md, que também padronizou saveTask para usar merge:true).

let store;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));
vi.mock('@/lib/whatsapp', () => ({ sendMusicReadyTemplate: vi.fn().mockResolvedValue({ success: true }) }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _collection, id) => ({ id }),
  getDoc: async (ref) => ({
    exists: () => Object.prototype.hasOwnProperty.call(store, ref.id),
    data: () => store[ref.id],
  }),
  setDoc: async (ref, data, opts) => {
    store[ref.id] = opts?.merge ? { ...(store[ref.id] || {}), ...data } : data;
  },
  updateDoc: async (ref, data) => {
    store[ref.id] = { ...(store[ref.id] || {}), ...data };
  },
  runTransaction: async (_db, updateFunction) => {
    const tx = {
      get: async (ref) => ({
        exists: () => Object.prototype.hasOwnProperty.call(store, ref.id),
        data: () => store[ref.id],
      }),
      update: (ref, data) => {
        store[ref.id] = { ...(store[ref.id] || {}), ...data };
      },
    };
    return updateFunction(tx);
  },
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
