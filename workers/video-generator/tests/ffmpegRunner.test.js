import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildFfmpegArgs, generateConcatFileContent } from '../src/ffmpegRunner.js';

describe('FFmpeg Runner Module', () => {
  test('generateConcatFileContent formats images with correct duration', () => {
    const images = ['/tmp/img1.jpg', '/tmp/img2.jpg', '/tmp/img3.jpg'];
    const totalDuration = 30; // 30 seconds
    const content = generateConcatFileContent(images, totalDuration);

    assert.ok(content.includes("file '/tmp/img1.jpg'"), 'contains image 1');
    assert.ok(content.includes('duration 10'), 'duration per image is 10s');
    assert.ok(content.includes("file '/tmp/img3.jpg'"), 'contains last image');
  });

  test('buildFfmpegArgs creates valid command parameters', () => {
    const args = buildFfmpegArgs({
      concatFilePath: '/tmp/concat.txt',
      audioFilePath: '/tmp/audio.mp3',
      outputFilePath: '/tmp/output.mp4',
      width: 720,
      height: 1280
    });

    const argsStr = args.join(' ');
    assert.ok(argsStr.includes('-f concat'), 'uses concat demuxer');
    assert.ok(argsStr.includes('-i /tmp/concat.txt'), 'has concat input');
    assert.ok(argsStr.includes('-i /tmp/audio.mp3'), 'has audio input');
    assert.ok(argsStr.includes('libx264'), 'uses h264 codec');
    assert.ok(argsStr.includes('aac'), 'uses aac codec');
    assert.ok(argsStr.includes('720:1280'), 'scales to 720x1280 vertical');
    assert.ok(argsStr.includes('+faststart'), 'has web streaming optimization');
    assert.ok(argsStr.includes('-shortest'), 'stops on audio completion');
  });
});
