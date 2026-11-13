import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isOrderPaid,
  hasClickedToPay,
  hasCustomerPriorPurchase,
  runAbandonedPixRecovery,
  getAbandonedPixRecoveryMetrics,
} from '@/lib/abandonedPixRecovery';

vi.mock('@/lib/supabase-edge.js', () => ({
  getSupabaseEdge: vi.fn(),
}));

vi.mock('@/lib/supabaseDb.js', () => ({
  updateOrder: vi.fn().mockResolvedValue({ success: true }),
  getOrder: vi.fn(),
}));

vi.mock('@/lib/configSite.js', () => ({
  lerConfigSite: vi.fn().mockResolvedValue({
    abandonedPixRecoveryEnabled: true,
    abandonedPixRecoveryMaxPerHour: 15,
    whatsappSuporte: '5594991081351',
  }),
  normalizarNumeroWhatsapp: vi.fn((n) => n || '5594991081351'),
  WHATSAPP_SUPORTE_PADRAO: '5594991081351',
}));

vi.mock('@/lib/whatsappCloudApi.js', () => ({
  enviarRecuperacaoCarrinhoCloud: vi.fn().mockResolvedValue({
    success: true,
    provider: 'cloud_api',
    phoneUsed: '5511999998888',
  }),
}));

import { getSupabaseEdge } from '@/lib/supabase-edge.js';
import { updateOrder } from '@/lib/supabaseDb.js';
import { lerConfigSite } from '@/lib/configSite.js';
import { enviarRecuperacaoCarrinhoCloud } from '@/lib/whatsappCloudApi.js';

describe('Recuperação de PIX Abandonado — Regras de Negócio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isOrderPaid', () => {
    it('reconhece pedidos pagos por status ou flags de acesso', () => {
      expect(isOrderPaid({ payment_status: 'PAGO' })).toBe(true);
      expect(isOrderPaid({ payment_status: 'PAGAMENTO_APROVADO' })).toBe(true);
      expect(isOrderPaid({ paymentStatus: 'PAGO' })).toBe(true);
      expect(isOrderPaid({ paid_at: '2026-11-13T10:00:00Z' })).toBe(true);
      expect(isOrderPaid({ has_video_access: true })).toBe(true);
      expect(isOrderPaid({ has_playback_access: true })).toBe(true);
      expect(isOrderPaid({ has_carta_access: true })).toBe(true);
      expect(isOrderPaid({ has_karaoke_access: true })).toBe(true);
    });

    it('retorna false para pedidos aguardando pagamento ou pendentes', () => {
      expect(isOrderPaid({ payment_status: 'AGUARDANDO_PAGAMENTO' })).toBe(false);
      expect(isOrderPaid({ payment_status: 'PENDENTE' })).toBe(false);
      expect(isOrderPaid(null)).toBe(false);
    });
  });

  describe('hasClickedToPay', () => {
    it('identifica que o cliente clicou para pagar via pixGeneratedAt, pixCopiedAt ou paymentIntentId', () => {
      expect(hasClickedToPay({ extras: { pixCopiedAt: '2026-11-13T12:00:00Z' } })).toBe(true);
      expect(hasClickedToPay({ extras: { paymentIntentId: 'TX123' } })).toBe(true);
      expect(hasClickedToPay({ extras: { pixGeneratedAt: '2026-11-13T12:00:00Z' } })).toBe(true);
      expect(hasClickedToPay({ pixCopiedAt: '2026-11-13T12:00:00Z' })).toBe(true);
      expect(hasClickedToPay({ paymentIntentId: 'TX456' })).toBe(true);
    });

    it('retorna false se o cliente apenas gerou a música mas nunca clicou em pagar', () => {
      expect(hasClickedToPay({
        payment_status: 'AGUARDANDO_PAGAMENTO',
        extras: {},
      })).toBe(false);
    });
  });

  describe('hasCustomerPriorPurchase (Regra Estrita de Exclusão)', () => {
    it('exclui lead que já possui compra paga anterior associada ao e-mail', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'order-1', payment_status: 'PAGO' }],
              }),
            })),
          })),
        })),
      };

      const hasBought = await hasCustomerPriorPurchase('11999998888', 'cliente@teste.com', mockSupabase);
      expect(hasBought).toBe(true);
    });

    it('exclui lead quando fez 2 pedidos e pagou 1 deles (identificado pelo telefone)', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            ilike: vi.fn((col, val) => {
              if (col === 'customer_email') {
                return { limit: vi.fn().mockResolvedValue({ data: [] }) };
              }
              return {
                limit: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'order-pago', customer_phone: '5511999998888', payment_status: 'PAGO' },
                  ],
                }),
              };
            }),
          })),
        })),
      };

      const hasBought = await hasCustomerPriorPurchase('11999998888', 'outro@email.com', mockSupabase);
      expect(hasBought).toBe(true);
    });

    it('permite envio para lead que nunca comprou nada na plataforma', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  { id: 'order-unpaid', customer_phone: '11999998888', payment_status: 'AGUARDANDO_PAGAMENTO' },
                ],
              }),
            })),
          })),
        })),
      };

      const hasBought = await hasCustomerPriorPurchase('11999998888', 'novo@teste.com', mockSupabase);
      expect(hasBought).toBe(false);
    });
  });

  describe('runAbandonedPixRecovery', () => {
    it('respeita a chave liga/desliga do painel administrativo', async () => {
      vi.mocked(lerConfigSite).mockResolvedValueOnce({
        abandonedPixRecoveryEnabled: false,
      });

      const res = await runAbandonedPixRecovery();
      expect(res.enabled).toBe(false);
      expect(res.sentCount).toBe(0);
      expect(enviarRecuperacaoCarrinhoCloud).not.toHaveBeenCalled();
    });

    it('processa pedidos elegíveis, deduplica por cliente e envia template oficial', async () => {
      const mockCandidates = [
        {
          id: 'ord-1',
          order_number: 'NS-001',
          customer_name: 'Carlos Silva',
          customer_phone: '11999991111',
          customer_email: 'carlos@teste.com',
          honoree_name: 'Ana',
          payment_status: 'AGUARDANDO_PAGAMENTO',
          created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          extras: { pixCopiedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
        },
        // Pedido duplicado do mesmo cliente (deve ser ignorado, enviando apenas 1 vez)
        {
          id: 'ord-1-dup',
          order_number: 'NS-001-DUP',
          customer_name: 'Carlos Silva',
          customer_phone: '11999991111',
          customer_email: 'carlos@teste.com',
          honoree_name: 'Ana',
          payment_status: 'AGUARDANDO_PAGAMENTO',
          created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          extras: { pixCopiedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
        },
      ];

      const mockSupabase = {
        from: vi.fn((tabela) => {
          if (tabela === 'orders') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    lte: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn().mockResolvedValue({ data: mockCandidates, error: null }),
                      })),
                    })),
                  })),
                })),
                ilike: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: [] }),
                })),
              })),
            };
          }
          return {};
        }),
      };

      vi.mocked(getSupabaseEdge).mockReturnValue(mockSupabase);

      const res = await runAbandonedPixRecovery({ force: true });

      expect(res.success).toBe(true);
      expect(res.eligibleLeads).toBe(1); // Carlos deduplicado
      expect(res.sentCount).toBe(1);
      expect(enviarRecuperacaoCarrinhoCloud).toHaveBeenCalledTimes(1);
      expect(enviarRecuperacaoCarrinhoCloud).toHaveBeenCalledWith(
        '11999991111',
        expect.objectContaining({
          cliente: 'Carlos',
          homenageado: 'Ana',
        }),
        expect.any(Object)
      );
      expect(updateOrder).toHaveBeenCalledWith(
        'ord-1',
        expect.objectContaining({
          abandoned_pix_recovery_sent: true,
          abandoned_pix_recovery_provider: 'cloud_api',
        }),
        expect.any(Object)
      );
    });

    it('exclui cliente que fez 2 pedidos e pagou 1 deles', async () => {
      const mockCandidates = [
        {
          id: 'ord-abandonado',
          order_number: 'NS-REC-1',
          customer_name: 'Juliana',
          customer_phone: '11988887777',
          customer_email: 'juliana@teste.com',
          honoree_name: 'Pai',
          payment_status: 'AGUARDANDO_PAGAMENTO',
          created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          extras: { pixCopiedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
        },
      ];

      const mockSupabase = {
        from: vi.fn((tabela) => ({
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({ data: mockCandidates, error: null }),
                  })),
                })),
              })),
            })),
            ilike: vi.fn((col) => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  // O cliente já tem um pedido PAGO no histórico
                  { id: 'ord-anterior', customer_phone: '11988887777', payment_status: 'PAGO' },
                ],
              }),
            })),
          })),
        })),
      };

      vi.mocked(getSupabaseEdge).mockReturnValue(mockSupabase);

      const res = await runAbandonedPixRecovery({ force: true });

      expect(res.success).toBe(true);
      expect(res.excludedPriorPurchasesCount).toBe(1);
      expect(res.sentCount).toBe(0);
      expect(enviarRecuperacaoCarrinhoCloud).not.toHaveBeenCalled();
    });
  });

  describe('getAbandonedPixRecoveryMetrics', () => {
    it('calcula métricas de mensagens enviadas, conversões e faturamento recuperado', async () => {
      const mockSentOrders = [
        {
          id: 'ord-1',
          order_number: 'NS-1',
          customer_name: 'Maria',
          payment_status: 'PAGO',
          paid_at: '2026-11-13T11:00:00Z',
          extras: {
            abandoned_pix_recovery_sent: true,
            recovered_via_abandoned_pix: true,
            recovered_via_abandoned_pix_amount: 9.99,
          },
        },
        {
          id: 'ord-2',
          order_number: 'NS-2',
          customer_name: 'Lucas',
          payment_status: 'AGUARDANDO_PAGAMENTO',
          extras: {
            abandoned_pix_recovery_sent: true,
          },
        },
      ];

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            filter: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: mockSentOrders, error: null }),
              })),
            })),
          })),
        })),
      };

      vi.mocked(getSupabaseEdge).mockReturnValue(mockSupabase);

      const metrics = await getAbandonedPixRecoveryMetrics();

      expect(metrics.totalSent).toBe(2);
      expect(metrics.totalRecovered).toBe(1);
      expect(metrics.conversionRate).toBe(50);
      expect(metrics.recoveredRevenue).toBe(9.99);
      expect(metrics.recentRecovered.length).toBe(1);
      expect(metrics.recentSent.length).toBe(2);
    });
  });
});

