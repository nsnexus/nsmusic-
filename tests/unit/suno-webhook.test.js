import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/suno/webhook/route';

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({
    env: {
      KIE_WEBHOOK_SECRET: 'kie-secret-123',
      UNIFICALLY_WEBHOOK_SECRET: 'unif-secret-key-456',
    }
  })
}));

const updateTaskResultMock = vi.fn(async () => true);
const getTaskMock = vi.fn(async () => null);

vi.mock('@/lib/db', () => ({
  updateTaskResult: (...args) => updateTaskResultMock(...args),
  getTask: (...args) => getTaskMock(...args),
}));

vi.mock('@/lib/suno', () => ({
  maybeAutoRetrySunoFailure: vi.fn(async () => ({ retried: true })),
}));

describe('POST /api/suno/webhook', () => {
  beforeEach(() => {
    updateTaskResultMock.mockClear();
    getTaskMock.mockClear();
  });

  it('processa callback da Unifically com assinatura HMAC válida', async () => {
    const payload = {
      task_id: 'unif-task-abc',
      status: 'completed',
      data: {
        audio_url: 'https://cdn.unifically.com/outputs/test.mp3',
      }
    };
    const bodyStr = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', 'unif-secret-key-456')
      .update(`${timestamp}.${bodyStr}`)
      .digest('hex');

    const req = new Request('https://nsmusic.nsnexus.com.br/api/suno/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp,
      },
      body: bodyStr,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(updateTaskResultMock).toHaveBeenCalledWith('unif-task-abc', payload, null, expect.anything());
  });

  it('rejeita callback da Unifically com assinatura HMAC inválida', async () => {
    const payload = {
      task_id: 'unif-task-fake',
      status: 'completed',
    };
    const bodyStr = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const req = new Request('https://nsmusic.nsnexus.com.br/api/suno/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': 'bad-signature-hex-1234567890abcdef',
        'x-webhook-timestamp': timestamp,
      },
      body: bodyStr,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(updateTaskResultMock).not.toHaveBeenCalled();
  });

  it('processa callback da Kie.ai com secret correto', async () => {
    const payload = {
      taskId: 'kie-task-xyz',
      data: {
        audioUrl: 'https://audiostream.kie.ai/stream/xyz.mp3',
      }
    };

    const req = new Request('https://nsmusic.nsnexus.com.br/api/suno/webhook?secret=kie-secret-123', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(updateTaskResultMock).toHaveBeenCalledWith('kie-task-xyz', payload, null, expect.anything());
  });

  it('rejeita callback da Kie.ai com secret incorreto', async () => {
    const payload = {
      taskId: 'kie-task-xyz',
    };

    const req = new Request('https://nsmusic.nsnexus.com.br/api/suno/webhook?secret=wrong-secret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(updateTaskResultMock).not.toHaveBeenCalled();
  });
});
