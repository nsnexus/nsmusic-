import { describe, it, expect, vi, beforeEach } from 'vitest';

// "Já paguei" e o banco não mostra o pagamento: o chat segue conferindo sozinho E entrega o
// WhatsApp do atendente com o pedido na mensagem (pedido do dono do estúdio em 27/11/2026).

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async () => null),
  updateOrder: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/orderLookup', async (orig) => ({ ...(await orig()), findOrdersByPhone: vi.fn(async () => []) }));
vi.mock('@/lib/configSite', async (orig) => ({ ...(await orig()), lerConfigSite: vi.fn(async () => ({ whatsappSuporte: '5594991234567' })) }));
let conferencia = { ok: true, estado: 'nao_pago' };
const avisarDono = vi.fn(async () => {});
vi.mock('@/lib/agentTools', async (orig) => ({
  ...(await orig()),
  conferirPagamento: vi.fn(async () => conferencia),
  avisarDono: (...a) => avisarDono(...a),
}));

const { responderChat } = await import('@/lib/suporteChat');

const pedido = { id: 'abcdefghijklmnopqrst', orderNumber: 'NS-1234', paymentStatus: 'AGUARDANDO_PAGAMENTO', paymentIntentId: 'T'.repeat(30), audioFiles: ['https://x/1.mp3'], honoreeName: 'E hoje ' };

beforeEach(() => { conferencia = { ok: true, estado: 'nao_pago' }; avisarDono.mockClear(); });

describe('já paguei sem pagamento no banco', () => {
  it('manda o WhatsApp do atendente com o pedido e segue conferindo', async () => {
    const r = await responderChat(pedido, { acao: 'opcao', opcao: 'ja_paguei' });
    const contato = r.mensagens.find((m) => m.tipo === 'whatsapp');
    expect(contato.url).toMatch(/^https:\/\/wa\.me\/5594991234567\?text=/);
    expect(decodeURIComponent(contato.url)).toMatch(/Já paguei o pedido NS-1234/);
    expect(r.aguardar).toMatchObject({ tipo: 'pagamento', kind: 'pedido' });
    expect(avisarDono).toHaveBeenCalled();
  });

  it('banco fora do ar: também oferece o atendente', async () => {
    conferencia = { ok: false };
    const r = await responderChat(pedido, { acao: 'opcao', opcao: 'ja_paguei' });
    expect(r.mensagens.some((m) => m.tipo === 'whatsapp')).toBe(true);
  });
});
