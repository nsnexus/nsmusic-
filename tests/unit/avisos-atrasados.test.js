import { describe, it, expect } from 'vitest';
import { precisaAvisoMusica, precisaAvisoPagamento } from '../../src/lib/avisosAtrasados.js';

const agora = Date.parse('2026-11-24T20:00:00Z');
const min = (m) => new Date(agora - m * 60000).toISOString();

describe('aviso de música pronta', () => {
  it('manda se ficou pronta há 15+ min, sem play e sem pagamento', () => {
    expect(precisaAvisoMusica({ music_ready_at: min(16), created_at: min(20) }, agora)).toBe(true);
  });
  it('espera os 15 min', () => {
    expect(precisaAvisoMusica({ music_ready_at: min(10), created_at: min(20) }, agora)).toBe(false);
  });
  it('não manda se ouviu a prévia ou já pagou', () => {
    expect(precisaAvisoMusica({ music_ready_at: min(30), preview_listened_at: min(25) }, agora)).toBe(false);
    expect(precisaAvisoMusica({ music_ready_at: min(30), paid_at: min(20) }, agora)).toBe(false);
  });
});

describe('aviso de pagamento aprovado', () => {
  it('manda se pagou há 10+ min e não abriu a entrega', () => {
    expect(precisaAvisoPagamento({ paid_at: min(11) }, agora)).toBe(true);
  });
  it('espera os 10 min', () => {
    expect(precisaAvisoPagamento({ paid_at: min(5) }, agora)).toBe(false);
  });
  it('não manda se viu a entrega depois de pagar', () => {
    expect(precisaAvisoPagamento({ paid_at: min(15), delivery_viewed_at: min(14) }, agora)).toBe(false);
  });
  it('visita antiga (antes de pagar) não conta', () => {
    expect(precisaAvisoPagamento({ paid_at: min(15), delivery_viewed_at: min(40) }, agora)).toBe(true);
  });
});
