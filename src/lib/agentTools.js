import { getOrder, updateOrder } from './supabaseDb.js';
import { findRecentOrderByPhone } from './orderLookup.js';
import { resolveDeliveryUrl, buildAudioDownloadLink } from './whatsappTemplates.js';
import { getChargeStatus } from './efi.js';
import { readEnvValue } from './envValue.js';
import { applyPaymentApproval } from './payments.js';

// Ferramentas do atendente de WhatsApp: o que a IA pode REALMENTE fazer, em vez de só conversar.
//
// Motivo (pedido do dono do estúdio em 25/09/2026): "até agora não sinto confiança de usar ele pra
// nada". O agente só sabia coletar dados de pedido novo — não olhava quem estava falando nem
// resolvia nada. Na prática, a maior parte das mensagens é suporte de quem JÁ comprou: "paguei e
// não recebi", "cadê minha música", "quero mudar a letra".
//
// Cada função aqui é uma ação verificável, não uma resposta de texto. Regras que valem para todas:
//   - Nada é liberado por alegação do cliente. "Já paguei" dispara CONSULTA à Efí, nunca liberação
//     direta (regra 3 do CLAUDE.md e .claude/rules/payments.md).
//   - Retornam dados estruturados; quem escreve a mensagem é a camada de conversa.
//   - Nunca lançam: falha vira `{ ok: false, motivo }` para o agente responder algo honesto em vez
//     de quebrar a conversa.

/**
 * Quem é a pessoa do outro lado, e em que pé está o pedido dela.
 *
 * É a primeira coisa que o atendente precisa saber: sem isso ele responde no vácuo e pede dados que
 * já estão no banco.
 */
export async function carregarContextoDoCliente(phone, env = {}) {
  try {
    const pedido = await findRecentOrderByPhone(phone, env);
    if (!pedido) return { ok: true, temPedido: false };

    const pago = pedido.paymentStatus === 'PAGAMENTO_APROVADO' || pedido.paymentStatus === 'PAGO';
    const faixas = Array.isArray(pedido.audioFiles) ? pedido.audioFiles.filter(Boolean) : [];
    const temMusica = faixas.length > 0 || Boolean(pedido.audioUrl);

    return {
      ok: true,
      temPedido: true,
      pedido,
      resumo: {
        orderId: pedido.id,
        numero: pedido.orderNumber || null,
        cliente: pedido.customerName || null,
        homenageado: pedido.honoreeName || null,
        estilo: pedido.musicStyle || null,
        criadoEm: pedido.createdAt || null,
        pago,
        temMusica,
        totalFaixas: faixas.length,
        producao: pedido.productionStatus || null,
        temLetra: Boolean(pedido.lyrics),
        linkEntrega: resolveDeliveryUrl(pedido.id),
      },
    };
  } catch (err) {
    console.warn('[agentTools] Falha ao carregar contexto do cliente:', err.message);
    return { ok: false, motivo: 'falha_na_busca' };
  }
}

/**
 * "Já paguei e não liberou": consulta a cobrança na Efí AGORA e aplica a aprovação se ela estiver
 * paga de verdade.
 *
 * Nunca acredita no cliente: quem decide é a resposta do provedor nesta mesma requisição. A
 * gravação passa por applyPaymentApproval, o ponto único de aprovação do projeto — o agente não
 * escreve paymentStatus por conta própria (C-09 / payments.md).
 */
export async function conferirPagamento(pedido, env = {}) {
  if (!pedido?.id) return { ok: false, motivo: 'sem_pedido' };

  const jaPago = pedido.paymentStatus === 'PAGAMENTO_APROVADO' || pedido.paymentStatus === 'PAGO';
  if (jaPago) {
    return { ok: true, estado: 'ja_estava_pago', linkEntrega: resolveDeliveryUrl(pedido.id) };
  }

  const txid = pedido.paymentIntentId;
  if (!txid) return { ok: true, estado: 'sem_cobranca' };

  try {
    const cobranca = await getChargeStatus(txid, env);
    const status = String(cobranca?.status || '').toUpperCase();

    // CONCLUIDA é o status de pago na API Pix da Efí.
    if (status !== 'CONCLUIDA') {
      return { ok: true, estado: 'ainda_nao_pago', statusProvedor: status || 'desconhecido' };
    }

    const valor = Number(cobranca?.valor?.original || cobranca?.pix?.[0]?.valor || 0);
    const resultado = await applyPaymentApproval(pedido.id, txid, {
      status: 'approved',
      transaction_amount: valor,
    }, env);

    return {
      ok: true,
      estado: resultado.applied ? 'liberado_agora' : 'ja_estava_pago',
      linkEntrega: resolveDeliveryUrl(pedido.id),
    };
  } catch (err) {
    console.warn('[agentTools] Falha ao conferir pagamento na Efí:', err.message);
    return { ok: false, motivo: 'consulta_indisponivel' };
  }
}

/**
 * Links para o cliente ouvir e baixar. O caso mais comum do suporte: a pessoa pagou, a música está
 * pronta, e só falta o link chegar até ela.
 */
export function montarLinksDaMusica(pedido) {
  if (!pedido?.id) return { ok: false, motivo: 'sem_pedido' };

  const faixas = Array.isArray(pedido.audioFiles) && pedido.audioFiles.length
    ? pedido.audioFiles.filter(Boolean)
    : [pedido.audioUrl].filter(Boolean);

  if (faixas.length === 0) return { ok: true, temMusica: false, linkEntrega: resolveDeliveryUrl(pedido.id) };

  const nome = pedido.honoreeName ? String(pedido.honoreeName).replace(/[^\p{L}\p{N} _-]/gu, '').trim() : 'musica';
  const downloads = faixas.map((url, i) => buildAudioDownloadLink(url, `${nome || 'musica'}-versao-${i + 1}.mp3`));

  return {
    ok: true,
    temMusica: true,
    linkEntrega: resolveDeliveryUrl(pedido.id),
    downloads,
  };
}

/**
 * Ajuste de letra pedido pelo cliente.
 *
 * Só reescreve o texto e devolve para ele aprovar — NÃO regera música. Gerar áudio custa crédito e
 * o cliente frequentemente quer ver a letra antes; regerar direto queimaria dinheiro a cada pedido
 * de ajuste.
 */
export async function ajustarLetra(pedido, instrucao, env = {}) {
  if (!pedido?.id || !pedido?.lyrics) return { ok: false, motivo: 'sem_letra' };
  if (!instrucao?.trim()) return { ok: false, motivo: 'sem_instrucao' };

  try {
    const { runGeminiWithFailover } = await import('./gemini.js');

    const prompt = `Você é o compositor do estúdio. Abaixo está a letra atual de uma homenagem para ${pedido.honoreeName || 'alguém especial'}.

O cliente pediu este ajuste: "${instrucao}"

Reescreva a letra aplicando o pedido dele. Regras:
- Mantenha a estrutura de marcações ([Verse], [Chorus], etc.) e o idioma português do Brasil.
- Mude só o que o pedido exige; preserve o resto, inclusive os detalhes reais da história.
- Não invente fatos novos sobre as pessoas.
- Responda APENAS com a letra final, sem comentários.

LETRA ATUAL:
${pedido.lyrics}`;

    const nova = await runGeminiWithFailover(prompt, env);
    const letra = String(nova || '').trim();
    if (!letra || letra.length < 40) return { ok: false, motivo: 'resposta_invalida' };

    await updateOrder(pedido.id, {
      lyrics: letra,
      lyricsAjustadaEm: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, env);

    return { ok: true, letra };
  } catch (err) {
    console.warn('[agentTools] Falha ao ajustar letra:', err.message);
    return { ok: false, motivo: 'falha_na_ia' };
  }
}

// Número do dono do estúdio, para quando a conversa precisa de gente.
//
// Não é segredo (é o WhatsApp de atendimento), mas fica em variável de ambiente para não exigir
// deploy quando mudar — já aconteceu de o número principal ser suspenso e precisar trocar na hora.
const WHATSAPP_DONO_PADRAO = '5594991064043';

export function numeroDoDono(env = {}) {
  return readEnvValue(env, 'ADMIN_WHATSAPP') || WHATSAPP_DONO_PADRAO;
}

/**
 * Chama o dono quando a máquina não resolve.
 *
 * O caso que motivou isto (26/09/2026): o cliente afirma que pagou, a Efí responde que não há
 * pagamento, e aí não existe resposta automática correta — ou o dinheiro saiu e algo quebrou no
 * caminho, ou o cliente se confundiu. Nos dois casos quem resolve é uma pessoa, e ela precisa saber
 * ANTES do cliente reclamar de novo.
 *
 * Avisa UMA VEZ por pedido: o mesmo cliente insistindo não pode virar enxurrada no WhatsApp do dono.
 */
export async function avisarDono(pedido, motivo, env = {}) {
  if (!pedido?.id) return { ok: false, motivo: 'sem_pedido' };

  try {
    const { updateOrder } = await import('./supabaseDb.js');
    const { sendWApiTextMessage } = await import('./whatsapp.js');

    if (pedido.alertaDonoEnviadoEm) return { ok: true, estado: 'ja_avisado' };

    const numero = pedido.orderNumber || pedido.id;
    const cliente = pedido.customerName || 'Cliente';
    const telefone = pedido.customerPhone || '(sem telefone)';

    const texto = `⚠️ *Pagamento para conferir*\n\n`
      + `Pedido: ${numero}\n`
      + `Cliente: ${cliente}\n`
      + `WhatsApp: ${telefone}\n`
      + `Situação: ${motivo}\n\n`
      + `O cliente diz que pagou, mas a Efí não confirma. Precisa de conferência manual.`;

    await sendWApiTextMessage(numeroDoDono(env), texto, env);
    await updateOrder(pedido.id, { alertaDonoEnviadoEm: new Date().toISOString() }, env).catch(() => {});

    return { ok: true, estado: 'avisado' };
  } catch (err) {
    console.warn('[agentTools] Falha ao avisar o dono:', err.message);
    return { ok: false, motivo: 'falha_no_envio' };
  }
}

// Quantas vezes o atendente pode regerar a música do mesmo pedido. Cada geração custa crédito na
// Kie.ai e acontece ANTES de qualquer pagamento — sem teto, um cliente insatisfeito em laço custa
// dinheiro real a cada mensagem.
export const MAX_REGERACOES_PELO_BOT = 2;

/**
 * Regera a música — por mudança de estilo, ou depois de a letra ser ajustada e aprovada.
 */
export async function regerarMusica(pedido, { novoEstilo = null } = {}, env = {}) {
  if (!pedido?.id) return { ok: false, motivo: 'sem_pedido' };

  const jaRegerou = Number(pedido.regeracoesPeloBot) || 0;
  if (jaRegerou >= MAX_REGERACOES_PELO_BOT) {
    return { ok: false, motivo: 'limite_de_regeracoes' };
  }

  try {
    if (novoEstilo) {
      await updateOrder(pedido.id, { musicStyle: novoEstilo, updatedAt: new Date().toISOString() }, env);
    }

    // Relê o pedido para montar o payload com a letra/estilo já atualizados por este mesmo turno.
    const atual = (await getOrder(pedido.id, env)) || pedido;

    const { buildSunoPayload } = await import('./sunoPayload.js');
    const { requestSunoGeneration } = await import('./suno.js');

    const payload = buildSunoPayload(atual);
    const resultado = await requestSunoGeneration({
      orderId: pedido.id,
      prompt: payload.prompt,
      tags: payload.tags,
    }, env);

    if (!resultado.ok) return { ok: false, motivo: 'falha_na_geracao' };

    await updateOrder(pedido.id, {
      regeracoesPeloBot: jaRegerou + 1,
      productionStatus: 'GERANDO_AUDIO',
      updatedAt: new Date().toISOString(),
    }, env);

    return { ok: true, taskId: resultado.taskId, estilo: novoEstilo || atual.musicStyle || null };
  } catch (err) {
    console.warn('[agentTools] Falha ao regerar música:', err.message);
    return { ok: false, motivo: 'erro' };
  }
}
