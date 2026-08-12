// AudioContext compartilhado da geração de vídeo, isolado num módulo próprio e minúsculo.
//
// Por que não fica dentro de videoGenerator.js: aquele módulo só é carregado por import dinâmico
// (ver B-08/Lote 6), e o destravamento do áudio precisa acontecer de forma SÍNCRONA dentro do
// clique do usuário. Esperar um import() resolver já joga a chamada para fora da janela de gesto
// do navegador, que é justamente o que precisamos evitar.
//
// Causa raiz que isso corrige: a renderização do vídeo só começa depois do upload das fotos e da
// carga de 10 a 20 imagens, o que leva minutos. Nesse ponto o navegador não considera mais a página
// ativada por gesto e bloqueia o início de qualquer áudio — o vídeo era gravado inteiro em silêncio
// e entregue ao cliente como se estivesse correto. Um AudioContext destravado durante o gesto
// permanece destravado pelo resto da vida da página.

let sharedAudioCtx = null;

/**
 * Cria (ou retoma) o AudioContext compartilhado.
 *
 * Chame DIRETAMENTE no handler de clique que inicia a geração do vídeo, antes de qualquer `await` —
 * é o gesto do usuário que autoriza o áudio. Chamadas repetidas são inofensivas.
 *
 * @returns {AudioContext|null} null quando o navegador não expõe AudioContext
 */
export function primeAudioContext() {
  try {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new Ctor();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch((e) => console.warn('[AudioContext] Falha ao retomar:', e?.message));
    }
    return sharedAudioCtx;
  } catch (e) {
    console.warn('[AudioContext] Não foi possível preparar o contexto de áudio:', e?.message);
    return null;
  }
}
