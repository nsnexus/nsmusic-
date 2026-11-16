import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ICONES_3D, icone3dDe } from '../../src/lib/icones3d.js';
import { recipients, stylesList, moods } from '../../src/app/criar/wizardOptions.js';

describe('ícones 3D', () => {
  it('todo ícone mapeado existe em public/icons/3d', () => {
    const faltando = [...new Set(Object.values(ICONES_3D))]
      .filter((slug) => !existsSync(path.resolve(__dirname, `../../public/icons/3d/${slug}.webp`)));
    expect(faltando).toEqual([]);
  });

  it('acha o ícone com ou sem o seletor de variação e cai no emoji quando não há', () => {
    expect(icone3dDe('🎙️')).toBe('/icons/3d/studio-microphone.webp');
    expect(icone3dDe('🎙')).toBe('/icons/3d/studio-microphone.webp');
    expect(icone3dDe('🦄')).toBeNull();
    expect(icone3dDe('')).toBeNull();
  });

  it('as opções do passo a passo têm ícone 3D', () => {
    const semIcone = [...recipients, ...stylesList, ...moods]
      .map((o) => o.icon)
      .filter((e) => e && !icone3dDe(e));
    expect(semIcone).toEqual([]);
  });
});
