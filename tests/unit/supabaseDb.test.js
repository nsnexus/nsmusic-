import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateOrderId, createOrder, updateOrder, softDeleteOrder, getSunoTask, saveSunoTask } from '../../src/lib/supabaseDb.js';

let mockSupabaseRows;

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: (table) => {
      let filterCol = null;
      let filterVal = null;
      return {
        upsert: async (payload) => {
          const item = Array.isArray(payload) ? payload[0] : payload;
          mockSupabaseRows[table] = mockSupabaseRows[table] || {};
          mockSupabaseRows[table][item.id] = { ...(mockSupabaseRows[table][item.id] || {}), ...item };
          return { data: [mockSupabaseRows[table][item.id]], error: null };
        },
        eq: function (col, val) {
          filterCol = col;
          filterVal = val;
          return this;
        },
        update: async (updates) => {
          mockSupabaseRows[table] = mockSupabaseRows[table] || {};
          if (filterCol && filterVal) {
            mockSupabaseRows[table][filterVal] = {
              ...(mockSupabaseRows[table][filterVal] || {}),
              ...updates
            };
          }
          return { data: [updates], error: null };
        },
        select: function () {
          return this;
        },
        maybeSingle: async function () {
          const items = mockSupabaseRows[table] || {};
          const found = Object.values(items).find(r => String(r[filterCol]) === String(filterVal));
          return { data: found || null, error: null };
        }
      };
    }
  }))
}));

beforeEach(() => {
  mockSupabaseRows = { orders: {}, suno_tasks: {} };
});

describe('supabaseDb', () => {
  it('generateOrderId gera string alfanumérica de 20 caracteres', () => {
    const id = generateOrderId();
    expect(id).toHaveLength(20);
    expect(id).toMatch(/^[a-zA-Z0-9]{20}$/);
  });

  it('createOrder grava no Supabase', async () => {
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
  });

  it('updateOrder atualiza no Supabase', async () => {
    const orderId = 'test-order-123';
    mockSupabaseRows.orders[orderId] = { id: orderId, customer_name: 'Ana' };

    const updates = {
      audioUrl: 'https://r2.dev/audio123.mp3',
      productionStatus: 'AUDIO_GERADO',
      paymentStatus: 'PAGO'
    };

    const res = await updateOrder(orderId, updates);
    expect(res.success).toBe(true);

    // Verifica atualização no Supabase
    expect(mockSupabaseRows.orders[orderId].audio_url).toBe('https://r2.dev/audio123.mp3');
    expect(mockSupabaseRows.orders[orderId].production_status).toBe('AUDIO_GERADO');
    expect(mockSupabaseRows.orders[orderId].payment_status).toBe('PAGO');
    expect(mockSupabaseRows.orders[orderId].updated_at).toBeDefined();
  });

  it('saveSunoTask persiste tarefa no Supabase', async () => {
    const taskId = 'task-xyz-999';
    const res = await saveSunoTask(taskId, 'COMPLETED', { audio: 'track.mp3' }, 'order-123', { provider: 'kie' });

    expect(res).toBe(true);
    expect(mockSupabaseRows.suno_tasks[taskId]).toBeDefined();
    expect(mockSupabaseRows.suno_tasks[taskId].status).toBe('COMPLETED');
    expect(mockSupabaseRows.suno_tasks[taskId].provider).toBe('kie');
  });

  it('getSunoTask recupera tarefa do Supabase', async () => {
    const taskId = 'task-abc-111';
    mockSupabaseRows.suno_tasks[taskId] = {
      id: taskId,
      order_id: 'order-1',
      status: 'PROCESSING',
      provider: 'kie',
      result: null
    };

    const task = await getSunoTask(taskId);
    expect(task).toBeDefined();
    expect(task.id).toBe(taskId);
    expect(task.orderId).toBe('order-1');
    expect(task.status).toBe('PROCESSING');
  });

  it('softDeleteOrder marca deleted_at no Supabase', async () => {
    const orderId = 'order-delete-me';
    mockSupabaseRows.orders[orderId] = { id: orderId, customer_name: 'Excluir' };

    const res = await softDeleteOrder(orderId);
    expect(res.success).toBe(true);
    expect(mockSupabaseRows.orders[orderId].deleted_at).toBeDefined();
  });
});
