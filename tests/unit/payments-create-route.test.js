import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ orders:{}, intents:[], records:[], reserveError:false, nextId:0, provider:vi.fn(), updateOrder:vi.fn(), charges:{}, efiFails:false, infinitepayFails:false, efiMode:'production' }));
vi.mock('@/lib/supabaseDb',()=>({ getOrder:async id=>state.orders[id]||null,updateOrder:state.updateOrder }));
vi.mock('@/lib/efi',()=>({
  generateTxid:()=> 'A'.repeat(26),
  getEfiMode:()=> state.efiMode,
  getChargeStatus:async txid=>state.charges[txid] || null,
  createPixCharge:async args=>{
    state.provider(args);
    if (state.efiFails) throw new Error('Efí indisponível');
    const charge = { txid:args.txid, pixCopiaECola:'code-'+args.txid,status:'ATIVA' };
    state.charges[args.txid] = {
      ...charge, calendario: { criacao: new Date().toISOString(), expiracao:3600 },
    };
    return charge;
  }
}));
vi.mock('@/lib/infinitepay',()=>({
  createInfinitePayCheckoutLink:async ()=> {
    if (state.infinitepayFails) throw new Error('InfinitePay indisponível');
    return { slug:'checkout-teste', url:'https://checkout.infinitepay.io/handle/checkout-teste' };
  },
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
const { POST: createCardCheckout } = await import('@/app/api/payments/stripe/create/route');
const request=body=>({json:async()=>body});
beforeEach(()=>{state.orders={order1:{id:'order1'}};state.intents=[];state.records=[];state.nextId=0;state.reserveError=false;state.charges={};state.efiFails=false;state.infinitepayFails=false;state.efiMode='production';state.provider.mockClear();state.updateOrder.mockReset().mockResolvedValue(true);});
describe('PIX com reserva persistida',()=>{
  it('recusa PIX ou cartão para a música já liberada pelo Pacote Família', async () => {
    state.orders.order1 = { id: 'order1', paymentStatus: 'PAGAMENTO_APROVADO', paidSku: 'geracao_extra_familia' };
    for (const createCheckout of [POST, createCardCheckout]) {
      const res = await createCheckout(request({ orderId: 'order1', sku: 'audio_only' }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/já está liberada pelo seu Pacote Família/);
    }
    expect(state.intents).toHaveLength(0);
    expect(state.records).toHaveLength(0);
    expect(state.provider).not.toHaveBeenCalled();
  });

  it('permite comprar vídeo avulso para uma música do Pacote Família', async () => {
    state.orders.order1 = { id: 'order1', paymentStatus: 'PAGO', paidSku: 'geracao_extra_familia' };
    const res = await POST(request({ orderId: 'order1', sku: 'video_addon' }));
    expect(res.status).toBe(200);
    expect(state.provider).toHaveBeenCalledOnce();
  });

  it('gravar a cobrança não sobrescreve uma liberação da música feita em paralelo', async () => {
    for (const createCheckout of [POST, createCardCheckout]) {
      const res = await createCheckout(request({ orderId: 'order1', sku: 'audio_only' }));
      expect(res.status).toBe(200);
      expect(state.updateOrder.mock.lastCall[1]).not.toHaveProperty('paymentStatus');
    }
  });

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
  it('QR antigo de vídeo não é reaproveitado: oferece checkout pagável alternativo',async()=>{
    const primeira = await POST(request({orderId:'order1',sku:'video_addon',isSecondaryPayment:true}));
    const txid = (await primeira.json()).paymentId;
    state.charges[txid].calendario.criacao = new Date(Date.now() - 70*60*1000).toISOString();
    const nova = await POST(request({orderId:'order1',sku:'video_addon',isSecondaryPayment:true}));
    const data = await nova.json();
    expect(nova.status).toBe(200);
    expect(data.provider).toBe('infinitepay');
    expect(data.checkoutUrl).toMatch(/^https:\/\/checkout\.infinitepay\.io\//);
    expect(data.qrCode).toBe('');
    expect(data.paymentId).toBe('inf_checkout-teste');
    expect(state.intents[0].provider).toBe('infinitepay');
  });

  it('reutiliza o checkout InfinitePay já criado sem emitir PIX expirado',async()=>{
    state.intents.push({
      id:++state.nextId,order_id:'order1',sku:'video_addon',expected_amount:6.90,
      txid:'inf_checkout-teste',provider:'infinitepay',
      qr_code:'https://checkout.infinitepay.io/handle/checkout-teste',
    });
    const res=await POST(request({orderId:'order1',sku:'video_addon',isSecondaryPayment:true}));
    expect(res.status).toBe(200);
    const data=await res.json();
    expect(data.checkoutUrl).toMatch(/^https:\/\/checkout\.infinitepay\.io\//);
    expect(state.provider).not.toHaveBeenCalled();
  });

  it('não mostra QR Efí de homologação em nsmusic.ia.br; oferece checkout real',async()=>{
    state.efiMode='sandbox';
    const req=request({orderId:'order1',sku:'video_addon',isSecondaryPayment:true});
    req.url='https://nsmusic.ia.br/api/payments/create';
    const res=await POST(req);
    const data=await res.json();
    expect(res.status).toBe(200);
    expect(data.provider).toBe('infinitepay');
    expect(data.checkoutUrl).toMatch(/^https:\/\/checkout\.infinitepay\.io\//);
    expect(state.provider).not.toHaveBeenCalled();
  });

  it('não expõe PIX estático de vídeo quando os dois provedores falham',async()=>{
    state.efiFails=true;
    state.infinitepayFails=true;
    const res=await POST(request({orderId:'order1',sku:'video_addon',isSecondaryPayment:true}));
    const data=await res.json();
    expect(res.status).toBe(424);
    expect(data.error).toMatch(/PIX do vídeo está indisponível/);
    expect(data.qrCode).toBeUndefined();
  });

  it('não emite segunda cobrança quando a Efí já informa CONCLUIDA',async()=>{
    const primeira=await POST(request({orderId:'order1',sku:'video_addon',isSecondaryPayment:true}));
    const txid=(await primeira.json()).paymentId;
    state.charges[txid].status='CONCLUIDA';
    const res=await POST(request({orderId:'order1',sku:'video_addon',isSecondaryPayment:true}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/pagamento concluído/);
  });

  it('uma troca de pacote conserva o vínculo da cobrança anterior',async()=>{
    const a=await POST(request({orderId:'order1',sku:'audio_only'}));
    const prior=(await a.json()).paymentId;
    await POST(request({orderId:'order1',sku:'combo'}));
    expect(state.orders.order1.previousPaymentIntentIds).toContain(prior);
    expect(state.records.at(-1)).toMatchObject({p_sku:'combo',p_amount:16.90});
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
