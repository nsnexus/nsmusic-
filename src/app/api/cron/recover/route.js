import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendRecoveryTemplate } from '@/lib/whatsapp';

export const runtime = 'edge';

// Executado a cada 1 hora via cron-job.org
export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    // Nunca hardcodar segredo, nem como fallback (ver .claude/rules/security.md) — se a variável
    // faltar, falha com 500 citando o nome dela, em vez de aceitar um valor fixo previsível.
    const cronSecret = String(env.CRON_SECRET || process.env.CRON_SECRET || '').trim();
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET não configurada no servidor.' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
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

    // ?dryRun=true simula sem enviar WhatsApp nem gravar recoveryStage — só conta quantos
    // disparariam. Usado pra medir o tamanho do primeiro lote antes de ligar de vez (nenhum pedido
    // tem recoveryStage gravado ainda, então a primeira execução real processa todo o backlog atual
    // de uma vez).
    const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true';

    const results = { total: pendingOrders.length, processed: 0, sent: [], dryRun };

    const promises = pendingOrders.map(async (order) => {
      // Ignora se não gerou música (audioUrl ausente — sunoTaskId nunca é gravado em orders, só em
      // suno_tasks) ou se não tem telefone válido. audioUrl é setado em src/lib/db.js:updateTaskResult
      // assim que a Kie.ai termina a geração — é o sinal real de "cliente já viu a prévia".
      if (!order.audioUrl || !order.customerPhone || !order.createdAt) return;
      
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
        if (dryRun) {
          results.processed++;
          results.sent.push({ id: order.id, stage: targetStage });
          return;
        }
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
