import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USER_DATA_DIR = path.resolve(__dirname, 'perfil-chrome');

let browserContext = null;
let activePage = null;

/**
 * Inicializa ou reaproveita o navegador com perfil persistente.
 */
export async function initSunoBrowser(options = {}) {
  const { headless = false } = options;

  if (browserContext && activePage && !activePage.isClosed()) {
    return { context: browserContext, page: activePage };
  }

  console.log('[SunoAutomator] 🚀 Iniciando navegador Chrome com perfil persistente...');
  browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox'
    ]
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
 * Verifica se o usuário está logado. Se não, aguarda login manual.
 */
async function verificarAutenticacao(page) {
  try {
    await page.waitForTimeout(3000);
    const content = await page.content();

    const precisaLogin = content.includes('Sign In') || content.includes('Sign in') || content.includes('Log In') || content.includes('Log in');
    const temCreate = content.includes('Create') || content.includes('Custom') || content.includes('Lyrics');

    if (precisaLogin && !temCreate) {
      console.log('\n=============================================================');
      console.log('⚠️ [ATENÇÃO] CONTA NÃO AUTENTICADA NO SUNO!');
      console.log('Por favor, faça login na janela do navegador que se abriu.');
      console.log('O robô detectará seu login automaticamente assim que terminar.');
      console.log('=============================================================\n');

      // Aguarda até o usuário completar o login (até 5 minutos)
      await page.waitForFunction(() => {
        const text = document.body.innerText || '';
        return (text.includes('Create') || text.includes('Custom')) && !text.includes('Sign In');
      }, { timeout: 300000 });

      console.log('[SunoAutomator] ✅ Login no Suno detectado com sucesso!');
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
    const customSwitch = page.locator('button:has-text("Custom"), [aria-label*="Custom" i], input[type="checkbox"]:has-text("Custom")').first();
    const isCustomVisible = await customSwitch.isVisible({ timeout: 4000 }).catch(() => false);
    if (isCustomVisible) {
      const isChecked = await customSwitch.getAttribute('aria-checked') || await customSwitch.getAttribute('data-state');
      if (isChecked !== 'true' && isChecked !== 'checked') {
        await customSwitch.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
  } catch (e) {
    console.log('[SunoAutomator] Modo Custom já ativo ou botão não encontrado:', e.message);
  }

  // 2. Preenche a Letra (Lyrics)
  onProgress('Preenchendo letra da música...');
  const lyricsInput = page.locator('textarea[placeholder*="lyrics" i], textarea[placeholder*="letra" i], textarea[aria-label*="lyrics" i]').first();
  await lyricsInput.waitFor({ state: 'visible', timeout: 15000 });
  await lyricsInput.fill(prompt);
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
  await createButton.click();

  await page.waitForTimeout(4000);

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
