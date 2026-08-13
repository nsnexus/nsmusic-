// Cliente da API Pix da Efí (ex-Gerencianet) — substitui o bypass manual de PIX estático.
//
// A API Pix exige mTLS (certificado cliente) em TODA chamada, inclusive na autenticação — exigência
// do Banco Central para PSPs, não uma opção da Efí. Cloudflare Pages não suporta binding de
// certificado mTLS (só Workers suportam), então esse hop é feito por um Worker dedicado
// (`workers/efi-proxy/`): este módulo chama o Worker por HTTPS simples (`EFI_PROXY_URL` +
// `EFI_PROXY_SECRET`), e é o Worker quem detém o certificado e fala com a Efí — ver
// docs/EFI_SETUP.md para o porquê e o passo a passo.
//
// Como em src/lib/auth.js, as funções aqui recebem `env` explicitamente em vez de chamar
// `getRequestContext()` internamente: quem resolve o contexto (com o try/catch que ele exige fora
// do runtime da Cloudflare) é sempre a rota chamadora — isso mantém este módulo testável em Node puro.
//
// Doc oficial: https://dev.efipay.com.br/docs/api-pix/credenciais

import { fetchWithRetry } from './httpRetry';

function readEnvValue(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

// Qualquer valor que não seja exatamente 'production' cai em homologação — inclusive a variável
// ausente ou com espaço/maiúscula sobrando. Isso é silencioso e produz um 401 idêntico ao de
// credencial errada (credencial de produção recusada pelo host de homologação), então o modo
// resolvido é exposto no diagnóstico de erro das rotas. O nome do ambiente não é segredo.
export function getEfiMode(env) {
  return readEnvValue(env, 'EFI_ENV') === 'production' ? 'production' : 'sandbox';
}

function getBaseUrl(env) {
  return getEfiMode(env) === 'production'
    ? 'https://pix.api.efipay.com.br'
    : 'https://pix-h.api.efipay.com.br';
}

// Fetch que repassa a chamada para o Worker dedicado de mTLS (workers/efi-proxy/) em vez de falar
// direto com a Efí — Cloudflare Pages não tem binding de certificado mTLS, só Workers têm (ver
// comentário de topo do arquivo). Chamar a Efí sem mTLS sempre falha do lado deles (handshake TLS
// recusado) — melhor falhar cedo com uma mensagem clara do que deixar um 401/timeout confuso se
// propagar.
function getRelayFetch(env) {
  const proxyUrl = readEnvValue(env, 'EFI_PROXY_URL');
  const proxySecret = readEnvValue(env, 'EFI_PROXY_SECRET');
  if (!proxyUrl || !proxySecret) {
    throw new Error('EFI_PROXY_URL/EFI_PROXY_SECRET não configurados neste ambiente (ver docs/EFI_SETUP.md).');
  }
  const efiEnv = readEnvValue(env, 'EFI_ENV') || 'sandbox';

  return async (efiUrl, options = {}) => {
    const path = new URL(efiUrl).pathname;
    return fetch(`${proxyUrl}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Efi-Proxy-Secret': proxySecret,
      },
      body: JSON.stringify({
        env: efiEnv,
        path,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || null,
      }),
      signal: options.signal,
    });
  };
}

async function getAccessToken(env) {
  const clientId = readEnvValue(env, 'EFI_CLIENT_ID');
  const clientSecret = readEnvValue(env, 'EFI_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('EFI_CLIENT_ID/EFI_CLIENT_SECRET não configurados.');
  }

  const relayFetch = getRelayFetch(env);
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetchWithRetry(
    `${getBaseUrl(env)}/oauth/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(10000),
    },
    2,
    relayFetch
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Falha ao autenticar na Efí (HTTP ${res.status}): ${errText}`);
    // Mesma ideia do efiStatus em createPixCharge: só o código sobe para a rota chamadora poder
    // distinguir "credencial recusada" de "cobrança recusada" sem repassar texto do provedor.
    err.efiStatus = res.status;
    err.efiStage = 'auth';
    // Credencial de produção usada contra o host de homologação (ou vice-versa) devolve exatamente
    // o mesmo 401 de credencial inválida — sem saber o ambiente resolvido, os dois casos são
    // indistinguíveis de fora e a investigação trava (aconteceu em 13/08/2026).
    err.efiEnv = getEfiMode(env) + '-' + (clientId ? clientId.slice(-4) : 'none');
    throw err;
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Resposta de autenticação da Efí sem access_token.');
  }
  return data.access_token;
}

// txid do Pix: 26 a 35 caracteres alfanuméricos (spec Bacen) — diferente do limite de 25 do campo
// de dados adicionais do BR Code estático que existia antes desta migração.
export function generateTxid(orderId) {
  const base = String(orderId || 'NSMUSIC').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 15);
  const suffix = (Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  let txid = (base + suffix).slice(0, 35);
  while (txid.length < 26) txid += '0';
  return txid;
}

/**
 * Cria (ou substitui) uma cobrança Pix imediata com um txid próprio, o que permite correlacionar
 * diretamente com o pedido sem precisar de uma segunda consulta.
 * @param {{orderId: string, amount: number, description?: string}} params
 * @param {object} env - contexto de ambiente resolvido pela rota chamadora (ver módulo acima)
 * @returns {Promise<{txid: string, pixCopiaECola: string, status: string}>}
 */
export async function createPixCharge({ orderId, amount, description }, env) {
  if (!orderId || typeof amount !== 'number' || amount <= 0) {
    throw new Error('createPixCharge requer orderId e amount válidos.');
  }

  const chave = readEnvValue(env, 'EFI_PIX_KEY');
  if (!chave) {
    throw new Error('EFI_PIX_KEY não configurada.');
  }

  const accessToken = await getAccessToken(env);
  const relayFetch = getRelayFetch(env);
  const txid = generateTxid(orderId);

  const body = {
    calendario: { expiracao: 3600 },
    valor: { original: amount.toFixed(2) },
    chave,
    solicitacaoPagador: (description || `Pedido NS Music ${orderId}`).slice(0, 140),
  };

  const res = await fetchWithRetry(
    `${getBaseUrl(env)}/v2/cob/${txid}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
    2,
    relayFetch
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Falha ao criar cobrança Pix na Efí (HTTP ${res.status}): ${errText}`);
    // Só o código HTTP sobe para a rota chamadora poder identificar a falha sem repassar ao cliente
    // o texto do provedor (ver .claude/rules/security.md). Sem isso, toda falha aqui chegava ao
    // suporte como "erro ao gerar o PIX", sem nenhuma pista de qual era.
    err.efiStatus = res.status;
    err.efiStage = 'cob';
    err.efiEnv = getEfiMode(env);
    throw err;
  }

  const data = await res.json();
  return {
    txid: data.txid || txid,
    pixCopiaECola: data.pixCopiaECola || '',
    status: data.status || 'ATIVA',
  };
}

/**
 * Consulta o status oficial de uma cobrança na Efí — nunca aprovar um pagamento a partir só do
 * corpo de um webhook; confirmar sempre nesta chamada antes (payments.md).
 * @param {string} txid
 * @param {object} env
 * @returns {Promise<{status: string, valor: {original: string}} | null>}
 */
export async function getChargeStatus(txid, env) {
  if (!txid) return null;

  const accessToken = await getAccessToken(env);
  const relayFetch = getRelayFetch(env);

  const res = await fetchWithRetry(
    `${getBaseUrl(env)}/v2/cob/${txid}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    },
    2,
    relayFetch
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha ao consultar cobrança Pix na Efí (HTTP ${res.status}): ${errText}`);
  }

  return res.json();
}
