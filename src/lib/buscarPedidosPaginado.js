'use client';

import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Busca TODOS os pedidos que casam com os filtros, paginando com cursor.
//
// Por que existe (achado 25/09/2026): os relatórios do painel usavam uma consulta única com
// `orderBy('createdAt')` ASCENDENTE mais um teto (`limit(2000)` na tabela de vendas por dia,
// `limit(3000)` nos cards de faturamento). Quando o mês passa do teto — e passou: o estúdio cria
// ~145 pedidos por dia —, a consulta devolve os pedidos MAIS ANTIGOS e descarta o resto. O efeito
// no painel foi silencioso e enganoso: a tabela mostrava movimento normal até o dia 21 e ZERO
// vendas nos dias 22 a 25, enquanto o banco tinha 63, 77, 78 e 47 pagamentos nesses dias. O dono do
// estúdio estava olhando um relatório que dizia que as vendas tinham parado.
//
// Paginar resolve na raiz: o teto deixa de decidir QUAIS pedidos aparecem. `maxDocs` continua
// existindo como freio de segurança (uma consulta que traz o banco inteiro por engano custaria uma
// leitura por documento), mas quem chama recebe `truncado: true` quando ele é atingido — assim o
// relatório pode avisar em vez de mentir.
const TAMANHO_PAGINA = 1000;

export async function buscarPedidosPaginado(filtros, { maxDocs = 20000 } = {}) {
  const ordersRef = collection(db, 'orders');
  const docs = [];
  let cursor = null;
  let truncado = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const restantes = maxDocs - docs.length;
    if (restantes <= 0) { truncado = true; break; }

    const constraints = [
      ...filtros,
      orderBy('createdAt'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(Math.min(TAMANHO_PAGINA, restantes)),
    ];

    const snap = await getDocs(query(ordersRef, ...constraints));
    if (snap.empty) break;

    docs.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];

    if (snap.docs.length < TAMANHO_PAGINA) break;
  }

  const pedidos = docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => !o.deletedAt
      && !o.id.startsWith('config_')
      && !o.id.startsWith('session_')
      && o.productionStatus !== 'CONFIG'
      && o.productionStatus !== 'RASCUNHO');

  return { pedidos, truncado, lidos: docs.length };
}
