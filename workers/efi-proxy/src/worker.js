// Worker dedicado só para o hop mTLS até a API Pix da Efí — existe porque Cloudflare Pages não
// suporta binding de certificado mTLS (só Workers suportam; ver docs/EFI_SETUP.md para o porquê
// dessa arquitetura). O app Next.js (Pages) fala com este Worker por HTTPS simples; este Worker é
// quem detém os bindings de certificado e repassa a chamada para a Efí.
//
// Design deliberado para eliminar SSRF por construção: o chamador nunca envia host/URL, só um enum
// `env` (sandbox/production) mapeado aqui para o host fixo, e path+método validados contra uma
// allowlist fechada dos únicos 3 endpoints que src/lib/efi.js usa.

const HOSTS = {
  sandbox: 'https://pix-h.api.efipay.com.br',
  production: 'https://pix.api.efipay.com.br',
};

// Sandbox e produção são aplicações/certificados diferentes na Efí — cada um tem seu próprio
// binding mTLS (ver workers/efi-proxy/wrangler.toml), selecionado pelo mesmo `env` que escolhe o host.
const MTLS_BINDING_NAMES = {
  sandbox: 'EFI_MTLS_CERT_SANDBOX',
  production: 'EFI_MTLS_CERT_PRODUCTION',
};

const TXID_PATTERN = '[A-Za-z0-9]{26,35}';

const PATH_RULES = [
  { method: 'POST', pattern: /^\/oauth\/token$/ },
  { method: 'PUT', pattern: new RegExp(`^/v2/cob/${TXID_PATTERN}$`) },
  { method: 'GET', pattern: new RegExp(`^/v2/cob/${TXID_PATTERN}$`) },
  // Imagem do QR Code da cobrança (src/lib/efi.js:getPixQrCodeImage). O id do `location` é numérico
  // e vem do próprio retorno do PUT /v2/cob/:txid — nunca do cliente.
  { method: 'GET', pattern: /^\/v2\/loc\/\d+\/qrcode$/ },
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

  const mtlsBindingName = MTLS_BINDING_NAMES[efiEnv];
  const mtlsBinding = env?.[mtlsBindingName];
  if (!mtlsBinding?.fetch) {
    console.warn(`[efi-proxy] ${mtlsBindingName} não configurado neste Worker.`);
    return jsonError(500, `${mtlsBindingName} não configurado`);
  }

  let upstreamRes;
  try {
    upstreamRes = await mtlsBinding.fetch(`${host}${path}`, {
      method,
      // User-Agent explícito — fetch de dentro de um Worker sai sem UA nenhum por padrão. Testado
      // em 14/08/2026 como hipótese pro 403 "Sorry, you have been blocked" da Efí: não mudou o
      // resultado (ver commit), então a causa não é heurística de header ausente — mantido mesmo
      // assim por ser boa prática e não ter custo.
      headers: { ...pickAllowedHeaders(headers), 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
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

// Reconciliação agendada de pedidos travados.
//
// Mora neste Worker por um motivo só: Cloudflare Pages não suporta cron trigger, Workers suportam —
// a mesma limitação que já obrigou este Worker a existir para o hop mTLS. Ele não sabe nada sobre
// pedidos; só bate na rota do app, que é quem tem toda a lógica (ver
// src/app/api/orders/reconcile/route.js).
//
// Necessário porque a confirmação de música pronta e de pagamento depende do polling feito pelo
// NAVEGADOR DO CLIENTE. Quando o webhook do provedor falha e o cliente fecha a aba, o pedido fica
// preso para sempre — sem este agendamento, só um clique manual no painel destrava.
async function handleScheduledReconcile(env) {
  const appUrl = env?.APP_URL;
  const secret = env?.RECONCILE_SECRET;

  if (!appUrl || !secret) {
    console.warn('[efi-proxy] APP_URL/RECONCILE_SECRET não configurados — reconciliação agendada ignorada.');
    return;
  }

  try {
    const res = await fetch(`${appUrl}/api/orders/reconcile`, {
      method: 'POST',
      headers: { 'X-Reconcile-Secret': secret },
      // Consulta até 10 pedidos na Kie.ai e 10 cobranças na Efí, sequencialmente — teto folgado.
      signal: AbortSignal.timeout(60000),
    });

    const body = await res.text().catch(() => '');
    if (!res.ok) {
      console.warn(`[efi-proxy] Reconciliação respondeu HTTP ${res.status}: ${body.slice(0, 200)}`);
      return;
    }
    console.log(`[efi-proxy] Reconciliação concluída: ${body.slice(0, 300)}`);
  } catch (err) {
    console.warn('[efi-proxy] Falha na reconciliação agendada:', err?.message ?? err);
  }
}

// Régua de recuperação de carrinho via WhatsApp (só 4h desde 24/08/2026, ver route.js) — dispara a
// rota que antes dependia de um agendador externo (cron-job.org) nunca configurado.
// Ver src/app/api/cron/recover/route.js.
async function handleScheduledRecover(env) {
  const appUrl = env?.APP_URL;
  const secret = env?.CRON_SECRET;

  if (!appUrl || !secret) {
    console.warn('[efi-proxy] APP_URL/CRON_SECRET não configurados — régua de recuperação ignorada.');
    return;
  }

  try {
    const res = await fetch(`${appUrl}/api/cron/recover`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(60000),
    });

    const body = await res.text().catch(() => '');
    if (!res.ok) {
      console.warn(`[efi-proxy] Régua de recuperação respondeu HTTP ${res.status}: ${body.slice(0, 200)}`);
      return;
    }
    console.log(`[efi-proxy] Régua de recuperação concluída: ${body.slice(0, 300)}`);
  } catch (err) {
    console.warn('[efi-proxy] Falha na régua de recuperação agendada:', err?.message ?? err);
  }
}

// Limpeza diária de pedidos antigos — consolida as métricas em `stats` e APAGA de verdade o que
// passou da retenção (documento, suno_tasks e arquivos no Storage). Ver
// src/app/api/orders/cleanup/route.js: é irreversível por decisão de negócio, para parar de pagar
// armazenamento de pedido que ninguém vai mais acessar.
async function handleScheduledCleanup(env) {
  const appUrl = env?.APP_URL;
  const secret = env?.CLEANUP_SECRET || env?.RECONCILE_SECRET;

  if (!appUrl || !secret) {
    console.warn('[efi-proxy] APP_URL/CLEANUP_SECRET não configurados — limpeza agendada ignorada.');
    return;
  }

  try {
    const res = await fetch(`${appUrl}/api/orders/cleanup`, {
      method: 'POST',
      headers: { 'X-Cleanup-Secret': secret },
      // Apaga até 40 pedidos, cada um com suas suno_tasks e arquivos do Storage — teto folgado.
      signal: AbortSignal.timeout(120000),
    });

    const body = await res.text().catch(() => '');
    if (!res.ok) {
      console.warn(`[efi-proxy] Limpeza respondeu HTTP ${res.status}: ${body.slice(0, 200)}`);
      return;
    }
    console.log(`[efi-proxy] Limpeza concluída: ${body.slice(0, 300)}`);
  } catch (err) {
    console.warn('[efi-proxy] Falha na limpeza agendada:', err?.message ?? err);
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

  // Disparado pelos crons declarados em wrangler.toml — event.cron diz qual dos dois disparou.
  // waitUntil garante que a chamada termina mesmo depois do handler retornar.
  async scheduled(event, env, ctx) {
    if (event.cron === '7,22,37,52 * * * *') {
      ctx.waitUntil(handleScheduledRecover(env));
    } else if (event.cron === '40 6 * * *') {
      ctx.waitUntil(handleScheduledCleanup(env));
    } else {
      ctx.waitUntil(handleScheduledReconcile(env));
    }
  },
};
