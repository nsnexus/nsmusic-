import { describe, it, expect } from 'vitest';
import { buildOrderAudioHistory, appendAudioHistory } from '@/lib/audioHistory';

describe('audioHistory', () => {
  it('retorna array vazio para pedido sem áudio e sem tarefas', () => {
    expect(buildOrderAudioHistory({}, [])).toEqual([]);
    expect(buildOrderAudioHistory(null, null)).toEqual([]);
  });

  it('cria histórico a partir do áudio atual do pedido se não houver tarefas', () => {
    const order = {
      id: 'ord_1',
      audioUrl: 'https://cdn.example.com/audio1.mp3',
      audioFiles: ['https://cdn.example.com/audio1.mp3', 'https://cdn.example.com/audio2.mp3'],
      sunoTaskId: 'task_1',
      lyrics: 'Letra bonita',
      sunoPrompt: 'Pop, acoustic'
    };

    const history = buildOrderAudioHistory(order, []);
    expect(history.length).toBe(1);
    expect(history[0].version).toBe(1);
    expect(history[0].active).toBe(true);
    expect(history[0].audioUrl).toBe('https://cdn.example.com/audio1.mp3');
    expect(history[0].audioFiles).toEqual(['https://cdn.example.com/audio1.mp3', 'https://cdn.example.com/audio2.mp3']);
    expect(history[0].lyrics).toBe('Letra bonita');
  });

  it('consolida tarefas concluídas de suno_tasks e identifica a versão ativa', () => {
    const order = {
      id: 'ord_1',
      audioUrl: 'https://cdn.example.com/audio_task2_v1.mp3',
      audioFiles: ['https://cdn.example.com/audio_task2_v1.mp3', 'https://cdn.example.com/audio_task2_v2.mp3'],
      sunoTaskId: 'task_2'
    };

    const sunoTasks = [
      {
        id: 'task_1',
        status: 'COMPLETED',
        provider: 'kie',
        created_at: '2026-10-20T10:00:00Z',
        result: {
          data: [
            { audio_url: 'https://cdn.example.com/audio_task1_v1.mp3', prompt: 'Letra 1', tags: 'Sertanejo' },
            { audio_url: 'https://cdn.example.com/audio_task1_v2.mp3', prompt: 'Letra 1', tags: 'Sertanejo' }
          ]
        }
      },
      {
        id: 'task_2',
        status: 'COMPLETED',
        provider: 'suno_local',
        created_at: '2026-10-21T10:00:00Z',
        result: {
          data: [
            { audio_url: 'https://cdn.example.com/audio_task2_v1.mp3', prompt: 'Letra 2', tags: 'Pop' },
            { audio_url: 'https://cdn.example.com/audio_task2_v2.mp3', prompt: 'Letra 2', tags: 'Pop' }
          ]
        }
      }
    ];

    const history = buildOrderAudioHistory(order, sunoTasks);
    expect(history.length).toBe(2);

    // O mais recente primeiro (Versão 2)
    expect(history[0].version).toBe(2);
    expect(history[0].taskId).toBe('task_2');
    expect(history[0].active).toBe(true);
    expect(history[0].provider).toBe('suno_local');

    // A versão anterior (Versão 1)
    expect(history[1].version).toBe(1);
    expect(history[1].taskId).toBe('task_1');
    expect(history[1].active).toBe(false);
    expect(history[1].provider).toBe('kie');
  });

  it('appendAudioHistory adiciona nova versão mantendo anteriores no histórico', () => {
    const orderData = {
      id: 'ord_1',
      audioUrl: 'https://cdn.example.com/old_v1.mp3',
      audioFiles: ['https://cdn.example.com/old_v1.mp3'],
      sunoTaskId: 'task_old',
      sunoProvider: 'kie',
      audioHistory: [
        {
          id: 'task_old',
          version: 1,
          audioUrl: 'https://cdn.example.com/old_v1.mp3',
          audioFiles: ['https://cdn.example.com/old_v1.mp3'],
          active: true
        }
      ]
    };

    const newTracks = [
      { audio_url: 'https://cdn.example.com/new_v1.mp3', prompt: 'Nova Letra', tags: 'Rock' },
      { audio_url: 'https://cdn.example.com/new_v2.mp3', prompt: 'Nova Letra', tags: 'Rock' }
    ];

    const updated = appendAudioHistory(orderData, newTracks, 'task_new', 'unifically');

    expect(updated.length).toBe(2);
    expect(updated[0].version).toBe(2);
    expect(updated[0].active).toBe(true);
    expect(updated[0].audioUrl).toBe('https://cdn.example.com/new_v1.mp3');
    expect(updated[0].provider).toBe('unifically');

    // A versão antiga agora é inativa
    expect(updated[1].active).toBe(false);
    expect(updated[1].audioUrl).toBe('https://cdn.example.com/old_v1.mp3');
  });
});
