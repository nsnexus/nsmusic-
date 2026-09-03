// Contadores AO VIVO para a prova social da home (pedido do dono do estúdio, 03/09/2026).
//
// Guardam DUAS contagens simples:
//   - generations: +1 cada vez que um pedido gera música;
//   - sales: +1 cada vez que o pagamento da música é aprovado.
//
// O número de MÚSICAS exibido na home é `generations * 2` (cada geração entrega 2 versões) — a
// multiplicação fica na exibição, não aqui: o contador guarda o fato bruto, que é o que não muda
// se um dia o pacote passar a ter outro número de versões.
//
// Por que um documento próprio em vez de contar a coleção `orders`: contar pedidos custa UMA
// LEITURA POR DOCUMENTO no Firestore a cada visita da home — com a base crescendo, vira o item mais
// caro do site, justamente na página mais acessada. Aqui a home lê UM documento, sempre.
//
// Por que fica em `orders/config_stats` e não na coleção `stats`: as regras do Firestore em produção
// NEGAM escrita em `stats` para quem não está autenticado, e este projeto não tem Admin SDK — as
// rotas Edge acessam o banco com o mesmo SDK cliente anônimo do navegador (ver
// docs/ARCHITECTURE.md). Confirmado em 03/09/2026: gravar em `stats` devolve permission-denied, e é
// por isso que `stats/_totals` está zerado até hoje — a consolidação da limpeza nunca conseguiu
// escrever. `orders` é gravável, e o projeto já usa esse padrão para configuração
// (`orders/config_whatsapp`); o prefixo `config_` também já é ignorado pela limpeza e pelo painel.
//
// Todo incremento usa `increment()` (atômico, sem ler antes) e roda em try/catch próprio: contador
// de vitrine NUNCA pode derrubar geração de música nem aprovação de pagamento.

import { doc, getDoc, setDoc, increment } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';

// Mesmo padrão de orders/config_whatsapp — prefixo config_ é filtrado da listagem e da limpeza.
const LIVE_COLLECTION = 'orders';
const LIVE_DOC = 'config_stats';
const BASE_DOC = { orderNumber: 'CONFIG-STATS', productionStatus: 'CONFIG' };

/** +1 geração (um pedido que teve música gerada). */
export async function addGeneration() {
  try {
    await setDoc(
      doc(db, LIVE_COLLECTION, LIVE_DOC),
      { ...BASE_DOC, generations: increment(1), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (err) {
    console.warn('[liveStats] Falha ao somar geração:', err.message);
  }
}

/** +1 venda (pagamento da MÚSICA aprovado — add-on não conta como cliente novo). */
export async function addSale() {
  try {
    await setDoc(
      doc(db, LIVE_COLLECTION, LIVE_DOC),
      { ...BASE_DOC, sales: increment(1), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (err) {
    console.warn('[liveStats] Falha ao somar venda:', err.message);
  }
}

/**
 * Lê os contadores. Devolve zeros em qualquer falha — a home tem os próprios números de reserva e
 * nunca quebra por causa disso.
 */
export async function readLiveStats() {
  try {
    const snap = await getDoc(doc(db, LIVE_COLLECTION, LIVE_DOC));
    if (!snap.exists()) return { generations: 0, sales: 0 };
    const data = snap.data();
    return {
      generations: Number(data.generations) || 0,
      sales: Number(data.sales) || 0,
    };
  } catch (err) {
    console.warn('[liveStats] Falha ao ler contadores:', err.message);
    return { generations: 0, sales: 0 };
  }
}
