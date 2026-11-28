// "Esse número tem WhatsApp?" — consulta feita no /criar quando o cliente termina de digitar.
//
// A API oficial da Meta não tem essa consulta, então ela é feita pela Evolution (número não
// oficial), com cuidados para não chamar atenção do WhatsApp (decisão do Narciso, 28/11/2026):
//   - de preferência numa instância própria só para isso (EVOLUTION_CHECK_INSTANCE), com um chip
//     separado — sem ela, usa a instância principal;
//   - no máximo uma consulta por número a cada 24 h (resposta guardada no cache da Cloudflare);
//   - limite por IP, para ninguém usar o site para checar lista de números;
//   - nunca bloqueia o pedido: se a Evolution falhar, demorar ou não estiver configurada, a resposta
//     é "desconhecido" e a tela segue como antes. Só mostra aviso quando a Evolution diz "não existe".
//
// A consulta é a mesma que o celular faz ao salvar um contato: não manda mensagem para ninguém.
// WHATSAPP_CHECK_ENABLED=false desliga tudo.

export const RESULTADO = { TEM: 'tem', NAO_TEM: 'nao_tem', DESCONHECIDO: 'desconhecido' };
export const LIMITE_POR_IP_HORA = 10;
const TIMEOUT_MS = 6000;

/** Só celular brasileiro: DDD (11–99) + 8 ou 9 dígitos, sem o 55. */
export function telefoneValidoParaConsulta(digitos) {
  const d = String(digitos || '');
  return /^[1-9][1-9]\d{8,9}$/.test(d);
}

/**
 * Variações do número para consultar: com e sem o 9º dígito. Contas antigas de algumas regiões
 * ficaram registradas no WhatsApp sem o 9, e muita gente esquece de digitar o 9 — qualquer uma das
 * duas existindo já conta como "tem WhatsApp".
 */
export function variacoesParaConsulta(digitos) {
  const d = String(digitos || '');
  if (!telefoneValidoParaConsulta(d)) return [];
  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  const variacoes = [`55${d}`];
  if (local.length === 9 && local.startsWith('9')) variacoes.push(`55${ddd}${local.slice(1)}`);
  if (local.length === 8) variacoes.push(`55${ddd}9${local}`);
  return variacoes;
}

/** Interpreta a resposta do `chat/whatsappNumbers` da Evolution. */
export function interpretarResposta(json) {
  const lista = Array.isArray(json) ? json : (Array.isArray(json?.numbers) ? json.numbers : null);
  if (!lista || lista.length === 0) return RESULTADO.DESCONHECIDO;
  if (lista.some((item) => item?.exists === true)) return RESULTADO.TEM;
  if (lista.every((item) => item?.exists === false)) return RESULTADO.NAO_TEM;
  return RESULTADO.DESCONHECIDO;
}

/**
 * Consulta a Evolution. `evo` = { baseUrl, instanceName, token }. Nunca lança: em qualquer falha
 * devolve "desconhecido" (o cliente não pode ficar travado por causa disso).
 */
export async function consultarEvolution(digitos, evo, { fetchImpl = fetch } = {}) {
  const numeros = variacoesParaConsulta(digitos);
  if (numeros.length === 0 || !evo?.baseUrl || !evo?.instanceName || !evo?.token) return RESULTADO.DESCONHECIDO;
  try {
    const res = await fetchImpl(`${evo.baseUrl}/chat/whatsappNumbers/${encodeURIComponent(evo.instanceName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evo.token },
      body: JSON.stringify({ numbers: numeros }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn('[verificaWhatsapp] Evolution respondeu', res.status);
      return RESULTADO.DESCONHECIDO;
    }
    return interpretarResposta(await res.json());
  } catch (err) {
    console.warn('[verificaWhatsapp] Falha ao consultar a Evolution:', err?.name || 'erro');
    return RESULTADO.DESCONHECIDO;
  }
}

// ── Cache da Cloudflare (por data center): resposta por número e contador por IP ──────────────

async function sha256(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cacheDisponivel() {
  try {
    return typeof caches !== 'undefined' && caches?.default ? caches.default : null;
  } catch {
    return null;
  }
}

// O número entra no cache só como hash (nada de telefone em chave legível).
const chaveResultado = async (digitos) => `https://cache.nsmusic.ia.br/wa-check/v1/${await sha256(`nsm:${digitos}`)}`;
const chaveIp = async (ip) => `https://cache.nsmusic.ia.br/wa-check-ip/v1/${await sha256(`ip:${ip}`)}`;

export async function lerResultadoGuardado(digitos, cache = cacheDisponivel()) {
  if (!cache) return null;
  try {
    const res = await cache.match(await chaveResultado(digitos));
    if (!res) return null;
    const { resultado } = await res.json();
    return resultado === RESULTADO.TEM || resultado === RESULTADO.NAO_TEM ? resultado : null;
  } catch {
    return null;
  }
}

export async function guardarResultado(digitos, resultado, cache = cacheDisponivel()) {
  if (!cache || (resultado !== RESULTADO.TEM && resultado !== RESULTADO.NAO_TEM)) return;
  try {
    await cache.put(await chaveResultado(digitos), new Response(JSON.stringify({ resultado }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
    }));
  } catch {
    // Cache é otimização: sem ele só consulta de novo.
  }
}

/** Conta uma consulta deste IP na hora corrente. true = passou do limite. */
export async function estourouLimiteDoIp(ip, cache = cacheDisponivel(), limite = LIMITE_POR_IP_HORA) {
  if (!cache || !ip) return false;
  try {
    const chave = await chaveIp(ip);
    const anterior = await cache.match(chave);
    const dados = anterior ? await anterior.json() : null;
    const agora = Date.now();
    const inicio = dados && agora - dados.inicio < 3600 * 1000 ? dados.inicio : agora;
    const total = (dados && inicio === dados.inicio ? Number(dados.total) || 0 : 0) + 1;
    const restanteS = Math.max(60, Math.ceil((inicio + 3600 * 1000 - agora) / 1000));
    await cache.put(chave, new Response(JSON.stringify({ inicio, total }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${restanteS}` },
    }));
    return total > limite;
  } catch {
    return false;
  }
}

/**
 * Fluxo completo: cache → limite do IP → Evolution → guarda. `deps` existe para os testes.
 */
export async function verificarWhatsapp(digitos, { ip = '', evo = null, cache = cacheDisponivel(), fetchImpl = fetch } = {}) {
  if (!telefoneValidoParaConsulta(digitos)) return { resultado: RESULTADO.DESCONHECIDO, motivo: 'formato' };

  const guardado = await lerResultadoGuardado(digitos, cache);
  if (guardado) return { resultado: guardado, motivo: 'cache' };

  if (await estourouLimiteDoIp(ip, cache)) return { resultado: RESULTADO.DESCONHECIDO, motivo: 'limite' };
  if (!evo) return { resultado: RESULTADO.DESCONHECIDO, motivo: 'sem_evolution' };

  const resultado = await consultarEvolution(digitos, evo, { fetchImpl });
  await guardarResultado(digitos, resultado, cache);
  return { resultado, motivo: 'consulta' };
}
