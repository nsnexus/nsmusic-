import { describe, it, expect } from 'vitest';
import { origensParaArquivar } from '@/lib/audioArchive';

// O arquivamento é a única coisa entre a música do cliente e o dia em que a Kie.ai apaga o
// arquivo. Se ele tentar a origem errada e desistir, a música pago vira link morto sem aviso —
// foi o que aconteceu em 21/09/2026 e só apareceu quando um cliente reclamou de um pedido de
// agosto.
describe('origens para arquivar', () => {
  const UUID = 'a47a5d5e-72c9-4d95-9441-fdc8b1f4c435';

  it('prefere o arquivo direto ao endpoint de streaming', () => {
    // audiostream.kie.ai responde 200 com CORPO VAZIO para download direto (medido em produção).
    // Se ele vier primeiro, o arquivador baixa 0 bytes e desiste achando que não há música.
    const origens = origensParaArquivar(`https://audiostream.kie.ai/stream/${UUID}.mp3`);
    expect(origens[0]).toBe(`https://tempfile.aiquickdraw.com/r/${UUID}.mp3`);
    expect(origens[origens.length - 1]).toContain('audiostream.kie.ai');
  });

  it('deriva o UUID do base64 no path do musicfile', () => {
    const base64 = Buffer.from(UUID).toString('base64').replace(/=+$/, '');
    const origens = origensParaArquivar(`https://musicfile.kie.ai/${base64}`);
    expect(origens[0]).toBe(`https://tempfile.aiquickdraw.com/r/${UUID}.mp3`);
  });

  it('mantém a URL original como última tentativa', () => {
    const original = `https://tempfile.aiquickdraw.com/r/${UUID}.mp3`;
    expect(origensParaArquivar(original)).toContain(original);
  });

  it('não repete a mesma origem duas vezes', () => {
    const origens = origensParaArquivar(`https://tempfile.aiquickdraw.com/r/${UUID}.mp3`);
    expect(new Set(origens).size).toBe(origens.length);
  });

  it('URL sem UUID reconhecível vira uma tentativa só', () => {
    expect(origensParaArquivar('https://cdn1.suno.ai/qualquer-coisa.mp3')).toEqual(['https://cdn1.suno.ai/qualquer-coisa.mp3']);
  });

  it('entrada vazia não gera tentativa nenhuma', () => {
    for (const vazio of ['', null, undefined]) {
      expect(origensParaArquivar(vazio)).toEqual([]);
    }
  });
});
