// Chamada à Kie.ai para iniciar uma geração de música, mais a retentativa automática quando ela
// reporta falha definitiva. Extraído de api/suno/generate/route.js para ser reaproveitado em três
// pontos que precisam do mesmo comportamento: a rota que o cliente chama na hora de criar, o polling
// de status (retry em tempo real, enquanto o cliente ainda está na página) e a reconciliação por
// cron (retry para quem já fechou a aba) — ver docs/CODEBASE_MAP.md.
//
import { getOrder, updateOrder } from './supabaseDb.js';
import { saveTask, getTask } from './db.js';
import { buildSunoPayload } from './sunoPayload.js';
import { resolverSiteUrl } from './siteUrl.js';
import { readEnvValue } from './envValue.js';

// Provedores de geração suportados: Unifically (primário), Kie.ai (fallback) e Suno Local (robô desktop).
export const PROVIDER_KIE = 'kie';
export const PROVIDER_UNIFICALLY = 'unifically';
export const PROVIDER_SUNO_LOCAL = 'suno_local';

// A Kie.ai sinaliza a maioria dos erros com HTTP 200 e um `code` no corpo (429/430 = limite de
// taxa, 455 = manutenção, 500 = erro interno deles) — só olhar response.status não pegava esses
// casos e o retry abaixo nunca rodava para o modo de falha mais comum da API.
const TRANSIENT_KIE_CODES = new Set([429, 430, 455, 500, 501, 503]);
export function isTransientKieFailure(status, code) {
  if (status >= 500 || status === 429) return true;
  return code != null && TRANSIENT_KIE_CODES.has(Number(code));
}

// Tentativas automáticas de RETRY depois que a Kie.ai já reportou falha definitiva para uma tarefa
// (não confundir com as 3 tentativas de rede dentro de requestSunoGeneration, que cobrem timeout e
// erro transitório de UMA chamada). Cap baixo de propósito: uma letra/estilo rejeitado por política
// de conteúdo falha de forma idêntica em toda tentativa — sem limite, ficaria retentando pra sempre
// e queimando crédito à toa. Esgotado o limite, o pedido fica para reprocessamento manual no painel.
const MAX_AUTO_RETRIES = 3;

// Fidelidade ao estilo pedido pelo cliente — ver comentário no corpo da chamada, requestSunoGeneration.
// Valores altos de estilo + baixos de estranheza favorecem o pedido do cliente sobre a "criatividade"
// da IA; ajuste aqui se o resultado ficar genérico/repetitivo demais pro gosto do estúdio.
const STYLE_WEIGHT = 0.75;
const WEIRDNESS_CONSTRAINT = 0.2;
// Pages encerra a requisição antes de completar a antiga combinação de 3 timeouts de 15 s.
// Duas tentativas de 10 s ainda cobrem uma oscilação transitória da Kie.ai e deixam margem para
// Firestore e serialização da resposta JSON voltarem ao cliente.
const MAX_KIE_ATTEMPTS = 2;
const KIE_REQUEST_TIMEOUT_MS = 10000;

// Reexportado de ./envValue.js — vários módulos já importavam daqui antes da extração.
export { readEnvValue };

// Grava no pedido que a geração falhou, para o admin ver o motivo e reprocessar em lote — sem isso
// o pedido só fica preso em EM_PRODUCAO/LETRA_CRIADA/GERANDO_AUDIO sem nenhum rastro do que aconteceu.
export async function recordSunoFailure(orderId, reason, env = {}) {
  if (!orderId) return;
  const nowIso = new Date().toISOString();
  try {
    const existing = await getOrder(orderId, env);
    const sunoErrorCount = (Number(existing?.sunoErrorCount) || 0) + 1;
    await updateOrder(orderId, {
      sunoError: reason,
      sunoErrorAt: nowIso,
      sunoErrorCount,
      updatedAt: nowIso
    }, env);
  } catch (err) {
    console.error('[suno] Erro ao registrar falha de geração no pedido:', err.message);
  }
}

/**
 * Determina o provedor principal de geração:
 * 1. Configuração dinâmica no banco (tabela config, editável no painel admin sem deploy)
 * 2. Variável de ambiente SUNO_PRIMARY_PROVIDER ('kie', 'unifically' ou 'suno_local')
 * 3. Default: 'unifically' se UNIFICALLY_API_KEY existir, senão 'kie'
 */
export async function resolvePrimaryProvider(env = {}) {
  try {
    const { lerConfigSite } = await import('./configSite.js');
    const cfg = await lerConfigSite(env);
    if (cfg?.sunoPrimaryProvider === PROVIDER_KIE || cfg?.sunoPrimaryProvider === PROVIDER_UNIFICALLY || cfg?.sunoPrimaryProvider === PROVIDER_SUNO_LOCAL) {
      return cfg.sunoPrimaryProvider;
    }
  } catch (e) {
    // Falha silenciosa em ambientes sem tabela config / testes
  }

  const envPrimary = String(readEnvValue(env, 'SUNO_PRIMARY_PROVIDER') || '').toLowerCase().trim();
  if (envPrimary === PROVIDER_KIE || envPrimary === PROVIDER_UNIFICALLY || envPrimary === PROVIDER_SUNO_LOCAL) {
    return envPrimary;
  }

  const unificallyKey = readEnvValue(env, 'UNIFICALLY_API_KEY');
  return unificallyKey ? PROVIDER_UNIFICALLY : PROVIDER_KIE;
}

/**
 * Inicia a geração da música. Respeita o provedor primário configurado (Suno Local, Unifically ou Kie.ai)
 * com failover automático transparente para o provedor secundário em caso de erro (ex: falta de créditos,
 * timeout, erro 4xx/5xx).
 *
 * @param {{orderId: string, prompt: string, tags: string, preferredProvider?: string}} params
 * @param {object} env
 * @returns {Promise<{ok: true, taskId: string, provider: string} | {ok: false, error: string, status: number}>}
 */
export async function requestSunoGeneration({ orderId, prompt, tags, preferredProvider = null }, env = {}) {
  const unificallyKey = readEnvValue(env, 'UNIFICALLY_API_KEY');
  const kieKey = readEnvValue(env, 'KIE_API_KEY');

  // Verifica se o pedido utiliza voz personalizada do cliente (clonagem de timbre)
  let isCustomVoiceOrder = false;
  if (orderId) {
    try {
      const order = await getOrder(orderId, env);
      if (
        order?.isCustomVoice ||
        order?.voiceType === 'minha_voz' ||
        order?.customVoiceId ||
        order?.extras?.isCustomVoice ||
        order?.extras?.customVoiceId
      ) {
        isCustomVoiceOrder = true;
      }
    } catch (e) {}
  }

  const primary = preferredProvider || await resolvePrimaryProvider(env);

  // Se o pedido requer voz clonada do cliente e o provedor seria o robô local (suno_local),
  // desvia obrigatoriamente para a Kie.ai, que é a única com suporte ao motor de persona/clonagem.
  let effectivePrimary = (isCustomVoiceOrder && primary === PROVIDER_SUNO_LOCAL)
    ? PROVIDER_KIE
    : primary;

  // Se o provedor for o robô local, verifica se ele já está ocupado gerando outra música.
  // Se estiver ocupado, desvia o novo pedido imediatamente para a Kie.ai para não formar fila.
  if (effectivePrimary === PROVIDER_SUNO_LOCAL) {
    try {
      const { getSupabaseEdge } = await import('./supabase-edge.js');
      const supabase = getSupabaseEdge(env);
      if (supabase) {
        // 1. Verifica pedidos ativos no robô nos últimos 4 minutos
        const { data: ocupados } = await supabase
          .from('orders')
          .select('id, suno_requested_at, extras')
          .eq('suno_provider', PROVIDER_SUNO_LOCAL)
          .eq('production_status', 'GERANDO_AUDIO')
          .neq('id', orderId || '')
          .limit(1);

        if (ocupados && ocupados.length > 0) {
          const outro = ocupados[0];
          const inicio = outro.suno_requested_at || outro.extras?.robo_iniciado_em;
          const decorridoMs = inicio ? Date.now() - new Date(inicio).getTime() : 0;
          if (!inicio || decorridoMs < 240000) {
            console.log(`[suno] ⚡ Robô local ocupado gerando pedido #${outro.id.substring(0, 8)}. Desviando novo pedido #${orderId ? orderId.substring(0, 8) : ''} imediatamente para Kie.ai.`);
            effectivePrimary = PROVIDER_KIE;
          }
        }

        // 2. Verifica se o heartbeat do robô está marcado como 'busy'
        if (effectivePrimary === PROVIDER_SUNO_LOCAL) {
          const { data: hb } = await supabase
            .from('config')
            .select('valor')
            .eq('chave', 'suno_worker_heartbeat')
            .maybeSingle();

          if (hb?.valor?.status === 'busy') {
            const lastSeen = hb.valor.last_seen;
            const diffMs = lastSeen ? Date.now() - new Date(lastSeen).getTime() : 0;
            if (diffMs < 180000) {
              console.log(`[suno] ⚡ Heartbeat do robô local acusa 'busy'. Desviando pedido #${orderId ? orderId.substring(0, 8) : ''} para Kie.ai.`);
              effectivePrimary = PROVIDER_KIE;
            }
          }
        }
      }
    } catch (checkBusyErr) {
      console.warn('[suno] Falha ao verificar disponibilidade do robô local:', checkBusyErr.message);
    }
  }

  const fallback = effectivePrimary === PROVIDER_SUNO_LOCAL ? PROVIDER_KIE : (effectivePrimary === PROVIDER_UNIFICALLY ? PROVIDER_KIE : PROVIDER_UNIFICALLY);
  const hasFallback = fallback === PROVIDER_UNIFICALLY ? Boolean(unificallyKey) : Boolean(kieKey);

  const tentarProvedor = async (prov) => {
    if (prov === PROVIDER_SUNO_LOCAL) {
      return gerarPeloWorkerLocal({ orderId, prompt, tags }, env);
    }
    if (prov === PROVIDER_UNIFICALLY) {
      if (!unificallyKey) {
        return { ok: false, error: 'Configuração ausente: UNIFICALLY_API_KEY não definida no servidor.', status: 500 };
      }
      return gerarPelaUnifically({ orderId, prompt, tags }, env);
    }
    if (prov === PROVIDER_KIE) {
      if (!kieKey) {
        return { ok: false, error: 'Configuração ausente: KIE_API_KEY não definida no servidor.', status: 500 };
      }
      return gerarPelaKie({ orderId, prompt, tags }, env);
    }
    return { ok: false, error: `Provedor desconhecido: ${prov}`, status: 400 };
  };

  // 1. Tenta o provedor principal (ou o explicitamente requisitado)
  const resultPrimario = await tentarProvedor(effectivePrimary);
  if (resultPrimario.ok) {
    return resultPrimario;
  }

  // Se não houver fallback configurado, encerra com o resultado primário
  if (!hasFallback) {
    return resultPrimario;
  }

  // Se o provedor principal falhou (ex: 402 sem crédito, erro de autenticação, timeout, 5xx):
  console.warn(`[suno] Provedor principal (${effectivePrimary}) falhou (${resultPrimario.error || resultPrimario.status}). Iniciando fallback automático para ${fallback}...`);
  await recordSunoFailure(orderId, `${effectivePrimary}_failover_to_${fallback}_${resultPrimario.status || 'unknown'}`, env);

  // 2. Aciona o fallback se as chaves estiverem disponíveis
  const resultFallback = await tentarProvedor(fallback);
  if (resultFallback.ok) {
    return resultFallback;
  }

  console.error(`[suno] Provedor de fallback (${fallback}) também falhou:`, resultFallback.error);
  return resultPrimario;
}

/**
 * Grava o vínculo tarefa->pedido das duas pontas (suno_tasks e orders) — o resto do sistema
 * (webhook, polling, reconciliação, arquivamento) lê sempre daqui, nunca do provedor.
 */
async function persistirGeracao({ orderId, taskId, provider }, env = {}) {
  const salvo = await saveTask(taskId, 'PROCESSING', null, orderId, { provider }, env);
  if (!salvo) {
    await recordSunoFailure(orderId, 'save_task_failed', env);
    return { ok: false, error: 'A geração foi iniciada, mas houve uma falha ao registrar o pedido. A equipe será notificada.', status: 502 };
  }

  if (orderId) {
    const nowIso = new Date().toISOString();
    try {
      const existing = await getOrder(orderId, env);
      const sunoGenerationCount = (Number(existing?.sunoGenerationCount) || 0) + 1;
      await updateOrder(orderId, {
        productionStatus: 'GERANDO_AUDIO',
        sunoRequestedAt: nowIso,
        sunoError: null,
        sunoTaskId: taskId,
        sunoProvider: provider,
        sunoGenerationCount,
        updatedAt: nowIso,
      }, env);
    } catch (err) {
      console.error('[suno] Erro ao atualizar status do pedido para GERANDO_AUDIO:', err.message);
      await recordSunoFailure(orderId, 'order_update_failed', env);
      return { ok: false, error: 'A geração foi iniciada, mas houve uma falha ao registrar o pedido. A equipe será notificada.', status: 502 };
    }
  }

  return { ok: true };
}

async function gerarPeloWorkerLocal({ orderId, prompt, tags }, env = {}) {
  const taskId = `suno_local_${orderId || Date.now()}`;
  const pers = await persistirGeracao({ orderId, taskId, provider: PROVIDER_SUNO_LOCAL }, env);
  if (!pers.ok) return pers;

  if (orderId) {
    try {
      await updateOrder(orderId, {
        sunoProvider: PROVIDER_SUNO_LOCAL,
        status_robo: 'PENDENTE',
        sunoError: null,
      }, env);
    } catch (e) {}
  }

  return { ok: true, taskId, provider: PROVIDER_SUNO_LOCAL };
}

async function gerarPelaUnifically({ orderId, prompt, tags }, env) {
  const apiKey = readEnvValue(env, 'UNIFICALLY_API_KEY');
  if (!apiKey) {
    return { ok: false, error: 'Configuração ausente: UNIFICALLY_API_KEY não definida no servidor.', status: 500 };
  }

  const baseUrl = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));
  const callbackUrl = `${baseUrl}/api/suno/webhook?provider=unifically`;
  const modelVersion = readEnvValue(env, 'UNIFICALLY_SUNO_MODEL') || 'chirp-hawk';

  let response, data;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await fetch('https://api.unifically.com/v1/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'suno-ai/music',
          callback_url: callbackUrl,
          input: {
            mv: modelVersion,
            custom: true,
            prompt: prompt,
            tags: tags,
            title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`.substring(0, 80),
            make_instrumental: false
          }
        }),
        signal: AbortSignal.timeout(10000)
      });

      data = await response.json().catch(() => ({}));
      if (response.ok && (data.code === 200 || data.success === true || data.data?.task_id || data.data?.taskId)) {
        break;
      }

      console.warn(`[suno] Tentativa ${attempt}/2 Unifically falhou:`, response.status, data);
      if (response.status < 500 && response.status !== 429) {
        // Erro não transitório (ex: 400 bad request, 401 unauth, 402 no balance)
        break;
      }
    } catch (fetchErr) {
      console.warn(`[suno] Falha de rede ao chamar Unifically (tentativa ${attempt}/2):`, fetchErr.message);
      response = null;
      data = { msg: fetchErr.message };
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  const taskId = data?.data?.task_id || data?.data?.taskId || data?.task_id || data?.taskId || data?.id;
  if (!response?.ok || !taskId) {
    const errorMsg = data?.data?.message || data?.error_message || data?.message || data?.msg || `HTTP ${response?.status || 'network'}`;
    console.error('[suno] Erro no retorno da Unifically:', response?.status, errorMsg);
    return { ok: false, error: errorMsg, status: response?.status || 502 };
  }

  const persistido = await persistirGeracao({ orderId, taskId, provider: PROVIDER_UNIFICALLY }, env);
  if (!persistido.ok) return persistido;

  return { ok: true, taskId, provider: PROVIDER_UNIFICALLY };
}

async function gerarPelaKie({ orderId, prompt, tags }, env) {
  const apiKey = readEnvValue(env, 'KIE_API_KEY');
  if (!apiKey) {
    console.error('[suno] Variável de ambiente KIE_API_KEY não configurada.');
    return { ok: false, error: 'Configuração ausente: KIE_API_KEY não definida no servidor.', status: 500 };
  }

  // Garante a URL do webhook no domínio oficial de produção (ver src/lib/siteUrl.js).
  const baseUrl = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));

  // Segredo compartilhado no callback: /api/suno/webhook confere este valor antes de processar
  // (ver A-03 no AUDIT_REPORT.md — o webhook não tinha nenhuma autenticação).
  const webhookSecret = readEnvValue(env, 'KIE_WEBHOOK_SECRET');
  const callbackUrl = webhookSecret
    ? `${baseUrl}/api/suno/webhook?secret=${encodeURIComponent(webhookSecret)}`
    : `${baseUrl}/api/suno/webhook`;

  // Suporte a voz personalizada do cliente (timbre clonado)
  let voicePayload = {};
  if (orderId) {
    try {
      const order = await getOrder(orderId, env);
      const vId = order?.customVoiceId;
      if (vId && (order?.isCustomVoice || order?.voiceType === 'minha_voz')) {
        voicePayload = {
          personaId: vId,
          voiceId: vId,
          persona_id: vId,
          persona_model: 'voice_persona',
          account_id: '70147233',
          accountId: '70147233',
          suno_user_id: '70147233',
          persona_voice_user_id: 70147233,
          voice_record: 'b4fa71e2-b681-4b1c-97f7-812a9ed0effa',
          voice_record_id: 'b4fa71e2-b681-4b1c-97f7-812a9ed0effa',
          voice_recording_id: 'b4fa71e2-b681-4b1c-97f7-812a9ed0effa',
        };
      }
    } catch (e) {
      console.warn('[suno] Não foi possível verificar customVoiceId do pedido:', e.message);
    }
  }

  // Uma tentativa extra para erros transitórios (timeout, falha de rede, 5xx). Erros
  // definitivos (4xx, ex: payload ou chave inválida) não são reexecutados. Cada tentativa cria
  // seu PRÓPRIO AbortSignal.timeout — reaproveitar o mesmo sinal entre tentativas faria as
  // tentativas seguintes abortarem na hora, já que o relógio do sinal conta a partir da criação.
  let response, data;
  for (let attempt = 1; attempt <= MAX_KIE_ATTEMPTS; attempt++) {
    try {
      response = await fetch('https://api.kie.ai/api/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          prompt: prompt,
          customMode: true,
          instrumental: false,
          model: readEnvValue(env, 'SUNO_MODEL') || 'V6',
          style: tags,
          title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`.substring(0, 80),
          callBackUrl: callbackUrl,
          // Sem esses dois campos, a Kie.ai decide sozinha (default não documentado) — explica cliente
          // pedir um estilo e a música sair "torta" (achado 28/08/2026). styleWeight alto = mais fiel
          // ao estilo pedido; weirdnessConstraint baixo = MENOS desvio criativo (documentação da
          // Kie.ai: valor alto em weirdnessConstraint é mais estranho/experimental, não o contrário).
          styleWeight: STYLE_WEIGHT,
          weirdnessConstraint: WEIRDNESS_CONSTRAINT,
          ...voicePayload
        }),
        signal: AbortSignal.timeout(KIE_REQUEST_TIMEOUT_MS)
      });

      data = await response.json().catch(() => ({}));

      if (response.ok && (!data.code || data.code === 200)) break;

      if (!isTransientKieFailure(response.status, data.code)) break;
      console.warn(`[suno] Erro transitório da Kie.ai (tentativa ${attempt}/${MAX_KIE_ATTEMPTS}):`, response.status, data.code);
    } catch (fetchErr) {
      console.warn(`[suno] Falha de rede ao chamar Kie.ai (tentativa ${attempt}/${MAX_KIE_ATTEMPTS}):`, fetchErr.message);
      response = null;
      data = { msg: fetchErr.message };
    }
    if (attempt < MAX_KIE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  // Mensagem ao cliente nunca ecoa o texto bruto do provedor externo (ver .claude/rules/security.md)
  // — o motivo detalhado fica só no log do servidor e no campo sunoError do pedido, para o admin.
  if (!response || !response.ok || (data.code && data.code !== 200)) {
    console.error('[suno] Erro no retorno da Kie.ai:', response?.status, data?.code, data?.msg || data?.message);
    await recordSunoFailure(orderId, `kie_${data?.code || response?.status || 'network'}`);
    return { ok: false, error: 'Não foi possível iniciar a geração da música agora. Tente novamente em instantes.', status: 502 };
  }

  const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.task_id || data?.id;
  if (!taskId) {
    console.error('[suno] Kie.ai não retornou um taskId válido:', data);
    await recordSunoFailure(orderId, 'kie_no_taskid');
    return { ok: false, error: 'A geração da música não pôde ser confirmada. Tente novamente em instantes.', status: 502 };
  }

  // sunoTaskId guardado aqui também permite a separação vocal do add-on de playback: a Kie.ai
  // identifica a faixa por taskId+audioId da geração original (ver src/lib/playback.js).
  // sunoGenerationCount conta cada chamada que o provedor de fato aceitou (e portanto cobrou),
  // para o painel admin estimar gasto; increment() sobrevive a retentativas concorrentes.
  const persistido = await persistirGeracao({ orderId, taskId, provider: PROVIDER_KIE }, env);
  if (!persistido.ok) return persistido;

  return { ok: true, taskId, provider: PROVIDER_KIE };
}

// Segue a cadeia de retentativas automáticas até a tarefa mais recente. Uma tarefa que falhou e foi
// automaticamente reenviada (ver maybeAutoRetrySunoFailure) grava o novo taskId em
// suno_tasks/{taskId}.retryTaskId — isso permite que quem já estava consultando o taskId ANTIGO
// (o navegador do cliente, fazendo polling; ou suno_tasks encontrado via orderId pela reconciliação)
// acabe olhando para o resultado certo sem precisar saber que uma nova tarefa foi criada.
//
// Limitado a poucos saltos: o cap de MAX_AUTO_RETRIES já impede cadeias longas de acontecer de
// verdade; o limite aqui é só para nunca entrar em loop se algum bug de auto-referência escapar.
export async function resolveLatestTaskId(taskId, env = {}) {
  let current = taskId;
  for (let hop = 0; hop < MAX_AUTO_RETRIES + 1; hop++) {
    const task = await getTask(current, env);
    if (task?.retryTaskId) {
      current = task.retryTaskId;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Reage a uma falha definitiva ou timeout reportado por um provedor (Kie.ai ou Unifically) para `taskId`,
 * retentando automaticamente com o provedor secundário (fallback) quando ainda há orçamento de tentativas.
 *
 * Idempotente por reserva sequencial (getDoc + updateDoc, o mesmo padrão usado em
 * src/lib/payments.js): evita que polling do cliente e cron de reconciliação disparem duas
 * retentativas para a mesma falha ao colidir na mesma janela de tempo.
 *
 * @param {{taskId: string, orderId: string, env: object, reason: string, preferredProvider?: string}} params
 * @returns {Promise<{retried: true, newTaskId: string} | {retried: false, reason: string}>}
 */
export async function maybeAutoRetrySunoFailure({ taskId, orderId, env = {}, reason, preferredProvider = null }) {
  if (!orderId) return { retried: false, reason: 'sem_order_id' };

  let orderData;
  try {
    orderData = await getOrder(orderId, env);
    if (!orderData) return { retried: false, reason: 'pedido_nao_encontrado' };
  } catch (err) {
    console.warn('[suno] Falha ao ler pedido para decidir retentativa:', err.message);
    return { retried: false, reason: 'falha_leitura_pedido' };
  }

  // Já convergiu por outra via (webhook chegou, ou outra chamada já resolveu) — nada a fazer.
  if (orderData.productionStatus !== 'GERANDO_AUDIO') {
    return { retried: false, reason: 'ja_resolvido' };
  }

  const retriesUsados = Number(orderData.sunoAutoRetryCount) || 0;
  if (retriesUsados >= MAX_AUTO_RETRIES) {
    await recordSunoFailure(orderId, `falhou_${reason}_limite_retry_esgotado`, env);
    return { retried: false, reason: 'limite_esgotado' };
  }

  // Reserva sequencial: evita que polling do cliente e cron de reconciliação disparem duas
  // retentativas para a mesma falha ao colidir na mesma janela de tempo.
  try {
    const freshData = await getOrder(orderId, env);
    if (!freshData || freshData.sunoRetryReserved || freshData.productionStatus !== 'GERANDO_AUDIO') {
      return { retried: false, reason: 'reservado_por_outra_chamada' };
    }
    await updateOrder(orderId, { sunoRetryReserved: true, updatedAt: new Date().toISOString() }, env);
  } catch (err) {
    console.warn('[suno] Falha ao reservar retentativa automática:', err.message);
    return { retried: false, reason: 'falha_reserva' };
  }

  const payload = buildSunoPayload(orderData);
  if (!payload.prompt?.trim() || !payload.tags?.trim()) {
    await updateOrder(orderId, { sunoRetryReserved: false, updatedAt: new Date().toISOString() }, env).catch(() => {});
    await recordSunoFailure(orderId, `falhou_${reason}_sem_dados_para_retry`, env);
    return { retried: false, reason: 'payload_incompleto' };
  }

  // Determina o provedor de destino da retentativa:
  // Se a falha foi na Unifically, vai para Kie.ai; se foi na Kie.ai e há Unifically configurada, tenta Unifically.
  let targetProvider = preferredProvider;
  if (!targetProvider) {
    try {
      const failedTask = await getTask(taskId, env);
      if (failedTask?.provider === PROVIDER_UNIFICALLY) {
        targetProvider = PROVIDER_KIE;
      } else if (failedTask?.provider === PROVIDER_KIE) {
        const unifKey = readEnvValue(env, 'UNIFICALLY_API_KEY');
        targetProvider = unifKey ? PROVIDER_UNIFICALLY : PROVIDER_KIE;
      }
    } catch (e) {
      // Fallback para inspeção da string do motivo
    }
  }

  if (!targetProvider) {
    const reasonLower = String(reason || '').toLowerCase();
    if (reasonLower.includes('unifically') || reasonLower.includes('upstream error')) {
      targetProvider = PROVIDER_KIE;
    } else if (reasonLower.includes('kie')) {
      const unifKey = readEnvValue(env, 'UNIFICALLY_API_KEY');
      targetProvider = unifKey ? PROVIDER_UNIFICALLY : PROVIDER_KIE;
    }
  }

  const result = await requestSunoGeneration({
    orderId,
    prompt: payload.prompt,
    tags: payload.tags,
    preferredProvider: targetProvider
  }, env);

  if (!result.ok) {
    await updateOrder(orderId, { sunoRetryReserved: false, updatedAt: new Date().toISOString() }, env).catch(() => {});
    return { retried: false, reason: 'nova_tentativa_falhou' };
  }

  try {
    const { getSupabaseEdge } = await import('./supabase-edge.js');
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      await supabase.from('suno_tasks').update({
        retry_task_id: result.taskId,
        updated_at: new Date().toISOString()
      }).eq('id', taskId);
    }
  } catch (err) {
    console.warn('[suno] Falha ao encadear taskId de retentativa:', err.message);
  }

  const autoRetryCount = (Number(orderData.sunoAutoRetryCount) || 0) + 1;
  await updateOrder(orderId, {
    sunoAutoRetryCount: autoRetryCount,
    sunoRetryReserved: false,
    updatedAt: new Date().toISOString(),
  }, env).catch((err) => console.warn('[suno] Falha ao atualizar contador de retentativas:', err.message));

  return { retried: true, newTaskId: result.taskId };
}
