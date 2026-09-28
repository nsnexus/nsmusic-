import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { downloadJobAssets } from '../src/downloader.js';

describe('Downloader Module', () => {
  const tmpBase = path.join(os.tmpdir(), 'test-video-downloader');

  before(async () => {
    await fs.mkdir(tmpBase, { recursive: true });
  });

  after(async () => {
    await fs.rm(tmpBase, { recursive: true, force: true });
  });

  test('downloadJobAssets should create workDir and cleanup correctly', async () => {
    // Mock fetch for image and audio
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('audio.mp3')) {
        return new Response(Buffer.alloc(2048, 'a'), { status: 200 });
      }
      return new Response(Buffer.alloc(2048, 'i'), { status: 200 });
    };

    try {
      const orderId = 'test-order-123';
      const imageUrls = [
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg'
      ];
      const audioUrl = 'https://example.com/audio.mp3';

      const result = await downloadJobAssets(orderId, imageUrls, audioUrl, tmpBase);

      assert.ok(result.workDir.includes(orderId), 'workDir should contain orderId');
      assert.equal(result.imageFiles.length, 2, 'should download 2 images');
      assert.ok(result.audioFile.endsWith('.mp3'), 'should have audio file');

      // Verify files exist
      const statAudio = await fs.stat(result.audioFile);
      assert.ok(statAudio.size > 0, 'audio file should have content');

      // Test cleanup
      await result.cleanup();
      await assert.rejects(async () => {
        await fs.stat(result.workDir);
      }, 'workDir should be removed after cleanup');

    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('downloadJobAssets throws if no audioUrl or empty images', async () => {
    await assert.rejects(async () => {
      await downloadJobAssets('order-err', [], 'https://example.com/a.mp3', tmpBase);
    }, /Nenhuma imagem válida/);

    await assert.rejects(async () => {
      await downloadJobAssets('order-err', ['https://example.com/i.jpg'], null, tmpBase);
    }, /URL de áudio obrigatória/);
  });
});
