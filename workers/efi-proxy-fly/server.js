// Relay de mTLS pra API Pix da Efí — versão Fly.io, substituindo o Worker Cloudflare
// (workers/efi-proxy/) depois que a Efí bloqueou (WAF/rede) o IP dos Workers. Mesmo desenho de
// segurança do Worker original: o app Next.js nunca fala direto com a Efí nem manda host/URL — só um
// enum `env` (sandbox/production), path e método, validados contra uma allowlist fechada. Isso
// elimina SSRF por construção, igual antes.
//
// Diferente do Worker, aqui é um processo Node normal — usa https.request nativo com o certificado
// cliente, sem precisar de um binding especial da plataforma.

const http = require('http');
const https = require('https');

const HOSTS = {
  sandbox: 'pix-h.api.efipay.com.br',
  production: 'pix.api.efipay.com.br',
};

const TXID_PATTERN = '[A-Za-z0-9]{26,35}';

const PATH_RULES = [
  { method: 'POST', pattern: /^\/oauth\/token$/ },
  { method: 'PUT', pattern: new RegExp(`^/v2/cob/${TXID_PATTERN}$`) },
  { method: 'GET', pattern: new RegExp(`^/v2/cob/${TXID_PATTERN}$`) },
  { method: 'GET', pattern: /^\/v2\/loc\/\d+\/qrcode$/ },
  // Consulta (somente leitura) do webhook registrado na chave Pix. Serve para responder, sem
  // adivinhação, se a Efí está mesmo configurada para nos avisar quando um Pix cai — a pergunta
  // que apareceu em 21/09/2026 quando pagamentos deixaram de ser identificados. Só GET: registrar
  // ou apagar webhook continua fora da allowlist, e é feito pelo script dedicado
  // (scripts/register-efi-webhook.mjs), nunca por uma rota do site.
  { method: 'GET', pattern: /^\/v2\/webhook\/[0-9A-Za-z.@+-]{1,80}$/ },
];

const FORWARDED_HEADER_NAMES = ['authorization', 'content-type'];

function pickAllowedHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const name of FORWARDED_HEADER_NAMES) {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    if (key && headers[key]) out[name] = headers[key];
  }
  return out;
}

// Certificados chegam como env var em base64 (Fly secrets não suportam bem multi-linha/arquivo
// direto) — decodificados uma vez na subida do processo.
//
// Pegadinha conhecida (14/08/2026): gerar o base64 a partir de um PEM extraído com `openssl` no Git
// Bash/MinGW do Windows produz quebra de linha CRLF (\r\n) dentro do PEM. O Node aceita o certificado
// (cert.cert funciona), mas a CHAVE privada falha ao decodificar com
// `error:1E08010C:DECODER routines::unsupported` (ERR_OSSL_UNSUPPORTED) — sintoma nada óbvio pra uma
// causa tão simples. Sempre gerar o PEM final com `tr -d '\r' < arquivo.pem > arquivo_lf.pem` (ou
// equivalente) antes de rodar `base64` nele.
function loadCertPair(envPrefix) {
  const certB64 = process.env[`${envPrefix}_CERT_B64`];
  const keyB64 = process.env[`${envPrefix}_KEY_B64`];
  if (!certB64 || !keyB64) return null;
  return {
    cert: Buffer.from(certB64, 'base64'),
    key: Buffer.from(keyB64, 'base64'),
  };
}

const CERTS = {
  sandbox: loadCertPair('EFI_SANDBOX'),
  production: loadCertPair('EFI_PRODUCTION'),
};

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      // Corta requisição absurdamente grande cedo — mesmo espírito do MAX_FILE_BASE64_CHARS do app.
      if (size > 10_000_000) {
        reject(new Error('payload muito grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Repassa a chamada pra Efí via https.request nativo, apresentando o certificado cliente da conta
// (sandbox ou produção, conforme `efiEnv`). Equivalente ao `mtlsBinding.fetch` do Worker Cloudflare.
function relayToEfi({ efiEnv, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const certPair = CERTS[efiEnv];
    if (!certPair) {
      reject(Object.assign(new Error(`certificado de ${efiEnv} não configurado`), { code: 'NO_CERT' }));
      return;
    }

    const options = {
      hostname: HOSTS[efiEnv],
      port: 443,
      path,
      method,
      headers: pickAllowedHeaders(headers),
      cert: certPair.cert,
      key: certPair.key,
      timeout: 8000,
    };

    const req = https.request(options, (upstreamRes) => {
      const chunks = [];
      upstreamRes.on('data', (c) => chunks.push(c));
      upstreamRes.on('end', () => {
        resolve({
          status: upstreamRes.statusCode,
          contentType: upstreamRes.headers['content-type'] || 'application/json',
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('timeout ao chamar a Efí')));
    req.on('error', reject);

    if (method !== 'GET' && body) req.write(body);
    req.end();
  });
}

async function handleRelay(req, res) {
  const proxySecret = process.env.EFI_PROXY_SECRET;
  if (!proxySecret) {
    console.warn('[efi-proxy-fly] EFI_PROXY_SECRET não configurado neste serviço.');
    jsonResponse(res, 500, { error: 'EFI_PROXY_SECRET não configurado' });
    return;
  }
  if (req.headers['x-efi-proxy-secret'] !== proxySecret) {
    jsonResponse(res, 401, { error: 'secret inválido' });
    return;
  }

  let payload;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw.toString('utf8') || '{}');
  } catch (e) {
    jsonResponse(res, 400, { error: 'corpo inválido' });
    return;
  }

  const { env: efiEnv, path, method, headers, body } = payload || {};

  if (!HOSTS[efiEnv]) {
    jsonResponse(res, 400, { error: 'env inválido (esperado sandbox ou production)' });
    return;
  }
  if (typeof path !== 'string' || typeof method !== 'string') {
    jsonResponse(res, 400, { error: 'path/method inválidos' });
    return;
  }
  const rule = PATH_RULES.find((r) => r.method === method && r.pattern.test(path));
  if (!rule) {
    jsonResponse(res, 400, { error: 'path/method não permitido' });
    return;
  }

  try {
    const upstream = await relayToEfi({ efiEnv, path, method, headers, body });
    res.writeHead(upstream.status, { 'Content-Type': upstream.contentType });
    res.end(upstream.body);
  } catch (err) {
    console.warn('[efi-proxy-fly] Falha ao chamar a Efí:', err.message);
    jsonResponse(res, 502, { error: 'falha ao chamar a Efí' });
  }
}

// Tarefas agendadas.
//
// Elas moravam no Worker Cloudflare `efi-proxy`, que existia só por isso depois que o relay da Efí
// veio para cá (Cloudflare Pages não suporta cron trigger; Workers suportam). Em 21/09/2026 esse
// Worker não existia mais na conta — `wrangler tail efi-proxy` respondeu "This Worker does not
// exist on your account [code: 10007]". Ou seja: TODOS os agendamentos estavam mortos, sem nenhum
// alarme, e a reconciliação de pagamento junto. Trouxe todos para cá, que é a máquina que já roda
// 24h (min_machines_running = 1) e já é o hop confiável para a Efí.
//
// Cada tarefa é só um POST na rota do app, que é quem tem a lógica. Aqui não existe regra de
// negócio nenhuma, de propósito.
// Cada rota exige um cabeçalho diferente — conferido um a um contra o código das rotas em
// 21/09/2026, porque cabeçalho errado aqui devolve 401 e a tarefa falha EM SILÊNCIO, que é
// exatamente o modo de falha que estamos consertando.
const TAREFAS = [
  // A mais importante: confere na Efí quem pagou e não foi liberado. Ver
  // src/app/api/orders/reconcile/route.js (lê `x-reconcile-secret`).
  // Pagamento e música vão em requisições SEPARADAS de propósito: juntas, a fase de música gasta
  // o orçamento de sub-requisições do Edge e a de pagamento morre com 'unknown' (achado
  // 21/09/2026 — ver o comentário de ?fase= em src/app/api/orders/reconcile/route.js).
  // A de pagamento é mais frequente: é a que libera o produto de quem já pagou.
  { nome: 'reconcile-pagamentos', caminho: '/api/orders/reconcile?fase=pagamentos', cabecalho: 'X-Reconcile-Secret', envSegredo: 'RECONCILE_SECRET', minutos: 5 },
  { nome: 'reconcile-audio', caminho: '/api/orders/reconcile?fase=audio', cabecalho: 'X-Reconcile-Secret', envSegredo: 'RECONCILE_SECRET', minutos: 15 },
  // Régua de recuperação de carrinho no WhatsApp. Esta usa `Authorization: Bearer`, não um
  // cabeçalho próprio — ver src/app/api/cron/recover/route.js:37.
  { nome: 'recover', caminho: '/api/cron/recover', metodo: 'GET', cabecalho: 'Authorization', prefixoBearer: true, envSegredo: 'CRON_SECRET', minutos: 15 },
  // Arquivamento de áudio pago no R2. Aceita `x-cleanup-secret` ou `x-reconcile-secret`.
  // A cada 10 min, nao 60: a URL de origem da Kie.ai (audiostream) morre em poucas horas, entao
  // arquivar tarde e arquivar 0 byte. Cada execucao processa um lote pequeno (ver MAX_ORDERS_PER_RUN
  // na rota) porque cada faixa atravessa o Worker inteira.
  { nome: 'archive-audio', caminho: '/api/orders/archive-audio', cabecalho: 'X-Cleanup-Secret', envSegredo: 'CLEANUP_SECRET', alternativaSegredo: 'RECONCILE_SECRET', minutos: 10 },
  // Limpeza de rascunho antigo, uma vez por dia.
  { nome: 'cleanup', caminho: '/api/orders/cleanup', cabecalho: 'X-Cleanup-Secret', envSegredo: 'CLEANUP_SECRET', alternativaSegredo: 'RECONCILE_SECRET', minutos: 24 * 60 },
];

function agendarTarefas() {
  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  if (!appUrl) {
    console.warn('[efi-proxy-fly] APP_URL não configurado — TODAS as tarefas agendadas estão desativadas.');
    return;
  }

  for (const tarefa of TAREFAS) {
    const segredo = process.env[tarefa.envSegredo] || (tarefa.alternativaSegredo ? process.env[tarefa.alternativaSegredo] : '');
    if (!segredo) {
      console.warn(`[efi-proxy-fly] ${tarefa.envSegredo} não configurado — tarefa "${tarefa.nome}" DESATIVADA.`);
      continue;
    }

    const rodar = async () => {
      try {
        const res = await fetch(`${appUrl}${tarefa.caminho}`, {
          method: tarefa.metodo || 'POST',
          headers: { [tarefa.cabecalho]: tarefa.prefixoBearer ? ('Bearer ' + segredo) : segredo },
          signal: AbortSignal.timeout(60000),
        });
        const body = await res.text().catch(() => '');
        if (!res.ok) {
          console.warn(`[efi-proxy-fly] "${tarefa.nome}" respondeu HTTP ${res.status}: ${body.slice(0, 200)}`);
          return;
        }
        console.log(`[efi-proxy-fly] "${tarefa.nome}" concluída: ${body.slice(0, 300)}`);
      } catch (err) {
        console.warn(`[efi-proxy-fly] Falha na tarefa "${tarefa.nome}":`, err.message);
      }
    };

    // Roda uma vez logo ao subir, não só depois do primeiro intervalo. Sem isso, um restart da
    // máquina custava até 10 minutos sem reconciliação nenhuma — justamente a janela em que um
    // pagamento recente fica sem ser conferido.
    rodar();
    setInterval(rodar, tarefa.minutos * 60 * 1000);
    console.log(`[efi-proxy-fly] Tarefa "${tarefa.nome}" agendada a cada ${tarefa.minutos} min.`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && req.url === '/relay') {
      await handleRelay(req, res);
      return;
    }
    jsonResponse(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[efi-proxy-fly] Exceção não tratada:', err.stack || err.message);
    jsonResponse(res, 500, { error: 'erro interno no proxy' });
  }
});

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`[efi-proxy-fly] Ouvindo na porta ${port}`);
  agendarTarefas();
});
