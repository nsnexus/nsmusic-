// Cérebro do chat de suporte do site (/suporte), a página com cara de conversa que substitui o link
// do WhatsApp de suporte (ideia do dono do estúdio, 25/11/2026).
//
// Cada ação recebe o pedido já carregado e devolve MENSAGENS estruturadas que a página desenha
// (texto com opções, áudio, arquivo, link, Pix). O que custa dinheiro ou libera produto continua
// passando pelos mesmos pontos únicos do resto do sistema:
//   - pagamento do pedido: /api/payments/create + /api/payments/status (o chat só chama as rotas);
//   - "já paguei": conferirPagamento (consulta a Efí, nunca acredita no cliente nem em comprovante);
//   - ajuste de R$ 1: ajustePago.js, aplicado por applyPaymentApproval quando a Efí confirma.

import { runGeminiWithFailover } from './gemini.js';
import { classificarIntencao } from './agentSuporte.js';
import { conferirPagamento } from './agentTools.js';
import { criarCobrancaAjuste, SKU_AJUSTE, limparEstilo, assinaturaAudio } from './ajustePago.js';

export { assinaturaAudio };
import { findOrdersByPhone } from './orderLookup.js';
import { pedidoLiberado, pedidosPagosComAudio, agruparComBonus } from './whatsappAdm.js';
import { bonusDisponivel } from './bonusAutomatico.js';
import { getPriceForSku, skuApprovesMusic } from './pricing.js';
import { getOrder, updateOrder } from './supabaseDb.js';
import { numeroDoDono } from './ownerPhone.js';
import { lerConfigSite, normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from './configSite.js';

export const MENU = [
  { id: 'ritmo', label: 'Mudar o ritmo' },
  { id: 'letra', label: 'Ajustar a letra' },
  { id: 'baixar', label: 'Não consigo baixar' },
  { id: 'pagamento', label: 'Problema no pagamento' },
  { id: 'criar', label: 'Criar uma música nova' },
  { id: 'humano', label: 'Falar com atendente' },
];

const ESTILOS = ['Sertanejo', 'Pagode', 'Gospel', 'Forró', 'Funk', 'MPB', 'Arrocha', 'Piseiro'];
const MAIS_ALGO = { tipo: 'texto', texto: 'Posso te ajudar em mais alguma coisa?', opcoes: MENU };
const VALIDADE_PROPOSTA_MS = 60 * 60 * 1000;

const texto = (t, opcoes) => (opcoes ? { tipo: 'texto', texto: t, opcoes } : { tipo: 'texto', texto: t });
const reais = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const primeiroNome = (n) => (n ? String(n).trim().split(/\s+/)[0] : '');

export function pedidoEstaPago(p) {
  return p?.paymentStatus === 'PAGAMENTO_APROVADO' || p?.paymentStatus === 'PAGO';
}

export function temAudio(p) {
  return (Array.isArray(p?.audioFiles) && p.audioFiles.some(Boolean)) || Boolean(p?.audioUrl);
}

/** id de pedido aceito pelo chat: só o id longo e aleatório. Número "NS-…" é adivinhável. */
export function orderIdValido(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(id) && !/^NS-/i.test(id);
}

function arquivosDoPedido(p, versao) {
  const faixas = Array.isArray(p.audioFiles) && p.audioFiles.some(Boolean) ? p.audioFiles.filter(Boolean) : [p.audioUrl].filter(Boolean);
  const nome = String(p.honoreeName || 'musica').normalize('NFD').replace(/[^\w -]/g, '').trim().replace(/\s+/g, '-') || 'musica';
  return faixas.slice(0, 4).flatMap((_, i) => {
    const base = `/api/audio/proxy?orderId=${encodeURIComponent(p.id)}&faixa=${i}&v=${versao}`;
    const arquivo = `Musica-${nome}-versao-${i + 1}.mp3`;
    return [
      { tipo: 'audio', url: base, titulo: `${p.honoreeName ? `Música de ${p.honoreeName}` : 'Sua música'} · versão ${i + 1}` },
      { tipo: 'arquivo', url: `${base}&download=${encodeURIComponent(arquivo)}`, nome: arquivo },
    ];
  });
}

async function linkAtendente(pedido, env) {
  let numero = WHATSAPP_SUPORTE_PADRAO;
  try {
    numero = normalizarNumeroWhatsapp((await lerConfigSite(env))?.whatsappSuporte) || numero;
  } catch { /* fica o padrão */ }
  const msg = `Olá! Vim do chat de suporte do site. Pedido ${pedido?.orderNumber || ''}`.trim();
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}

export function saudacao(pedido) {
  const nome = primeiroNome(pedido.customerName);
  const de = pedido.honoreeName ? ` da música de *${pedido.honoreeName}*` : '';
  const situacao = !temAudio(pedido)
    ? ' Ela ainda está sendo finalizada no estúdio.'
    : (pedidoEstaPago(pedido) ? '' : ' Ele ainda está aguardando o pagamento.');
  return [
    texto(`Oi${nome ? `, ${nome}` : ''}! Aqui é o suporte da NS Music. Já encontrei seu pedido${de}.${situacao}`),
    texto('Como posso te ajudar? Toque numa opção ou, se preferir, escreva ou mande um áudio.', MENU),
  ];
}

// ---------- Ações ----------

async function acaoBaixar(pedido, env, { comPagamento = true } = {}) {
  if (!temAudio(pedido)) {
    return { mensagens: [texto('Sua música ainda está sendo finalizada no estúdio. 🎵 Assim que ficar pronta, ela aparece aqui e em "Minhas músicas".', [MENU[5]])] };
  }
  const todos = pedido.customerPhone ? await findOrdersByPhone(pedido.customerPhone, env, 20) : [];
  const lista = todos.some((p) => p.id === pedido.id) ? todos : [pedido, ...todos];
  if (!pedidoLiberado(pedido, lista)) {
    if (!comPagamento) return { mensagens: [texto('O download libera assim que o pagamento for confirmado.')] };
    const pag = await acaoPagamento(pedido, env);
    return { ...pag, mensagens: [texto('Sua música está prontinha! O download libera assim que o pagamento for confirmado.'), ...pag.mensagens] };
  }
  const pedidos = agruparComBonus(pedidosPagosComAudio(lista)).slice(0, 3).flatMap((g) => g.pedidos);
  const alvo = pedidos.length ? pedidos : [pedido];
  return {
    mensagens: [
      texto(alvo.length > 1 ? `Achei ${alvo.length} músicas pagas suas. Aqui estão:` : 'Aqui está sua música, pode ouvir e baixar por aqui mesmo:'),
      ...alvo.flatMap((p) => arquivosDoPedido(p, assinaturaAudio(p))),
      texto('Toque no arquivo pra salvar no celular. Se preferir, eu mando direto no seu WhatsApp.', [
        { id: 'enviar_whatsapp', label: 'Mandar no meu WhatsApp' },
        { id: 'menu', label: 'Consegui, obrigado!' },
      ]),
    ],
  };
}

async function acaoPagamento(pedido, env) {
  if (pedidoEstaPago(pedido)) {
    const b = await acaoBaixar(pedido, env, { comPagamento: false });
    return { mensagens: [texto('Seu pagamento já está confirmado. ✅'), ...b.mensagens] };
  }
  // Já existe Pix? Confere na Efí antes de gerar outro: muita gente pagou e só não liberou.
  if (pedido.paymentIntentId) {
    const conf = await conferirPagamento(pedido, env);
    if (conf.ok && (conf.estado === 'liberado_agora' || conf.estado === 'ja_estava_pago')) return acaoPago(pedido.id, env);
  }
  const atual = pedido.paymentIntentSku;
  const sku = atual && atual !== 'impacto' && skuApprovesMusic(atual) && getPriceForSku(atual) ? atual : 'audio_only';
  return {
    mensagens: [texto(`Seu pedido ainda está aguardando o pagamento de ${reais(getPriceForSku(sku))}. Gerei um Pix novo pra você:`)],
    gerarPix: { sku },
  };
}

async function acaoJaPaguei(pedido, env) {
  if (pedidoEstaPago(pedido)) return acaoPagamento(pedido, env);
  const conf = await conferirPagamento(pedido, env);
  if (conf.ok && (conf.estado === 'liberado_agora' || conf.estado === 'ja_estava_pago')) return acaoPago(pedido.id, env);
  if (!conf.ok) {
    return { mensagens: [texto('Não consegui falar com o banco agora. Vou continuar conferindo aqui sozinho e libero assim que confirmar.')], aguardar: { tipo: 'pagamento', txid: pedido.paymentIntentId || null, kind: 'pedido' } };
  }
  if (conf.estado === 'sem_cobranca') return acaoPagamento(pedido, env);
  const { avisarDono } = await import('./agentTools.js');
  await avisarDono(pedido, 'cliente diz que pagou (chat de suporte)', env).catch(() => {});
  return {
    mensagens: [texto('Conferi agora direto no banco e o pagamento ainda não apareceu. 😕 Se você pagou há pouco, pode levar alguns minutinhos. Fica tranquilo(a): vou continuar conferindo aqui e libero sozinho assim que cair. Já avisei a equipe também.')],
    aguardar: { tipo: 'pagamento', txid: pedido.paymentIntentId, kind: 'pedido' },
  };
}

/** Depois que a página viu o pagamento do pedido aprovado. */
export async function acaoPago(orderId, env) {
  const pedido = await getOrder(orderId, env);
  if (!pedido || !pedidoEstaPago(pedido)) {
    return { mensagens: [texto('Ainda estou esperando o banco confirmar. Assim que cair, eu libero aqui.')], aguardar: { tipo: 'pagamento', txid: pedido?.paymentIntentId || null, kind: 'pedido' } };
  }
  const b = await acaoBaixar(pedido, env, { comPagamento: false });
  const bonus = bonusDisponivel(pedido)
    ? [texto('E você ganhou 1 música bônus grátis nesse pedido. Quando quiser, é só usar:'), { tipo: 'link', url: `/criar?novo=1&origem=segunda_geracao&orderRef=${encodeURIComponent(pedido.id)}`, titulo: 'Criar minha música bônus' }]
    : [];
  return { mensagens: [texto('Pagamento confirmado! 🎉 Seu pedido está liberado.'), ...b.mensagens, ...bonus] };
}

function exigeMusicaPaga(pedido) {
  if (!temAudio(pedido)) return [texto('Sua música ainda está sendo finalizada. Assim que ela ficar pronta, dá pra pedir ajuste por aqui.', MENU)];
  if (!pedidoEstaPago(pedido)) return [texto('O ajuste é pra música já paga, e seu pedido ainda está aguardando o pagamento. Quer resolver o pagamento primeiro?', [MENU[3], MENU[5]])];
  if (!pedido.lyrics) return [texto('Esse pedido precisa de um ajuste feito pela equipe. Toca aqui que eu te passo pra uma pessoa:', [MENU[5]])];
  return null;
}

function acaoRitmo(pedido) {
  const bloqueio = exigeMusicaPaga(pedido);
  if (bloqueio) return { mensagens: bloqueio };
  return {
    mensagens: [texto(`Bora! Pra qual ritmo você quer mudar? Cada ajuste custa ${reais(getPriceForSku(SKU_AJUSTE))} e a letra continua a mesma.`, [
      ...ESTILOS.map((e) => ({ id: `estilo:${e}`, label: e })),
      { id: 'ritmo_outro', label: 'Outro ritmo' },
    ])],
  };
}

async function cobrarAjuste(pedido, ajuste, env, abertura) {
  const r = await criarCobrancaAjuste(pedido, ajuste, env);
  if (!r.ok) {
    if (r.motivo === 'estilo_invalido') return { mensagens: [texto('Não entendi o ritmo. Escreve só o nome dele, tipo "sertanejo" ou "pagode".')], modo: 'ritmo' };
    return { mensagens: [texto('Tive um problema pra gerar o Pix do ajuste agora. Toca aqui que uma pessoa da equipe resolve com você:', [MENU[5]])] };
  }
  return {
    mensagens: [
      texto(`${abertura} É só pagar o Pix de ${reais(r.valor)} abaixo que eu mando gravar na hora:`),
      { tipo: 'pix', copiaECola: r.pixCopiaECola, valor: r.valor, txid: r.txid, titulo: 'Ajuste da música' },
      texto('Assim que o pagamento cair, eu começo sozinho e te mostro a nova versão aqui.'),
    ],
    aguardar: { tipo: 'pagamento', txid: r.txid, kind: 'ajuste' },
  };
}

function acaoEstilo(pedido, estiloBruto, env) {
  const bloqueio = exigeMusicaPaga(pedido);
  if (bloqueio) return { mensagens: bloqueio };
  const estilo = limparEstilo(estiloBruto);
  return cobrarAjuste(pedido, { tipo: 'ritmo', estilo }, env, `Fechado: vou gravar sua música em *${estilo}*, com a mesma letra.`);
}

function acaoLetra(pedido) {
  const bloqueio = exigeMusicaPaga(pedido);
  if (bloqueio) return { mensagens: bloqueio };
  return {
    mensagens: [texto('Beleza! Me conta o que você quer mudar na letra. Pode escrever ou mandar um áudio. Ex.: "troca Ana por Aninha" ou "fala que ele é o melhor pai do mundo".')],
    modo: 'letra',
  };
}

/** Reescreve uma letra aplicando o pedido do cliente. Devolve '' se a IA falhar. */
export async function reescreverLetra(base, instrucao, homenageado, env = {}) {
  const prompt = `Você é o compositor do estúdio. Abaixo está a letra atual de uma homenagem para ${homenageado || 'alguém especial'}.

O cliente pediu este ajuste: "${String(instrucao || '').slice(0, 800)}"

Reescreva a letra aplicando o pedido dele. Regras:
- Mantenha a estrutura de marcações ([Verse], [Chorus], etc.) e o idioma português do Brasil.
- Mude só o que o pedido exige; preserve o resto, inclusive os detalhes reais da história.
- Não invente fatos novos sobre as pessoas.
- Responda APENAS com a letra final, sem comentários.

LETRA ATUAL:
${String(base || '').slice(0, 6000)}`;
  try {
    return String((await runGeminiWithFailover(prompt, env)) || '').trim();
  } catch (err) {
    console.warn('[suporteChat] Falha ao reescrever a letra:', err?.message);
    return '';
  }
}

async function proporLetra(pedido, instrucao, env) {
  const bloqueio = exigeMusicaPaga(pedido);
  if (bloqueio) return { mensagens: bloqueio };
  const proposta = pedido.ajusteLetraProposta;
  const recente = proposta?.letra && Date.now() - Date.parse(proposta.criadoEm || 0) < VALIDADE_PROPOSTA_MS;
  const base = recente ? proposta.letra : pedido.lyrics;
  const pedidoTexto = String(instrucao || '').slice(0, 800);

  const letra = await reescreverLetra(base, pedidoTexto, pedido.honoreeName, env);
  if (letra.length < 40) {
    return { mensagens: [texto('Não consegui ajustar a letra agora. Tenta escrever de outro jeito, ou fala com uma pessoa da equipe:', [MENU[5]])], modo: 'letra' };
  }

  await updateOrder(pedido.id, { ajusteLetraProposta: { letra, instrucao: pedidoTexto, criadoEm: new Date().toISOString() } }, env);
  return {
    mensagens: [
      texto('Ajustei! Olha como ficou a letra:'),
      { tipo: 'letra', texto: letra.replace(/^\[[^\]]+\]\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim() },
      texto(`Se gostou, eu gravo a música nova com essa letra por ${reais(getPriceForSku(SKU_AJUSTE))}.`, [
        { id: 'letra_ok', label: `Pode gravar (${reais(getPriceForSku(SKU_AJUSTE))})` },
        { id: 'letra', label: 'Quero mudar mais' },
        { id: 'menu', label: 'Deixa como está' },
      ]),
    ],
  };
}

function acaoLetraOk(pedido, env) {
  const bloqueio = exigeMusicaPaga(pedido);
  if (bloqueio) return { mensagens: bloqueio };
  return cobrarAjuste(pedido, { tipo: 'letra' }, env, 'Perfeito, vou gravar com a letra nova.');
}

/** Depois que a página viu o Pix do ajuste aprovado. */
export async function acaoAjustePago(orderId, txid, env) {
  const pedido = await getOrder(orderId, env);
  const aplicado = (Array.isArray(pedido?.ajustesAplicados) ? pedido.ajustesAplicados : []).find((a) => a?.txid === txid);
  if (!aplicado) {
    return { mensagens: [texto('Recebendo a confirmação do banco…')], aguardar: { tipo: 'pagamento', txid, kind: 'ajuste' } };
  }
  if (!aplicado.ok) {
    return { mensagens: [texto('Recebi seu pagamento, mas tive um problema pra gravar a nova versão. Já avisei a equipe e ela vai resolver com você.', [MENU[5]])] };
  }
  return {
    mensagens: [texto('Pagamento confirmado! 🎉 Já mandei gravar. Leva uns 2 a 3 minutinhos. Fica aqui que eu te mostro a nova versão assim que ficar pronta.')],
    aguardar: { tipo: 'musica', assinatura: aplicado.assinaturaAntes || assinaturaAudio(pedido) },
  };
}

/** Polling da nova versão depois de um ajuste pago. */
export async function acaoNovaVersao(orderId, assinatura, env) {
  const pedido = await getOrder(orderId, env);
  if (!pedido) return { pronto: false };
  const atual = assinaturaAudio(pedido);
  const gerando = String(pedido.productionStatus || '').toUpperCase().includes('GERANDO');
  if (!atual || atual === assinatura || gerando) return { pronto: false };
  return {
    pronto: true,
    mensagens: [
      texto('Sua nova versão ficou pronta! 🎶 Ouve aqui:'),
      ...arquivosDoPedido(pedido, atual),
      texto('Gostou? Se quiser mais algum ajuste é só me chamar.', [{ id: 'gostei', label: 'Ficou perfeita!' }, MENU[0], MENU[1], MENU[5]]),
    ],
  };
}

function acaoCriar(pedido) {
  const msgs = [];
  if (bonusDisponivel(pedido)) {
    msgs.push(texto('Boa notícia: você ainda tem 1 música bônus grátis nesse pedido. Dá pra criar aqui mesmo pelo chat, ou pelo site:'));
    msgs.push({ tipo: 'link', url: `/criar?novo=1&origem=segunda_geracao&orderRef=${encodeURIComponent(pedido.id)}`, titulo: 'Criar minha música bônus pelo site' });
    msgs.push(texto('Quer criar por aqui? É rapidinho, eu te faço umas perguntas:', [{ id: 'criar_nova', label: 'Criar aqui pelo chat' }, { id: 'menu', label: 'Voltar ao menu' }]));
  } else {
    msgs.push(texto('Bora fazer uma música nova! Eu te faço umas perguntas rapidinho por aqui:', [{ id: 'criar_nova', label: 'Criar aqui pelo chat' }, { id: 'menu', label: 'Voltar ao menu' }]));
  }
  return { mensagens: msgs };
}

/**
 * Polling da música nova criada pelo chat. Paga (bônus automático, Pacote Família) → entrega
 * completa; não paga → prévia na página da música (mesmo funil do site) + Pix aqui no chat.
 */
export async function acaoMusicaNovaPronta(orderId, env) {
  const pedido = await getOrder(orderId, env);
  if (!pedido || !temAudio(pedido)) return { pronto: false };
  if (String(pedido.productionStatus || '').toUpperCase().includes('GERANDO')) return { pronto: false };
  if (pedidoEstaPago(pedido)) {
    const b = await acaoBaixar(pedido, env, { comPagamento: false });
    return { pronto: true, mensagens: [texto('Sua música ficou pronta! 🎶'), ...b.mensagens] };
  }
  const sku = 'audio_only';
  return {
    pronto: true,
    mensagens: [
      texto(`Sua música${pedido.honoreeName ? ` pra *${pedido.honoreeName}*` : ''} ficou pronta! 🎶 Ouve a prévia aqui:`),
      { tipo: 'link', url: `/entrega?orderId=${encodeURIComponent(pedido.id)}`, titulo: 'Ouvir minha música' },
      texto(`Gostou? Pra liberar as 2 versões completas em MP3 é só pagar ${reais(getPriceForSku(sku))} no Pix. Pode ser por aqui mesmo:`, [
        { id: 'pagamento', label: 'Pagar com Pix aqui' },
        { id: 'humano', label: 'Falar com atendente' },
      ]),
    ],
  };
}

/** Nome e WhatsApp do pedido atual, para quem já é cliente não precisar digitar de novo. */
export function dadosDoCliente(pedido) {
  return { customerName: pedido?.customerName || '', customerPhone: String(pedido?.customerPhone || '').replace(/\D/g, '') };
}

async function acaoHumano(pedido, env, motivo = '') {
  const agora = Date.now();
  const ultimo = Date.parse(pedido.suporteChatHumanoEm || 0);
  if (!(agora - ultimo < 30 * 60 * 1000)) {
    try {
      const { sendWApiTextMessage } = await import('./whatsapp.js');
      await sendWApiTextMessage(numeroDoDono(env), `🙋 *Cliente pediu atendente no chat do site*\n\nPedido: ${pedido.orderNumber || pedido.id}\n`
        + `Cliente: ${pedido.customerName || '—'}\nWhatsApp: ${pedido.customerPhone || '—'}\nPago: ${pedidoEstaPago(pedido) ? 'sim' : 'não'}`
        + `${motivo ? `\nMensagem: ${String(motivo).slice(0, 300)}` : ''}`, env);
      await updateOrder(pedido.id, { suporteChatHumanoEm: new Date(agora).toISOString() }, env);
    } catch (err) {
      console.warn('[suporteChat] Falha ao avisar o dono:', err?.message);
    }
  }
  return {
    mensagens: [
      texto('Claro! Já avisei a equipe. Pra falar com uma pessoa agora, toca no botão abaixo. Seu pedido já vai junto na mensagem.'),
      { tipo: 'whatsapp', url: await linkAtendente(pedido, env), titulo: 'Falar com atendente no WhatsApp' },
    ],
  };
}

async function acaoEnviarWhatsapp(pedido, env, emSegundoPlano) {
  if (!pedido.customerPhone) return acaoHumano(pedido, env);
  const { enviarMusicasPeloChat } = await import('./whatsappAdm.js');
  const envio = enviarMusicasPeloChat(pedido.customerPhone, env);
  emSegundoPlano(envio);
  const final = String(pedido.customerPhone).replace(/\D/g, '').slice(-4);
  return { mensagens: [texto(`Pronto! Estou mandando suas músicas no seu WhatsApp (final ${final}), em MP3 e em áudio. Chegam em alguns instantes. 💚`), MAIS_ALGO] };
}

// ---------- Texto livre ----------

async function interpretarTexto(pedido, mensagem, modo, env) {
  const msg = String(mensagem || '').trim().slice(0, 1000);
  if (!msg) return { mensagens: [] };
  if (modo === 'letra') return proporLetra(pedido, msg, env);
  if (modo === 'ritmo') return acaoEstilo(pedido, msg, env);

  const { intencao, detalhe } = await classificarIntencao(msg, {
    numero: pedido.orderNumber, orderId: pedido.id, pago: pedidoEstaPago(pedido), temMusica: temAudio(pedido), estilo: pedido.musicStyle,
  }, env);

  switch (intencao) {
    case 'CADE_MINHA_MUSICA': return acaoBaixar(pedido, env);
    case 'PAGUEI_NAO_LIBEROU': return acaoJaPaguei(pedido, env);
    case 'AJUSTAR_LETRA': return detalhe ? proporLetra(pedido, detalhe, env) : acaoLetra(pedido);
    case 'TROCAR_ESTILO': return detalhe ? acaoEstilo(pedido, detalhe, env) : acaoRitmo(pedido);
    case 'NOVO_PEDIDO': return acaoCriar(pedido);
    case 'FALAR_HUMANO': return acaoHumano(pedido, env, msg);
    case 'SAUDACAO': return { mensagens: [texto(`Oi${primeiroNome(pedido.customerName) ? `, ${primeiroNome(pedido.customerName)}` : ''}! Como posso te ajudar?`, MENU)] };
    default: return { mensagens: [texto('Hmm, não entendi muito bem. 😅 Escolhe uma das opções abaixo, ou toca em "Falar com atendente" que uma pessoa te ajuda.', MENU)] };
  }
}

/**
 * Despacha uma ação do chat. `entrada`: { acao, opcao?, texto?, modo? }.
 * @returns {Promise<{mensagens: object[], modo?: string, aguardar?: object, gerarPix?: object}>}
 */
export async function responderChat(pedido, entrada, env = {}, { emSegundoPlano = (p) => p } = {}) {
  const { acao, opcao } = entrada || {};
  if (acao === 'inicio') return { mensagens: saudacao(pedido) };
  if (acao === 'texto') return interpretarTexto(pedido, entrada.texto, entrada.modo, env);
  if (acao === 'comprovante') return pedidoEstaPago(pedido)
    ? { mensagens: [texto('Recebi a imagem! Se ela é pra o vídeo da homenagem, as fotos são enviadas na página da sua música:'), { tipo: 'link', url: `/entrega/${encodeURIComponent(pedido.id)}`, titulo: 'Abrir a página da minha música' }, MAIS_ALGO] }
    : acaoJaPaguei(pedido, env);
  if (acao !== 'opcao') return { mensagens: [texto('Não entendi. Escolhe uma opção:', MENU)] };

  if (typeof opcao === 'string' && opcao.startsWith('estilo:')) return acaoEstilo(pedido, opcao.slice(7), env);
  switch (opcao) {
    case 'ritmo': return acaoRitmo(pedido);
    case 'ritmo_outro': return { mensagens: [texto('Escreve aqui o ritmo que você quer (ex.: MPB, rock, reggae, bachata…).')], modo: 'ritmo' };
    case 'letra': return acaoLetra(pedido);
    case 'letra_ok': return acaoLetraOk(pedido, env);
    case 'baixar': return acaoBaixar(pedido, env);
    case 'enviar_whatsapp': return acaoEnviarWhatsapp(pedido, env, emSegundoPlano);
    case 'pagamento': return acaoPagamento(pedido, env);
    case 'ja_paguei': return acaoJaPaguei(pedido, env);
    case 'criar': return acaoCriar(pedido);
    case 'humano': return acaoHumano(pedido, env);
    case 'gostei': return { mensagens: [texto('Que bom! 💚 Qualquer coisa é só chamar por aqui.'), MAIS_ALGO] };
    case 'menu': return { mensagens: [MAIS_ALGO] };
    default: return { mensagens: [texto('Não entendi. Escolhe uma opção:', MENU)] };
  }
}
