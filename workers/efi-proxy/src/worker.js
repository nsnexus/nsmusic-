// Worker dedicado só para o hop mTLS até a API Pix da Efí — existe porque Cloudflare Pages não
// suporta binding de certificado mTLS (só Workers suportam; ver docs/EFI_SETUP.md para o porquê
// dessa arquitetura). O app Next.js (Pages) fala com este Worker por HTTPS simples; este Worker é
// quem detém o binding `EFI_MTLS_CERT` e repassa a chamada para a Efí.
//
// Design deliberado para eliminar SSRF por construção: o chamador nunca envia host/URL, só um enum
// `env` (sandbox/production) mapeado aqui para o host fixo, e path+método validados contra uma
// allowlist fechada dos únicos 3 endpoints que src/lib/efi.js usa.

const HOSTS = {
  sandbox: 'https://pix-h.api.efipay.com.br',
  production: 'https://pix.api.efipay.com.br',
};

const TXID_PATTERN = '[A-Za-z0-9]{26,35}';

const PATH_RULES = [
  { method: 'POST', pattern: /^\/oauth\/token$/ },
  { method: 'PUT', pattern: new RegExp(`^/v2/cob/${TXID_PATTERN}$`) },
  { method: 'GET', pattern: new RegExp(`^/v2/cob/${TXID_PATTERN}$`) },
];

const FORWARDED_HEADER_NAMES = ['authorization', 'content-type'];

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pickAllowedHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const name of FORWARDED_HEADER_NAMES) {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    if (key && headers[key]) out[name] = headers[key];
  }
  return out;
}

async function handleRelay(request, env) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/relay') {
    return jsonError(404, 'not found');
  }

  const proxySecret = env?.EFI_PROXY_SECRET;
  if (!proxySecret) {
    console.warn('[efi-proxy] EFI_PROXY_SECRET não configurado neste Worker.');
    return jsonError(500, 'EFI_PROXY_SECRET não configurado');
  }
  if (request.headers.get('X-Efi-Proxy-Secret') !== proxySecret) {
    return jsonError(401, 'secret inválido');
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonError(400, 'corpo inválido');
  }

  const { env: efiEnv, path, method, headers, body } = payload || {};

  const host = HOSTS[efiEnv];
  if (!host) {
    return jsonError(400, 'env inválido (esperado sandbox ou production)');
  }

  if (typeof path !== 'string' || typeof method !== 'string') {
    return jsonError(400, 'path/method inválidos');
  }
  const rule = PATH_RULES.find((r) => r.method === method && r.pattern.test(path));
  if (!rule) {
    return jsonError(400, 'path/method não permitido');
  }

  const mtlsBinding = env?.EFI_MTLS_CERT;
  if (!mtlsBinding?.fetch) {
    console.warn('[efi-proxy] EFI_MTLS_CERT não configurado neste Worker.');
    return jsonError(500, 'EFI_MTLS_CERT não configurado');
  }

  let upstreamRes;
  try {
    upstreamRes = await mtlsBinding.fetch(`${host}${path}`, {
      method,
      headers: pickAllowedHeaders(headers),
      body: method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.warn('[efi-proxy] Falha ao chamar a Efí via mTLS:', err?.message ?? err);
    return jsonError(502, 'falha ao chamar a Efí');
  }

  try {
    const responseBody = await upstreamRes.text();
    return new Response(responseBody, {
      status: upstreamRes.status,
      headers: { 'Content-Type': upstreamRes.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    console.warn('[efi-proxy] Falha ao processar resposta da Efí:', err?.message ?? err);
    return jsonError(502, 'falha ao processar resposta da Efí');
  }
}

export default {
  async fetch(request, env) {
    // Rede de segurança: qualquer exceção não prevista aqui dentro nunca deve escapar como um 500
    // genérico sem corpo (o runtime da Cloudflare esconde detalhes de exceções não tratadas) — pelo
    // menos logamos o suficiente para depurar via `wrangler tail`.
    try {
      return await handleRelay(request, env);
    } catch (err) {
      console.error('[efi-proxy] Exceção não tratada:', err?.stack ?? err?.message ?? err);
      return jsonError(500, 'erro interno no proxy');
    }
  },
};
