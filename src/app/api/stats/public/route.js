import { NextResponse } from 'next/server';
import { readLiveStats } from '@/lib/liveStats';

export const runtime = 'edge';
// Sem isto o Next trata o GET como estático e congela a resposta na primeira chamada.
export const dynamic = 'force-dynamic';
// ACHADO 03/09/2026: o SDK do Firestore fala com o banco por `fetch`, e o App Router CACHEIA fetch
// por padrão — a leitura do documento ficou congelada no estado de antes de o campo existir (o
// endpoint devolvia `sales` certo e `generations: 0`, enquanto o documento no servidor já tinha os
// dois). `force-no-store` é o que impede o Next de cachear a consulta ao banco. O cache que
// interessa continua sendo o da BORDA (Cache-Control abaixo), com 5 min de validade.
export const fetchCache = 'force-no-store';

// Números da prova social da home. Lê UM documento (stats/_live) — nunca varre a coleção `orders`,
// que custaria uma leitura por pedido a cada visita (ver src/lib/liveStats.js).
//
// Público de propósito: são os mesmos números exibidos na página. Não expõe faturamento, pedido,
// nem nada de cliente — só as duas contagens.
export async function GET() {
  const { generations, sales } = await readLiveStats();

  return NextResponse.json(
    // A home multiplica generations por 2 (cada geração entrega 2 versões) — aqui vai o dado bruto.
    { generations, sales },
    {
      headers: {
        // 5 min de cache na borda: a home é a página mais acessada e esses números não mudam de
        // segundo em segundo. `stale-while-revalidate` serve o valor antigo enquanto atualiza,
        // então nenhum visitante espera pela consulta.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}
