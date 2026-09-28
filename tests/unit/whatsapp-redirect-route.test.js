import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/whatsapp/route';
import { WHATSAPP_SUPORTE_PADRAO } from '@/lib/configSite';

vi.mock('@/lib/configSite', async () => {
  const actual = await vi.importActual('@/lib/configSite');
  return {
    ...actual,
    lerConfigSite: vi.fn().mockResolvedValue({
      whatsappSuporte: '5594991081351'
    }),
  };
});

describe('Rota dinâmica /whatsapp e /suporte', () => {
  it('redireciona para o número configurado dinamicamente no painel admin', async () => {
    const req = new Request('https://nsmusic.ia.br/whatsapp');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('https://wa.me/5594991081351');
  });

  it('anexa o pedido ao texto da mensagem se fornecido', async () => {
    const req = new Request('https://nsmusic.ia.br/whatsapp?pedido=NS-TESTE-123');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('NS-TESTE-123');
  });
});
