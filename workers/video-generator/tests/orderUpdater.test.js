import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderUpdates, updateOrderStatus } from '../src/orderUpdater.js';

describe('Order Updater Module', () => {
  test('buildOrderUpdates formats updates correctly', () => {
    const updates = buildOrderUpdates({
      status: 'CONCLUIDO',
      progress: 100,
      videoUrl: 'https://media.nsmusic.ia.br/videos/test.mp4'
    });

    assert.equal(updates.video_status, 'CONCLUIDO');
    assert.equal(updates.video_url, 'https://media.nsmusic.ia.br/videos/test.mp4');
    assert.equal(updates.video_error, null);
    assert.ok(updates.updated_at, 'has updated_at timestamp');
  });

  test('buildOrderUpdates formats error state correctly', () => {
    const updates = buildOrderUpdates({
      status: 'ERRO',
      error: 'FFmpeg process killed'
    });

    assert.equal(updates.video_status, 'ERRO');
    assert.equal(updates.video_error, 'FFmpeg process killed');
    assert.ok(updates.updated_at, 'has updated_at timestamp');
  });

  test('updateOrderStatus throws if orderId is missing', async () => {
    await assert.rejects(async () => {
      await updateOrderStatus(null, { status: 'GERANDO' });
    }, /ID do pedido obrigatório/);
  });
});
