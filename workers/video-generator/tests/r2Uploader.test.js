import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateR2Key, constructPublicUrl, uploadVideoToR2 } from '../src/r2Uploader.js';

describe('R2 Uploader Module', () => {
  test('generateR2Key produces unique video key with orderId', () => {
    const key = generateR2Key('order-xyz');
    assert.ok(key.startsWith('videos/order-xyz-'), 'key starts with videos/orderId');
    assert.ok(key.endsWith('.mp4'), 'key ends with .mp4');
  });

  test('constructPublicUrl formats public URL correctly', () => {
    const url = constructPublicUrl('https://media.nsmusic.ia.br', 'videos/my-video.mp4');
    assert.equal(url, 'https://media.nsmusic.ia.br/videos/my-video.mp4');

    // Com barra no final de publicUrl
    const url2 = constructPublicUrl('https://media.nsmusic.ia.br/', 'videos/my-video.mp4');
    assert.equal(url2, 'https://media.nsmusic.ia.br/videos/my-video.mp4');
  });

  test('uploadVideoToR2 throws if credentials or file are missing', async () => {
    await assert.rejects(async () => {
      await uploadVideoToR2(null, 'order-123', {});
    }, /Caminho do arquivo de vídeo obrigatório/);

    await assert.rejects(async () => {
      await uploadVideoToR2('/tmp/video.mp4', 'order-123', {
        R2_ACCOUNT_ID: '',
        R2_ACCESS_KEY_ID: '',
      });
    }, /Credenciais do Cloudflare R2 não configuradas/);
  });
});
