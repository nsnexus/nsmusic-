// Ritmo "de gente" para os envios pela Evolution API (WhatsApp não oficial, por QR code).
//
// O WhatsApp restringe número que se comporta como robô: resposta instantânea, rajada de arquivos
// em poucos segundos, sempre o mesmo texto. Aqui ficam as peças que deixam o envio mais parecido com
// uma pessoa digitando no celular:
//   - um tempo de "digitando…" proporcional ao tamanho do texto (a Evolution mostra a presença
//     enquanto espera o `delay` que mandamos no corpo da mensagem);
//   - pausas com variação aleatória (nunca o mesmo intervalo duas vezes);
//   - sorteio entre versões de um mesmo texto.
// Nada disso garante que o número não seja restringido — só tira os padrões mais óbvios.
//
// Nos testes (Vitest) as esperas viram zero, para a suíte não ficar lenta.

const EM_TESTE = typeof process !== 'undefined' && Boolean(process.env?.VITEST);

/** Número inteiro aleatório entre min e max (inclusive). */
export function entre(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

/** Espera `ms` milissegundos (zero nos testes). */
export function dormir(ms) {
  if (EM_TESTE || !ms || ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Quanto tempo mostrar "digitando…" antes de um texto: ~35 ms por caractere, entre 1,5 s e 5 s,
 * com ±20% de variação. Uma resposta curta sai rápido; uma longa, como quem digitou mesmo.
 */
export function tempoDigitando(texto) {
  const base = Math.min(Math.max(1500, String(texto || '').length * 35), 5000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** Tempo de "gravando áudio…" antes de mandar um áudio. */
export function tempoGravando() {
  return entre(2000, 3500);
}

/** Tempo antes de mandar um arquivo (escolher o arquivo no celular). */
export function tempoAnexo() {
  return entre(1000, 2200);
}

/** Pausa entre um arquivo e outro. */
export function pausaEntreArquivos() {
  return entre(2500, 5000);
}

/** "Lendo" a mensagem do cliente antes de começar a responder. */
export function tempoLendo() {
  return entre(1500, 3500);
}

/** Sorteia uma das versões de um texto. Aceita string (devolve ela mesma) ou lista. */
export function variar(versoes) {
  if (!Array.isArray(versoes)) return versoes;
  return versoes[Math.floor(Math.random() * versoes.length)];
}
