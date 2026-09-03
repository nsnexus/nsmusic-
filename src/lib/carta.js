// Geração do texto da Carta Virtual (add-on, ver src/lib/pricing.js:carta_addon).
//
// Diferente do playback (que depende de uma tarefa assíncrona na Kie.ai), a carta é texto puro:
// sai na mesma chamada, sem webhook e sem estado PROCESSING. Reaproveita a MESMA matéria-prima que
// o cliente já contou pra música (story, importantMoments, honoreeName, relationship, occasion) —
// é justamente isso que faz esse add-on quase não custar esforço pro cliente.
//
// Disparada automaticamente por src/lib/payments.js:applyPaymentApproval quando o add-on é pago,
// e regerável pelo próprio cliente em /entrega (ver api/carta/generate).

import { runGeminiWithFailover } from './gemini.js';

// Limite defensivo: a carta é exibida inteira na tela e cabe num cartão — texto gigante quebraria o
// layout do envelope e nunca foi a intenção do produto.
const MAX_CARTA_CHARS = 2200;

export function buildCartaPrompt(order = {}) {
  const remetente = order.customerName || '';
  const honoree = order.honoreeName || 'pessoa especial';
  const relacao = order.relationship || order.recipientType || '';
  const ocasiao = order.occasion || '';
  const historia = order.story || '';
  const momentos = order.importantMoments || '';

  return `Você é um escritor brasileiro que ajuda pessoas comuns a colocar em palavras o que elas sentem, mas não conseguem escrever sozinhas.

Escreva uma CARTA pessoal, na primeira pessoa, como se fosse ${remetente || 'o cliente'} escrevendo com as próprias mãos para ${honoree}.

Dados reais (use-os de verdade, são o coração da carta):
- Para: ${honoree}
- Relação: ${relacao}
- Ocasião: ${ocasiao}
- História: ${historia}
- Momentos marcantes: ${momentos}

Regras:
- Use os detalhes concretos que a pessoa contou (lugares, apelidos, cenas, datas). Uma carta que serviria para qualquer pessoa é uma carta fracassada.
- Tom de quem escreve à mão pra alguém que ama: simples, direto, sem palavra difícil e sem floreio de cartão de loja.
- Entre 3 e 5 parágrafos curtos. Nunca ultrapasse 1800 caracteres.
- Comece com uma saudação natural (ex: "Minha querida vó," / "Pai,").
- Termine com uma despedida curta e assine exatamente como "${remetente || honoree}".
- Português do Brasil.
- Se a ocasião for despedida/homenagem a quem já partiu, escreva com serenidade e saudade — nunca com festa.

RETORNE EXCLUSIVAMENTE O TEXTO DA CARTA. Sem título, sem aspas, sem comentário, sem explicação — o texto vai direto pra tela do cliente.`;
}

/**
 * Gera o texto da carta a partir dos dados do pedido.
 *
 * Não escreve no Firestore: quem chama decide onde e quando persistir (a rota de API grava em
 * orders/{id}.cartaTexto, e applyPaymentApproval grava logo após aprovar o add-on).
 *
 * @param {object} order documento do pedido (já lido pelo chamador)
 * @returns {Promise<{ok: true, texto: string} | {ok: false, error: string}>}
 */
export async function generateCartaText(order = {}) {
  // Sem nada da história não há carta possível — melhor falhar explicitamente do que entregar um
  // texto genérico de cartão de loja, que é exatamente o que este produto não pode ser.
  if (!order.story && !order.importantMoments) {
    return { ok: false, error: 'missing_story' };
  }

  try {
    const texto = await runGeminiWithFailover(buildCartaPrompt(order));
    const limpo = String(texto || '').trim();
    if (limpo.length < 80) {
      return { ok: false, error: 'empty_result' };
    }
    return { ok: true, texto: limpo.slice(0, MAX_CARTA_CHARS) };
  } catch (err) {
    // Mensagem crua do provedor nunca sobe pro cliente (ver .claude/rules/security.md).
    console.error('[carta] Falha ao gerar o texto da carta:', err.message);
    return { ok: false, error: 'generation_failed' };
  }
}
