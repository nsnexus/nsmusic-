import { describe, it, expect } from 'vitest';
import { embedId3v2Tags, skipId3v2 } from '@/lib/mp3TagWriter';

describe('mp3TagWriter — Embutir tags ID3v2.3 (Capa, Metadados e Direitos)', () => {
  it('cria cabeçalho ID3v2.3 válido com tags de texto e direitos autorais', () => {
    // Simula áudio MP3 mínimo com frame sync 0xFF 0xFB
    const mockAudio = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x01, 0x02, 0x03]);

    const tagged = embedId3v2Tags(mockAudio, {
      title: 'Canção para Helena',
      artist: 'NS Music Studio',
      album: 'Homenagem Especial',
      copyright: '© 2026 NS Music. Todos os direitos reservados.',
      year: '2026',
      lyrics: 'Verso 1: Uma linda homenagem para você...',
    });

    expect(tagged).toBeInstanceOf(Uint8Array);
    expect(tagged.length).toBeGreaterThan(mockAudio.length);

    // Verifica assinatura 'ID3' (bytes 0x49, 0x44, 0x33)
    expect(tagged[0]).toBe(0x49); // 'I'
    expect(tagged[1]).toBe(0x44); // 'D'
    expect(tagged[2]).toBe(0x33); // '3'
    expect(tagged[3]).toBe(0x03); // ID3v2.3
    expect(tagged[4]).toBe(0x00);

    // Converte para string para checar frames esperados
    const textDecoder = new TextDecoder('latin1');
    const headerStr = textDecoder.decode(tagged.subarray(0, 500));

    expect(headerStr).toContain('TIT2'); // Título
    expect(headerStr).toContain('TPE1'); // Artista
    expect(headerStr).toContain('TALB'); // Álbum
    expect(headerStr).toContain('TCOP'); // Copyright
    expect(headerStr).toContain('TYER'); // Ano
    expect(headerStr).toContain('USLT'); // Letra

    // Verifica que o áudio MP3 original está preservado no final
    const id3End = skipId3v2(tagged);
    expect(id3End).toBeGreaterThan(10);
    const audioPayload = tagged.subarray(id3End);
    expect(audioPayload).toEqual(mockAudio);
  });

  it('embute a imagem de capa (APIC frame) com sucesso', () => {
    const mockAudio = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
    const mockImage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x12, 0x34]); // JPEG magic bytes

    const tagged = embedId3v2Tags(mockAudio, {
      title: 'Música com Foto',
      imageBytes: mockImage,
      imageMimeType: 'image/jpeg',
    });

    const textDecoder = new TextDecoder('latin1');
    const str = textDecoder.decode(tagged);

    expect(str).toContain('APIC');
    expect(str).toContain('image/jpeg');

    // Verifica que os bytes da imagem estão dentro do arquivo
    const id3End = skipId3v2(tagged);
    expect(id3End).toBeGreaterThan(mockImage.length);
  });

  it('substitui cabeçalho ID3 anterior sem duplicar', () => {
    const mockAudio = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);

    const firstTagged = embedId3v2Tags(mockAudio, { title: 'Musica Antiga' });
    const secondTagged = embedId3v2Tags(firstTagged, { title: 'Musica Nova' });

    const textDecoder = new TextDecoder('utf-8');
    const str = textDecoder.decode(secondTagged);

    expect(str).toContain('Musica Nova');
    expect(str).not.toContain('Musica Antiga');
  });
});
