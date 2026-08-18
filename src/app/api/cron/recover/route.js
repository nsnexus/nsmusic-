import { NextResponse } from 'next/server';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendRecoveryTemplate } from '@/lib/whatsapp';

export const runtime = 'edge';

// Executado a cada 1 hora via cron-job.org
export async function GET(req) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'nsmusic-recovery-secret-2026';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const now = Date.now();
    const HOUR_IN_MS = 60 * 60 * 1000;
    
    // Tempos de corte
    const cut4h = now - (4 * HOUR_IN_MS);
    const cut24h = now - (24 * HOUR_IN_MS);
    const cut72h = now - (72 * HOUR_IN_MS);

    const ordersRef = collection(db, 'orders');
    
    // Busca pedidos pendentes. (Índice simples em paymentStatus já funciona no Firestore)
    const q1 = query(ordersRef, where('paymentStatus', '==', 'PENDENTE'));
    const q2 = query(ordersRef, where('paymentStatus', '==', 'AGUARDANDO_PAGAMENTO'));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    const pendingOrders = [];
    snap1.forEach(d => pendingOrders.push({ id: d.id, ...d.data() }));
    snap2.forEach(d => pendingOrders.push({ id: d.id, ...d.data() }));

    const results = { total: pendingOrders.length, processed: 0, sent: [] };

    const promises = pendingOrders.map(async (order) => {
      // Ignora se não gerou música (sunoTaskId ausente) ou se não tem telefone válido
      if (!order.sunoTaskId || !order.customerPhone || !order.createdAt) return;
      
      const orderTime = new Date(order.createdAt).getTime();
      // Ignora pedidos muito antigos (mais de 72h) ou muito recentes (menos de 4h)
      if (orderTime < cut72h || orderTime > cut4h) return;

      const currentStage = order.recoveryStage || 0;
      let targetStage = 0;
      let templateName = '';
      let promoParam = '';

      if (orderTime <= cut24h && currentStage < 2) {
        targetStage = 2;
        templateName = 'nsmusic_recovery_24h';
        promoParam = '&promo=24h';
      } else if (orderTime <= cut4h && orderTime > cut24h && currentStage < 1) {
        targetStage = 1;
        templateName = 'nsmusic_recovery_4h';
        promoParam = '';
      }

      if (targetStage > 0) {
        try {
          const deliveryUrl = `https://nsmusic.nsnexus.com.br/entrega?id=${order.id}${promoParam}`;
          
          const params = {
            customerName: order.customerName || 'Cliente',
            honoreeName: order.honoreeName || 'alguém especial',
            deliveryUrl: deliveryUrl
          };

          const waRes = await sendRecoveryTemplate(order.customerPhone, templateName, params);
          
          if (waRes.success) {
            await updateDoc(doc(db, 'orders', order.id), {
              recoveryStage: targetStage,
              updatedAt: new Date().toISOString()
            });
            results.processed++;
            results.sent.push({ id: order.id, stage: targetStage });
          } else {
            console.error(`Falha no envio WA (Cron) para pedido ${order.id}:`, waRes.error);
          }
        } catch (e) {
          console.error(`Erro ao processar recuperação para pedido ${order.id}:`, e);
        }
      }
    });

    await Promise.allSettled(promises);

    return NextResponse.json({ success: true, results });

  } catch (err) {
    console.error("Erro no Cron de Recuperação:", err);
    return NextResponse.json({ error: 'Falha interna do Cron.' }, { status: 500 });
  }
}
