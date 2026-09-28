import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncQueue } from '../src/queue.js';

describe('Async Queue Module', () => {
  test('queue limits concurrency to maxConcurrent', async () => {
    const queue = new AsyncQueue(2);
    let running = 0;
    let maxObservedRunning = 0;

    const task = async () => {
      running++;
      if (running > maxObservedRunning) {
        maxObservedRunning = running;
      }
      await new Promise(r => setTimeout(r, 20));
      running--;
    };

    const promises = [
      queue.enqueue('job1', task),
      queue.enqueue('job2', task),
      queue.enqueue('job3', task),
      queue.enqueue('job4', task),
    ];

    await Promise.all(promises);

    assert.equal(maxObservedRunning, 2, 'max concurrent running jobs should not exceed 2');
    const stats = queue.getStats();
    assert.equal(stats.activeCount, 0, 'all jobs finished');
    assert.equal(stats.queuedCount, 0, 'queue is empty');
  });

  test('queue handles job errors without stalling subsequent jobs', async () => {
    const queue = new AsyncQueue(1);
    let job2Completed = false;

    // Job 1 throws error
    const p1 = queue.enqueue('job-fail', async () => {
      throw new Error('Falha simulada');
    }).catch(err => err.message);

    // Job 2 should still run
    const p2 = queue.enqueue('job-success', async () => {
      job2Completed = true;
      return 'ok';
    });

    const res1 = await p1;
    const res2 = await p2;

    assert.equal(res1, 'Falha simulada');
    assert.equal(res2, 'ok');
    assert.equal(job2Completed, true);
  });
});
