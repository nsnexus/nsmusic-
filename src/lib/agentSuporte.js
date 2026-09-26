import { runJsonCompletion } from './gemini.js';
import {
  carregarContextoDoCliente,
  conferirPagamento,
  montarLinksDaMusica,
  ajustarLetra,
  regerarMusica,
} from './agentTools.js';

// Atendimento de quem JÁ tem pedido. É a metade que faltava no agente: ele só sabia coletar dados
// de pedido novo, então quem escrevia "paguei e não recebi" caía no vazio ou era tratado como
// cliente novo.
//
// Como funciona: identifica o cliente pelo telefone ANTES de responder qualquer coisa, classifica a
// intenção com o contexto real do pedido em mãos, executa a ação (consultar a Efí, montar o link,
// reescrever a letra, regerar a música) e só então escreve. A IA decide O QUE fazer; quem faz são
// as ferramentas de src/lib/agentTools.js, que são verificáveis.
//
// O que NUNCA é decidido por IA:
//   - liberar pedido: só a consulta à Efí decide (regra 3 do CLAUDE.md);
//   - preço, status ou acesso: nada disso vem de texto do cliente nem de inferência do modelo.

const INTENCOES = [
  'CADE_MINHA_MUSICA',   // pagou (ou acha que pagou) e quer o arquivo
  'PAGUEI_NAO_LIBEROU',  // diz que pagou e o site não liberou
  'AJUSTAR_LETRA',       // quer mudar algo na letra
  'TROCAR_ESTILO',       // quer outro estilo musical
  'NOVO_PEDIDO',         // quer fazer outra música
  'FALAR_HUMANO',        // quer pessoa
  'OUTRO',               // qualquer outra coisa
];

const PROMPT_CLASSIFICADOR = `Você classifica a intenção de UMA mensagem de WhatsApp de um cliente de um estúdio de músicas personalizadas.

Responda APENAS com JSON: {"intencao": "...", "detalhe": "..."}

Intenções possíveis:
- CADE_MINHA_MUSICA: quer receber/ouvir/baixar a música que já encomendou.
- PAGUEI_NAO_LIBEROU: afirma ter pago e diz que não liberou / continua pedindo pagamento.
- AJUSTAR_LETRA: quer mudar, corrigir ou acrescentar algo NA LETRA.
- TROCAR_ESTILO: quer outro estilo/ritmo musical (sertanejo, pagode, gospel...).
- NOVO_PEDIDO: quer fazer uma música NOVA, além da que já tem.
- FALAR_HUMANO: pede atendente, pessoa, humano, ou está claramente irritado querendo suporte real.
- OUTRO: qualquer outra coisa.

Em "detalhe", quando for AJUSTAR_LETRA ou TROCAR_ESTILO, coloque exatamente o que o cliente pediu
(o ajuste desejado, ou o nome do estilo). Nos outros casos, use string vazia.`;

async function classificarIntencao(mensagem, resumo, envVars) {
  const contexto = resumo
    ? `Contexto do cliente: pedido ${resumo.numero || resumo.orderId}, pago=${resumo.pago}, música pronta=${resumo.temMusica}, estilo=${resumo.estilo || '—'}.`
    : 'Contexto: este telefone não tem pedido registrado.';

  try {
    const json = await runJsonCompletion(
      PROMPT_CLASSIFICADOR,
      `${contexto}\n\nMensagem do cliente: "${mensagem}"`,
      envVars
    );
    const intencao = String(json?.intencao || '').toUpperCase();
    return {
      intencao: INTENCOES.includes(intencao) ? intencao : 'OUTRO',
      detalhe: String(json?.detalhe || '').trim(),
    };
  } catch (err) {
    console.warn('[agentSuporte] Falha ao classificar intenção:', err.message);
    return { intencao: 'OUTRO', detalhe: '' };
  }
}

/**
 * Tenta resolver a mensagem como ATENDIMENTO de um pedido existente.
 *
 * @returns {Promise<{atendido: boolean, resposta?: string, entregarHumano?: boolean}>}
 *   `atendido: false` significa "isto não é suporte de pedido existente" — quem chama segue com o
 *   fluxo normal de coleta de pedido novo.
 */
export async function tentarAtenderSuporte(phone, mensagem, envVars = {}) {
  const contexto = await carregarContextoDoCliente(phone, envVars);

  // Sem pedido no histórico não há o que atender: é cliente novo, segue o fluxo de coleta.
  if (!contexto.ok || !contexto.temPedido) return { atendido: false };

  const { pedido, resumo } = contexto;
  const { intencao, detalhe } = await classificarIntencao(mensagem, resumo, envVars);

  if (intencao === 'NOVO_PEDIDO' || intencao === 'OUTRO') return { atendido: false };

  if (intencao === 'FALAR_HUMANO') {
    return {
      atendido: true,
      entregarHumano: true,
      resposta: 'Claro! Já chamei aqui — em instantes uma pessoa da equipe te responde por aqui mesmo. 🙏',
    };
  }

  if (intencao === 'PAGUEI_NAO_LIBEROU') {
    const conferencia = await conferirPagamento(pedido, envVars);

    if (!conferencia.ok) {
      return {
        atendido: true,
        entregarHumano: true,
        resposta: 'Deixa eu conferir isso direitinho pra você — já vou verificar seu pagamento e te retorno por aqui. 🙏',
      };
    }

    if (conferencia.estado === 'liberado_agora') {
      return {
        atendido: true,
        resposta: `Confirmei seu pagamento agora e já liberei! 🎉\n\nSua música está aqui:\n${conferencia.linkEntrega}`,
      };
    }

    if (conferencia.estado === 'ja_estava_pago') {
      const links = montarLinksDaMusica(pedido);
      return {
        atendido: true,
        resposta: `Seu pagamento está confirmado sim! ✅\n\nSua música está aqui:\n${links.linkEntrega}`,
      };
    }

    if (conferencia.estado === 'ainda_nao_pago') {
      return {
        atendido: true,
        resposta: `Acabei de consultar no banco e o pagamento ainda não caiu por aqui. 😕\n\nSe você pagou agora há pouco, às vezes leva alguns minutinhos. Pode me mandar o comprovante que eu confiro na hora?\n\nSe preferir pagar de novo, é por aqui:\n${resumo.linkEntrega}`,
      };
    }

    // sem_cobranca: o pedido nunca chegou a gerar Pix.
    return {
      atendido: true,
      resposta: `Olhei aqui e ainda não encontrei um pagamento nesse pedido. Pode ser que a cobrança não tenha chegado a ser gerada.\n\nDá uma olhada nesta página, que ela mostra o Pix certinho:\n${resumo.linkEntrega}`,
    };
  }

  if (intencao === 'CADE_MINHA_MUSICA') {
    const links = montarLinksDaMusica(pedido);

    if (!links.temMusica) {
      return {
        atendido: true,
        resposta: `Achei seu pedido aqui! A música ainda está sendo finalizada no estúdio. 🎵\n\nAssim que ficar pronta ela aparece nesta página:\n${resumo.linkEntrega}`,
      };
    }

    if (!resumo.pago) {
      return {
        atendido: true,
        resposta: `Sua música está pronta! 🎶 Você pode ouvir a prévia aqui:\n${links.linkEntrega}\n\nO download completo libera assim que o pagamento for confirmado. 💚`,
      };
    }

    const baixar = links.downloads.map((l, i) => `Versão ${i + 1}: ${l}`).join('\n');
    return {
      atendido: true,
      resposta: `Aqui está sua música! 🎶\n\n${baixar}\n\nE a página completa fica aqui:\n${links.linkEntrega}`,
    };
  }

  if (intencao === 'AJUSTAR_LETRA') {
    if (!resumo.temLetra) return { atendido: false };

    const ajuste = await ajustarLetra(pedido, detalhe || mensagem, envVars);
    if (!ajuste.ok) {
      return {
        atendido: true,
        entregarHumano: true,
        resposta: 'Quero muito acertar essa letra com você — vou chamar aqui pra ajustarmos juntos. 🙏',
      };
    }

    return {
      atendido: true,
      resposta: `Ajustei a letra do seu jeito! Olha como ficou:\n\n${ajuste.letra}\n\nSe gostou, me responde *pode gravar* que eu já mando pro estúdio. Se quiser mudar mais alguma coisa, é só me dizer. 💚`,
    };
  }

  if (intencao === 'TROCAR_ESTILO') {
    const estilo = detalhe || '';
    if (!estilo) {
      return {
        atendido: true,
        resposta: 'Claro, posso trocar o estilo! Me diz qual você quer: sertanejo, MPB, pop, gospel, pagode, forró, rock...?',
      };
    }

    const nova = await regerarMusica(pedido, { novoEstilo: estilo }, envVars);

    if (!nova.ok && nova.motivo === 'limite_de_regeracoes') {
      return {
        atendido: true,
        entregarHumano: true,
        resposta: 'Essa música já foi refeita algumas vezes por aqui — vou chamar uma pessoa da equipe pra cuidar disso com você, assim a gente acerta de vez. 🙏',
      };
    }

    if (!nova.ok) {
      return {
        atendido: true,
        entregarHumano: true,
        resposta: 'Tive um problema pra regravar agora — já chamei a equipe pra resolver isso pra você. 🙏',
      };
    }

    return {
      atendido: true,
      resposta: `Mandei regravar em *${estilo}*! 🎙️ Leva uns 2 a 3 minutinhos.\n\nEla vai aparecer aqui assim que ficar pronta:\n${resumo.linkEntrega}`,
    };
  }

  return { atendido: false };
}
