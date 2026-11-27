import { describe, it, expect, vi } from 'vitest';

// Reserva de envio único do WhatsApp: só quem consegue o INSERT na config envia.
let comportamento;
vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: () => ({
    from: () => {
      const q = {
        filtros: [],
        async insert() { return comportamento.insert; },
        eq(c, v) { this.filtros.push([c, v]); return this; },
        lt(c, v) { this.filtros.push([c, `<${v}`]); return this; },
        async update() { comportamento.filtrosDoUpdate = this.filtros; return comportamento.update; },
        async delete() { comportamento.apagou = true; return { error: null }; },
      };
      return q;
    },
  }),
}));

const { reservarEnvioUnico, liberarEnvioUnico } = await import('@/lib/envioUnico');

describe('reservarEnvioUnico', () => {
  it('primeiro a gravar envia', async () => {
    comportamento = { insert: { error: null } };
    expect(await reservarEnvioUnico('envio_x', {})).toBe(true);
  });

  it('chave já existe e a reserva é recente: não envia', async () => {
    comportamento = { insert: { error: { message: 'duplicate key' } }, update: { data: [], error: null } };
    expect(await reservarEnvioUnico('envio_x', {})).toBe(false);
    expect(comportamento.filtrosDoUpdate).toContainEqual(['valor->>status', 'enviando']);
  });

  it('reserva presa (envio caiu no meio) há mais de 10 min: pode tentar de novo', async () => {
    comportamento = { insert: { error: { message: 'duplicate key' } }, update: { data: [{ chave: 'envio_x' }], error: null } };
    expect(await reservarEnvioUnico('envio_x', {})).toBe(true);
  });

  it('liberar apaga a reserva para a nova tentativa do cron', async () => {
    comportamento = {};
    await liberarEnvioUnico('envio_x', {});
    expect(comportamento.apagou).toBe(true);
  });
});
