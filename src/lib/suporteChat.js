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
import { pedidoLiberado, pedidosPagosComAudio, agruparComBonus, dataHoraBr } from './whatsappAdm.js';
import { isBonusOrder } from './trafficSource.js';
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

const ESTILOS = ['Sertanejo', 'Pagode', 'Gospel', 'Forró', 'Funk', 'MPB', 'Arrocha', 'Piseiro', 'Carimbó'];
export const INSTAGRAM_URL = 'https://www.instagram.com/_nsmusic';
const CONVITE_INDICACAO = 'Fiz uma música personalizada na NS Music e ficou linda! Faz a sua também: https://nsmusic.ia.br';

/**
 * Fecho de atendimento bem-sucedido (cliente confirmou que deu certo): agradece, pede indicação e
 * convida para o Instagram. Pedido do dono do estúdio em 25/11/2026.
 */
export function agradecimento() {
  return [
    texto('Obrigado por confiar na NS Music! Se puder, indica a gente pra alguém que você gosta, isso ajuda muito nosso trabalho. E segue a gente no Instagram pra acompanhar as novidades:'),
    { tipo: 'link', url: INSTAGRAM_URL, titulo: 'Seguir @_nsmusic no Instagram' },
    { tipo: 'whatsapp', url: `https://wa.me/?text=${encodeURIComponent(CONVITE_INDICACAO)}`, titulo: 'Indicar para um amigo' },
    texto('Precisando de algo, é só chamar aqui. 🎶'),
  ];
}

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

/**
 * Número com mais de um pedido: o cliente escolhe sobre qual quer falar antes de qualquer coisa
 * (senão "mudar o ritmo" cairia no pedido errado).
 */
export function gruposDoNumero(pedidos) {
  return agruparComBonus(pedidos || []);
}

export function listaDePedidos(pedidos) {
  const grupos = gruposDoNumero(pedidos).slice(0, 9);
  const opcoes = grupos.map(({ principal: p, pedidos: doGrupo }) => {
    const quando = dataHoraBr(p.createdAt).split(' às ')[0];
    const situacao = pedidoLiberado(p, pedidos) ? 'paga' : temAudio(p) ? 'aguardando pagamento' : 'em produção';
    const nome = p.honoreeName ? `Música de ${String(p.honoreeName).slice(0, 30)}` : `Pedido ${p.orderNumber || ''}`.trim();
    const bonus = doGrupo.length > 1 ? ' · com bônus' : '';
    return { id: `pedido:${p.id}`, label: `${nome} · ${quando} · ${situacao}${bonus}` };
  });
  return texto(`Achei ${grupos.length} pedidos nesse número. Sobre qual deles você quer falar?`, opcoes);
}

/** Os pedidos do mesmo telefone, o grupo (principal + bônus) deste pedido e se ele está liberado. */
export async function contextoDoPedido(pedido, env = {}) {
  const todos = pedido.customerPhone ? await findOrdersByPhone(pedido.customerPhone, env, 20) : [];
  const lista = todos.some((p) => p.id === pedido.id) ? todos : [pedido, ...todos];
  const grupo = gruposDoNumero(lista).find((g) => g.pedidos.some((p) => p.id === pedido.id))?.pedidos || [pedido];
  return { lista, grupo, liberado: pedidoLiberado(pedido, lista) };
}

/**
 * Arquivos das músicas liberadas do pedido (principal + bônus do mesmo grupo), para entregar fora do
 * chat (botão "Receber minhas músicas" do WhatsApp oficial). URLs relativas ao site, do proxy de áudio.
 */
export async function faixasParaEntregar(pedido, env = {}) {
  if (!pedido || !temAudio(pedido)) return { liberado: false, faixas: [] };
  const { lista, grupo, liberado } = await contextoDoPedido(pedido, env);
  if (!liberado) return { liberado: false, faixas: [] };
  const pagos = pedidosPagosComAudio(grupo).filter((p) => pedidoLiberado(p, lista));
  const faixas = (pagos.length ? pagos : [pedido])
    .flatMap((p) => arquivosDoPedido(p, assinaturaAudio(p)).filter((m) => m.tipo === 'arquivo').map((m) => ({ url: m.url, nome: m.nome })));
  return { liberado: true, faixas };
}

/** Pedido com música bônus: pergunta em qual das músicas fazer a ação. */
function escolherMusica(ctx, acao, pergunta) {
  const musicas = ctx.grupo.filter(temAudio);
  if (musicas.length < 2) return null;
  return {
    mensagens: [texto(pergunta, musicas.map((p, i) => ({
      id: `alvo:${p.id}:${acao}`,
      label: `${i === 0 ? 'Música principal' : 'Música bônus'}${p.musicStyle ? ` · ${String(p.musicStyle).slice(0, 25)}` : ''}${p.honoreeName ? ` (${String(p.honoreeName).slice(0, 20)})` : ''}`,
    })))],
  };
}

export function saudacao(pedido, ctx = null) {
  const nome = primeiroNome(pedido.customerName);
  const comBonus = ctx && ctx.grupo.filter(temAudio).length > 1 ? ' (com a música bônus)' : '';
  const de = pedido.honoreeName ? ` da música de *${pedido.honoreeName}*${comBonus}` : comBonus;
  const liberado = ctx ? ctx.liberado : pedidoEstaPago(pedido);
  const situacao = !temAudio(pedido)
    ? ' Ela ainda está sendo finalizada no estúdio.'
    : (liberado ? '' : ' Ele ainda está aguardando o pagamento.');
  return [
    texto(`Oi${nome ? `, ${nome}` : ''}! Aqui é o suporte da NS Music. Já encontrei seu pedido${de}.${situacao}`),
    texto('Como posso te ajudar? Toque numa opção ou, se preferir, escreva ou mande um áudio.', MENU),
  ];
}

// ---------- Ações ----------

async function acaoBaixar(pedido, env, { comPagamento = true, ctx = null } = {}) {
  if (!temAudio(pedido)) {
    return { mensagens: [texto('Sua música ainda está sendo finalizada no estúdio. 🎵 Assim que ficar pronta, ela aparece aqui e em "Minhas músicas".', [MENU[5]])] };
  }
  const { lista, grupo, liberado } = ctx || await contextoDoPedido(pedido, env);
  if (!liberado) {
    if (!comPagamento) return { mensagens: [texto('O download libera assim que o pagamento for confirmado.')] };
    const pag = await acaoPagamento(pedido, env, ctx || { liberado });
    return { ...pag, mensagens: [texto('Sua música está prontinha! O download libera assim que o pagamento for confirmado.'), ...pag.mensagens] };
  }
  const pedidos = pedidosPagosComAudio(grupo).filter((p) => pedidoLiberado(p, lista));
  const alvo = pedidos.length ? pedidos : [pedido];
  return {
    mensagens: [
      texto(alvo.length > 1 ? 'Aqui estão a música principal e a bônus, pode ouvir e baixar por aqui mesmo:' : 'Aqui está sua música, pode ouvir e baixar por aqui mesmo:'),
      ...alvo.flatMap((p) => arquivosDoPedido(p, assinaturaAudio(p))),
      texto('Toque no arquivo pra salvar no celular. Se não baixar, toque nos três pontinhos (⋮) lá em cima e escolha *Abrir no navegador*, depois tente de novo.', [
        { id: 'deu_certo', label: 'Consegui, obrigado!' },
        MENU[5],
      ]),
    ],
  };
}

async function acaoPagamento(pedido, env, ctx = null) {
  if (ctx ? ctx.liberado : pedidoEstaPago(pedido)) {
    const b = await acaoBaixar(pedido, env, { comPagamento: false, ctx });
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

async function acaoJaPaguei(pedido, env, ctx = null) {
  if (ctx ? ctx.liberado : pedidoEstaPago(pedido)) return acaoPagamento(pedido, env, ctx);
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

/**
 * Vídeo da homenagem: é gerado pelo próprio cliente, na página do pedido (escolhe as fotos e o vídeo
 * sai lá, com a música). O bot só manda o link certo, como o dono do estúdio faz no WhatsApp
 * (pedido de 25/11/2026). Se o vídeo ainda não estiver liberado, a própria página mostra como liberar.
 */
export function acaoVideo(pedido) {
  return {
    mensagens: [
      texto('O vídeo você faz direto na plataforma, na página do seu pedido. Lá você escolhe as fotos e o vídeo é gerado na hora, já com a sua música. 🎬 Pra trocar uma foto é o mesmo caminho: escolhe de novo e gera outra vez.'),
      { tipo: 'link', url: `/entrega?orderId=${encodeURIComponent(pedido.id)}`, titulo: 'Acessar meu pedido e fazer o vídeo' },
      texto('Se abrir dentro do WhatsApp e não deixar escolher as fotos, toque nos três pontinhos (⋮) e em *Abrir no navegador*.', [MENU[5], { id: 'menu', label: 'Voltar ao menu' }]),
    ],
  };
}

function exigeMusicaPaga(pedido, ctx) {
  if (!temAudio(pedido)) return [texto('Sua música ainda está sendo finalizada. Assim que ela ficar pronta, dá pra pedir ajuste por aqui.', MENU)];
  if (!(ctx ? ctx.liberado : pedidoEstaPago(pedido))) return [texto('O ajuste é pra música já paga, e seu pedido ainda está aguardando o pagamento. Quer resolver o pagamento primeiro?', [MENU[3], MENU[5]])];
  if (!pedido.lyrics) return [texto('Esse pedido precisa de um ajuste feito pela equipe. Toca aqui que eu te passo pra uma pessoa:', [MENU[5]])];
  return null;
}

function acaoRitmo(pedido, ctx, escolhido) {
  if (!escolhido) {
    const qual = escolherMusica(ctx, 'ritmo', 'Esse pedido tem duas músicas. Qual delas você quer mudar o ritmo?');
    if (qual) return qual;
  }
  const bloqueio = exigeMusicaPaga(pedido, ctx);
  if (bloqueio) return { mensagens: bloqueio };
  return {
    mensagens: [texto(`Bora! Pra qual ritmo você quer mudar? Cada ajuste custa ${reais(getPriceForSku(SKU_AJUSTE))} e a letra continua a mesma.`, [
      ...ESTILOS.map((e) => ({ id: `estilo:${e}`, label: e })),
      { id: 'ritmo_outro', label: 'Outro ritmo' },
    ])],
  };
}

async function cobrarAjuste(pedido, ajuste, env, abertura, ctx) {
  const r = await criarCobrancaAjuste(pedido, ajuste, env, { liberado: ctx?.liberado });
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

function acaoEstilo(pedido, estiloBruto, env, ctx, perguntar = false) {
  const estilo = limparEstilo(estiloBruto);
  if (perguntar) {
    const qual = escolherMusica(ctx, `estilo:${estilo}`, `Qual das duas músicas você quer em ${estilo}?`);
    if (qual) return qual;
  }
  const bloqueio = exigeMusicaPaga(pedido, ctx);
  if (bloqueio) return { mensagens: bloqueio };
  return cobrarAjuste(pedido, { tipo: 'ritmo', estilo }, env, `Fechado: vou gravar sua música em *${estilo}*, com a mesma letra.`, ctx);
}

function acaoLetra(pedido, ctx, escolhido) {
  if (!escolhido) {
    const qual = escolherMusica(ctx, 'letra', 'Esse pedido tem duas músicas. Qual letra você quer ajustar?');
    if (qual) return qual;
  }
  const bloqueio = exigeMusicaPaga(pedido, ctx);
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

async function proporLetra(pedido, instrucao, env, ctx) {
  const bloqueio = exigeMusicaPaga(pedido, ctx);
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
        { id: 'letra_mais', label: 'Quero mudar mais' },
        { id: 'menu', label: 'Deixa como está' },
      ]),
    ],
  };
}

function acaoLetraOk(pedido, env, ctx) {
  const bloqueio = exigeMusicaPaga(pedido, ctx);
  if (bloqueio) return { mensagens: bloqueio };
  return cobrarAjuste(pedido, { tipo: 'letra' }, env, 'Perfeito, vou gravar com a letra nova.', ctx);
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

// ---------- Texto livre ----------

// O Whisper "ouve" frases de legenda de vídeo em áudio mudo ou curtinho (achado 25/11/2026: um
// áudio de 2 s virou "Legendas pela comunidade do Amara.org"). Isso não é o cliente falando.
const ALUCINACOES = /amara\.org|legendas? pela comunidade|legenda(do)? por|obrigad[oa] por assistir|inscreva-se|ative o sininho|tchau,? tchau/i;

export function transcricaoValida(texto) {
  const t = String(texto || '').trim();
  return t.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 && !ALUCINACOES.test(t);
}

/**
 * O chat está esperando algo (Pix cair, música gravando) e o cliente escreve: a resposta é sobre
 * ISSO, não um menu do zero (achado 25/11/2026: "cadê, pedi pra mudar o ritmo" listou as músicas
 * antigas enquanto a nova ainda gravava).
 */
function respostaEnquantoEspera(pedido, aguardando, intencao) {
  if (intencao === 'FALAR_HUMANO') return null;
  if (aguardando.tipo === 'musica' || aguardando.tipo === 'musica_nova') {
    const estilo = aguardando.tipo === 'musica' && pedido.musicStyle ? ` em *${pedido.musicStyle}*` : '';
    const qual = aguardando.tipo === 'musica' ? `sua nova versão${estilo}` : 'sua música';
    return { mensagens: [texto(`Já tá gravando ${qual}! 🎙️ Costuma levar de 2 a 3 minutinhos. Assim que ficar pronta, ela aparece aqui sozinha, não precisa fazer nada.`, [MENU[5]])] };
  }
  if (aguardando.tipo === 'pagamento') {
    if (aguardando.kind === 'ajuste') {
      return { mensagens: [texto(`Ainda estou esperando o Pix de ${reais(getPriceForSku(SKU_AJUSTE))} cair. Assim que o banco confirmar, eu começo a gravar sozinho. Se já pagou, é só aguardar uns instantes aqui.`, [MENU[5]])] };
    }
    if (intencao === 'PAGUEI_NAO_LIBEROU') return null;
    return { mensagens: [texto('Ainda estou esperando o pagamento do Pix cair. Assim que o banco confirmar, eu libero sua música aqui.', [{ id: 'ja_paguei', label: 'Já paguei' }, MENU[5]])] };
  }
  return null;
}

async function interpretarTexto(pedido, mensagem, modo, env, aguardando, ctx) {
  const msg = String(mensagem || '').trim().slice(0, 1000);
  if (!msg) return { mensagens: [] };
  if (modo === 'letra') return proporLetra(pedido, msg, env, ctx);
  if (modo === 'ritmo') return acaoEstilo(pedido, msg, env, ctx);

  // Vídeo e fotos: quem faz é o próprio cliente, na página do pedido (achado 25/11/2026:
  // "só quero tirar uma foto que ficou errado" virava pedido de música nova).
  if (/\b(foto|fotos|v[ií]deo|v[ií]deos|capa|imagem|imagens|slide|slideshow)\b/i.test(msg)) return acaoVideo(pedido);

  const { intencao, detalhe } = await classificarIntencao(msg, {
    numero: pedido.orderNumber, orderId: pedido.id, pago: pedidoEstaPago(pedido), temMusica: temAudio(pedido), estilo: pedido.musicStyle,
  }, env);

  if (aguardando) {
    const r = respostaEnquantoEspera(pedido, aguardando, intencao);
    if (r) return r;
  }

  switch (intencao) {
    case 'CADE_MINHA_MUSICA': return acaoBaixar(pedido, env, { ctx });
    case 'PAGUEI_NAO_LIBEROU': return acaoJaPaguei(pedido, env, ctx);
    // Pedido com bônus: pergunta antes em qual música (a instrução de letra é repetida depois).
    case 'AJUSTAR_LETRA': return (detalhe && ctx.grupo.filter(temAudio).length < 2) ? proporLetra(pedido, detalhe, env, ctx) : acaoLetra(pedido, ctx, false);
    case 'TROCAR_ESTILO': return detalhe ? acaoEstilo(pedido, detalhe, env, ctx, true) : acaoRitmo(pedido, ctx, false);
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
export async function responderChat(pedido, entrada, env = {}) {
  const { acao, opcao } = entrada || {};
  // `escolhido`: a página já perguntou em qual música (principal ou bônus) e mudou para ela.
  const escolhido = Boolean(entrada?.escolhido);
  const ctx = await contextoDoPedido(pedido, env);
  if (acao === 'inicio') {
    // Mais de um pedido no número: quem volta pelo navegador (pedido lembrado, sem link) escolhe de
    // novo sobre qual quer falar; quem veio pelo link do pedido vê a saudação com a opção de trocar.
    const grupos = gruposDoNumero(ctx.lista);
    if (grupos.length > 1) {
      const lista = listaDePedidos(ctx.lista);
      if (entrada.listar) return { mensagens: [texto(`Oi${primeiroNome(pedido.customerName) ? `, ${primeiroNome(pedido.customerName)}` : ''}! Aqui é o suporte da NS Music.`), lista], escolherPedido: lista.opcoes };
      return { mensagens: saudacao(pedido, ctx), escolherPedido: lista.opcoes };
    }
    return { mensagens: saudacao(pedido, ctx) };
  }
  if (acao === 'texto') return interpretarTexto(pedido, entrada.texto, entrada.modo, env, entrada.aguardando || null, ctx);
  if (acao === 'comprovante') return ctx.liberado
    ? { mensagens: [texto('Recebi a imagem! Se ela é pra o vídeo da homenagem, as fotos são enviadas na página da sua música:'), { tipo: 'link', url: `/entrega?orderId=${encodeURIComponent(pedido.id)}`, titulo: 'Abrir a página da minha música' }, MAIS_ALGO] }
    : acaoJaPaguei(pedido, env, ctx);
  if (acao !== 'opcao') return { mensagens: [texto('Não entendi. Escolhe uma opção:', MENU)] };

  if (typeof opcao === 'string' && opcao.startsWith('estilo:')) return acaoEstilo(pedido, opcao.slice(7), env, ctx);
  switch (opcao) {
    case 'ritmo': return acaoRitmo(pedido, ctx, escolhido);
    case 'ritmo_outro': return { mensagens: [texto('Escreve aqui o ritmo que você quer (ex.: MPB, rock, reggae, bachata…).')], modo: 'ritmo' };
    case 'letra': return acaoLetra(pedido, ctx, escolhido);
    case 'letra_mais': return acaoLetra(pedido, ctx, true);
    case 'letra_ok': return acaoLetraOk(pedido, env, ctx);
    case 'baixar': return acaoBaixar(pedido, env, { ctx });
    case 'pagamento': return acaoPagamento(pedido, env, ctx);
    case 'ja_paguei': return acaoJaPaguei(pedido, env, ctx);
    case 'criar': return acaoCriar(pedido);
    case 'humano': return acaoHumano(pedido, env);
    case 'gostei': return { mensagens: [texto('Que bom que ficou do jeito que você queria! 💚'), ...agradecimento()] };
    case 'deu_certo': return { mensagens: [texto('Que bom que deu tudo certo! 💚'), ...agradecimento()] };
    case 'menu': return { mensagens: [MAIS_ALGO] };
    default: return { mensagens: [texto('Não entendi. Escolhe uma opção:', MENU)] };
  }
}

// ---------- Ferramentas do atendente com IA (src/lib/atendenteIA.js) ----------
//
// A IA escolhe O QUE fazer; quem faz são estas funções, as mesmas dos botões. Cobrança, conferência
// de pagamento e liberação continuam nelas — a IA não tem como pular nenhuma regra.

/** "principal" ou "bonus" → o pedido certo do grupo (só músicas com áudio). */
function musicaDoGrupo(ctx, qual) {
  const musicas = (ctx?.grupo || []).filter(temAudio);
  if (qual === 'bonus' && musicas.length > 1) return musicas[1];
  return musicas[0] || null;
}

/** Passo a passo para sair do navegador do WhatsApp, conforme o celular do cliente. */
export function ensinarNavegador({ dispositivo = '', urlAtual = '' } = {}) {
  if (dispositivo === 'ios') {
    return [
      texto('Isso acontece porque o link abriu dentro do WhatsApp, que às vezes não deixa ouvir nem baixar. No iPhone é rapidinho:\n\n1️⃣ Toque nos três pontinhos *⋯* (ou no ícone de compartilhar) no canto da tela\n2️⃣ Escolha *Abrir no Safari* (ou "Abrir no navegador")\n3️⃣ A página abre no Safari e aí é só tocar na música de novo'),
      texto('Conseguiu? Se não der certo, uma pessoa da equipe te ajuda.', [{ id: 'txt:Consegui!', label: 'Consegui!' }, MENU[5]]),
    ];
  }
  const msgs = [
    texto('Isso acontece porque o link abriu dentro do WhatsApp, que às vezes não deixa ouvir nem baixar. É só abrir no Chrome:\n\n1️⃣ Toque nos três pontinhos *⋮* no canto de cima da tela\n2️⃣ Escolha *Abrir no Chrome* (ou "Abrir no navegador")\n3️⃣ A página abre no Chrome e aí é só tocar na música de novo'),
  ];
  // Android: o link intent:// pede para o sistema abrir esta mesma página no navegador de verdade.
  if (/^https:\/\//.test(urlAtual)) {
    msgs.push({ tipo: 'link', url: `intent://${urlAtual.replace(/^https:\/\//, '')}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(urlAtual)};end`, titulo: 'Abrir no Chrome' });
  }
  msgs.push(texto('Conseguiu? Se não der certo, uma pessoa da equipe te ajuda.', [{ id: 'txt:Consegui!', label: 'Consegui!' }, MENU[5]]));
  return msgs;
}

export const FERRAMENTAS_COM_PEDIDO = new Set([
  'enviar_musicas', 'conferir_pagamento', 'pagar_pedido', 'trocar_ritmo', 'ajustar_letra',
  'gravar_letra_ajustada', 'fazer_video', 'link_fotos', 'oferecer_bonus',
]);

/**
 * Executa uma ferramenta de AÇÃO e devolve o que mostrar ao cliente (mesmo formato de responderChat).
 * @returns {Promise<{mensagens: object[], modo?, aguardar?, gerarPix?, orderId?}|{erro: string}>}
 */
export async function executarFerramenta(nome, args = {}, { pedido = null, ctx = null, dispositivo = '', urlAtual = '' } = {}, env = {}) {
  if (FERRAMENTAS_COM_PEDIDO.has(nome) && !pedido) return { erro: 'sem_pedido_aberto' };
  const a = args && typeof args === 'object' ? args : {};

  switch (nome) {
    case 'enviar_musicas': return acaoBaixar(pedido, env, { ctx });
    case 'conferir_pagamento': return acaoJaPaguei(pedido, env, ctx);
    case 'pagar_pedido': return acaoPagamento(pedido, env, ctx);
    case 'fazer_video':
    case 'link_fotos': return acaoVideo(pedido);
    case 'oferecer_bonus': return acaoCriar(pedido);
    case 'trocar_ritmo':
    case 'ajustar_letra':
    case 'gravar_letra_ajustada': {
      const alvo = musicaDoGrupo(ctx, a.musica === 'bonus' ? 'bonus' : 'principal') || pedido;
      const ctxAlvo = alvo.id === pedido.id ? ctx : await contextoDoPedido(alvo, env);
      let r;
      if (nome === 'trocar_ritmo') {
        const estilo = limparEstilo(a.estilo);
        r = estilo.length >= 3 ? await acaoEstilo(alvo, estilo, env, ctxAlvo) : acaoRitmo(alvo, ctxAlvo, true);
      } else if (nome === 'ajustar_letra') {
        const instrucao = String(a.instrucao || '').trim();
        r = instrucao ? await proporLetra(alvo, instrucao, env, ctxAlvo) : acaoLetra(alvo, ctxAlvo, true);
      } else {
        r = await acaoLetraOk(alvo, env, ctxAlvo);
      }
      return { ...r, orderId: alvo.id };
    }
    case 'ensinar_navegador': return { mensagens: ensinarNavegador({ dispositivo, urlAtual }) };
    case 'chamar_atendente': {
      if (pedido) return acaoHumano(pedido, env, String(a.motivo || '').slice(0, 300));
      return { mensagens: [
        texto('Claro! Toca no botão abaixo pra falar com uma pessoa da equipe.'),
        { tipo: 'whatsapp', url: await linkAtendente(null, env), titulo: 'Falar com atendente no WhatsApp' },
      ] };
    }
    case 'agradecer_cliente': return { mensagens: agradecimento() };
    case 'mostrar_menu': return { mensagens: [texto(String(a.texto || 'Como posso te ajudar?').slice(0, 300), MENU)] };
    default: return { erro: 'ferramenta_desconhecida' };
  }
}

/** Resumo do pedido aberto para a IA (sem telefone nem e-mail). */
export function resumoParaIA(pedido, ctx) {
  if (!pedido) return 'Nenhum pedido aberto nesta conversa.';
  const musicas = (ctx?.grupo || [pedido]).filter(temAudio);
  const linhas = [
    `Pedido aberto: ${pedido.orderNumber || pedido.id} · cliente: ${pedido.customerName || '—'} · homenageado(a): ${pedido.honoreeName || '—'}`,
    `Situação: ${ctx?.liberado ?? pedidoEstaPago(pedido) ? 'PAGO (liberado)' : temAudio(pedido) ? 'música pronta, AGUARDANDO PAGAMENTO' : 'música EM PRODUÇÃO'}`,
    `Músicas prontas neste pedido: ${musicas.length === 0 ? 'nenhuma ainda' : musicas.map((m, i) => `${i === 0 ? 'principal' : 'bônus'} (${m.musicStyle || 'estilo não informado'}${m.honoreeName ? `, para ${m.honoreeName}` : ''})`).join(' e ')}`,
    `Tem letra: ${pedido.lyrics ? 'sim' : 'não'} · música bônus ainda disponível: ${bonusDisponivel(pedido) ? 'sim' : 'não'}`,
  ];
  return linhas.join('\n');
}
