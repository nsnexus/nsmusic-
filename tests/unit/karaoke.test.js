import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(),
  updateOrder: vi.fn().mockResolvedValue({}),
}));

import { triggerKaraokeRender } from '@/lib/karaoke';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

describe('triggerKaraokeRender - seleção de versão da música', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa a faixa especificada pelo trackIndex quando há múltiplas faixas', async () => {
    getOrder.mockResolvedValueOnce({
      id: 'order-123',
      audioFiles: [
        'https://cdn.example.com/versao-1.mp3',
        'https://cdn.example.com/versao-2.mp3',
      ],
      audioIds: ['track-1', 'track-2'],
      lyrics: 'Letra teste',
    });

    const res = await triggerKaraokeRender('order-123', { trackIndex: 1 });
    expect(res.ok).toBe(true);

    expect(updateOrder).toHaveBeenCalledWith(
      'order-123',
      expect.objectContaining({
        karaokeStatus: 'GERANDO',
        karaokeChosenAudioUrl: 'https://cdn.example.com/versao-2.mp3',
        karaokeChosenTrackIndex: 1,
      }),
      expect.any(Object)
    );
  });

  it('usa a faixa especificada diretamente por audioUrl se informada', async () => {
    getOrder.mockResolvedValueOnce({
      id: 'order-123',
      audioFiles: [
        'https://cdn.example.com/versao-1.mp3',
        'https://cdn.example.com/versao-2.mp3',
      ],
      lyrics: 'Letra teste',
    });

    const res = await triggerKaraokeRender('order-123', { audioUrl: 'https://cdn.example.com/versao-2.mp3' });
    expect(res.ok).toBe(true);

    expect(updateOrder).toHaveBeenCalledWith(
      'order-123',
      expect.objectContaining({
        karaokeStatus: 'GERANDO',
        karaokeChosenAudioUrl: 'https://cdn.example.com/versao-2.mp3',
      }),
      expect.any(Object)
    );
  });

  it('faz fallback para o primeiro áudio se nenhuma opção de versão for passada', async () => {
    getOrder.mockResolvedValueOnce({
      id: 'order-123',
      audioFiles: [
        'https://cdn.example.com/versao-1.mp3',
        'https://cdn.example.com/versao-2.mp3',
      ],
      lyrics: 'Letra teste',
    });

    const res = await triggerKaraokeRender('order-123');
    expect(res.ok).toBe(true);

    expect(updateOrder).toHaveBeenCalledWith(
      'order-123',
      expect.objectContaining({
        karaokeStatus: 'GERANDO',
        karaokeChosenAudioUrl: 'https://cdn.example.com/versao-1.mp3',
      }),
      expect.any(Object)
    );
  });
});
