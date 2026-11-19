// Oferta cruzada da Coruja Lulu (livro infantil personalizado) na página de entrega do NS Music.
// Só aparece para quem pagou uma música para uma criança da família: filho(a), neto(a),
// sobrinho(a), ou música no estilo Infantil / de Chá Revelação.

export const LINK_CORUJA_LULU =
  'https://corujalulu.com.br/criar?utm_source=nsmusic&utm_medium=popup_entrega&utm_campaign=livro_infantil';

const RELACOES_CRIANCA = ['Filho', 'Filha', 'Neto', 'Neta', 'Sobrinho', 'Sobrinha'];

const PALAVRAS_CRIANCA = /\b(filh[oa]s?|net[oa]s?|sobrinh[oa]s?|afilhad[oa]s?|beb[eê]s?|crian[cç]as?)\b/i;

/** Este pedido é de uma música feita para uma criança? */
export function pedidoParaCrianca(order = {}) {
  if (!order) return false;
  const relacao = String(order.relationship || order.recipientType || '').trim();
  if (RELACOES_CRIANCA.includes(relacao)) return true;
  // "Outro" escrito à mão: "minha afilhada", "meu bebê"...
  if (relacao === 'Outro' && PALAVRAS_CRIANCA.test(String(order.customRelationship || ''))) return true;
  if (String(order.musicStyle || '') === 'Infantil') return true;
  if (String(order.occasion || '') === 'Chá Revelação') return true;
  return false;
}

/** Mostra a oferta? Só pedido pago, para criança, e uma vez por pedido. */
export function deveMostrarOfertaLivro(order, { pago, jaVisto } = {}) {
  return Boolean(pago && !jaVisto && pedidoParaCrianca(order));
}

/** Primeiro nome do homenageado, para a chamada ("Transforme a Alice..."). */
export function primeiroNomeCrianca(order = {}) {
  const nome = String(order?.honoreeName || '').trim().split(/\s+/)[0] || '';
  return nome.slice(0, 24);
}
