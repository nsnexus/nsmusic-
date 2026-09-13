// Rampa sequencial de um hue só (azul), clara->escura — usada nos mapas de calor do admin (por
// horário do dia e por estado). Magnitude, não identidade: nunca arco-íris, nunca cor por categoria
// aqui. Valores vêm da rampa validada da skill de dataviz (references/palette.md, passos 100-700).
const STEPS = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const SEM_DADOS = '#f1f5f9'; // cinza neutro — "zero"/"sem dado" fica claramente fora da rampa de cor

/** @param {number} t intensidade de 0 a 1 (0 = sem dado, 1 = pico do período) */
export function sequentialBlue(t) {
  if (!Number.isFinite(t) || t <= 0) return SEM_DADOS;
  const idx = Math.min(STEPS.length - 1, Math.round(t * (STEPS.length - 1)));
  return STEPS[idx];
}

/** Cor de texto legível sobre a célula, conforme o quão escura a cor de fundo ficou. */
export function textoSobreSequencial(t) {
  return Number.isFinite(t) && t >= 0.55 ? '#ffffff' : '#0f172a';
}
