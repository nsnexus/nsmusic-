import { describe, it, expect } from 'vitest';
import { generatePixPayload } from '@/app/api/payments/create/route';

// Teste de caracterização: fixa o CRC16 e o payload BR Code ATUAIS para os três
// valores de catálogo (música, vídeo e combo). Ver docs/audit/FIX_PLAN.md, Lote 0.
// Os literais abaixo foram capturados executando a função tal como está hoje —
// não representam necessariamente o comportamento desejado (ex: txid estático).

function crc16ccitt(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

describe('generatePixPayload', () => {
  it('música (R$ 9,99): payload e CRC16 exatos', () => {
    const payload = generatePixPayload(9.99, false);
    expect(payload).toBe(
      '00020101021126470014br.gov.bcb.pix0114+55949910640430207NSMusic52040000530398654049.995802BR5922NARCISO H F DOS SANTOS6011PARAUAPEBAS62070503***6304EFD6'
    );
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16ccitt(body));
  });

  it('vídeo (R$ 6,90): payload e CRC16 exatos', () => {
    const payload = generatePixPayload(6.9, true);
    expect(payload).toBe(
      '00020101021126530014br.gov.bcb.pix0114+55949910640430213NSMusic Video52040000530398654046.905802BR5922NARCISO H F DOS SANTOS6011PARAUAPEBAS62070503***6304E9C2'
    );
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16ccitt(body));
  });

  it('combo música + vídeo (R$ 16,89): payload e CRC16 exatos', () => {
    const payload = generatePixPayload(16.89, false);
    expect(payload).toBe(
      '00020101021126470014br.gov.bcb.pix0114+55949910640430207NSMusic520400005303986540516.895802BR5922NARCISO H F DOS SANTOS6011PARAUAPEBAS62070503***6304625F'
    );
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16ccitt(body));
  });
});

// A-10 no AUDIT_REPORT.md: o BR Code passou a ter um txid real por cobrança em vez do literal
// fixo '***', para tornar o PIX conciliável.
describe('generatePixPayload com txid real (A-10)', () => {
  it('embute o txid no campo 05 (Additional Data Field) e recalcula o CRC corretamente', () => {
    const payload = generatePixPayload(9.99, false, 'ABCD1234');
    expect(payload).toContain('0508ABCD1234'); // tag05 + len(08) + valor
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16ccitt(body));
  });

  it('trunca o txid em 25 caracteres (limite do BR Code) e remove caracteres não alfanuméricos', () => {
    const longTxid = 'a'.repeat(30) + '!!!';
    const payload = generatePixPayload(9.99, false, longTxid);
    // buildAdditionalDataField não força maiúsculas — só sanitiza e limita o comprimento.
    expect(payload).toMatch(/0525a{25}/);
  });

  it('sem txid explícito, usa "***" — idêntico ao comportamento antigo (compatibilidade)', () => {
    const withDefault = generatePixPayload(9.99, false);
    const withExplicitStar = generatePixPayload(9.99, false, '***');
    expect(withDefault).toBe(withExplicitStar);
  });

  it('dois txids diferentes produzem payloads e CRCs diferentes', () => {
    const a = generatePixPayload(9.99, false, 'ORDER1AAA');
    const b = generatePixPayload(9.99, false, 'ORDER2BBB');
    expect(a).not.toBe(b);
  });
});
