import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabaseState } = vi.hoisted(() => {
  return {
    mockSupabaseState: {
      storage: [],
    },
  };
});

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: () => ({
    from: (table) => {
      if (table === 'financial_entries') {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => ({
                  order: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
                }),
              }),
            }),
            order: () => ({
              order: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
            }),
          }),
          insert: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
            }),
          }),
          delete: () => ({
            eq: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
          }),
        };
      }
      if (table === 'config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { valor: mockSupabaseState.storage }, error: null }),
            }),
          }),
          upsert: (payload) => {
            mockSupabaseState.storage = payload.valor;
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      return {};
    },
  }),
}));

import {
  validateFinancialEntry,
  calculateFinancialSummary,
  CATEGORIAS_DESPESA,
  CATEGORIAS_RECEITA,
  getFinancialEntries,
  createFinancialEntry,
  deleteFinancialEntry,
} from '@/lib/financial';

describe('financial library', () => {
  it('contém a categoria de imposto sobre Facebook Ads (13,8%)', () => {
    expect(CATEGORIAS_DESPESA).toContain('Imposto Facebook Ads (13,8%)');
    expect(CATEGORIAS_RECEITA).toContain('Venda Direta / PIX');
  });

  describe('validateFinancialEntry', () => {
    it('valida lançamento de receita válido', () => {
      const res = validateFinancialEntry({
        tipo: 'receita',
        data: '2026-10-13',
        valor: '150.50',
        descricao: 'Venda avulsa via WhatsApp',
      });
      expect(res.ok).toBe(true);
      expect(res.valor).toBe(150.5);
    });

    it('valida lançamento de despesa válido', () => {
      const res = validateFinancialEntry({
        tipo: 'despesa',
        data: '2026-10-13',
        valor: 13.8,
        descricao: 'Imposto Meta Ads',
      });
      expect(res.ok).toBe(true);
      expect(res.valor).toBe(13.8);
    });

    it('rejeita tipo inválido', () => {
      const res = validateFinancialEntry({
        tipo: 'outro',
        data: '2026-10-13',
        valor: 50,
        descricao: 'Teste',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Tipo inválido/);
    });

    it('rejeita valor zero ou negativo', () => {
      const resZero = validateFinancialEntry({
        tipo: 'receita',
        data: '2026-10-13',
        valor: 0,
        descricao: 'Teste',
      });
      expect(resZero.ok).toBe(false);

      const resNeg = validateFinancialEntry({
        tipo: 'despesa',
        data: '2026-10-13',
        valor: -10,
        descricao: 'Teste',
      });
      expect(resNeg.ok).toBe(false);
    });

    it('rejeita descrição vazia ou apenas espaços', () => {
      const res = validateFinancialEntry({
        tipo: 'receita',
        data: '2026-10-13',
        valor: 100,
        descricao: '   ',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Descrição é obrigatória/);
    });

    it('rejeita formato de data inválido', () => {
      const res = validateFinancialEntry({
        tipo: 'receita',
        data: '13/10/2026',
        valor: 100,
        descricao: 'Teste',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Data inválida/);
    });
  });

  describe('calculateFinancialSummary', () => {
    it('calcula corretamente o total de receitas, despesas e saldo líquido', () => {
      const entries = [
        { tipo: 'receita', valor: 100 },
        { tipo: 'receita', valor: 50.5 },
        { tipo: 'despesa', valor: 13.8 },
        { tipo: 'despesa', valor: 20 },
      ];
      const summary = calculateFinancialSummary(entries);
      expect(summary.totalReceitas).toBe(150.5);
      expect(summary.totalDespesas).toBe(33.8);
      expect(summary.saldoLiquido).toBe(116.7);
      expect(summary.countReceitas).toBe(2);
      expect(summary.countDespesas).toBe(2);
      expect(summary.totalLancamentos).toBe(4);
    });

    it('retorna zeros para lista vazia', () => {
      const summary = calculateFinancialSummary([]);
      expect(summary.totalReceitas).toBe(0);
      expect(summary.totalDespesas).toBe(0);
      expect(summary.saldoLiquido).toBe(0);
      expect(summary.totalLancamentos).toBe(0);
    });
  });

  describe('persistência e fallback de lançamentos', () => {
    beforeEach(() => {
      mockSupabaseState.storage = [];
      vi.clearAllMocks();
    });

    it('cria e lista lançamento via fallback config quando tabela postgres ainda não existe', async () => {
      const entry = await createFinancialEntry(
        {},
        {
          tipo: 'despesa',
          data: '2026-10-13',
          valor: 13.8,
          categoria: 'Imposto Facebook Ads (13,8%)',
          descricao: 'Imposto nota fiscal Meta Ads',
          observacoes: 'Gasto de R$ 100 + R$ 13,80',
        }
      );

      expect(entry.id).toMatch(/^fe_/);
      expect(entry.valor).toBe(13.8);
      expect(mockSupabaseState.storage.length).toBe(1);

      const result = await getFinancialEntries({}, { mes: '2026-10' });
      expect(result.entries.length).toBe(1);
      expect(result.resumo.totalDespesas).toBe(13.8);
      expect(result.resumo.saldoLiquido).toBe(-13.8);

      const del = await deleteFinancialEntry({}, entry.id);
      expect(del.ok).toBe(true);
      expect(mockSupabaseState.storage.length).toBe(0);
    });
  });
});
