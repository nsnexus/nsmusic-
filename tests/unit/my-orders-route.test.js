import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ user: null, filters: [], rows: [] }));
vi.mock('@/lib/auth', () => ({ requireCustomer: async () => state.user || { ok: false, status: 401, error: 'Faça login.' } }));
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => ({ from: () => {
  const builder = {
    select() { return this; }, eq(column,value) { state.filters.push([column,value]); return this; },
    is() { return this; }, neq() { return this; }, order() { return this; },
    range(from,to) { state.filters.push(['range',from,to]); return this; },
    then(resolve) { resolve({ data: state.rows, error: null }); }
  }; return builder;
} }) }));
const { GET } = await import('@/app/api/orders/my-orders/route');
beforeEach(() => { state.user = { ok:true, uid:'account-owner' }; state.filters=[]; state.rows=[{ id:'own-order',honoree_name:'Pessoa',payment_status:'PAGO' }]; });
describe('biblioteca privada', () => {
  it('não permite busca anônima por telefone, e-mail ou pedido', async () => {
    state.user=null;
    for(const query of ['', '?phone=11999990000','?email=other@example.test','?order=another-order']) {
      const res=await GET(new Request('http://localhost/api/orders/my-orders'+query));
      expect(res.status).toBe(401);
    }
    expect(state.filters).toEqual([]);
  });
  it('ignora identidade da URL e filtra pela conta validada no servidor', async () => {
    const res=await GET(new Request('http://localhost/api/orders/my-orders?userId=other&phone=11999990000'));
    expect(res.status).toBe(200);
    expect(state.filters).toContainEqual(['user_id','account-owner']);
    const data=await res.json();
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].honoreeName).toBe('Pessoa');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('pagina sem expor telefone ou tokens de pedido', async () => {
    state.rows=Array.from({length:21},(_,n)=>({id:String(n), customer_phone:'private',extras:{ownerClaimHash:'secret'}}));
    const res=await GET(new Request('http://localhost/api/orders/my-orders?page=2'));
    const data=await res.json();
    expect(state.filters).toContainEqual(['range',40,60]);
    expect(data.hasMore).toBe(true); expect(data.orders).toHaveLength(20);
    expect(JSON.stringify(data)).not.toContain('private');
    expect(JSON.stringify(data)).not.toContain('secret');
  });
});
