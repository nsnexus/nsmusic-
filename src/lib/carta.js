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
import { escolherModeloCarta } from './cartaModelo.js';

// Limite defensivo: a carta é exibida inteira na tela e cabe num cartão — texto gigante quebraria o
// layout do envelope e nunca foi a intenção do produto.
const MAX_CARTA_CHARS = 2200;

// Modelos de carta (pedido 04/09/2026): Romântica, Aniversário, Homenagem e Padrão, cada um com
// versão masculina/feminina/neutra — 4 categorias x 3 gêneros, escolhidos automaticamente a partir
// do que o cliente já respondeu no wizard (occasion + relationship/recipientType). Nenhuma pergunta
// nova: a matéria-prima pra escolher o modelo já existe no pedido. A escolha em si (categoria e
// gênero) mora em src/lib/cartaModelo.js — módulo próprio, sem import de gemini.js, porque também
// é usado no CLIENTE (CartaAddonCard, /carta, painel admin) pra saber qual imagem de fundo mostrar.
export { escolherModeloCarta };

// Instruções de TOM por categoria — o que muda entre os modelos não é o texto pronto, é a direção
// que a IA recebe (achado: 4 prompts totalmente separados divergiam e ficavam difíceis de manter;
// um prompt base + bloco de tom por categoria mantém a mesma qualidade com 1/4 do código).
const TOM_POR_CATEGORIA = {
  romantica: `Tom: carta de amor. Fale do que essa pessoa desperta, da certeza de tê-la por perto, do
que você sente quando pensa nela. Pode ser mais poético e intenso que os outros modelos, mas sem
clichê de cartão de banca de jornal ("você é meu tudo", "te amo mais que tudo nesse mundo").
Saudação de abertura carinhosa e íntima (ex: "Meu amor,", "Minha vida,").`,
  aniversario: `Tom: carta de aniversário. Celebre quem essa pessoa é e o que ela já construiu até
aqui, e desejе algo real pro ano que começa — não um "parabéns" genérico, mas um desejo que só faz
sentido pra ELA, a partir da história contada. Alegre, mas sem exagero de festa.`,
  homenagem: `Tom: carta de homenagem. Reconhecimento e gratidão por quem essa pessoa é e pelo que
ela representa na vida de quem escreve. Sereno, sincero, sem pressa. Se a história sugerir que é uma
homenagem a alguém que já partiu, escreva com saudade e serenidade — nunca com festa.`,
  padrao: `Tom: carta afetuosa, sem ocasião específica pra celebrar — só o desejo de dizer, com
palavras, o que normalmente não se diz. Direto e caloroso, apoiado inteiramente nos detalhes reais
contados abaixo.`,
};

// Instruções de GÊNERO — evita a IA "chutar" errado quando o pedido tem detalhes concretos que
// pedem concordância (ex: "você é um pai incrível" vs "você é uma mãe incrível"). Neutro pede pra
// simplesmente evitar esse tipo de adjetivo flexionado, em vez de arriscar o gênero errado.
const GENERO_INSTRUCAO = {
  masculino: 'Ao se referir a quem recebe a carta com adjetivos ou substantivos que variam por gênero, use a forma MASCULINA (ex: "querido", "um pai incrível", "amado").',
  feminino: 'Ao se referir a quem recebe a carta com adjetivos ou substantivos que variam por gênero, use a forma FEMININA (ex: "querida", "uma mãe incrível", "amada").',
  neutro: 'Evite adjetivos ou substantivos flexionados por gênero ao se referir a quem recebe a carta (nada de "querido"/"querida", "amado"/"amada") — não há como saber o gênero certo aqui. Use o nome da pessoa ou "você" em frases que não exigem concordância de gênero.',
};

export function buildCartaPrompt(order = {}) {
  const remetente = order.customerName || '';
  const honoree = order.honoreeName || 'pessoa especial';
  const relacao = order.relationship || order.recipientType || '';
  const ocasiao = order.occasion || '';
  const historia = order.story || '';
  const momentos = order.importantMoments || '';
  const { categoria, genero } = escolherModeloCarta(order);

  return `Você é um escritor brasileiro que ajuda pessoas comuns a colocar em palavras o que elas sentem, mas não conseguem escrever sozinhas.

Escreva uma CARTA pessoal, na primeira pessoa, como se fosse ${remetente || 'o cliente'} escrevendo com as próprias mãos para ${honoree}.

${TOM_POR_CATEGORIA[categoria]}

${GENERO_INSTRUCAO[genero]}

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
