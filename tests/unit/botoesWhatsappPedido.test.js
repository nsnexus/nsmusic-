import { describe, it, expect } from 'vitest';
import { GET as v1 } from '../../src/app/api/audio/v1/[id]/route.js';
import { GET as v2 } from '../../src/app/api/audio/v2/[id]/route.js';

describe('botões Versão 1 / Versão 2 do WhatsApp', () => {
  it.each([['v1', v1], ['v2', v2]])('%s leva para a página do pedido', async (_n, GET) => {
    const res = await GET(new Request('https://nsmusic.ia.br/x'), { params: { id: 'NS-MWLF4BYR-1233-2026' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://nsmusic.ia.br/entrega?orderId=NS-MWLF4BYR-1233-2026');
  });

  it('id inválido vai para a home', async () => {
    const res = await v1(new Request('https://nsmusic.ia.br/x'), { params: { id: '<script>' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).not.toContain('entrega');
  });
});
