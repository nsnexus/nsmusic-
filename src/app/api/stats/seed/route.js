import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, setDoc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Define a LINHA DE BASE dos contadores da home (orders/config_stats — ver src/lib/liveStats.js
// para o porquê de não ser a coleção `stats`).
//
// Existe porque os contadores ao vivo (src/lib/liveStats.js) só passam a somar a partir do momento
// em que entraram no ar — tudo o que foi vendido e gerado ANTES disso precisa entrar de uma vez.
// Contar a coleção `orders` não resolveria: a limpeza (api/orders/cleanup) já apagou pedidos
// antigos, então a base atual vale menos que o histórico real.
//
// Por isso os valores são INFORMADOS, não deduzidos: quem sabe o número verdadeiro é o dono do
// estúdio, olhando o painel de pagamentos. Escrita direta (`set`), não incremento — rodar duas
// vezes com o mesmo valor deixa o mesmo resultado, em vez de dobrar o número.
//
// Autorizado só por admin: mexe no que o site anuncia publicamente.
export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const admin = await requireAdmin(req, env);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error || 'Não autorizado.' }, { status: admin.status || 401 });
    }

    const body = await req.json().catch(() => ({}));
    const generations = Number(body?.generations);
    const sales = Number(body?.sales);

    if (!Number.isFinite(generations) || generations < 0 || !Number.isFinite(sales) || sales < 0) {
      return NextResponse.json(
        { error: 'Informe generations e sales como números não negativos.' },
        { status: 400 }
      );
    }

    const antes = await getDoc(doc(db, 'orders', 'config_stats')).then(
      (s) => (s.exists() ? s.data() : null),
      () => null
    );

    await setDoc(
      doc(db, 'orders', 'config_stats'),
      {
        orderNumber: 'CONFIG-STATS',
        productionStatus: 'CONFIG',
        generations: Math.round(generations),
        sales: Math.round(sales),
        seededAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      anterior: antes ? { generations: antes.generations ?? 0, sales: antes.sales ?? 0 } : null,
      atual: { generations: Math.round(generations), sales: Math.round(sales) },
    });
  } catch (error) {
    console.error('[api/stats/seed] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao definir os contadores.' }, { status: 500 });
  }
}
