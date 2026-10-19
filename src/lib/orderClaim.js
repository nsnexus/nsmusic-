export function claimCookieName(orderId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(orderId))) return null;
  return `nsmusic_claim_${orderId}`;
}

export async function hashOrderClaim(token) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function claimOrderForCustomer(req, supabase, userId, orderId) {
  const name = claimCookieName(orderId);
  if (!name) return false;
  const cookie = req.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  const token = cookie?.slice(name.length + 1) || '';
  // The RPC also permits a customer who already owns this order.
  const hash = token.length >= 32 && token.length <= 160 ? await hashOrderClaim(token) : '';
  const { data, error } = await supabase.rpc('claim_order_for_customer', { p_user_id: userId, p_order_id: orderId, p_claim_hash: hash });
  if (error) throw new Error('Não foi possível verificar o vínculo do pedido com sua conta.');
  return Boolean(data?.claimed);
}
