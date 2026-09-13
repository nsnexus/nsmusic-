import { describe, it, expect } from 'vitest';
import { ufFromPhone } from '@/lib/dddToUf';

describe('ufFromPhone', () => {
  it('reconhece DDD com formatação humana', () => {
    expect(ufFromPhone('(91) 98221-1251')).toBe('PA');
    expect(ufFromPhone('(11) 91234-5678')).toBe('SP');
    expect(ufFromPhone('(61) 99999-0000')).toBe('DF');
  });

  it('remove o DDI 55 antes de ler o DDD', () => {
    expect(ufFromPhone('5591982211251')).toBe('PA');
    expect(ufFromPhone('559491064040')).toBe('PA'); // 94 = PA, sem 9º dígito
  });

  it('devolve null pra telefone sem DDD reconhecível', () => {
    expect(ufFromPhone('')).toBe(null);
    expect(ufFromPhone(null)).toBe(null);
    expect(ufFromPhone('123')).toBe(null);
    expect(ufFromPhone('(00) 00000-0000')).toBe(null); // DDD 00 não existe
  });
});
