import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ summary: { balance: 123.5, total: 110, rewarded: 105, earnedCredits: 126 }, error: null }));
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => ({
  rpc: async () => ({ data: state.summary, error: state.error }),
  from(table) {
    const builder = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, range() { return this; },
      async maybeSingle() { return { data: { referral_code: 'referral-code' }, error: null }; },
      then(resolve) { resolve({ data: table === 'credit_ledger' ? Array.from({ length: 51 }, (_,id) => ({ id, amount: 1 })) : [], error: null }); }
    }; return builder;
  },
}) }));
const { getCreditAccount } = await import('@/lib/credits');
beforeEach(() => { state.error = null; });
describe('saldo e indicação com histórico longo', () => {
  it('não calcula o saldo nem os totais a partir da página do extrato', async () => {
    const result = await getCreditAccount('account');
    expect(result.balance).toBe(123.5);
    expect(result.ledger).toHaveLength(50); expect(result.ledgerHasMore).toBe(true);
    expect(result.referrals).toMatchObject({ total: 110, rewarded: 105, earnedCredits: 126, nextBonusProgress: 0, nextBonusRemaining: 5 });
  });
  it('não mostra saldo incompleto quando a agregação falha', async () => {
    state.error = { message: 'database unavailable' };
    await expect(getCreditAccount('account')).rejects.toThrow('Não foi possível calcular seu saldo');
  });
});
