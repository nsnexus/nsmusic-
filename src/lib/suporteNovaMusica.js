// Leitura da história que o cliente manda de uma vez no chat de suporte (/suporte), para o roteiro
// de música nova (src/lib/novaMusicaChat.js) pular as perguntas já respondidas.
//
// A IA aqui só EXTRAI: não conversa, não escreve resposta e não decide nada. O que ela devolve
// fora da lista de opções do wizard é descartado em mesclarExtraidos, e a pergunta é feita
// normalmente.

import { runJsonCompletion } from './gemini.js';
import { VALORES_VALIDOS } from './novaMusicaChat.js';

const lista = (k) => Array.from(VALORES_VALIDOS[k]).join(' | ');

const PROMPT = `Você lê a mensagem de um cliente que quer encomendar uma música personalizada de homenagem e extrai SÓ o que ele disse de forma explícita.

Responda APENAS com JSON: {"honoreeName": string|null, "relationship": string|null, "occasion": string|null, "musicStyle": string|null, "voiceType": string|null, "musicMood": string|null, "temHistoria": boolean}

- honoreeName: nome (ou apelido) da pessoa homenageada. Nunca o nome de quem escreve.
- relationship: o que a pessoa homenageada é de quem escreve. Use EXATAMENTE um destes valores: ${lista('relationship')}
- occasion: use EXATAMENTE um destes valores: ${lista('occasion')}
- musicStyle: use EXATAMENTE um destes valores: ${lista('musicStyle')}
- voiceType: masculina | feminina | dueto
- musicMood: use EXATAMENTE um destes valores: ${lista('musicMood')}
- temHistoria: true se a mensagem já traz algum detalhe concreto da história (um momento, um jeito, um apelido, uma lembrança).

Se algo não foi dito com clareza, use null. Nunca invente.`;

/** @returns {Promise<object>} campos extraídos (podem vir nulos) */
export async function extrairDadosDaHistoria(texto, env = {}) {
  const msg = String(texto || '').trim().slice(0, 3000);
  if (msg.length < 8) return {};
  try {
    const json = await runJsonCompletion(PROMPT, `Mensagem do cliente: """${msg}"""`, env);
    return json && typeof json === 'object' ? json : {};
  } catch (err) {
    console.warn('[suporteNovaMusica] Falha ao ler a história:', err?.message);
    return {};
  }
}
