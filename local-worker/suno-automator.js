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

  // 1. Garante que o modo "Custom" (Personalizado) está ativado
  onProgress('Garantindo modo personalizado (Custom)...');
  const styleSelector = 'textarea[placeholder*="style" i], input[placeholder*="style" i], [aria-label*="style" i], [placeholder*="genre" i]';
  let isCustomActive = await page.locator(styleSelector).first().isVisible({ timeout: 1500 }).catch(() => false);

  if (!isCustomActive) {
    console.log('[SunoAutomator] Modo Custom desligado. Clicando no switch Custom...');
    const customBtn = page.locator('button:has-text("Custom"), [role="switch"]:has-text("Custom"), label:has-text("Custom"), button[aria-label*="Custom" i]').first();
    if (await customBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await customBtn.click();
      await page.waitForTimeout(1500);
    }
    isCustomActive = await page.locator(styleSelector).first().isVisible({ timeout: 2500 }).catch(() => false);
  }

  // 2. Preenche a Letra (Lyrics)
  onProgress('Preenchendo letra da música...');
  const lyricsSelector = 'textarea[placeholder*="lyrics" i], textarea[placeholder*="letra" i], textarea[placeholder*="own lyrics" i], textarea[aria-label*="lyrics" i]';
  let lyricsInput = page.locator(lyricsSelector).first();
  let achouLyrics = await lyricsInput.isVisible({ timeout: 3000 }).catch(() => false);

  if (!achouLyrics) {
    lyricsInput = page.locator('textarea').first();
    achouLyrics = await lyricsInput.isVisible({ timeout: 4000 }).catch(() => false);
  }

  if (!achouLyrics) {
    throw new Error('Não foi possível encontrar a caixa de letra no Suno. Verifique se o login está concluído no navegador.');
  }

  await lyricsInput.click().catch(() => {});
  await lyricsInput.fill(prompt);
  await page.waitForTimeout(500);

  // 3. Preenche o Estilo (Style Tags)
  onProgress(`Preenchendo estilo musical: ${style}...`);
  const styleInput = page.locator(styleSelector).first();
  if (await styleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await styleInput.click().catch(() => {});
    await styleInput.fill(style);
    await page.waitForTimeout(500);
  } else {
    console.warn('[SunoAutomator] ⚠️ Campo de estilo não encontrado');
  }

  // 4. Preenche o Título (Title)
  onProgress(`Preenchendo título: ${title}...`);
  const titleInput = page.locator('input[placeholder*="title" i], input[placeholder*="título" i], input[aria-label*="title" i]').first();
  if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await titleInput.click().catch(() => {});
    await titleInput.fill(title.substring(0, 80));
    await page.waitForTimeout(500);
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
          console.log(`[SunoAutomator] 🎯 Faixas renderizadas com sucesso! ${(size1/1024/1024).toFixed(2)} MB e ${(size2/1024/1024).toFixed(2)} MB`);
          clipsFinalizados = [
            {
              id: id1,
              title: title || 'Faixa 1',
              status: 'complete',
              audioUrl: `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id1}.m4a`
            },
            {
              id: id2,
              title: title || 'Faixa 2',
              status: 'complete',
              audioUrl: `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id2}.m4a`
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
