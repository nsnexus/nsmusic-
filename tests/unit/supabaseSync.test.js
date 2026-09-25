import { describe, it, expect, vi } from 'vitest';
import { mapFirestoreOrderToSupabase, mirrorOrderToSupabase, mirrorPaymentToSupabase } from '../../src/lib/supabaseSync.js';

describe('supabaseSync', () => {
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
});
