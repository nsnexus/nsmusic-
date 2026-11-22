import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../../src/lib/videoUploadQueue.js';

describe('upload paralelo das fotos do vídeo', () => {
  it('preserva a ordem das fotos mesmo quando os uploads terminam fora de ordem', async () => {
    const result = await mapWithConcurrency([0, 1, 2, 3], 3, async (index) => {
      await new Promise((resolve) => setTimeout(resolve, (4 - index) * 3));
      return `url-${index}`;
    });
    expect(result).toEqual(['url-0', 'url-1', 'url-2', 'url-3']);
  });

  it('nunca ultrapassa o limite de 3 tarefas em paralelo', async () => {
    let running = 0;
    let maxRunning = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return n;
    });
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(maxRunning).toBe(3);
  });

  it('aguarda as operações em andamento e devolve o erro para o front', async () => {
    let running = 0;
    const task = mapWithConcurrency([0, 1, 2, 3], 2, async (n) => {
      running += 1;
      await new Promise((resolve) => setTimeout(resolve, 3));
      running -= 1;
      if (n === 1) throw new Error('Falha na foto 2');
      return n;
    });
    await expect(task).rejects.toThrow('Falha na foto 2');
    expect(running).toBe(0);
  });

  it('lida com lista vazia', async () => {
    expect(await mapWithConcurrency([], 3, async () => 'unused')).toEqual([]);
  });
});
