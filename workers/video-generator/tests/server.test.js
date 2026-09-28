import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

describe('Server API Endpoints', () => {
  let server;
  let baseUrl;
  const testSecret = 'test-token-123456';

  before(async () => {
    const { app } = createApp({
      VPS_VIDEO_SECRET: testSecret,
      MAX_CONCURRENT_JOBS: '2',
      SUPABASE_URL: '',
      R2_ACCOUNT_ID: '',
    });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(r => server.close(r));
    }
  });

  test('GET /health returns 200 with queue stats', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'nsmusic-video-generator');
    assert.ok(typeof data.queue.activeCount === 'number');
  });

  test('POST /render rejects requests without valid token', async () => {
    // Sem token
    const res1 = await fetch(`${baseUrl}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'test-1' }),
    });
    assert.equal(res1.status, 401);

    // Com token errado
    const res2 = await fetch(`${baseUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-token',
      },
      body: JSON.stringify({ orderId: 'test-1' }),
    });
    assert.equal(res2.status, 401);
  });

  test('POST /render validates required fields', async () => {
    const res = await fetch(`${baseUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testSecret}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('orderId'));
  });

  test('POST /render accepts valid request with 202', async () => {
    const res = await fetch(`${baseUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testSecret}`,
      },
      body: JSON.stringify({
        orderId: 'valid-order-999',
        audioUrl: 'https://example.com/audio.mp3',
        imageUrls: ['https://example.com/img1.jpg'],
        title: 'Homenagem',
      }),
    });

    assert.equal(res.status, 202);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.orderId, 'valid-order-999');
  });
});
