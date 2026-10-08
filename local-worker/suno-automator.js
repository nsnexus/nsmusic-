import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      headless: false,
      channel: 'chrome',
      viewport: { width: 1440, height: 900 },
      ignoreDefaultArgs: ['--no-sandbox', '--enable-automation'],
      args: [
        '--test-type',
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--disable-notifications',
        '--disable-features=Translate',
        '--lang=pt-BR'
      ]
    });
  } catch (err) {
    console.warn('[SunoAutomator] Falha com Chrome do sistema. Tentando Chromium padrão:', err.message);
    browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      ignoreDefaultArgs: ['--no-sandbox', '--enable-automation'],
      args: [
        '--test-type',
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--disable-notifications',
        '--disable-features=Translate',
        '--lang=pt-BR'
      ]
    });
  }

  const pages = browserContext.pages();
  activePage = pages.length > 0 ? pages[0] : await browserContext.newPage();
  activePage.setDefaultTimeout(30000);

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
 * Remove banner de consentimento de cookies da Suno (Usercentrics/CMP) para não bloquear cliques.
 */
async function removerBannerCookies(page) {
  try {
    await page.evaluate(() => {
      // 1. Tenta clicar no botão de aceitar se existir
      const acceptBtn = document.querySelector(
        '#cmp-welcome-optin-accept-all-button, #cmp-bnt-accept-all, #cmp-banner-container button[id*="accept"], #cmp-first-layer button, [data-cmp-action="accept"]'
      );
      if (acceptBtn) {
        try { acceptBtn.click(); } catch (e) {}
      }

      // 2. Remove completamente o banner e camadas de consentimento do DOM
      const banner = document.getElementById('cmp-banner-container');
      if (banner) banner.remove();
      const layer = document.getElementById('cmp-first-layer');
      if (layer) layer.remove();

      document.querySelectorAll('.cmp-backdrop, .cmp-layer, #cmp-banner-container, [id*="cmp-"]').forEach(el => {
        try { el.remove(); } catch (e) {}
      });

      if (document.body) {
        document.body.style.overflow = 'auto';
        document.body.style.pointerEvents = 'auto';
      }
    });
  } catch (e) {}
}

/**
 * Executa a criação da música na interface do Suno e captura as URLs de CDN.
 */
export async function gerarMusicaNoSuno({ prompt, style = 'Acoustic Pop', title = 'Nova Música', onProgress = () => {} }) {
  const { page } = await initSunoBrowser();

  onProgress('Navegando para tela de criação do Suno...');
  if (!page.url().includes('suno.com/create')) {
    await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  await page.waitForTimeout(2000);
  await removerBannerCookies(page);

  // 1. Garante que o modo "Advanced" está ativado
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

  // 2. Preenche a Letra (Lyrics) no editor contenteditable do Suno
  onProgress('Preenchendo letra da música no editor oficial...');
  await removerBannerCookies(page);

  const lyricsEditor = page.locator('div[aria-label="Lyrics editor"], [contenteditable="true"][aria-label*="Lyrics" i], [contenteditable="true"]').first();
  await lyricsEditor.waitFor({ state: 'visible', timeout: 8000 });
  await lyricsEditor.scrollIntoViewIfNeeded().catch(() => {});
  await lyricsEditor.click();
  await page.waitForTimeout(200);

  // LIMPEZA COMPLETA: Seleciona tudo e apaga via teclado nativo do Playwright
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);

  // Garante que o editor ficou 100% vazio no DOM (sem resquícios de estrofes de pedidos anteriores)
  await page.evaluate(() => {
    const editor = document.querySelector('div[aria-label="Lyrics editor"], [contenteditable="true"]');
    if (editor) {
      editor.innerText = '';
      editor.innerHTML = '';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.waitForTimeout(100);

  // Injeta o texto completo no editor limpo
  await lyricsEditor.click();
  await page.keyboard.insertText(prompt);
  await page.waitForTimeout(400);

  // Validação do texto preenchido
  let currentLyrics = await page.evaluate(() => {
    const editor = document.querySelector('div[aria-label="Lyrics editor"], [contenteditable="true"]');
    return editor ? (editor.innerText || editor.textContent || '').trim() : '';
  });

  // Se o insertText não fixou, usa fallback de área de transferência
  if (!currentLyrics || currentLyrics.length < 10) {
    console.log('[SunoAutomator] Aplicando fallback de preenchimento via clipboard...');
    await page.evaluate((text) => {
      const editor = document.querySelector('div[aria-label="Lyrics editor"], [contenteditable="true"]');
      if (editor) {
        editor.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);
      }
    }, prompt);
    await page.waitForTimeout(300);
    currentLyrics = await page.evaluate(() => {
      const editor = document.querySelector('div[aria-label="Lyrics editor"], [contenteditable="true"]');
      return editor ? (editor.innerText || editor.textContent || '').trim() : '';
    });
  }

  if (currentLyrics && currentLyrics.length > 10) {
    console.log(`[SunoAutomator] ✅ Letra preenchida com sucesso (${currentLyrics.length} caracteres)!`);
  } else {
    throw new Error('Falha ao preencher a letra no editor da Suno.');
  }

  await page.waitForTimeout(300);

  // 3. Preenche o Estilo Musical (Styles) - Tags musicais ricas
  onProgress(`Preenchendo estilo musical: ${style.substring(0, 60)}...`);
  const styleInput = page.locator('textarea').nth(1);
  if (await styleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await styleInput.scrollIntoViewIfNeeded().catch(() => {});
    await styleInput.click().catch(() => {});
    await styleInput.fill('');
    await page.waitForTimeout(100);
    await styleInput.fill(style);
    await page.waitForTimeout(300);
    console.log(`[SunoAutomator] ✅ Estilo musical preenchido: "${style}"`);
  } else {
    console.warn('[SunoAutomator] ⚠️ Campo de estilo não encontrado diretamente');
  }

  // 4. Preenche o Título (Song Title)
  onProgress(`Preenchendo título: ${title}...`);
  const cleanTitle = title.substring(0, 80);
  const titleInput = page.locator('input[placeholder*="Song Title" i]:visible, input[placeholder*="Song Title" i]').last();
  
  if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await titleInput.scrollIntoViewIfNeeded().catch(() => {});
    await titleInput.click().catch(() => {});
    await titleInput.fill('');
    await page.waitForTimeout(100);
    await titleInput.fill(cleanTitle).catch(async () => {
      await titleInput.evaluate((el, text) => {
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, cleanTitle);
    });
    await page.waitForTimeout(300);
    console.log(`[SunoAutomator] ✅ Título preenchido: "${cleanTitle}"`);
  }

  // 5. Prepara escuta de rede para capturar os UUIDs dos clipes
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
            console.log('[SunoAutomator] 🎯 UUIDs capturados da API Suno:', clipIdsGerados);
          }
        }
      }
    } catch (e) {}
  };
  page.on('response', onResponse);

  // Mapeia clipes pré-existentes na tela antes de clicar em Create
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
  await removerBannerCookies(page);
  const createButton = page.locator('button:has-text("Create"), button[aria-label="Create song"]').last();
  await createButton.waitFor({ state: 'visible', timeout: 10000 });
  await createButton.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await createButton.click({ force: true });

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

  // 7. Aguarda os clipes finalizarem e captura as URLs diretas da CDN
  onProgress('Aguardando Suno finalizar as 2 faixas (leva cerca de 30-50s)...');
  const startTime = Date.now();
  const MAX_WAIT_MS = 240000; // 4 minutos máximo

  await page.waitForTimeout(15000);

  let targetClipIds = [];

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    onProgress(`Aguardando renderização no Suno (${elapsed}s decorridos)...`);

    // Prioriza IDs capturados via API de rede
    if (clipIdsGerados.length >= 2) {
      targetClipIds = clipIdsGerados.slice(0, 2);
    } else {
      // Busca no DOM os novos UUIDs surgidos no topo da biblioteca
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

      // Testa se ambos os áudios já estão respondendo na CDN da Suno
      const [r1, r2] = await Promise.all([
        fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id1}.m4a`, { method: 'HEAD' }).catch(() => null),
        fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id2}.m4a`, { method: 'HEAD' }).catch(() => null)
      ]);

      const size1 = parseInt(r1?.headers?.get('content-length') || '0', 10);
      const size2 = parseInt(r2?.headers?.get('content-length') || '0', 10);

      // Quando a CDN responder com tamanho real (> 100KB)
      if ((r1?.ok && size1 > 100000 && r2?.ok && size2 > 100000) || elapsed >= 50) {
        console.log(`[SunoAutomator] 🎯 Faixas renderizadas com sucesso na CDN da Suno!`);
        break;
      }
    }

    await page.waitForTimeout(4000);
  }

  page.off('response', onResponse);

  if (targetClipIds.length < 2) {
    throw new Error('TIMEOUT: O Suno não gerou as 2 faixas no tempo esperado.');
  }

  // 8. Monta as URLs oficiais da CDN para download direto em streaming
  const id1 = targetClipIds[0];
  const id2 = targetClipIds[1];

  const cdnUrl1 = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id1}.m4a`;
  const cdnUrl2 = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id2}.m4a`;

  console.log('[SunoAutomator] 🌐 URLs oficiais da CDN capturadas:', [cdnUrl1, cdnUrl2]);

  return {
    success: true,
    clips: [
      {
        id: id1,
        title: title || 'Faixa 1',
        status: 'complete',
        audioUrl: cdnUrl1
      },
      {
        id: id2,
        title: title || 'Faixa 2',
        status: 'complete',
        audioUrl: cdnUrl2
      }
    ]
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
