import { describe, it, expect } from 'vitest';
import { extractAudioTracks } from '@/lib/db';

// Testes de caracterização: fixam o comportamento ATUAL de extractAudioTracks
// para os formatos de resposta já observados vindos da Kie.ai/Suno.
// Ver docs/audit/FIX_PLAN.md, Lote 0.

describe('extractAudioTracks', () => {
  it('retorna [] para entrada vazia/nula', () => {
    expect(extractAudioTracks(null)).toEqual([]);
    expect(extractAudioTracks(undefined)).toEqual([]);
  });

  it('formato 1: array simples de objetos de faixa', () => {
    const result = [
      { id: 'a1', audio_url: 'https://cdn1.suno.ai/a1.mp3' },
      { id: 'a2', audio_url: 'https://cdn1.suno.ai/a2.mp3' },
    ];
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].audio_url).toBe('https://cdn1.suno.ai/a1.mp3');
    expect(tracks[0].audioUrl).toBe('https://cdn1.suno.ai/a1.mp3');
    expect(tracks[0].trackId).toBe('a1');
  });

  it('formato 2: { data: [...] }', () => {
    const result = {
      data: [{ id: 'b1', audioUrl: 'https://cdn1.suno.ai/b1.mp3' }],
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].audio_url).toBe('https://cdn1.suno.ai/b1.mp3');
  });

  it('formato 3: { data: { response: { sunoData: [...] } } }', () => {
    const result = {
      data: {
        response: {
          sunoData: [{ id: 'c1', audio_url: 'https://cdn1.suno.ai/c1.mp3' }],
        },
      },
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].trackId).toBe('c1');
  });

  it('formato 4: { response: { tracks: [...] } }', () => {
    const result = {
      response: {
        tracks: [{ id: 'd1', stream_audio_url: 'https://cdn1.suno.ai/d1.mp3' }],
      },
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].audio_url).toBe('https://cdn1.suno.ai/d1.mp3');
  });

  it('formato 5: string simples de URL da musicfile.kie.ai — NÃO acrescenta .mp3 (achado 28/08/2026: CDN assina por path exato, sufixo extra quebra a assinatura, 403)', () => {
    const result = ['https://musicfile.kie.ai/tracks/e1'];
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].audio_url).toBe('https://musicfile.kie.ai/tracks/e1');
  });

  it('gera URL de fallback da CDN do Suno quando só há trackId (sem audio_url)', () => {
    const result = [
      { id: '11111111-2222-3333-4444-555555555555' },
    ];
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].audio_url).toBe(
      'https://cdn1.suno.ai/11111111-2222-3333-4444-555555555555.mp3'
    );
  });

  it('filtra faixas sem audio_url e sem trackId', () => {
    const result = [{ id: null, foo: 'bar' }];
    expect(extractAudioTracks(result)).toEqual([]);
  });

  it('captura a capa (image_url) gerada pela Kie.ai junto do áudio', () => {
    const result = [{ id: 'f1', audio_url: 'https://cdn1.suno.ai/f1.mp3', image_url: 'https://kie.ai/cover-f1.jpg' }];
    const tracks = extractAudioTracks(result);
    expect(tracks[0].imageUrl).toBe('https://kie.ai/cover-f1.jpg');
  });

  it('imageUrl fica vazio quando a Kie.ai não manda capa', () => {
    const result = [{ id: 'g1', audio_url: 'https://cdn1.suno.ai/g1.mp3' }];
    const tracks = extractAudioTracks(result);
    expect(tracks[0].imageUrl).toBe('');
  });
});
