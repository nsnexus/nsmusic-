import { describe, expect, it } from 'vitest';
import { pixLocalAindaValido, cobrancaEfiAindaPagavel } from '../../src/lib/pixValidade.js';

const now = Date.parse('2026-11-22T12:00:00.000Z');
const pix = (minutesAgo) => ({ qrCode: '000201010212...', generatedAt: new Date(now - minutesAgo * 60_000).toISOString() });

describe('validade do Pix Copia e Cola do vídeo', () => {
  it('restaura um código recente e rejeita um vencido ou sem data', () => {
    expect(pixLocalAindaValido(pix(5), now)).toBe(true);
    expect(pixLocalAindaValido(pix(54), now)).toBe(true);
    expect(pixLocalAindaValido(pix(56), now)).toBe(false);
    expect(pixLocalAindaValido({ qrCode: '000201010212...' }, now)).toBe(false);
    expect(pixLocalAindaValido({ qrCode: '' }, now)).toBe(false);
    expect(pixLocalAindaValido({ qrCode: 'x', generatedAt: 'inválida' }, now)).toBe(false);
  });

  it('só reaproveita cobranças ATIVAS da Efí dentro da validade, com margem', () => {
    const charge = (minutesAgo, status = 'ATIVA') => ({
      status,
      pixCopiaECola: '000201010212...',
      calendario: { criacao: new Date(now - minutesAgo * 60_000).toISOString(), expiracao: 3600 },
    });
    expect(cobrancaEfiAindaPagavel(charge(15), now)).toBe(true);
    expect(cobrancaEfiAindaPagavel(charge(56), now)).toBe(false);
    expect(cobrancaEfiAindaPagavel(charge(70), now)).toBe(false);
    expect(cobrancaEfiAindaPagavel(charge(10, 'CONCLUIDA'), now)).toBe(false);
    expect(cobrancaEfiAindaPagavel({ status:'ATIVA', pixCopiaECola:'000201' }, now)).toBe(false);
    expect(cobrancaEfiAindaPagavel({ ...charge(1), pixCopiaECola: '' }, now)).toBe(false);
  });
});
