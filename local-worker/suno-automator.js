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
  onProgress('Ativando modo personalizado (Custom)...');
  try {
    const customSwitch = page.locator('button:has-text("Custom"), [role="switch"]:has-text("Custom"), label:has-text("Custom"), span:has-text("Custom")').first();
    const isCustomVisible = await customSwitch.isVisible({ timeout: 3000 }).catch(() => false);
    if (isCustomVisible) {
      const temTextarea = await page.locator('textarea').first().isVisible({ timeout: 1000 }).catch(() => false);
      if (!temTextarea) {
        await customSwitch.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
  } catch (e) {
    console.log('[SunoAutomator] Modo Custom:', e.message);
  }

  // 2. Preenche a Letra (Lyrics)
  onProgress('Preenchendo letra da música...');
  let lyricsInput = page.locator('textarea[placeholder*="lyrics" i], textarea[placeholder*="letra" i], textarea[placeholder*="own" i], textarea[aria-label*="lyrics" i]').first();
  let achouLyrics = await lyricsInput.isVisible({ timeout: 4000 }).catch(() => false);

  if (!achouLyrics) {
    lyricsInput = page.locator('textarea').first();
    achouLyrics = await lyricsInput.isVisible({ timeout: 6000 }).catch(() => false);
  }

  if (!achouLyrics) {
    throw new Error('Não foi possível encontrar a caixa de letra no Suno. Verifique se o login está concluído no navegador.');
  }

  await lyricsInput.fill(prompt);
  await page.waitForTimeout(500);
  await page.waitForTimeout(500);

  // 3. Preenche o Estilo (Style)
  onProgress('Preenchendo estilo musical...');
  const styleInput = page.locator('textarea[placeholder*="style" i], input[placeholder*="style" i], [aria-label*="style of music" i]').first();
  if (await styleInput.isVisible().catch(() => false)) {
    await styleInput.fill(style);
    await page.waitForTimeout(500);
  }

  // 4. Preenche o Título (Title)
  onProgress('Preenchendo título...');
  const titleInput = page.locator('input[placeholder*="title" i], input[aria-label*="title" i]').first();
  if (await titleInput.isVisible().catch(() => false)) {
    await titleInput.fill(title.substring(0, 80));
    await page.waitForTimeout(500);
  }

  // 5. Prepara escuta da API interna de feed do Suno para capturar os clip IDs
  let createdClipIds = [];
  const feedListener = async (response) => {
    try {
      const url = response.url();
      if ((url.includes('/api/generate') || url.includes('/api/feed')) && response.status() === 200) {
        const data = await response.json().catch(() => null);
        if (data) {
          const list = Array.isArray(data) ? data : (data.clips || data.data || []);
          for (const item of list) {
            if (item?.id && !createdClipIds.includes(item.id)) {
              createdClipIds.push(item.id);
            }
          }
        }
      }
    } catch (e) {}
  };

  page.on('response', feedListener);

  // 6. Clica em "Create"
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
    page.off('response', feedListener);
    throw new Error('INSUFFICIENT_CREDITS: A conta oficial do Suno está sem créditos suficientes.');
  }
  if (bodyText.includes('flagged by our moderation') || bodyText.includes('Moderation error')) {
    page.off('response', feedListener);
    throw new Error('MODERATION_ERROR: O Suno bloqueou termos na letra ou estilo.');
  }

  // 7. Aguarda os clipes finalizarem e extrai as URLs
  onProgress('Aguardando Suno finalizar as 2 faixas...');
  const startTime = Date.now();
  const MAX_WAIT_MS = 240000; // 4 minutos máximo por geração

  let clipsFinalizados = [];

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    onProgress(`Aguardando renderização no Suno (${elapsed}s decorridos)...`);

    // Consulta os clipes no contexto da página usando o fetch interno com cookies da sessão
    const result = await page.evaluate(async (clipIds) => {
      try {
        const query = clipIds.length > 0 ? `?ids=${clipIds.join(',')}` : '';
        const res = await fetch(`https://studio-api.suno.ai/api/feed/${query}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.clips || []);
        return list.map(c => ({
          id: c.id,
          title: c.title,
          status: c.status,
          audioUrl: c.audio_url || `https://cdn1.suno.ai/${c.id}.mp3`,
          duration: c.duration
        }));
      } catch (e) {
        return null;
      }
    }, createdClipIds);

    if (result && result.length > 0) {
      const prontos = result.filter(c => c.status === 'complete' && c.audioUrl);
      if (prontos.length >= 2) {
        clipsFinalizados = prontos.slice(0, 2);
        break;
      }
    }

    await page.waitForTimeout(4000);
  }

  page.off('response', feedListener);

  if (clipsFinalizados.length === 0) {
    throw new Error('TIMEOUT: O Suno demorou mais de 4 minutos para finalizar as faixas.');
  }

  console.log('[SunoAutomator] 🎉 2 faixas geradas com sucesso:', clipsFinalizados.map(c => c.audioUrl));
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
