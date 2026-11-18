// Canal OFICIAL (WhatsApp Cloud API, da Meta) para o robô do número ADM.
//
// Por que existe: o robô do ADM falava pela Evolution (conexão por QR code, não oficial). Em
// 17/11/2026 o WhatsApp restringiu o número ("atividade pode caracterizar mensagens automáticas") no
// meio de um envio de MP3 e áudio. Pela API oficial o robô responde sem esse risco.
//
// Como o número continua no app WhatsApp Business (coexistência), o dono segue atendendo pelo celular.
//
// Regra da Meta que este uso respeita: o cliente escreve primeiro ("3"), o que abre uma janela de 24 h
// em que a empresa pode mandar texto livre, áudio e documento SEM template. O robô só responde dentro
// dessa janela. (Mensagem iniciada por nós, fora da janela, exigiria template — não é o caso aqui.)
//
// Ativação: basta definir WHATSAPP_ADM_PHONE_NUMBER_ID. Sem ela, o ADM continua pela Evolution.

const GRAPH_VERSION = 'v21.0';

function lerEnv(env, nome) {
  return String((env && env[nome]) || process.env[nome] || '').trim();
}

/** Configuração do canal oficial do ADM, ou null se não estiver ativado. */
export function configCloudAdm(env = {}) {
  const phoneNumberId = lerEnv(env, 'WHATSAPP_ADM_PHONE_NUMBER_ID');
  // O mesmo token do número de disparo serve quando os dois números estão na mesma conta da Meta.
  const token = lerEnv(env, 'WHATSAPP_ADM_ACCESS_TOKEN') || lerEnv(env, 'WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberId || !token) return null;
  return { tipo: 'cloud', phoneNumberId, token };
}

function somenteDigitos(numero) {
  return String(numero || '').split('@')[0].replace(/\D/g, '');
}

async function chamarCloud(cloud, caminho, { method = 'POST', corpo, timeoutMs = 20000 } = {}) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${caminho}`, {
    method,
    headers: { Authorization: `Bearer ${cloud.token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // Só o código do erro: a mensagem da Meta pode citar o número do cliente.
    console.warn('[whatsapp-adm/cloud] A Meta recusou o envio:', res.status, json?.error?.code || '');
  }
  return { ok: res.ok, status: res.status, json };
}

function enviarMensagem(cloud, numero, tipo, conteudo, timeoutMs) {
  return chamarCloud(cloud, `${cloud.phoneNumberId}/messages`, {
    corpo: { messaging_product: 'whatsapp', recipient_type: 'individual', to: somenteDigitos(numero), type: tipo, [tipo]: conteudo },
    timeoutMs,
  });
}

export async function enviarTextoCloud(cloud, numero, texto) {
  const r = await enviarMensagem(cloud, numero, 'text', { body: String(texto).slice(0, 4000), preview_url: false });
  return r.ok;
}

/**
 * Manda a música como áudio tocável (audio/mpeg). A Meta não aceita MP3 como "documento", então o
 * áudio é o único formato: o cliente toca na conversa, baixa e encaminha.
 */
export async function enviarAudioCloud(cloud, numero, arquivo) {
  const r = await enviarMensagem(cloud, numero, 'audio', { link: arquivo.url }, 45000);
  return r.ok;
}

/** O número está acessível com este token? Usado pelo painel no lugar do "estado da conexão". */
export async function estadoCloud(cloud) {
  try {
    const r = await chamarCloud(cloud, `${cloud.phoneNumberId}?fields=display_phone_number,verified_name`, { method: 'GET', timeoutMs: 10000 });
    return r.ok ? 'open' : 'erro';
  } catch (err) {
    return 'erro';
  }
}

// ---------- Recebimento (webhook da Meta) ----------

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o segredo do app). */
export async function assinaturaValida(corpoBruto, cabecalho, segredo) {
  const recebido = String(cabecalho || '').replace(/^sha256=/i, '').toLowerCase();
  if (!segredo || !/^[a-f0-9]{64}$/.test(recebido)) return false;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoBruto)));
  const esperado = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (esperado.length !== recebido.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

/** O corpo é um webhook do WhatsApp Cloud API destinado ao número ADM? */
export function ehWebhookDoAdm(body, phoneNumberId) {
  if (!phoneNumberId || body?.object !== 'whatsapp_business_account') return false;
  return (body.entry || []).some((e) => (e?.changes || []).some((c) => String(c?.value?.metadata?.phone_number_id || '') === String(phoneNumberId)));
}

/** Mensagens de TEXTO de clientes enviadas ao número ADM (ignora status de entrega, mídia, etc.). */
export function mensagensDoWebhook(body, phoneNumberId) {
  const lista = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value || String(value.metadata?.phone_number_id || '') !== String(phoneNumberId)) continue;
      for (const m of value.messages || []) {
        if (m?.type !== 'text' || !m.from || !m.id) continue;
        const telefone = somenteDigitos(m.from);
        if (!telefone) continue;
        lista.push({ id: String(m.id), jid: telefone, telefone, texto: String(m.text?.body || '') });
      }
    }
  }
  return lista;
}

/**
 * Trata um webhook já verificado. Cada mensagem vira um evento no mesmo formato que o robô já usa
 * (`{ cloudMsg }`), então todas as regras (3, 4, lista de pedidos, intervalo de reenvio) são as mesmas.
 */
export async function tratarWebhookCloudAdm(body, env = {}, ctxPronto = null) {
  const cloud = configCloudAdm(env);
  if (!cloud) return [];
  const { tratarMensagemAdm } = await import('./whatsappAdm.js');
  const resultados = [];
  for (const msg of mensagensDoWebhook(body, cloud.phoneNumberId)) {
    resultados.push(await tratarMensagemAdm({ cloudMsg: msg }, env, ctxPronto));
  }
  return resultados;
}

/**
 * Ponto de entrada das rotas: confere que o webhook é do número ADM, valida a assinatura da Meta e
 * dispara o tratamento em segundo plano. Devolve `null` se o corpo não for do ADM (a rota segue o
 * fluxo normal dela) ou `{ status, json }` com a resposta pronta.
 */
export async function processarRequisicaoCloudAdm(req, env = {}, waitUntil = null) {
  const cloud = configCloudAdm(env);
  if (!cloud) return null;

  const bruto = await req.text();
  let body;
  try { body = JSON.parse(bruto); } catch (e) { return null; }
  if (!ehWebhookDoAdm(body, cloud.phoneNumberId)) return null;

  const segredo = lerEnv(env, 'WHATSAPP_APP_SECRET');
  if (!segredo) {
    console.warn('[whatsapp-adm/cloud] WHATSAPP_APP_SECRET não configurada: webhook recusado.');
    return { status: 500, json: { error: 'WHATSAPP_APP_SECRET não configurada.' } };
  }
  if (!(await assinaturaValida(bruto, req.headers.get('x-hub-signature-256'), segredo))) {
    return { status: 401, json: { error: 'Assinatura inválida.' } };
  }

  // A Meta espera resposta rápida: responde já e termina o envio em segundo plano.
  const trabalho = tratarWebhookCloudAdm(body, env).catch((err) => {
    console.warn('[whatsapp-adm/cloud] Erro ao tratar o webhook:', err?.name);
  });
  if (waitUntil) waitUntil(trabalho);
  else await trabalho;
  return { status: 200, json: { ok: true } };
}
