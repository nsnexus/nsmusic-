// Escolha do modelo de carta (categoria de tom + gênero de tratamento) a partir dos dados que o
// cliente já respondeu no wizard — pedido 04/09/2026. Fica em módulo PRÓPRIO, sem importar
// gemini.js, porque precisa ser usado tanto no servidor (src/lib/carta.js, pra montar o prompt)
// quanto no CLIENTE (CartaAddonCard, /carta, painel admin), e gemini.js não é seguro de embutir
// num bundle de browser.

// occasion (ver src/app/criar/wizardOptions.js) -> categoria da carta.
const CATEGORIA_POR_OCASIAO = {
  'Dia dos Namorados': 'romantica',
  'Declaração de Amor': 'romantica',
  'Pedido de Namoro': 'romantica',
  'Aniversário de Namoro': 'romantica',
  'Aniv. de Casamento': 'romantica',
  'Aniversário': 'aniversario',
  'Homenagem': 'homenagem',
  'Dia das Mães': 'homenagem',
};
const CATEGORIA_PADRAO = 'padrao';

// recipientType/relationship -> gênero de quem recebe a carta. Ambíguos (Chefe, Eu mesmo, Outro)
// ficam de fora do mapa de propósito e caem no fallback neutro.
const GENERO_POR_RELACAO = {
  Namorada: 'feminino', Esposa: 'feminino', Mãe: 'feminino', Vó: 'feminino', Filha: 'feminino', Amiga: 'feminino',
  Namorado: 'masculino', Marido: 'masculino', Pai: 'masculino', Vô: 'masculino', Filho: 'masculino', Amigo: 'masculino',
};
const GENERO_PADRAO = 'neutro';

// Deriva categoria + gênero a partir do pedido — função pura, testável sem chamar IA nenhuma.
export function escolherModeloCarta(order = {}) {
  const categoria = CATEGORIA_POR_OCASIAO[order.occasion] || CATEGORIA_PADRAO;
  const relacao = order.relationship || order.recipientType || '';
  const genero = GENERO_POR_RELACAO[relacao] || GENERO_PADRAO;
  return { categoria, genero };
}

// ID do slot VISUAL (imagem de fundo) — romântica é compartilhada entre gêneros (o pedido foi por 7
// modelos ao todo, não 8: Romântica + Aniversário/Homenagem/Padrão em M e F). Gênero neutro (relação
// ambígua, ex: "Chefe") usa a variante masculina só pro visual — o TEXTO da carta já trata o neutro
// à parte (ver GENERO_INSTRUCAO em src/lib/carta.js), essa escolha aqui não afeta o texto.
export function cartaTemaId(order = {}) {
  const { categoria, genero } = escolherModeloCarta(order);
  if (categoria === 'romantica') return 'romantica';
  const generoVisual = genero === 'neutro' ? 'masculino' : genero;
  return `${categoria}-${generoVisual}`;
}

export const CARTA_TEMA_SLOTS = [
  { id: 'romantica', label: 'Romântica' },
  { id: 'aniversario-feminino', label: 'Aniversário — Feminino' },
  { id: 'aniversario-masculino', label: 'Aniversário — Masculino' },
  { id: 'homenagem-feminino', label: 'Homenagem — Feminino' },
  { id: 'homenagem-masculino', label: 'Homenagem — Masculino' },
  { id: 'padrao-feminino', label: 'Padrão — Feminino' },
  { id: 'padrao-masculino', label: 'Padrão — Masculino' },
];

// Caixa de texto padrão pra quando o tema ainda não foi configurado no admin (ou não tem imagem) —
// cobre a maior parte do cartão, com margem confortável. Valores em % do cartão (não em px), pra
// funcionar igual em qualquer tamanho de tela — a MESMA % configurada no editor do admin (sobre a
// imagem) reproduz a posição certa na página pública.
export const CAIXA_TEXTO_PADRAO = { top: 12, left: 10, width: 80, height: 76 };

// Proporção fixa do cartão (largura/altura) — a MESMA no editor do admin e nas páginas públicas,
// senão a % da caixa de texto salva num lugar não bate no outro.
export const CARTA_ASPECT_RATIO = 3 / 4;
