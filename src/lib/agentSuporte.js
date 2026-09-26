import { runJsonCompletion } from './gemini.js';
import {
  carregarContextoDoCliente,
  conferirPagamento,
  montarLinksDaMusica,
  ajustarLetra,
  regerarMusica,
  avisarDono,
  listarMusicasPagas,
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
  'SAUDACAO',            // só cumprimentou, ainda não disse o que quer
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
- SAUDACAO: só cumprimentou ("oi", "boa tarde", "tudo bem?") sem dizer o que precisa.
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

  if (intencao === 'NOVO_PEDIDO') return { atendido: false };

  // Cliente que JÁ tem pedido só cumprimentou, ou disse algo que não classificamos.
  //
  // Antes isto caía no fluxo de coleta de pedido novo, cujo prompt manda fechar venda — então um
  // "oi" de quem já comprou virava "pra quem vai ser a música?" (relatado em 26/09/2026). Quem já é
  // cliente merece ser reconhecido e perguntado o que precisa, não abordado de novo.
  if (intencao === 'SAUDACAO' || intencao === 'OUTRO') {
    const nome = resumo.cliente ? String(resumo.cliente).split(' ')[0] : '';

    // Responder a um "oi" com link e lista de opções é despejo, não conversa. Pessoa de verdade
    // cumprimenta de volta e pergunta o que a outra precisa — só isso. O contexto do pedido já
    // está carregado; ele entra na resposta SEGUINTE, quando souber o que a pessoa quer.
    //
    // A única menção ao pedido aqui é quando ele ainda está em produção, porque nesse caso a
    // pessoa quase sempre escreveu por causa disso e esperar ela perguntar soaria desatento.
    const emProducao = !resumo.temMusica;

    return {
      atendido: true,
      resposta: emProducao
        ? `Oi${nome ? `, ${nome}` : ''}! Tudo bem? A música de ${resumo.homenageado || 'vocês'} ainda tá sendo finalizada aqui. Posso te ajudar em alguma coisa?`
        : `Oi${nome ? `, ${nome}` : ''}! Tudo bem? Como posso te ajudar?`,
    };
  }

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
      // O cliente afirma que pagou e a Efí diz que não. Não existe resposta automática certa aqui:
      // ou o dinheiro saiu e algo quebrou no caminho, ou houve confusão. Chama gente (uma vez só
      // por pedido) em vez de deixar o cliente repetindo a mesma queixa no vazio.
      await avisarDono(pedido, `Efí retornou "${conferencia.statusProvedor || 'sem pagamento'}"`, envVars).catch(() => {});
      // NÃO pedir comprovante. Quem decide se o pagamento existe é a Efí, e ela acabou de ser
      // consultada — o print do cliente não mudaria a resposta, e prometer conferir um arquivo que
      // o bot não lê é prometer o que não vai acontecer (achado 26/09/2026).
      //
      // A liberação automática continua rodando: a reconciliação confere as cobranças a cada 5
      // minutos e, quando o pagamento cai, o próprio sistema manda a mensagem de aprovação. Por
      // isso "te aviso aqui" é verdade, não consolo.
      return {
        atendido: true,
        resposta: `Conferi agora direto no banco e o pagamento ainda não apareceu aqui. 😕\n\nSe você pagou faz pouco tempo, costuma levar alguns minutinhos pra compensar — e assim que cair eu te aviso por aqui mesmo, sem você precisar fazer nada.\n\nSe quiser conferir ou pagar de novo, é nesta página:\n${resumo.linkEntrega}`,
      };
    }

    // sem_cobranca: o pedido nunca chegou a gerar Pix.
    await avisarDono(pedido, 'pedido sem cobrança Pix registrada', envVars).catch(() => {});
    return {
      atendido: true,
      resposta: `Olhei aqui e ainda não encontrei um pagamento nesse pedido. Pode ser que a cobrança não tenha chegado a ser gerada.\n\nDá uma olhada nesta página, que ela mostra o Pix certinho:\n${resumo.linkEntrega}`,
    };
  }

  if (intencao === 'CADE_MINHA_MUSICA') {
    // Cliente que volta costuma ter mais de uma homenagem. Responder só sobre a última é entregar
    // pela metade — e é justamente quem comprou várias vezes que merece a resposta completa
    // (pedido do dono do estúdio em 26/09/2026).
    const pagas = await listarMusicasPagas(phone, envVars).catch(() => []);

    if (pagas.length > 1) {
      const lista = pagas
        .map((m) => `• ${m.homenageado ? `*${m.homenageado}*` : `Pedido ${m.numero}`}: ${m.link}`)
        .join('\n');

      return {
        atendido: true,
        resposta: `Achei ${pagas.length} músicas suas aqui! 🎶\n\n${lista}\n\nÉ só abrir a que você quer ouvir ou baixar. Precisa de mais alguma coisa?`,
      };
    }

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
