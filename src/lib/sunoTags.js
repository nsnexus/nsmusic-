import { runJsonCompletion } from './gemini.js';

// Tags de estilo mais específicas, geradas a partir do CONTEÚDO da letra.
// Motivo (13/11/2026): o dono do estúdio notou que as tags eram sempre as mesmas para o mesmo par
// estilo + clima ("sertanejo + emocionante" → o mesmo texto para todo mundo), enquanto pedindo no
// ChatGPT com a letra à mão saía um estilo sob medida. Esta função pede à IA o estilo certo para
// ESTA letra e cai de volta nas tags fixas (buildSunoPayload) se algo falhar ou demorar.

const MAX_TAGS = 280;
const PALAVRAS_PROIBIDAS = [/\bskank\b/gi]; // ver comentário em sunoPayload.js (filtro da Suno)

export function sanitizarTags(bruto) {
  let t = String(bruto || '').replace(/[\r\n]+/g, ', ').replace(/\s{2,}/g, ' ').trim();
  PALAVRAS_PROIBIDAS.forEach((re) => { t = t.replace(re, ''); });
  t = t.replace(/\s*,\s*,+/g, ',').replace(/^[,\s]+|[,\s]+$/g, '');
  if (t.length > MAX_TAGS) {
    t = t.slice(0, MAX_TAGS);
    t = t.slice(0, Math.max(t.lastIndexOf(','), 0)) || t;
  }
  return t;
}

const SISTEMA = `Você é produtor musical especialista em Suno AI e música brasileira.
Receberá a LETRA de uma música personalizada e as escolhas do cliente. Devolva as tags de ESTILO que a Suno deve usar para esta letra específica.
Regras:
- Responda em JSON: {"tags": "..."}.
- Tags em inglês, separadas por vírgula, no máximo 260 caracteres.
- Respeite o gênero pedido pelo cliente, mas detalhe: subgênero, instrumentos principais, andamento (slow/mid/up-tempo), dinâmica emocional que acompanha a história (ex: "starts intimate, builds to powerful chorus") e o tipo de voz.
- Leia a letra: se é despedida/homenagem póstuma, o arranjo é contido; se é celebração, é leve e festivo; se é declaração de casal, é íntimo; se é para mãe/pai, é afetuoso e caloroso.
- A voz pedida (masculina, feminina, dueto) DEVE aparecer nas tags.
- Termine com "brazilian portuguese lyrics".
- Não cite nomes de artistas nem de bandas. Não escreva a palavra "skank".`;

export async function gerarTagsDeEstilo(ctx = {}, env = {}, { timeoutMs = 10000 } = {}) {
  const { lyrics, baseTags } = ctx;
  if (!lyrics || String(lyrics).trim().length < 40) return baseTags || '';

  const usuario = [
    `Gênero escolhido pelo cliente: ${ctx.musicStyle || 'não informado'}`,
    `Clima escolhido: ${ctx.musicMood || 'não informado'}`,
    `Voz: ${ctx.voiceType || 'não informada'}`,
    `Ocasião: ${ctx.occasion || 'não informada'}`,
    `Relação: ${ctx.relationship || 'não informada'}`,
    `Tags base (ponto de partida, melhore): ${baseTags || ''}`,
    '',
    'LETRA:',
    String(lyrics).slice(0, 3500),
  ].join('\n');

  try {
    const resultado = await Promise.race([
      runJsonCompletion(SISTEMA, usuario, env),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout gerando tags')), timeoutMs)),
    ]);
    const tags = sanitizarTags(resultado?.tags);
    if (tags.length < 20) return baseTags || '';
    return tags;
  } catch (err) {
    console.warn('[sunoTags] Usando tags padrão (falha ao gerar sob medida):', err?.message);
    return baseTags || '';
  }
}
