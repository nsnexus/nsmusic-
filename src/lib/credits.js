import { getSupabaseEdge } from './supabase-edge.js';

export async function getCreditAccount(userId, env = {}, page = 0) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) throw new Error('Carteira indisponível neste ambiente.');

  let { data: account, error } = await supabase.from('credit_accounts').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Não foi possível consultar sua carteira.');
  if (!account) {
    const created = await supabase.rpc('ensure_credit_account', { p_user_id: userId });
    if (created.error || !created.data) throw new Error('Não foi possível criar sua carteira.');
    account = Array.isArray(created.data) ? created.data[0] : created.data;
  }

  const { data: ledger, error: ledgerError } = await supabase.from('credit_ledger')
    .select('id,amount,reason,order_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }).range(page * 50, page * 50 + 50);
  if (ledgerError) throw new Error('Não foi possível consultar o histórico de créditos.');

  const { data: rawReferrals } = await supabase.from('referrals')
    .select('created_at, rewarded_at, qualifying_order_id')
    .eq('referrer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const referrals = rawReferrals || [];
  const { data: summary, error: summaryError } = await supabase.rpc('customer_credit_summary', { p_user_id: userId });
  if (summaryError || !summary) throw new Error('Não foi possível calcular seu saldo. Tente novamente em instantes.');
  const referralsCount = Number(summary.total) || 0;
  const referralsRewarded = Number(summary.rewarded) || 0;
  const referralsEarnedCredits = Number(summary.earnedCredits) || 0;
  const nextBonusProgress = referralsRewarded % 5;
  const nextBonusRemaining = (5 - nextBonusProgress) % 5 || 5;

  return {
    balance: Number(summary.balance) || 0,
    referralCode: account.referral_code,
    ledger: (ledger || []).slice(0, 50),
    ledgerHasMore: (ledger || []).length > 50,
    referrals: {
      total: referralsCount,
      rewarded: referralsRewarded,
      pending: Math.max(0, referralsCount - referralsRewarded),
      earnedCredits: referralsEarnedCredits,
      nextBonusProgress,
      nextBonusTarget: 5,
      nextBonusRemaining,
      list: referrals.map(r => ({
        createdAt: r.created_at,
        rewardedAt: r.rewarded_at,
        status: r.rewarded_at ? 'CONFIRMADO' : 'AGUARDANDO_PAGAMENTO',
      })),
    },
  };
}

export async function approveCreditPurchase(txid, amount, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { found: false };
  const { data, error } = await supabase.rpc('approve_credit_purchase', { p_txid: String(txid), p_paid_amount: Number(amount) });
  if (error) throw new Error('Não foi possível confirmar a compra de créditos.');
  return data || { found: false };
}
