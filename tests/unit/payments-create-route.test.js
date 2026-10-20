import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ orders:{}, intents:[], records:[], reserveError:false, nextId:0, provider:vi.fn() }));
vi.mock('@/lib/supabaseDb',()=>({ getOrder:async id=>state.orders[id]||null,updateOrder:async()=>true }));
vi.mock('@/lib/efi',()=>({
  generateTxid:()=> 'A'.repeat(26),
  getChargeStatus:async()=>null,
  createPixCharge:async args=>{ state.provider(args); return {txid:args.txid,pixCopiaECola:'code-'+args.txid,status:'ATIVA'}; }
}));
vi.mock('@/lib/supabase-edge',()=>({getSupabaseEdge:()=>({
  rpc:async(name,args)=>{
    if(name==='reserve_order_payment'){
      if(state.reserveError) return {data:null,error:{message:'db failed'}};
      let row=state.intents.find(i=>i.order_id===args.p_order_id&&i.sku===args.p_sku&&i.expected_amount===args.p_amount);
      if(!row){row={id:++state.nextId,order_id:args.p_order_id,sku:args.p_sku,expected_amount:args.p_amount,txid:String(state.nextId).padStart(26,'A'),provider:'efi'};state.intents.push(row)}
      return {data:{...row},error:null};
    }
    state.records.push(args);
    const order=state.orders[args.p_order_id];
    order.previousPaymentIntentIds ||= [];
    if(order.paymentIntentId && order.paymentIntentId!==args.p_txid && !order.previousPaymentIntentIds.includes(order.paymentIntentId)) order.previousPaymentIntentIds.push(order.paymentIntentId);
    order.paymentIntentId=args.p_txid;
    return {data:true,error:null};
  },
  from:()=>{let id;return {eq(column,value){id=value;return this},async update(data){Object.assign(state.intents.find(row=>row.id===id),data);return {error:null}}}}
})}));
const {POST}=await import('@/app/api/payments/create/route');
const request=body=>({json:async()=>body});
beforeEach(()=>{state.orders={order1:{id:'order1'}};state.intents=[];state.records=[];state.nextId=0;state.reserveError=false;state.provider.mockClear();});
describe('PIX com reserva persistida',()=>{
  it('deriva preço do catálogo e registra o vínculo ao pedido',async()=>{
    const res=await POST(request({orderId:'order1',sku:'audio_only',totalAmount:0.01}));
    expect(res.status).toBe(200);
    expect(state.provider).toHaveBeenCalledWith(expect.objectContaining({amount:9.99,orderId:'order1'}));
    expect(state.records[0]).toMatchObject({p_order_id:'order1',p_sku:'audio_only',p_amount:9.99});
  });
  it('reutiliza a cobrança ao repetir o clique',async()=>{
    const a=await POST(request({orderId:'order1',sku:'audio_only'}));
    const b=await POST(request({orderId:'order1',sku:'audio_only'}));
    expect((await a.json()).paymentId).toBe((await b.json()).paymentId);
    expect(state.provider).toHaveBeenCalledTimes(1);
  });
  it('uma troca de pacote conserva o vínculo da cobrança anterior',async()=>{
    const a=await POST(request({orderId:'order1',sku:'audio_only'}));
    const prior=(await a.json()).paymentId;
    await POST(request({orderId:'order1',sku:'combo'}));
    expect(state.orders.order1.previousPaymentIntentIds).toContain(prior);
    expect(state.records.at(-1)).toMatchObject({p_sku:'combo',p_amount:16.89});
  });
  it('não chama o provedor quando não consegue reservar no banco',async()=>{
    state.reserveError=true;
    const res=await POST(request({orderId:'order1',sku:'audio_only'}));
    expect(res.status).toBe(503);expect(state.provider).not.toHaveBeenCalled();
  });
  it('rejeita SKU desconhecido sem criar cobrança',async()=>{
    const res=await POST(request({orderId:'order1',sku:'creditos_pos_compra_1'}));
    expect(res.status).toBe(400);expect(state.provider).not.toHaveBeenCalled();
  });
});
