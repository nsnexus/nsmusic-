// Dados do "Medidor de Amor" — jornada de comparação de tamanho, do T-Rex ao coração, inspirada no
// projeto de referência (Capivarinha Love) que o dono do estúdio pediu pra replicar (03/09/2026).
//
// As MEDIDAS são fatos (tamanho real de cada coisa), não conteúdo autoral — reaproveitar o número é
// diferente de reaproveitar arte/texto. Os ÍCONES do projeto de referência (imagens próprias deles,
// embutidas em base64 no HTML) NÃO foram copiados — aqui usamos emoji, mesma ideia, arte própria.
//
// `m` é o tamanho em METROS (Terra/Lua/Sol convertidos de km pra manter tudo na mesma unidade —
// é o que permite calcular "quantas vezes maior" de um item pro próximo sem conversão no meio).
export const MEDIDOR_ITENS = [
  { chave: 'trex', nome: 'T-Rex', medida: '12 metros de ponta a ponta', metros: 12, emoji: '🦖' },
  { chave: 'baleia', nome: 'Baleia azul', medida: '30 metros — o maior animal que já existiu', metros: 30, emoji: '🐋' },
  { chave: 'arvore', nome: 'A maior árvore do mundo', medida: '116 metros de altura', metros: 116, emoji: '🌳' },
  { chave: 'lua', nome: 'A Lua', medida: '3.474 km de diâmetro', metros: 3_474_800, emoji: '🌙' },
  { chave: 'terra', nome: 'Planeta Terra', medida: '12.742 km de diâmetro', metros: 12_742_000, emoji: '🌍' },
  { chave: 'sol', nome: 'O Sol', medida: '1.392.700 km de diâmetro', metros: 1_392_700_000, emoji: '☀️' },
  { chave: 'coracao', nome: 'O nosso amor', medida: 'maior que tudo isso junto — e cresce um pouco mais a cada dia', metros: Infinity, emoji: '💜' },
];

// Quantas vezes o próximo item é maior que o atual — número que corre na tela em cada slide.
export function calcularVezesMaior(metrosAtual, metrosProximo) {
  if (!isFinite(metrosProximo)) return null; // etapa final (coração): não dá pra medir em vezes
  const razao = metrosProximo / metrosAtual;
  if (razao >= 100) return Math.round(razao);
  return Math.round(razao * 10) / 10;
}

export function formatarVezes(valor) {
  if (valor === null) return '∞';
  return valor >= 1000 ? valor.toLocaleString('pt-BR') : String(valor).replace('.', ',');
}
