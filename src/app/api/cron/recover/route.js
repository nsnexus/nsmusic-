import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendRecoveryTemplate } from '@/lib/whatsapp';

export const runtime = 'edge';

// Ativado em 19/08/2026 — pedidos criados antes disso nunca entram na régua (decisão consciente pra
// não disparar de uma vez o backlog de meses de pedidos pendentes acumulados antes da rotina existir
// de verdade). Só quem foi criado a partir daqui é elegível.
const RECOVERY_ENABLED_AFTER = new Date('2026-08-19T17:44:19.000Z').getTime();

// Teto de envios por execução — mandar tudo de uma vez em paralelo (Promise.allSettled) já estourou
// o limite de subrequests por invocação do Cloudflare Pages Function quando o backlog de pedidos
// elegíveis era grande (ver 21/08/2026: "Too many subrequests by single Worker invocation"), fazendo
// a maioria falhar em cascata. Roda a cada hora, então um backlog grande escoa em algumas execuções
// em vez de tentar tudo de uma vez. Envio sequencial (não paralelo) também evita rajada de subrequest.
const MAX_SENDS_PER_RUN = 20;

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

    // 1ª passada: só filtra e classifica, sem I/O nenhum — decide quem é elegível e pra qual estágio.
    const eligible = [];
    for (const order of pendingOrders) {
      // Ignora se não gerou música ou se não tem telefone válido.
      // REGRA ANTI-BAN: Só envia mensagens de recuperação (4h / 24h) para quem iniciou conversa
      // pelo WhatsApp (whatsappRequested === true). Clientes que nunca clicaram no botão não recebem
      // mensagens frias, eliminando qualquer risco de denúncia ou bloqueio.
      if (!order.audioUrl || !order.customerPhone || !order.createdAt || !order.whatsappRequested) continue;

      const orderTime = new Date(order.createdAt).getTime();
      // Nunca processa backlog anterior à ativação da régua (ver RECOVERY_ENABLED_AFTER acima).
      if (orderTime < RECOVERY_ENABLED_AFTER) continue;
      // Ignora pedidos muito antigos (mais de 72h) ou muito recentes (menos de 4h)
      if (orderTime < cut72h || orderTime > cut4h) continue;

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

      if (targetStage > 0) eligible.push({ order, orderTime, targetStage, templateName, promoParam });
    }

    const results = { total: pendingOrders.length, eligible: eligible.length, processed: 0, sent: [], dryRun };

    if (dryRun) {
      results.processed = eligible.length;
      results.sent = eligible.map(({ order, targetStage }) => ({ id: order.id, stage: targetStage }));
      return NextResponse.json({ success: true, results });
    }

    // 2ª passada: envia de fato, mais antigos primeiro, em série e com teto por execução — ver
    // MAX_SENDS_PER_RUN acima (limite de subrequest por invocação, não de taxa da Meta).
    eligible.sort((a, b) => a.orderTime - b.orderTime);
    const batch = eligible.slice(0, MAX_SENDS_PER_RUN);

    for (const { order, targetStage, templateName, promoParam } of batch) {
      try {
        const deliveryUrl = `https://nsmusic.nsnexus.com.br/entrega?id=${order.id}${promoParam}`;

        const params = {
          customerName: order.customerName || 'Cliente',
          deliveryUrl: deliveryUrl
        };

        const targetPhone = order.whatsappSenderPhone || order.customerPhone;
        const waRes = await sendRecoveryTemplate(targetPhone, templateName, params);

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

    return NextResponse.json({ success: true, results });

  } catch (err) {
    console.error("Erro no Cron de Recuperação:", err);
    return NextResponse.json({ error: 'Falha interna do Cron.' }, { status: 500 });
  }
}
