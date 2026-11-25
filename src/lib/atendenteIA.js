// Atendente com IA do chat de suporte (/suporte) — pedido do dono do estúdio em 25/11/2026: "igual
// converso com o ChatGPT", que entenda o cliente de primeira e conduza, sem encher de perguntas.
//
// Como funciona (um turno):
//   1. A IA recebe o conhecimento (editável no painel), a situação (pedido aberto, músicas, o que o
//      chat está esperando, celular do cliente), o histórico da conversa e a mensagem nova.
//   2. Ela responde em JSON: um texto e, se precisar, UMA ferramenta.
//   3. Ferramentas de consulta (buscar_pedidos, abrir_pedido) voltam para a IA continuar; as de ação
//      (enviar músicas, Pix, ajuste, letra…) mostram as mensagens prontas do sistema e encerram o turno.
//
// O que a IA NÃO consegue fazer, por construção: liberar pedido, mudar preço, confirmar pagamento
// sem o banco, abrir pedido de outro telefone. Tudo isso fica nas ferramentas.

import { runJsonCompletion, runGeminiWithFailover } from './gemini.js';
import { lerConfigAtendente } from './atendenteConhecimento.js';
import { montarPromptDaLetra } from './letraPrompt.js';
import { findOrdersByPhone } from './orderLookup.js';
import { VALORES_VALIDOS } from './novaMusicaChat.js';
import {
  executarFerramenta, resumoParaIA, contextoDoPedido, gruposDoNumero, listaDePedidos,
  pedidoEstaPago, temAudio,
} from './suporteChat.js';

const MAX_PASSOS = 3;
const MAX_HISTORICO = 16;

const FERRAMENTAS = `FERRAMENTAS (use no máximo UMA por resposta, no campo "ferramenta"):
- buscar_pedidos {"telefone": "só números com DDD"} → acha os pedidos do cliente pelo WhatsApp que ele usou no site.
- abrir_pedido {"pedido_id": "id da lista"} → abre um dos pedidos encontrados (só ids da lista de pedidos do número).
- enviar_musicas {} → mostra as músicas do pedido aberto para ouvir e baixar (se estiver pago).
- conferir_pagamento {} → confere no banco o Pix do pedido aberto; libera sozinho se caiu.
- pagar_pedido {} → mostra o Pix para pagar o pedido aberto.
- trocar_ritmo {"estilo": "nome do ritmo", "musica": "principal" | "bonus"} → gera o Pix de R$ 1,00 do ajuste; grava sozinho quando pagar. Sem estilo, mostra as opções de ritmo.
- ajustar_letra {"instrucao": "o que mudar, nas palavras do cliente", "musica": "principal" | "bonus"} → reescreve a letra e mostra para o cliente aprovar. Sem instrução, pergunta o que mudar.
- gravar_letra_ajustada {"musica": "principal" | "bonus"} → cliente aprovou a letra ajustada: gera o Pix de R$ 1,00.
- link_fotos {} → explica onde trocar as fotos do vídeo (página da música).
- ensinar_navegador {} → passo a passo para sair do navegador do WhatsApp e abrir no Chrome/Safari.
- oferecer_bonus {} → mostra o link da música bônus grátis do pedido aberto.
- escrever_letra_nova {"honoreeName": "", "relationship": "", "occasion": "", "story": "", "musicStyle": "", "voiceType": "masculina|feminina|dueto", "musicMood": ""} → escreve a letra de uma MÚSICA NOVA e mostra ao cliente.
- agradecer_cliente {} → fecho do atendimento: agradece, pede indicação e mostra o Instagram da NS Music.
- chamar_atendente {"motivo": "resumo curto"} → passa para uma pessoa da equipe.
- mostrar_menu {"texto": "frase curta"} → mostra as opções principais.`;

const REGRAS = `Você é o atendente da NS Music no chat de suporte do site. Responda como gente no WhatsApp: frases curtas, informal, uma pergunta por vez, sem elogio genérico, no máximo 1 emoji.

Regras que você nunca quebra:
- Nunca invente preço, prazo, situação de pedido ou de pagamento. Use o CONHECIMENTO e as FERRAMENTAS.
- Você não libera pedido nem confirma pagamento: quem confere é o banco (conferir_pagamento). Comprovante não libera nada.
- Dinheiro (reembolso, cobrança em dobro) ou algo que as ferramentas não resolvem: chamar_atendente.
- Se o cliente pedir para falar com uma pessoa, chamar_atendente na hora.

Como conduzir:
- Sem pedido aberto e o cliente fala de um pedido que já fez (pagou, não chegou, quer baixar, ajustar, trocar foto): peça o WhatsApp que ele usou no site e use buscar_pedidos. Se ele já mandou o número, use direto.
- Lista com vários pedidos: se o cliente disser qual (pelo nome de quem foi homenageado), use abrir_pedido; senão, peça para escolher.
- Pedido com música bônus e o cliente quer mudar ritmo ou letra sem dizer de qual: pergunte "a principal ou a bônus?" antes da ferramenta.
- Ajuste de ritmo ou de letra custa R$ 1,00: a ferramenta já mostra o valor, não precisa repetir.
- Cliente diz que não consegue ouvir, baixar ou enviar foto e está no navegador de um app: ensinar_navegador.
- MÚSICA NOVA: o essencial é o nome de quem vai ser homenageado e algo da história (um momento, um jeito, um apelido). Aproveite tudo que o cliente já contou. Se faltar a história, peça UM detalhe. Ritmo, voz e clima: se ele não disse, escolha o que combina com a história e conte qual escolheu. Com o essencial em mãos, chame escrever_letra_nova. Não peça nome nem WhatsApp do cliente antes: o sistema pede na hora de gravar.
- Atendimento resolvido (música entregue, pagamento liberado, ajuste pronto ou letra nova aprovada) e o cliente agradece, diz que deu certo ou se despede: agradecer_cliente, uma vez só na conversa. Não use se ainda há problema aberto ou o cliente está irritado.
- Nunca diga que fez algo que nenhuma ferramenta fez.

Responda SEMPRE em JSON, exatamente: {"resposta": "texto para o cliente (deixe vazio quando a ferramenta já fala com ele)", "opcoes": ["até 3 respostas rápidas curtas, opcional"], "ferramenta": null ou {"nome": "...", "args": {...}}}`;

function textoDoHistorico(historico) {
  return (Array.isArray(historico) ? historico : []).slice(-MAX_HISTORICO)
    .map((m) => `${m?.de === 'eu' ? 'Cliente' : 'Atendente'}: ${String(m?.texto || '').slice(0, 500)}`)
    .filter((l) => l.length > 10)
    .join('\n');
}

function descreverEspera(aguardando) {
  if (!aguardando) return 'nada';
  if (aguardando.tipo === 'pagamento') return aguardando.kind === 'ajuste' ? 'o Pix de R$ 1,00 do ajuste cair (o sistema confere sozinho)' : 'o Pix do pedido cair (o sistema confere sozinho)';
  if (aguardando.tipo === 'musica') return 'a nova versão da música terminar de gravar (aparece sozinha no chat)';
  if (aguardando.tipo === 'musica_nova') return 'a música nova terminar de gravar (aparece sozinha no chat)';
  return 'nada';
}

function listaParaIA(pedidos) {
  if (!pedidos?.length) return 'nenhuma (o cliente ainda não informou o WhatsApp)';
  return gruposDoNumero(pedidos).slice(0, 9).map(({ principal: p, pedidos: g }) => (
    `- id ${p.id}: música de ${p.honoreeName || '—'} · ${pedidoEstaPago(p) ? 'paga' : temAudio(p) ? 'aguardando pagamento' : 'em produção'}${g.length > 1 ? ' · com bônus' : ''}`
  )).join('\n');
}

const limpar = (v, n = 60) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Dados da música nova vindos da IA: só o que faz sentido, com padrões no que faltar. */
export function dadosDaMusicaNova(args = {}) {
  const voz = limpar(args.voiceType, 20).toLowerCase();
  return {
    honoreeName: limpar(args.honoreeName),
    relationship: limpar(args.relationship, 40),
    occasion: limpar(args.occasion, 40),
    story: limpar(args.story, 3000),
    musicStyle: limpar(args.musicStyle, 40) || 'Romântica',
    voiceType: VALORES_VALIDOS.voiceType.has(voz) ? voz : 'masculina',
    musicMood: limpar(args.musicMood, 30) || 'Emocionante',
  };
}

async function escreverLetraNova(args, env) {
  const dados = dadosDaMusicaNova(args);
  if (dados.honoreeName.length < 2 || dados.story.length < 10) return { erro: 'faltou_nome_ou_historia' };
  let letra = '';
  try {
    letra = String((await runGeminiWithFailover(montarPromptDaLetra(dados), env)) || '').trim();
  } catch (err) {
    console.warn('[atendenteIA] Falha ao escrever a letra:', err?.message);
  }
  if (letra.length < 50) return { erro: 'falha_na_letra' };
  return {
    mensagens: [
      { tipo: 'texto', texto: `Olha como ficou a letra pra *${dados.honoreeName}* (${dados.musicStyle}, voz ${dados.voiceType}):` },
      { tipo: 'letra', texto: letra.replace(/^\[[^\]]+\]\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim() },
      { tipo: 'texto', texto: 'Gostou? Se quiser, eu mudo o que você quiser antes de gravar.', opcoes: [
        { id: 'nova_gravar', label: 'Gostei, pode gravar!' },
        { id: 'nova_mudar', label: 'Quero mudar algo' },
        { id: 'nova_outra', label: 'Escrever outra letra' },
      ] },
    ],
    rascunho: { campos: dados, letra },
  };
}

/**
 * Um turno do atendente. Devolve o mesmo formato do chat (mensagens, orderId, aguardar…) ou
 * `{ falhou: true }` quando a IA não respondeu (a rota cai no atendimento por regras).
 */
export async function responderComIA({ pedido = null, telefone = '', historico = [], aguardando = null, mensagem = '', dispositivo = '', dentroDeApp = false, urlAtual = '' }, env = {}, deps = {}) {
  const ia = deps.runJsonCompletion || runJsonCompletion;
  const config = deps.config || await lerConfigAtendente(env);
  if (!config.ligado) return { falhou: true, motivo: 'desligado' };

  let pedidoAtual = pedido;
  let ctx = pedidoAtual ? await (deps.contextoDoPedido || contextoDoPedido)(pedidoAtual, env) : null;
  let fone = String(telefone || '').replace(/\D/g, '');
  let pedidosDoNumero = ctx?.lista || (fone.length >= 10 ? await (deps.findOrdersByPhone || findOrdersByPhone)(fone, env, 20) : []);
  const resultados = [];
  const extra = {};

  for (let passo = 0; passo < MAX_PASSOS; passo++) {
    const situacao = [
      `Celular do cliente: ${dispositivo || 'desconhecido'} · ${dentroDeApp ? 'está DENTRO do navegador do WhatsApp/app' : 'navegador normal'}`,
      `O chat está esperando: ${descreverEspera(aguardando)}`,
      resumoParaIA(pedidoAtual, ctx),
      `Pedidos do WhatsApp informado:\n${listaParaIA(pedidosDoNumero)}`,
    ].join('\n');
    const usuario = `CONHECIMENTO:\n${config.texto}\n\nSITUAÇÃO:\n${situacao}\n\nCONVERSA ATÉ AGORA:\n${textoDoHistorico(historico) || '(começo da conversa)'}\n\n${resultados.length ? `RESULTADO DAS FERRAMENTAS NESTE TURNO:\n${resultados.join('\n')}\n\n` : ''}MENSAGEM NOVA DO CLIENTE: ${String(mensagem).slice(0, 1500)}`;

    let saida;
    try {
      saida = await ia(`${REGRAS}\n\n${FERRAMENTAS}`, usuario, env);
    } catch (err) {
      console.warn('[atendenteIA] IA indisponível:', err?.message);
      return { falhou: true, motivo: 'ia_indisponivel' };
    }

    const resposta = typeof saida?.resposta === 'string' ? saida.resposta.trim().slice(0, 1500) : '';
    const opcoes = (Array.isArray(saida?.opcoes) ? saida.opcoes : []).filter((o) => typeof o === 'string' && o.trim())
      .slice(0, 3).map((o) => ({ id: `txt:${o.trim().slice(0, 40)}`, label: o.trim().slice(0, 40) }));
    const ferramenta = saida?.ferramenta && typeof saida.ferramenta === 'object' ? saida.ferramenta : null;
    const nome = String(ferramenta?.nome || '');
    const args = ferramenta?.args && typeof ferramenta.args === 'object' ? ferramenta.args : {};
    const fala = resposta ? [{ tipo: 'texto', texto: resposta, ...(opcoes.length && !nome ? { opcoes } : {}) }] : [];

    if (!nome) {
      if (!fala.length) return { falhou: true, motivo: 'resposta_vazia' };
      return { ...extra, mensagens: fala };
    }

    // --- Consultas: o resultado volta para a IA continuar ---
    if (nome === 'buscar_pedidos') {
      const d = String(args.telefone || fone).replace(/\D/g, '');
      if (d.length < 10 || d.length > 13) { resultados.push('buscar_pedidos: telefone inválido — peça o WhatsApp com DDD.'); continue; }
      fone = d;
      extra.telefone = d;
      pedidosDoNumero = await (deps.findOrdersByPhone || findOrdersByPhone)(d, env, 20);
      const grupos = gruposDoNumero(pedidosDoNumero);
      if (grupos.length === 0) { resultados.push(`buscar_pedidos: nenhum pedido com o WhatsApp ${d}.`); continue; }
      if (grupos.length === 1) {
        pedidoAtual = grupos[0].principal;
        ctx = await (deps.contextoDoPedido || contextoDoPedido)(pedidoAtual, env);
        extra.orderId = pedidoAtual.id;
        resultados.push(`buscar_pedidos: 1 pedido encontrado e já aberto.\n${resumoParaIA(pedidoAtual, ctx)}`);
        continue;
      }
      const lista = listaDePedidos(pedidosDoNumero);
      return { ...extra, mensagens: [...fala, lista], escolherPedido: lista.opcoes };
    }
    if (nome === 'abrir_pedido') {
      const escolhido = gruposDoNumero(pedidosDoNumero).map((g) => g.principal).find((p) => p.id === String(args.pedido_id || ''));
      if (!escolhido) { resultados.push('abrir_pedido: esse id não está na lista de pedidos do número.'); continue; }
      pedidoAtual = escolhido;
      ctx = await (deps.contextoDoPedido || contextoDoPedido)(pedidoAtual, env);
      extra.orderId = pedidoAtual.id;
      resultados.push(`abrir_pedido: aberto.\n${resumoParaIA(pedidoAtual, ctx)}`);
      continue;
    }

    // --- Ações: o sistema mostra as mensagens dele e o turno acaba ---
    let r;
    if (nome === 'escrever_letra_nova') r = await escreverLetraNova(args, env);
    else r = await (deps.executarFerramenta || executarFerramenta)(nome, args, { pedido: pedidoAtual, ctx, dispositivo, urlAtual }, env);

    if (r?.erro) {
      resultados.push(`${nome}: não deu (${r.erro}).`);
      continue;
    }
    return { ...extra, ...r, orderId: r.orderId || extra.orderId, mensagens: [...fala, ...(r.mensagens || [])] };
  }

  return { ...extra, mensagens: [{ tipo: 'texto', texto: 'Hmm, me perdi aqui. 😅 Me conta de novo o que você precisa, ou fala com uma pessoa da equipe:', opcoes: [{ id: 'humano', label: 'Falar com atendente' }] }] };
}
