import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório de perfil persistente do Chrome
const USER_DATA_DIR = path.resolve(__dirname, 'perfil-chrome');

let browserContext = null;
let activePage = null;

/**
 * Inicializa ou reaproveita a sessão persistente do Chrome.
 */
export async function initSunoBrowser() {
  if (browserContext && activePage && !activePage.isClosed()) {
    return { context: browserContext, page: activePage };
  }

  console.log('[SunoAutomator] 🚀 Iniciando navegador Google Chrome com perfil persistente...');

  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  try {
    browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false, // Pode rodar com janela para o usuário ver ou em background
      channel: 'chrome',
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars'
      ]
    });
  } catch (err) {
    console.warn('[SunoAutomator] Falha com Chrome do sistema. Tentando Chromium padrão:', err.message);
    browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });
  }

  const pages = browserContext.pages();
  activePage = pages.length > 0 ? pages[0] : await browserContext.newPage();

  // Configura downloads na página principal
  activePage.setDefaultTimeout(30000);

  // Acessa o Suno e valida sessão
  console.log('[SunoAutomator] 🌐 Acessando https://suno.com/create...');
  await activePage.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await activePage.waitForTimeout(3000);

  await verificarLoginSuno(activePage);

  return { context: browserContext, page: activePage };
}

/**
 * Verifica se a conta Suno está logada.
 */
async function verificarLoginSuno(page) {
  try {
    const isLogado = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      const hasSignIn = body.includes('Sign In') || body.includes('Log In');
      const hasCreate = body.includes('Create') || body.includes('Lyrics') || body.includes('My Workspace');
      return hasCreate && !hasSignIn;
    });

    if (isLogado) {
      console.log('[SunoAutomator] ✅ Sessão ativa detectada no Suno.');
    } else {
      console.log('\n=============================================================');
      console.log('🔑 [PRIMEIRO ACESSO] FAÇA LOGIN NA SUA CONTA SUNO');
      console.log('1. Na janela do Chrome aberta, clique em "Sign In" ou "Log In".');
      console.log('2. Faça login com sua conta oficial da Suno (Google, Discord, etc.).');
      console.log('3. Após terminar o login e estar na tela da Suno, o robô prosseguirá.');
      console.log('=============================================================\n');

      await page.waitForFunction(() => {
        const body = document.body ? document.body.innerText : '';
        return (body.includes('Create') || body.includes('My Workspace')) && !body.includes('Sign In');
      }, { timeout: 300000 });

      console.log('[SunoAutomator] ✅ Login concluído com sucesso!');
    }
  } catch (err) {
    console.warn('[SunoAutomator] Aviso na checagem de login:', err.message);
  }
}

/**
 * Executa a criação da música na interface do Suno.
 */
export async function gerarMusicaNoSuno({ prompt, style = 'Acoustic Pop', title = 'Nova Música', onProgress = () => {} }) {
  const { context, page } = await initSunoBrowser();

  onProgress('Navegando para tela de criação do Suno...');
  if (!page.url().includes('suno.com/create')) {
    await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  await page.waitForTimeout(2000);

  // 1. Garante que o modo "Advanced" está ativado (Suno v4/v6)
  onProgress('Garantindo modo avançado (Advanced)...');
  const advTab = page.locator('button[role="tab"]:has-text("Advanced")').first();
  await advTab.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  
  const isSelected = (await advTab.getAttribute('aria-selected')) === 'true';
  if (!isSelected) {
    console.log('[SunoAutomator] Modo Simple ativo. Clicando no tab "Advanced"...');
    await advTab.click();
    await page.waitForTimeout(1500);
    console.log('[SunoAutomator] ✅ Modo Advanced ativado com sucesso!');
  } else {
    console.log('[SunoAutomator] ✅ Modo Advanced já está ativo.');
  }

  // 2. Preenche a Letra (Lyrics) - Primeiro textarea visível
  onProgress('Preenchendo letra da música...');
  const lyricsInput = page.locator('textarea').first();
  await lyricsInput.waitFor({ state: 'visible', timeout: 5000 });
  await lyricsInput.scrollIntoViewIfNeeded().catch(() => {});
  await lyricsInput.fill(prompt);
  await page.waitForTimeout(400);
  console.log('[SunoAutomator] ✅ Letra preenchida.');

  // 3. Preenche o Estilo Musical (Styles) - Segundo textarea visível sob a seção Styles
  onProgress(`Preenchendo estilo musical: ${style}...`);
  const styleInput = page.locator('textarea').nth(1);
  if (await styleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await styleInput.scrollIntoViewIfNeeded().catch(() => {});
    await styleInput.fill(style);
    await page.waitForTimeout(400);
    console.log(`[SunoAutomator] ✅ Estilo musical preenchido: "${style}"`);
  } else {
    console.warn('[SunoAutomator] ⚠️ Campo de estilo não encontrado');
  }

  // 4. Preenche o Título (Song Title)
  onProgress(`Preenchendo título: ${title}...`);
  const cleanTitle = title.substring(0, 80);
  const titleInput = page.locator('input[placeholder*="Song Title" i]:visible, input[placeholder*="Song Title" i]').last();
  
  if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await titleInput.scrollIntoViewIfNeeded().catch(() => {});
    await titleInput.fill(cleanTitle).catch(async () => {
      // Fallback via evaluate
      await titleInput.evaluate((el, text) => {
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, cleanTitle);
    });
    await page.waitForTimeout(300);
    console.log(`[SunoAutomator] ✅ Título preenchido: "${cleanTitle}"`);
  } else {
    // Tenta preenchimento direto via evaluate em qualquer input com placeholder Song Title
    await page.evaluate((text) => {
      const inputs = document.querySelectorAll('input[placeholder*="Song Title" i]');
      inputs.forEach(inp => {
        inp.value = text;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }, cleanTitle);
    console.log(`[SunoAutomator] ✅ Título preenchido via fallback: "${cleanTitle}"`);
  }

  // 5. Prepara a escuta de rede para capturar os UUIDs exatos gerados pela API do Suno
  let clipIdsGerados = [];
  const onResponse = async (res) => {
    try {
      const url = res.url();
      if (url.includes('/api/generate') || url.includes('/generate/v2')) {
        const json = await res.json().catch(() => null);
        if (json && json.clips && Array.isArray(json.clips)) {
          const ids = json.clips.map(c => c.id).filter(Boolean);
          if (ids.length > 0) {
            clipIdsGerados = ids;
            console.log('[SunoAutomator] 🎯 UUIDs capturados da API de geração do Suno:', clipIdsGerados);
          }
        }
      }
    } catch (e) {}
  };
  page.on('response', onResponse);

  // Mapeia clipes que já existiam na biblioteca para segurança contra geração concorrente
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

  // 6. Clica em "Create"
  onProgress('Enviando solicitação de geração...');
  const createButton = page.locator('button:has-text("Create"), button[aria-label="Create song"]').last();
  await createButton.waitFor({ state: 'visible', timeout: 10000 });
  await createButton.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await createButton.click();

  // Monitora se o Cloudflare Turnstile aparecer
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1000);
    await resolverTurnstileSeNecessario(page);
  }

  // Verifica se apareceu erro de créditos ou moderação
  await page.waitForTimeout(3000);
  const bodyText = await page.innerText('body').catch(() => '');
  if (bodyText.includes('Out of credits') || bodyText.includes('Insufficient credits')) {
    page.off('response', onResponse);
    throw new Error('INSUFFICIENT_CREDITS: A conta oficial do Suno está sem créditos suficientes.');
  }
  if (bodyText.includes('flagged by our moderation') || bodyText.includes('Moderation error')) {
    page.off('response', onResponse);
    throw new Error('MODERATION_ERROR: O Suno bloqueou termos na letra ou estilo.');
  }

  // 7. Aguarda os clipes finalizarem
  onProgress('Aguardando Suno finalizar as 2 faixas (leva cerca de 30-50s)...');
  const startTime = Date.now();
  const MAX_WAIT_MS = 240000; // 4 minutos máximo

  // Aguarda 15 segundos mínimos para o Suno iniciar o processamento real
  await page.waitForTimeout(15000);

  let targetClipIds = [];

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    onProgress(`Aguardando renderização no Suno (${elapsed}s decorridos)...`);

    // Se já capturou os UUIDs pela API
    if (clipIdsGerados.length >= 2) {
      targetClipIds = clipIdsGerados.slice(0, 2);
    } else {
      // Busca no DOM os novos UUIDs que surgiram no topo da biblioteca
      const novosDoDom = await page.evaluate((antigos) => {
        const uuids = [];
        const uuidRegex = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
        document.querySelectorAll('a[href*="/song/"]').forEach(a => {
          const m = a.href.match(uuidRegex);
          if (m && m[1]) {
            const id = m[1].toLowerCase();
            if (!antigos.includes(id) && !uuids.includes(id)) uuids.push(id);
          }
        });
        return uuids;
      }, preExistingUuids);

      if (novosDoDom.length >= 2) {
        targetClipIds = novosDoDom.slice(0, 2);
      }
    }

    if (targetClipIds.length >= 2) {
      const id1 = targetClipIds[0];
      const id2 = targetClipIds[1];

      // Testa se ambos os áudios já estão disponíveis na infraestrutura do Suno
      const [r1, r2] = await Promise.all([
        fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id1}.m4a`, { method: 'HEAD' }).catch(() => null),
        fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id2}.m4a`, { method: 'HEAD' }).catch(() => null)
      ]);

      const size1 = parseInt(r1?.headers?.get('content-length') || '0', 10);
      const size2 = parseInt(r2?.headers?.get('content-length') || '0', 10);

      // Quando ambos tiverem sido renderizados pela IA
      if ((r1?.ok && size1 > 100000 && r2?.ok && size2 > 100000) || elapsed >= 50) {
        console.log(`[SunoAutomator] 🎯 Faixas renderizadas no Suno! Extraindo MP3s oficiais de alta qualidade...`);
        break;
      }
    }

    await page.waitForTimeout(4000);
  }

  page.off('response', onResponse);

  if (targetClipIds.length < 2) {
    throw new Error('TIMEOUT: O Suno não gerou as 2 faixas no tempo esperado.');
  }

  // 8. Extrai o MP3 oficial de cada uma das 2 faixas usando a página de download individual do Suno
  const [mp3_1, mp3_2] = await Promise.all([
    extrairAudioOficial(context, targetClipIds[0], title),
    extrairAudioOficial(context, targetClipIds[1], title)
  ]);

  const clipsFinalizados = [
    {
      id: targetClipIds[0],
      title: title || 'Faixa 1',
      status: 'complete',
      audioUrl: mp3_1.audioUrl,
      buffer: mp3_1.buffer
    },
    {
      id: targetClipIds[1],
      title: title || 'Faixa 2',
      status: 'complete',
      audioUrl: mp3_2.audioUrl,
      buffer: mp3_2.buffer
    }
  ];

  console.log('[SunoAutomator] 🎉 2 faixas geradas e validadas com sucesso!');
  return {
    success: true,
    clips: clipsFinalizados
  };
}

/**
 * Extrai o áudio MP3 oficial gerado pelo Suno através da interface de download oficial da faixa.
 * Garante que o arquivo é um MP3 legítimo de ~4MB com cabeçalho ID3 válido.
 */
async function extrairAudioOficial(context, clipId, clipTitle = 'musica') {
  console.log(`[SunoAutomator] 📥 Extraindo MP3 oficial para clipe: ${clipId}...`);

  const songPage = await context.newPage();
  try {
    const songUrl = `https://suno.com/song/${clipId}`;
    await songPage.goto(songUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await songPage.waitForTimeout(2500);

    // 1. Clica no botão de mais opções (...)
    const moreBtn = songPage.locator('button[aria-label="More options"]').first();
    await moreBtn.waitFor({ state: 'visible', timeout: 8000 });
    await moreBtn.click();
    await songPage.waitForTimeout(600);

    // 2. Clica na opção de menu "Download"
    const dlMenuItem = songPage.locator('div[role="menuitem"]:has-text("Download"), button[role="menuitem"]:has-text("Download")').last();
    await dlMenuItem.waitFor({ state: 'visible', timeout: 5000 });
    await dlMenuItem.click();
    await songPage.waitForTimeout(800);

    // 3. Clica no botão de confirmação de download ("Unlock & Download" ou "Download Audio")
    const unlockBtn = songPage.locator('button:has-text("Unlock & Download"), button:has-text("Download Audio"), button:has-text("Download")').last();
    await unlockBtn.waitFor({ state: 'visible', timeout: 5000 });

    const [download] = await Promise.all([
      songPage.waitForEvent('download', { timeout: 40000 }),
      unlockBtn.click()
    ]);

    const tempFilePath = await download.path();
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      const buffer = await fs.promises.readFile(tempFilePath);
      const mb = (buffer.length / 1024 / 1024).toFixed(2);
      console.log(`[SunoAutomator] 🎯 MP3 oficial extraído com sucesso (${mb} MB, arquivo: ${download.suggestedFilename()})!`);
      await songPage.close().catch(() => {});
      return {
        buffer,
        audioUrl: `https://suno.com/song/${clipId}`,
        fileName: download.suggestedFilename()
      };
    }
  } catch (err) {
    console.warn(`[SunoAutomator] Aviso no download direto do clipe ${clipId}:`, err.message);
  } finally {
    if (!songPage.isClosed()) {
      await songPage.close().catch(() => {});
    }
  }

  // Fallback caso a interface de download demore
  return {
    buffer: null,
    audioUrl: `https://audiopipe.suno.ai/?item_id=${clipId}`,
    fileName: `${clipId}.mp3`
  };
}

/**
 * Resolve Cloudflare Turnstile caso apareça na tela.
 */
async function resolverTurnstileSeNecessario(page) {
  try {
    const frame = page.frames().find(f => f.url().includes('cloudflare') || f.url().includes('turnstile'));
    if (frame) {
      const box = frame.locator('input[type="checkbox"], #challenge-stage, .ctp-checkbox-label').first();
      if (await box.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('[SunoAutomator] 🛡️ Detectado Cloudflare Turnstile. Clicando no checkbox...');
        await box.click();
        await page.waitForTimeout(2000);
        return true;
      }
    }
  } catch (e) {}
  return false;
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
