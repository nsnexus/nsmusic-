import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateOrderId, createOrder, updateOrder, softDeleteOrder, getSunoTask, saveSunoTask } from '../../src/lib/supabaseDb.js';

let mockFirestoreStore;
let mockSupabaseRows;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _coll, id) => ({ id }),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  limit: () => ({}),
  getDocs: async () => ({ empty: true }),
  getDoc: async (ref) => ({
    exists: () => Object.prototype.hasOwnProperty.call(mockFirestoreStore, ref.id),
    data: () => mockFirestoreStore[ref.id]
  }),
  setDoc: async (ref, data, opts) => {
    mockFirestoreStore[ref.id] = opts?.merge
      ? { ...(mockFirestoreStore[ref.id] || {}), ...data }
      : data;
  },
  updateDoc: async (ref, data) => {
    if (!mockFirestoreStore[ref.id]) {
      throw new Error('Doc not found in firestore');
    }
    mockFirestoreStore[ref.id] = { ...mockFirestoreStore[ref.id], ...data };
  }
}));


vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: (table) => ({
      upsert: async (payload, opts) => {
        const item = Array.isArray(payload) ? payload[0] : payload;
        mockSupabaseRows[table] = mockSupabaseRows[table] || {};
        mockSupabaseRows[table][item.id] = item;
        return { data: [item], error: null };
      },
      update: async (updates) => {
        return { data: [updates], error: null };
      },
      eq: function (col, val) {
        this._col = col;
        this._val = val;
        return this;
      },
      select: function () {
        return this;
      },
      maybeSingle: async function () {
        const items = mockSupabaseRows[table] || {};
        const found = Object.values(items).find(r => String(r[this._col]) === String(this._val));
        return { data: found || null, error: null };
      }
    })
  }))
}));

beforeEach(() => {
  mockFirestoreStore = {};
  mockSupabaseRows = { orders: {}, suno_tasks: {} };
});

describe('supabaseDb', () => {
  it('generateOrderId gera string alfanumérica de 20 caracteres', () => {
    const id = generateOrderId();
    expect(id).toHaveLength(20);
    expect(id).toMatch(/^[a-zA-Z0-9]{20}$/);
  });

  it('createOrder grava no Supabase e faz dual-write no Firestore', async () => {
    const orderData = {
      customerName: 'Carlos Lima',
      customerPhone: '11999998888',
      lyrics: 'Letra teste',
      musicStyle: 'Sertanejo'
    };

    const created = await createOrder(orderData);

    expect(created.id).toHaveLength(20);
    expect(created.orderNumber).toMatch(/^NS-/);
    expect(created.customerName).toBe('Carlos Lima');

    // Verifica persistência no Supabase
    expect(mockSupabaseRows.orders[created.id]).toBeDefined();
    expect(mockSupabaseRows.orders[created.id].customer_name).toBe('Carlos Lima');
    expect(mockSupabaseRows.orders[created.id].music_style).toBe('Sertanejo');

    // Verifica dual-write no Firestore
    expect(mockFirestoreStore[created.id]).toBeDefined();
    expect(mockFirestoreStore[created.id].customerName).toBe('Carlos Lima');
  });

  it('updateOrder atualiza tanto no Supabase quanto no Firestore', async () => {
    const orderId = 'test-order-123';
    mockFirestoreStore[orderId] = { id: orderId, customerName: 'Ana' };
    mockSupabaseRows.orders[orderId] = { id: orderId, customer_name: 'Ana' };

    const updates = {
      audioUrl: 'https://r2.dev/audio123.mp3',
      productionStatus: 'AUDIO_GERADO',
      paymentStatus: 'PAGO'
    };

    const res = await updateOrder(orderId, updates);
    expect(res.success).toBe(true);

    // Verifica atualização no Firestore
    expect(mockFirestoreStore[orderId].audioUrl).toBe('https://r2.dev/audio123.mp3');
    expect(mockFirestoreStore[orderId].productionStatus).toBe('AUDIO_GERADO');
    expect(mockFirestoreStore[orderId].paymentStatus).toBe('PAGO');
    expect(mockFirestoreStore[orderId].updatedAt).toBeDefined();
  });

  it('saveSunoTask persiste tarefa no Supabase e no Firestore', async () => {
    const taskId = 'task-xyz-999';
    const res = await saveSunoTask(taskId, 'COMPLETED', { audio: 'track.mp3' }, 'order-123', { provider: 'kie' });

    expect(res).toBe(true);
    expect(mockSupabaseRows.suno_tasks[taskId]).toBeDefined();
    expect(mockSupabaseRows.suno_tasks[taskId].status).toBe('COMPLETED');
    expect(mockSupabaseRows.suno_tasks[taskId].provider).toBe('kie');

    expect(mockFirestoreStore[taskId]).toBeDefined();
    expect(mockFirestoreStore[taskId].status).toBe('COMPLETED');
    expect(mockFirestoreStore[taskId].orderId).toBe('order-123');
  });

  it('getSunoTask recupera tarefa do Supabase com prioridade', async () => {
    const taskId = 'task-abc-111';
    mockSupabaseRows.suno_tasks[taskId] = {
      id: taskId,
      order_id: 'order-1',
      status: 'PROCESSING',
      provider: 'kie',
      clip_ids: ['clip1'],
      result: null
    };

    const task = await getSunoTask(taskId);
    expect(task).toBeDefined();
    expect(task.id).toBe(taskId);
    expect(task.orderId).toBe('order-1');
    expect(task.status).toBe('PROCESSING');
  });

  it('softDeleteOrder marca deleted_at e atualiza Firestore', async () => {
    const orderId = 'order-delete-me';
    mockFirestoreStore[orderId] = { id: orderId, customerName: 'Excluir' };

    const res = await softDeleteOrder(orderId);
    expect(res.success).toBe(true);
    expect(mockFirestoreStore[orderId].deletedAt).toBeDefined();
  });
});
