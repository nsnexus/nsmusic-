// Dados do "Medidor de Amor" — jornada de comparação de tamanho, do T-Rex ao coração, réplica do
// projeto de referência (Capivarinha Love, projeto do próprio dono do estúdio — autorizado a reusar
// os assets originais direto, 03/09/2026).
//
// As MEDIDAS são fatos (tamanho real de cada coisa). As IMAGENS em public/medidor/*.webp são as
// mesmas do projeto original (extraídas do MD_IMG embutido no index.html dele) — pedido explícito
// do dono pra ficar idêntico, emoji não passava o efeito certo.
//
// `m` é o tamanho em METROS (Terra/Lua/Sol convertidos de km pra manter tudo na mesma unidade —
// é o que permite calcular "quantas vezes maior" de um item pro próximo sem conversão no meio).
// `proporcao` é largura/altura real de cada imagem (mesmo valor do projeto original, campo `ar`) —
// sem isso a imagem vira um quadrado esticado; com ela, cada figura mantém sua forma real ao ser
// redimensionada só pela altura.
export const MEDIDOR_ITENS = [
  { chave: 'trex', nome: 'T-Rex', medida: '12 metros de ponta a ponta', metros: 12, imagem: '/medidor/trex.webp', proporcao: 0.888 },
  { chave: 'baleia', nome: 'Baleia azul', medida: '30 metros — o maior animal que já existiu', metros: 30, imagem: '/medidor/baleia.webp', proporcao: 0.488 },
  { chave: 'arvore', nome: 'A maior árvore do mundo', medida: '116 metros de altura', metros: 116, imagem: '/medidor/arvore.webp', proporcao: 0.307 },
  { chave: 'lua', nome: 'A Lua', medida: '3.474 km de diâmetro', metros: 3_474_800, imagem: '/medidor/lua.webp', proporcao: 1.0 },
  { chave: 'terra', nome: 'Planeta Terra', medida: '12.742 km de diâmetro', metros: 12_742_000, imagem: '/medidor/terra.webp', proporcao: 0.967 },
  { chave: 'sol', nome: 'O Sol', medida: '1.392.700 km de diâmetro', metros: 1_392_700_000, imagem: '/medidor/sol.webp', proporcao: 0.993 },
  { chave: 'coracao', nome: 'O nosso amor', medida: 'maior que tudo isso junto — e cresce um pouco mais a cada dia', metros: Infinity, imagem: '/medidor/coracao.webp', proporcao: 1.045 },
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
