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

  // Achado 29/08/2026: musicfile.kie.ai (o stream de preview) parou de entregar os arquivos, mas o
  // audioUrl do MESMO pedido continuava servindo os 5 MB. Gravar a URL errada não quebra só o
  // player: ela vai crua pro cliente na mensagem de WhatsApp.
  it('prefere audioUrl a streamAudioUrl quando o stream é do domínio quebrado', () => {
    const result = [{
      id: 'h1',
      audioUrl: 'https://tempfile.aiquickdraw.com/r/abc123.mp3',
      streamAudioUrl: 'https://musicfile.kie.ai/QUJD.mp3',
    }];
    expect(extractAudioTracks(result)[0].audio_url).toBe('https://tempfile.aiquickdraw.com/r/abc123.mp3');
  });

  it('prefere QUALQUER alternativa a musicfile, mesmo quando ela vem num campo de menor prioridade', () => {
    const result = [{
      id: 'h2',
      audio_url: 'https://musicfile.kie.ai/WFla.mp3',
      sourceAudioUrl: 'https://cdn1.suno.ai/h2.mp3',
    }];
    expect(extractAudioTracks(result)[0].audio_url).toBe('https://cdn1.suno.ai/h2.mp3');
  });

  it('usa musicfile quando é a única URL do payload — melhor que descartar a faixa', () => {
    const result = [{ id: 'h3', audio_url: 'https://musicfile.kie.ai/SEg.mp3' }];
    expect(extractAudioTracks(result)[0].audio_url).toBe('https://musicfile.kie.ai/SEg.mp3');
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

  it('mantém audiostream.kie.ai onde o MP3 completo (~6 MB) é entregue imediatamente pela Kie.ai', () => {
    const result = [{
      id: 'e7e35cdb-7225-4496-92b0-28db417e82e6',
      audioUrl: '',
      streamAudioUrl: 'https://audiostream.kie.ai/stream/e7e35cdb-7225-4496-92b0-28db417e82e6.mp3',
    }];
    const tracks = extractAudioTracks(result);
    expect(tracks[0].audio_url).toBe('https://audiostream.kie.ai/stream/e7e35cdb-7225-4496-92b0-28db417e82e6.mp3');
  });

  it('extrai UUID do path de audiostream preservando o link funcional de áudio', () => {
    const result = [{
      stream_audio_url: 'https://audiostream.kie.ai/stream/aae474c5-6548-4a67-a82e-3ac2040710f2.mp3',
    }];
    const tracks = extractAudioTracks(result);
    expect(tracks[0].audio_url).toBe('https://audiostream.kie.ai/stream/aae474c5-6548-4a67-a82e-3ac2040710f2.mp3');
    expect(tracks[0].trackId).toBe('aae474c5-6548-4a67-a82e-3ac2040710f2');
  });

  it('formato Unifically webhook: { task_id, status, data: { audio_url } }', () => {
    const result = {
      task_id: 'unif-task-1',
      status: 'completed',
      data: {
        audio_url: 'https://cdn.unifically.com/outputs/unif-1.mp3',
      },
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].audio_url).toBe('https://cdn.unifically.com/outputs/unif-1.mp3');
  });

  it('formato Unifically polling: { data: { task_id, status, output: { audio_url } } }', () => {
    const result = {
      code: 200,
      success: true,
      data: {
        task_id: 'unif-task-2',
        status: 'completed',
        output: {
          audio_url: 'https://cdn.unifically.com/outputs/unif-2.mp3',
        },
      },
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].audio_url).toBe('https://cdn.unifically.com/outputs/unif-2.mp3');
  });

  it('formato Unifically multi-faixa: { data: { output: { audio_urls: [...] } } }', () => {
    const result = {
      data: {
        output: {
          audio_urls: [
            'https://cdn.unifically.com/outputs/track1.mp3',
            'https://cdn.unifically.com/outputs/track2.mp3',
          ],
        },
      },
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].audio_url).toBe('https://cdn.unifically.com/outputs/track1.mp3');
    expect(tracks[1].audio_url).toBe('https://cdn.unifically.com/outputs/track2.mp3');
  });

  it('formato Unifically real de produção: { status, task_id, audio_url1, audio_url2 }', () => {
    const result = {
      status: 'completed',
      task_id: '96b69d7c-73d9-4a18-813c-9cf3e51ef5b4',
      audio_url1: 'https://files.unifically.com/audio/tf-wlAYfTcDIELE-803a43e8-312b-48ff-9a89-a884f7a81f0c.mp3',
      audio_url2: 'https://files.unifically.com/audio/tf-wqAzffcVIxVq-757f3834-c4b6-4d23-9789-3d281d7ae92e.mp3'
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].audio_url).toBe('https://files.unifically.com/audio/tf-wlAYfTcDIELE-803a43e8-312b-48ff-9a89-a884f7a81f0c.mp3');
    expect(tracks[0].audioUrl).toBe('https://files.unifically.com/audio/tf-wlAYfTcDIELE-803a43e8-312b-48ff-9a89-a884f7a81f0c.mp3');
    expect(tracks[0].trackId).toBe('803a43e8-312b-48ff-9a89-a884f7a81f0c');

    expect(tracks[1].audio_url).toBe('https://files.unifically.com/audio/tf-wqAzffcVIxVq-757f3834-c4b6-4d23-9789-3d281d7ae92e.mp3');
    expect(tracks[1].audioUrl).toBe('https://files.unifically.com/audio/tf-wqAzffcVIxVq-757f3834-c4b6-4d23-9789-3d281d7ae92e.mp3');
    expect(tracks[1].trackId).toBe('757f3834-c4b6-4d23-9789-3d281d7ae92e');
  });

  it('formato Unifically envelopado em { data: { audio_url1, audio_url2 } }', () => {
    const result = {
      code: 200,
      data: {
        status: 'completed',
        task_id: '96b69d7c-73d9-4a18-813c-9cf3e51ef5b4',
        audio_url1: 'https://files.unifically.com/audio/track1.mp3',
        audio_url2: 'https://files.unifically.com/audio/track2.mp3',
      }
    };
    const tracks = extractAudioTracks(result);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].audio_url).toBe('https://files.unifically.com/audio/track1.mp3');
    expect(tracks[1].audio_url).toBe('https://files.unifically.com/audio/track2.mp3');
  });
});
