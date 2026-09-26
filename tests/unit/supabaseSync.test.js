import { describe, it, expect, vi } from 'vitest';
import { mapFirestoreOrderToSupabase, mapSupabaseOrderToFirestore, mapSupabaseTaskToFirestore, mirrorOrderToSupabase, mirrorPaymentToSupabase } from '../../src/lib/supabaseSync.js';

describe('supabaseSync', () => {
  it('converte corretamente campos de snake_case do Postgres de volta para camelCase', () => {
    const row = {
      id: 'doc-id-456',
      order_number: 'NS-9999-2026',
      customer_name: 'João Souza',
      customer_phone: '(11) 98888-7777',
      payment_status: 'PAGO',
      audio_files: ['https://r2.dev/audio1.mp3'],
      has_video_access: true,
      extras: { campoLegado: 'abc' }
    };

    const mapped = mapSupabaseOrderToFirestore(row);

    expect(mapped.id).toBe('doc-id-456');
    expect(mapped.orderNumber).toBe('NS-9999-2026');
    expect(mapped.customerName).toBe('João Souza');
    expect(mapped.customerPhone).toBe('(11) 98888-7777');
    expect(mapped.paymentStatus).toBe('PAGO');
    expect(mapped.audioFiles).toEqual(['https://r2.dev/audio1.mp3']);
    expect(mapped.hasVideoAccess).toBe(true);
    expect(mapped.campoLegado).toBe('abc');
  });
  it('converte corretamente campos de camelCase para snake_case e preserva id', () => {
    const firestoreData = {
      orderNumber: 'NS-12345-2026',
      customerName: 'Maria Silva',
      customerPhone: '11999998888',
      customerEmail: 'maria@example.com',
      lyrics: 'Letra de teste',
      paymentStatus: 'PAGAMENTO_APROVADO',
      paidAt: '2026-09-25T12:00:00.000Z',
      hasVideoAccess: true,
      audioFiles: ['https://cdn.example.com/audio1.mp3'],
      audioIds: ['track-1'],
      // Campo desconhecido deve ir para extras
      campoDesconhecidoCustom: 'valor_especial'
    };

    const mapped = mapFirestoreOrderToSupabase('doc-id-123', firestoreData);

    expect(mapped.id).toBe('doc-id-123');
    expect(mapped.order_number).toBe('NS-12345-2026');
    expect(mapped.customer_name).toBe('Maria Silva');
    expect(mapped.customer_phone).toBe('11999998888');
    expect(mapped.customer_email).toBe('maria@example.com');
    expect(mapped.payment_status).toBe('PAGAMENTO_APROVADO');
    expect(mapped.paid_at).toBe('2026-09-25T12:00:00.000Z');
    expect(mapped.has_video_access).toBe(true);
    expect(mapped.audio_files).toEqual(['https://cdn.example.com/audio1.mp3']);
    expect(mapped.extras.campoDesconhecidoCustom).toBe('valor_especial');
  });

  it('lida com Firestore Timestamp (.toDate())', () => {
    const mockTimestamp = {
      toDate: () => new Date('2026-09-25T10:00:00.000Z')
    };

    const firestoreData = {
      createdAt: mockTimestamp,
      paidAt: mockTimestamp
    };

    const mapped = mapFirestoreOrderToSupabase('order-time', firestoreData);
    expect(mapped.created_at).toBe('2026-09-25T10:00:00.000Z');
    expect(mapped.paid_at).toBe('2026-09-25T10:00:00.000Z');
  });

  it('mirrorOrderToSupabase retorna sem erro quando Supabase não está configurado', async () => {
    const res = await mirrorOrderToSupabase('order-123', { customerName: 'Teste' }, {});
    expect(res.success).toBe(false);
    expect(res.reason).toBe('not_configured');
  });

  it('mirrorPaymentToSupabase retorna sem erro quando Supabase não está configurado', async () => {
    const res = await mirrorPaymentToSupabase({
      orderId: 'order-123',
      kind: 'musica',
      txid: 'tx-123',
      amount: 9.99
    }, {});
    expect(res.success).toBe(false);
    expect(res.reason).toBe('not_configured');
  });

  it('mapSupabaseTaskToFirestore converte corretamente registro de suno_tasks', () => {
    const row = {
      id: 'task-abc-123',
      order_id: 'order-xyz-789',
      status: 'COMPLETED',
      provider: 'kie',
      clip_ids: ['clip-1', 'clip-2'],
      result: { data: [{ audio_url: 'https://cdn.example.com/audio.mp3' }] },
      retry_task_id: null,
      created_at: '2026-09-25T12:00:00.000Z',
      updated_at: '2026-09-25T12:01:00.000Z'
    };

    const mapped = mapSupabaseTaskToFirestore(row);
    expect(mapped.id).toBe('task-abc-123');
    expect(mapped.orderId).toBe('order-xyz-789');
    expect(mapped.status).toBe('COMPLETED');
    expect(mapped.provider).toBe('kie');
    expect(mapped.clipIds).toEqual(['clip-1', 'clip-2']);
    expect(mapped.result).toEqual(row.result);
  });
});
