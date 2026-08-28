import { describe, it, expect } from 'vitest';
import { formatToWhatsAppNumber } from '@/lib/whatsapp';

// Teste de caracterização: comportamento ATUAL para números de 10 a 13 dígitos.
// Ver docs/audit/FIX_PLAN.md, Lote 0.

describe('formatToWhatsAppNumber', () => {
  it('retorna string vazia para entrada vazia/nula', () => {
    expect(formatToWhatsAppNumber('')).toBe('');
    expect(formatToWhatsAppNumber(null)).toBe('');
    expect(formatToWhatsAppNumber(undefined)).toBe('');
  });

  it('10 dígitos (DDD + 8 dígitos, sem 55): prefixa com 55', () => {
    expect(formatToWhatsAppNumber('9491064040')).toBe('559491064040');
  });

  it('11 dígitos (DDD + 9 dígitos, sem 55): prefixa com 55', () => {
    expect(formatToWhatsAppNumber('94991064040')).toBe('5594991064040');
  });

  it('12 dígitos já com 55 (DDD + 8 dígitos): mantém como está', () => {
    expect(formatToWhatsAppNumber('559491064040')).toBe('559491064040');
  });

  it('13 dígitos já com 55 (DDD + 9 dígitos): mantém como está', () => {
    expect(formatToWhatsAppNumber('5594991064040')).toBe('5594991064040');
  });

  it('remove caracteres não numéricos antes de formatar', () => {
    expect(formatToWhatsAppNumber('(94) 99106-4040')).toBe('5594991064040');
  });

  it('comprimento fora do esperado (ex: 9 dígitos): devolve só os dígitos limpos, sem prefixo', () => {
    expect(formatToWhatsAppNumber('123456789')).toBe('123456789');
  });

  it('comprimento muito longo (14 dígitos): devolve só os dígitos limpos, sem prefixo', () => {
    expect(formatToWhatsAppNumber('12345678901234')).toBe('12345678901234');
  });
});

// Achado 28/08/2026: LID (identificador de privacidade do WhatsApp) precisa manter o sufixo "@lid"
// pra W-API entregar a mensagem — sem ele, a API aceita o envio (200) mas nunca chega no destino.
describe('formatToWhatsAppNumber — LID (achado 28/08/2026)', () => {
  it('preserva o sufixo @lid em vez de tentar formatar como celular BR', () => {
    expect(formatToWhatsAppNumber('273005418684627@lid')).toBe('273005418684627@lid');
  });

  it('remove pontuação extra mas mantém o sufixo @lid', () => {
    expect(formatToWhatsAppNumber('27-3005-418684627@lid')).toBe('273005418684627@lid');
  });
});
