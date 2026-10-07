import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USER_DATA_DIR = path.resolve(__dirname, 'perfil-chrome');

let browserContext = null;
let activePage = null;

function pausarParaLogin(mensagem) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(mensagem, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Detecta e clica na caixa "Confirme que é humano" do Cloudflare Turnstile se estiver visível.
 */
export async function resolverTurnstileSeNecessario(page) {
  try {
    for (const frame of page.frames()) {
      if (frame.url().includes('challenges.cloudflare.com')) {
        const checkbox = frame.locator('input[type="checkbox"], [role="checkbox"], .ctp-checkbox-label, label, #challenge-stage, span.mark').first();
        if (await checkbox.isVisible({ timeout: 1500 }).catch(() => false)) {
          console.log('[SunoAutomator] 🛡️ Cloudflare Turnstile detectado! Clicando na confirmação...');
          await checkbox.hover().catch(() => {});
          await page.waitForTimeout(200);
          await checkbox.click({ delay: 100 }).catch(() => {});
          await page.waitForTimeout(2000);
          return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

/**
 * Inicializa ou reaproveita o navegador com perfil persistente e modo stealth (anti-detecção).
 */
export async function initSunoBrowser(options = {}) {
  const { headless = false } = options;

  if (browserContext && activePage && !activePage.isClosed()) {
    return { context: browserContext, page: activePage };
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const hasChrome = fs.existsSync(chromePath);

  console.log(`[SunoAutomator] 🚀 Iniciando navegador ${hasChrome ? 'Google Chrome (Oficial)' : 'Chromium'} com perfil persistente...`);
  
  browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: null,
    ...(hasChrome ? { channel: 'chrome' } : {}),
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-service-autorun'
    ]
  });

  // Remove marcas de automação (navigator.webdriver) para evitar disparar o Turnstile
  await browserContext.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    window.chrome = window.chrome || { runtime: {} };
  });

  const pages = browserContext.pages();
  activePage = pages.length > 0 ? pages[0] : await browserContext.newPage();

  // Acessa suno.com/create
  console.log('[SunoAutomator] 🌐 Acessando https://suno.com/create...');
  await activePage.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 45000 });

  await verificarAutenticacao(activePage);
  return { context: browserContext, page: activePage };
}

/**
 * Verifica se o usuário está logado. Se não, aguarda login manual com prompt no terminal.
 */
async function verificarAutenticacao(page) {
  try {
    await page.waitForTimeout(3000);

    // Verifica se há botões de Sign In visíveis
    const signInBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Log in"), button:has-text("Log In"), a:has-text("Sign In"), a:has-text("Log In")').first();
    const temSignIn = await signInBtn.isVisible({ timeout: 2500 }).catch(() => false);

    // Verifica se a textarea de geração já existe ou se o texto da página tem créditos
    const textoBody = (await page.innerText('body').catch(() => '')) || '';
    const temCreditos = /\d+\s*(credits|créditos)/i.test(textoBody);
    const temTextarea = await page.locator('textarea').first().isVisible({ timeout: 1500 }).catch(() => false);

    const estaLogado = temCreditos || (temTextarea && !temSignIn);

    if (!estaLogado) {
      console.log('\n=============================================================');
      console.log('🔑 [PRIMEIRO ACESSO] FAÇA LOGIN NA SUA CONTA SUNO');
      console.log('1. Na janela do Chrome aberta, clique em "Sign In" ou "Log In".');
      console.log('2. Faça login com sua conta oficial da Suno (Google, Discord, etc.).');
      console.log('3. Após terminar o login e estar na tela da Suno, volte aqui');
      console.log('   neste terminal e pressione a tecla [ENTER].');
      console.log('=============================================================\n');

      await pausarParaLogin('👉 Pressione [ENTER] aqui no terminal após concluir o login no Suno: ');

      console.log('\n[SunoAutomator] ⏳ Validando sessão logada e navegando para tela de criação...');
      await page.waitForTimeout(2000);

      if (!page.url().includes('suno.com/create')) {
        await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);
      }

      console.log('[SunoAutomator] ✅ Sessão autenticada e salva na pasta perfil-chrome!');
    } else {
      console.log('[SunoAutomator] ✅ Sessão ativa detectada no Suno.');
    }
  } catch (err) {
    console.warn('[SunoAutomator] Aviso na checagem de login:', err.message);
  }
}

/**
 * Executa a criação da música na interface do Suno.
 */
export async function gerarMusicaNoSuno({ prompt, style = 'Acoustic Pop', title = 'Nova Música', onProgress = () => {} }) {
  const { page } = await initSunoBrowser();

  onProgress('Navegando para tela de criação do Suno...');
  if (!page.url().includes('suno.com/create')) {
    await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  await page.waitForTimeout(2000);

  // 1. Garante que o modo "Advanced" está ativado (Suno v4/v6)
  onProgress('Garantindo modo avançado (Advanced)...');
  const styleSelector = 'textarea[placeholder*="style" i], input[placeholder*="style" i], [aria-label*="style" i], [placeholder*="genre" i], textarea[placeholder*="describe" i]';
  const totalTextareasAntes = await page.locator('textarea').count().catch(() => 0);
  let isAdvancedActive = (totalTextareasAntes >= 2) || (await page.locator(styleSelector).first().isVisible({ timeout: 1000 }).catch(() => false));

  if (!isAdvancedActive) {
    console.log('[SunoAutomator] Modo Advanced desligado. Clicando no botão "Advanced"...');
    
    // Tenta primeiro o botão "Advanced" exato (visto na nova interface v4/v6)
    const advancedBtn = page.getByRole('button', { name: /^advanced$/i })
      .or(page.getByRole('tab', { name: /^advanced$/i }))
      .or(page.locator('button:has-text("Advanced")'))
      .or(page.locator('[role="tab"]:has-text("Advanced")'))
      .or(page.locator('div:has-text("Advanced") button'))
      .or(page.locator('button:has-text("Simple") ~ button'))
      .first();

    if (await advancedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await advancedBtn.click();
      console.log('[SunoAutomator] 🖱️ Clicou no botão "Advanced"!');
      await page.waitForTimeout(1500);
    } else {
      // Fallback para seletores alternativos e variações
      const customSelectors = [
        'button:has-text("Advanced")',
        'button:has-text("Avançado")',
        'button:has-text("Custom")',
        'button:has-text("Personalizado")',
        '[role="switch"]:has-text("Advanced")',
        '[role="switch"]:has-text("Custom")',
        'div:has-text("Simple") ~ button',
        'span:has-text("Advanced")'
      ];

      for (const sel of customSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
          await el.click().catch(() => {});
          await page.waitForTimeout(1000);
          break;
        }
      }
    }

    const totalTextareasDepois = await page.locator('textarea').count().catch(() => 0);
    const styleVis = await page.locator(styleSelector).first().isVisible({ timeout: 1500 }).catch(() => false);
    isAdvancedActive = totalTextareasDepois >= 2 || styleVis;
    if (isAdvancedActive) {
      console.log('[SunoAutomator] ✅ Modo Advanced ativado com sucesso!');
    }
  }

  // 2. Preenche a Letra (Lyrics)
  onProgress('Preenchendo letra da música...');
  const lyricsSelector = 'textarea[placeholder*="lyrics" i], textarea[placeholder*="letra" i], textarea[placeholder*="own lyrics" i], textarea[aria-label*="lyrics" i], textarea[placeholder*="words" i]';
  let lyricsInput = page.locator(lyricsSelector).first();
  let achouLyrics = await lyricsInput.isVisible({ timeout: 3000 }).catch(() => false);

  if (!achouLyrics) {
    // No modo Advanced, o primeiro textarea é sempre a letra
    lyricsInput = page.locator('textarea').first();
    achouLyrics = await lyricsInput.isVisible({ timeout: 3000 }).catch(() => false);
  }

  if (!achouLyrics) {
    throw new Error('Não foi possível encontrar a caixa de letra no Suno. Verifique se o login está concluído no navegador.');
  }

  await lyricsInput.click().catch(() => {});
  await lyricsInput.fill(prompt);
  await page.waitForTimeout(500);
  console.log('[SunoAutomator] ✅ Letra preenchida.');

  // 3. Preenche o Estilo (Style Tags)
  onProgress(`Preenchendo estilo musical: ${style}...`);
  let styleInput = page.locator(styleSelector).first();
  let achouStyle = await styleInput.isVisible({ timeout: 2000 }).catch(() => false);

  if (!achouStyle) {
    // Se não achou pelo seletor de estilo mas temos 2 ou mais textareas no modo Advanced,
    // o segundo textarea é a caixa de Estilo!
    const totalTextareas = await page.locator('textarea').count().catch(() => 0);
    if (totalTextareas >= 2) {
      styleInput = page.locator('textarea').nth(1);
      achouStyle = await styleInput.isVisible({ timeout: 1000 }).catch(() => false);
    }
  }

  if (achouStyle) {
    await styleInput.click().catch(() => {});
    await styleInput.fill(style);
    await page.waitForTimeout(500);
    console.log(`[SunoAutomator] ✅ Estilo musical preenchido: "${style}"`);
  } else {
    console.warn('[SunoAutomator] ⚠️ Campo de estilo não encontrado');
  }

  // 4. Preenche o Título (Title)
  onProgress(`Preenchendo título: ${title}...`);
  const titleInput = page.locator('input[placeholder*="title" i], input[placeholder*="título" i], input[aria-label*="title" i], input[placeholder*="name" i]').first();
  if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await titleInput.click().catch(() => {});
    await titleInput.fill(title.substring(0, 80));
    await page.waitForTimeout(500);
    console.log(`[SunoAutomator] ✅ Título preenchido: "${title.substring(0, 80)}"`);
  }

  // Captura os IDs que já existiam na tela antes de clicar em Create para nunca confundir com faixas anteriores
  const preExistingUuids = await page.evaluate(() => {
    const list = [];
    const uuidRegex = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
    document.querySelectorAll('a[href*="/song/"], img[src*="suno.ai"], [data-id], [data-clip-id]').forEach(el => {
      const val = el.href || el.src || el.getAttribute('data-id') || el.getAttribute('data-clip-id') || '';
      const m = val.match(uuidRegex);
      if (m && m[1] && !list.includes(m[1].toLowerCase())) list.push(m[1].toLowerCase());
    });
    return list;
  });
  console.log(`[SunoAutomator] 📋 ${preExistingUuids.length} clipes pré-existentes na biblioteca ignorados.`);

  // 5. Clica em "Create"
  onProgress('Enviando solicitação de geração...');
  const createButton = page.locator('button:has-text("Create"), button[aria-label="Create"]').first();
  await createButton.waitFor({ state: 'visible', timeout: 10000 });
  await createButton.hover().catch(() => {});
  await page.waitForTimeout(400);
  await createButton.click();

  // Monitora se o Cloudflare Turnstile ("Confirme que é humano") aparecer e resolve automaticamente
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    const resolvido = await resolverTurnstileSeNecessario(page);
    if (resolvido) {
      console.log('[SunoAutomator] ✅ Confirmação do Cloudflare clicada com sucesso!');
      break;
    }
  }

  await page.waitForTimeout(3000);

  // Verifica se apareceu erro de créditos ou moderação
  const bodyText = await page.innerText('body').catch(() => '');
  if (bodyText.includes('Out of credits') || bodyText.includes('Insufficient credits')) {
    throw new Error('INSUFFICIENT_CREDITS: A conta oficial do Suno está sem créditos suficientes.');
  }
  if (bodyText.includes('flagged by our moderation') || bodyText.includes('Moderation error')) {
    throw new Error('MODERATION_ERROR: O Suno bloqueou termos na letra ou estilo.');
  }

  // 6. Aguarda os clipes finalizarem de verdade
  onProgress('Aguardando Suno finalizar as 2 faixas (leva cerca de 30-50s)...');
  const startTime = Date.now();
  const MAX_WAIT_MS = 240000; // 4 minutos máximo por geração

  // Aguarda 15 segundos mínimos para o Suno iniciar o processamento real
  await page.waitForTimeout(12000);

  let clipsFinalizados = [];

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    onProgress(`Aguardando renderização no Suno (${elapsed}s decorridos)...`);

    // Busca novos UUIDs no DOM que NÃO existiam antes do Create
    try {
      const novosUuids = await page.evaluate((antigos) => {
        const uuids = [];
        const uuidRegex = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;

        document.querySelectorAll('a[href*="/song/"]').forEach(a => {
          const m = a.href.match(uuidRegex);
          if (m && m[1]) {
            const id = m[1].toLowerCase();
            if (!antigos.includes(id) && !uuids.includes(id)) uuids.push(id);
          }
        });

        document.querySelectorAll('img[src*="suno.ai"]').forEach(img => {
          const m = img.src.match(uuidRegex);
          if (m && m[1]) {
            const id = m[1].toLowerCase();
            if (!antigos.includes(id) && !uuids.includes(id)) uuids.push(id);
          }
        });

        return uuids;
      }, preExistingUuids);

      if (novosUuids.length >= 2) {
        // Verifica se o áudio já está renderizado no CloudFront
        const id1 = novosUuids[0];
        const id2 = novosUuids[1];

        const [r1, r2] = await Promise.all([
          fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id1}.m4a`, { method: 'HEAD' }).catch(() => null),
          fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id2}.m4a`, { method: 'HEAD' }).catch(() => null)
        ]);

        const size1 = parseInt(r1?.headers?.get('content-length') || '0', 10);
        const size2 = parseInt(r2?.headers?.get('content-length') || '0', 10);

        if (r1?.ok && r2?.ok && size1 > 100000 && size2 > 100000) {
          console.log(`[SunoAutomator] 🎯 Faixas renderizadas no Suno! Extraindo áudios MP3 oficiais...`);

          const [mp3_1, mp3_2] = await Promise.all([
            extrairAudioOficial(page, id1, title),
            extrairAudioOficial(page, id2, title)
          ]);

          clipsFinalizados = [
            {
              id: id1,
              title: title || 'Faixa 1',
              status: 'complete',
              audioUrl: mp3_1.audioUrl || `https://audiopipe.suno.ai/?item_id=${id1}`,
              buffer: mp3_1.buffer
            },
            {
              id: id2,
              title: title || 'Faixa 2',
              status: 'complete',
              audioUrl: mp3_2.audioUrl || `https://audiopipe.suno.ai/?item_id=${id2}`,
              buffer: mp3_2.buffer
            }
          ];
          break;
        }
      }
    } catch (e) {}

    await page.waitForTimeout(4000);
  }

  if (clipsFinalizados.length === 0) {
    throw new Error('TIMEOUT: O Suno demorou mais de 4 minutos para finalizar as faixas.');
  }

  console.log('[SunoAutomator] 🎉 2 faixas geradas e validadas com sucesso:', clipsFinalizados.map(c => c.audioUrl));
  return {
    success: true,
    clips: clipsFinalizados
  };
}

/**
 * Extrai o áudio MP3 oficial gerado pelo Suno através da sessão autenticada.
 */
async function extrairAudioOficial(page, clipId, clipTitle = 'musica') {
  console.log(`[SunoAutomator] 📥 Extraindo MP3 oficial para clipe: ${clipId}...`);

  // 1. Tenta obter via API autenticada interna do Suno dentro do navegador
  try {
    const res = await page.evaluate(async (uuid) => {
      try {
        let token = null;
        if (window.Clerk?.session) {
          token = await window.Clerk.session.getToken();
        }
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        // Consulta feed do Suno
        const feedRes = await fetch(`https://studio-api.prod.suno.com/api/feed/v2?ids=${uuid}`, {
          headers,
          credentials: 'include'
        });

        let targetUrl = null;
        if (feedRes.ok) {
          const data = await feedRes.json();
          const items = Array.isArray(data) ? data : (data.clips || []);
          const item = items.find(c => c.id === uuid) || items[0];
          targetUrl = item?.audio_url;
        }

        if (!targetUrl) {
          targetUrl = `https://audiopipe.suno.ai/?item_id=${uuid}`;
        }

        // Baixa o arquivo MP3 com os cookies de sessão do navegador
        const audioFetch = await fetch(targetUrl, { credentials: 'include' });
        if (audioFetch.ok) {
          const ab = await audioFetch.arrayBuffer();
          if (ab.byteLength > 100000) {
            return {
              ok: true,
              url: targetUrl,
              size: ab.byteLength,
              bytes: Array.from(new Uint8Array(ab))
            };
          }
        }
        return { ok: false, status: audioFetch?.status };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, clipId);

    if (res?.ok && res?.bytes?.length > 100000) {
      const buf = Buffer.from(res.bytes);
      console.log(`[SunoAutomator] 🎯 MP3 oficial extraído com sucesso (${(buf.length / 1024 / 1024).toFixed(2)} MB)!`);
      return { buffer: buf, audioUrl: res.url };
    }
  } catch (err) {
    console.warn(`[SunoAutomator] Tentativa de extração via API do navegador:`, err.message);
  }

  // 2. Se a API interna não respondeu, tenta o download direto pelo menu de contexto do clipe no Suno
  try {
    const card = page.locator(`a[href*="${clipId}"]`).first();
    if (await card.isVisible({ timeout: 2000 }).catch(() => false)) {
      const row = card.locator('xpath=ancestor::div[contains(@class, "group") or contains(@class, "row") or contains(@class, "card")]').first();
      await row.hover().catch(() => {});
      await page.waitForTimeout(300);

      const moreBtn = row.locator('button[aria-label*="More" i], button:has(svg)').last();
      if (await moreBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await moreBtn.click().catch(() => {});
        await page.waitForTimeout(400);

        const dlOpt = page.locator('[role="menuitem"]:has-text("Download"), div:has-text("Download")').first();
        if (await dlOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
          await dlOpt.hover().catch(() => {});
          await dlOpt.click().catch(() => {});
          await page.waitForTimeout(400);

          const audioOpt = page.locator('[role="menuitem"]:has-text("Audio"), div:has-text("Audio")').first();
          if (await audioOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 15000 }),
              audioOpt.click()
            ]);
            const p = await download.path();
            if (p && fs.existsSync(p)) {
              const buf = await fs.promises.readFile(p);
              console.log(`[SunoAutomator] 🎯 MP3 oficial baixado via interface (${(buf.length / 1024 / 1024).toFixed(2)} MB)!`);
              return { buffer: buf, audioUrl: download.url() };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[SunoAutomator] Tentativa de download via interface:`, err.message);
  }

  return { buffer: null, audioUrl: `https://audiopipe.suno.ai/?item_id=${clipId}` };
}

/**
 * Fecha o navegador quando o processo é encerrado.
 */
export async function closeSunoBrowser() {
  if (browserContext) {
    try {
      await browserContext.close();
    } catch (e) {}
    browserContext = null;
    activePage = null;
  }
}
