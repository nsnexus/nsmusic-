import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';

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

  // Injeta script furtivo para mascarar automação perante o Cloudflare Turnstile
  await browserContext.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch (e) {}

    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
    } catch (e) {}

    try {
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    } catch (e) {}
  });

  console.log('[SunoAutomator] 🌐 Acessando https://suno.com/create...');
  await activePage.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await activePage.waitForTimeout(3000);

  await verificarLoginSuno(activePage);
  await configurarSlidersSuno(activePage).catch(() => {});

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

  // Ajusta os sliders musicais (Estranheza: 10%, Influência de estilo: 90%, Variedade: Desligada)
  await configurarSlidersSuno(page);

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

  // 5.1 Garante sliders configurados (Estranheza: 10%, Estilo: 90%, Variedade: Desligada)
  onProgress('Garantindo parâmetros musicais (Estranheza 10%, Estilo 90%, Variedade Desligada)...');
  await configurarSlidersSuno(page);

  // 6. Clica em "Create"
  onProgress('Enviando solicitação de geração...');
  await removerBannerCookies(page);
  const createButton = page.locator('button:has-text("Create"), button[aria-label="Create song"]').last();
  await createButton.waitFor({ state: 'visible', timeout: 10000 });
  await createButton.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  // Simula movimento suave do mouse até o botão Create para parecer humano
  const btnBox = await createButton.boundingBox().catch(() => null);
  if (btnBox) {
    const targetX = btnBox.x + btnBox.width / 2;
    const targetY = btnBox.y + btnBox.height / 2;
    await page.mouse.move(targetX, targetY, { steps: 8 }).catch(() => {});
    await page.waitForTimeout(200);
    await page.mouse.click(targetX, targetY).catch(() => createButton.click());
  } else {
    await createButton.click();
  }

  // Monitora se o Cloudflare Turnstile aparecer
  for (let i = 0; i < 6; i++) {
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

  // 7. Aguarda os clipes finalizarem no Suno
  onProgress('Aguardando Suno finalizar as 2 faixas (leva cerca de 45-75s)...');
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
      } else {
        // Se ainda não temos clipes novos na biblioteca, confere se o Turnstile surgiu travando
        await resolverTurnstileSeNecessario(page);
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

      // Aguarda até que ambas as faixas estejam totalmente geradas (> 1.5 MB cada)
      const ambasCompletas = r1?.ok && size1 > 1500000 && r2?.ok && size2 > 1500000;
      const timeoutSeguranca = elapsed >= 110 && r1?.ok && size1 > 500000 && r2?.ok && size2 > 500000;

      if (ambasCompletas || timeoutSeguranca) {
        console.log(`[SunoAutomator] 🎯 Faixas renderizadas com sucesso no Suno (${(size1/1024/1024).toFixed(2)} MB e ${(size2/1024/1024).toFixed(2)} MB)!`);
        break;
      }
    }

    await page.waitForTimeout(4000);
  }

  page.off('response', onResponse);

  if (targetClipIds.length < 2) {
    throw new Error('TIMEOUT: O Suno não gerou as 2 faixas no tempo esperado.');
  }

  const id1 = targetClipIds[0];
  const id2 = targetClipIds[1];

  const cdnUrl1 = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id1}.m4a`;
  const cdnUrl2 = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id2}.m4a`;

  // 8. Extrai o áudio decodificado pelo player do Suno e converte para MP3 256kbps
  let mp3Buffer1 = null;
  let mp3Buffer2 = null;

  try {
    mp3Buffer1 = await extrairMp3DoClip(page, id1, onProgress);
    console.log(`[SunoAutomator] ✅ Faixa 1 convertida para MP3 com sucesso (${(mp3Buffer1.length / 1024 / 1024).toFixed(2)} MB)!`);
  } catch (err) {
    console.warn(`[SunoAutomator] ⚠️ Falha na conversão de MP3 da Faixa 1 (${err.message}). Usando contingência CDN.`);
  }

  try {
    mp3Buffer2 = await extrairMp3DoClip(page, id2, onProgress);
    console.log(`[SunoAutomator] ✅ Faixa 2 convertida para MP3 com sucesso (${(mp3Buffer2.length / 1024 / 1024).toFixed(2)} MB)!`);
  } catch (err) {
    console.warn(`[SunoAutomator] ⚠️ Falha na conversão de MP3 da Faixa 2 (${err.message}). Usando contingência CDN.`);
  }

  // Retorna à tela /create para manter o navegador pronto para a próxima geração
  await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded' }).catch(() => {});

  return {
    success: true,
    clips: [
      {
        id: id1,
        title: title || 'Faixa 1',
        status: 'complete',
        audioUrl: cdnUrl1,
        buffer: mp3Buffer1
      },
      {
        id: id2,
        title: title || 'Faixa 2',
        status: 'complete',
        audioUrl: cdnUrl2,
        buffer: mp3Buffer2
      }
    ]
  };
}

/**
 * Converte um buffer de chunks fMP4 decodificados em MP3 limpo a 256 kbps via ffmpeg.
 */
export async function converterFmp4ParaMp3(fmp4Buffer) {
  const tempInput = path.join(os.tmpdir(), `suno_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
  const tempOutput = path.join(os.tmpdir(), `suno_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);

  try {
    fs.writeFileSync(tempInput, fmp4Buffer);
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-y',
        '-i', tempInput,
        '-codec:a', 'libmp3lame',
        '-b:a', '256k',
        tempOutput
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return fs.readFileSync(tempOutput);
  } finally {
    try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}
    try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
  }
}

/**
 * Captura o áudio completo decodificado pelo player oficial do Suno e converte para MP3 256kbps.
 */
export async function extrairMp3DoClip(page, clipId, onProgress = () => {}) {
  onProgress(`Abrindo página do clipe #${clipId.substring(0, 8)} para captura de áudio...`);

  // Injeta interceptor no SourceBuffer
  await page.evaluate(() => {
    window.__appendedChunks = [];
    if (!window.__origAppendBuffer) {
      window.__origAppendBuffer = SourceBuffer.prototype.appendBuffer;
      SourceBuffer.prototype.appendBuffer = function(buf) {
        window.__appendedChunks.push(Array.from(new Uint8Array(buf)));
        return window.__origAppendBuffer.call(this, buf);
      };
    }
  }).catch(() => {});

  await page.goto(`https://suno.com/song/${clipId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Garante que o interceptor está ativo na página carregada
  await page.evaluate(() => {
    window.__appendedChunks = [];
    if (!window.__origAppendBuffer) {
      window.__origAppendBuffer = SourceBuffer.prototype.appendBuffer;
      SourceBuffer.prototype.appendBuffer = function(buf) {
        window.__appendedChunks.push(Array.from(new Uint8Array(buf)));
        return window.__origAppendBuffer.call(this, buf);
      };
    }
  });

  const playBtn = page.locator('button[aria-label="Play"], button[aria-label*="play" i]').first();
  await playBtn.waitFor({ state: 'visible', timeout: 15000 });
  await playBtn.click();
  await page.waitForTimeout(1000);

  onProgress(`Bufferizando áudio completo do clipe #${clipId.substring(0, 8)}...`);

  // Avança o áudio em passos de 15s para forçar o buffer do clipe inteiro
  const dur = await page.evaluate(async () => {
    const audio = document.querySelector('audio');
    if (!audio) return 0;
    const d = audio.duration || 240;
    for (let t = 10; t < d; t += 15) {
      audio.currentTime = t;
      await new Promise(r => setTimeout(r, 120));
    }
    return d;
  });

  await page.waitForTimeout(800);

  // Pausa o áudio
  await page.evaluate(() => {
    const audio = document.querySelector('audio');
    if (audio) audio.pause();
  }).catch(() => {});

  const chunks = await page.evaluate(() => window.__appendedChunks || []);
  if (chunks.length === 0) {
    throw new Error('Nenhum fragmento de áudio recebido pelo reprodutor da Suno.');
  }

  const rawBuffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
  onProgress(`Convertendo ${(rawBuffer.length / 1024 / 1024).toFixed(2)} MB para formato MP3 (256 kbps)...`);

  const mp3Buffer = await converterFmp4ParaMp3(rawBuffer);
  return mp3Buffer;
}

/**
 * Resolve Cloudflare Turnstile ("Confirme que é humano") caso apareça na tela.
 */
async function resolverTurnstileSeNecessario(page) {
  try {
    // 1. Procura o iframe do Cloudflare Turnstile na página
    const turnstileIframe = page.locator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]').first();
    const existe = await turnstileIframe.count().catch(() => 0);

    if (existe > 0) {
      const box = await turnstileIframe.boundingBox().catch(() => null);
      if (box && box.width > 20 && box.height > 20) {
        // A caixinha do checkbox do Turnstile fica à esquerda (tipicamente 25-35px da borda) e centralizada na vertical
        const clickX = box.x + 30;
        const clickY = box.y + (box.height / 2);
        console.log(`[SunoAutomator] 🛡️ Detectado Cloudflare Turnstile. Simulando clique físico no checkbox em (${Math.round(clickX)}, ${Math.round(clickY)})...`);

        await page.mouse.move(clickX, clickY, { steps: 8 }).catch(() => {});
        await page.waitForTimeout(200);
        await page.mouse.click(clickX, clickY).catch(() => {});
        await page.waitForTimeout(1500);
        return true;
      }

      // Tentativa alternativa via frame locator
      const frame = page.frameLocator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]').first();
      const checkbox = frame.locator('input[type="checkbox"], #challenge-stage, .ctp-checkbox-label, label, span').first();
      if (await checkbox.count().catch(() => 0) > 0) {
        await checkbox.click({ timeout: 2000, force: true }).catch(() => {});
        return true;
      }
    }
  } catch (e) {}
  return false;
}

/**
 * Configura os sliders de geração avançada no Suno:
 * - Estranheza / Weirdness: 10% (0.10) -> "Safe zone | 10%"
 * - Influência de estilo / Style Influence: 90% (0.90) -> "Strong | 90%"
 * - Variedade / Variety: Desligada (0.00 / extremo esquerdo) -> "Exact style | Off"
 */
export async function configurarSlidersSuno(page) {
  try {
    console.log('[SunoAutomator] 🎚️ Calibrando sliders: Weirdness -> 10%, Style Influence -> 90%, Variety -> Desligada (Off)...');

    // 1. Garante que o modo Advanced está ativado para os sliders existirem no DOM
    const advTab = page.locator('button[role="tab"]:has-text("Advanced")').first();
    if (await advTab.isVisible().catch(() => false)) {
      const isSelected = (await advTab.getAttribute('aria-selected')) === 'true';
      if (!isSelected) {
        await advTab.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    // 2. Ajusta cada slider diretamente pelos manipuladores oficiais do componente React ou eventos de teclado nativos
    const resultado = await page.evaluate(async () => {
      const configs = [
        { label: 'Weirdness', regex: /Weirdness|Estranheza/i, targetNorm: 0.10, targetInt: 10 },
        { label: 'Style Influence', regex: /Style Influence|Influência de estilo/i, targetNorm: 0.90, targetInt: 90 },
        { label: 'Variety', regex: /Variety|Variedade/i, targetNorm: 0.00, targetInt: 0 }
      ];

      const relatorio = [];

      for (const item of configs) {
        // Localiza o slider pelo aria-label ou busca contextual
        let slider = document.querySelector(`[role="slider"][aria-label*="${item.label}" i]`);
        if (!slider) {
          const allSliders = Array.from(document.querySelectorAll('[role="slider"]'));
          slider = allSliders.find(s => {
            const labelAttr = s.getAttribute('aria-label') || '';
            if (item.regex.test(labelAttr)) return true;
            let p = s.parentElement;
            for (let i = 0; i < 4; i++) {
              if (p && item.regex.test(p.innerText || '')) return true;
              if (p) p = p.parentElement;
            }
            return false;
          });
        }

        if (!slider) {
          relatorio.push({ label: item.label, erro: 'slider_nao_encontrado' });
          continue;
        }

        const valorAntes = slider.getAttribute('aria-valuenow') || '';

        // Estratégia A: Injeção direta nos hooks do React Fiber (onChange e onCommit)
        const fiberKey = Object.keys(slider).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        let handlerAplicado = false;
        let curr = slider[fiberKey];

        while (curr) {
          if (curr.memoizedProps && typeof curr.memoizedProps.onChange === 'function') {
            try {
              curr.memoizedProps.onChange(item.targetNorm);
              if (typeof curr.memoizedProps.onCommit === 'function') {
                curr.memoizedProps.onCommit(item.targetNorm);
              }
              handlerAplicado = true;
              break;
            } catch (e) {}
          }
          curr = curr.return;
        }

        // Estratégia B (Fallback via KeyboardEvent nativo)
        if (!handlerAplicado) {
          slider.focus();
          let currentVal = parseInt(slider.getAttribute('aria-valuenow') || '50', 10);
          let steps = 0;
          while (currentVal !== item.targetInt && steps < 110) {
            steps++;
            const key = currentVal > item.targetInt ? 'ArrowLeft' : 'ArrowRight';
            slider.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true, view: window }));
            currentVal = parseInt(slider.getAttribute('aria-valuenow') || '50', 10);
          }
        }

        // Aguarda propagação do React
        await new Promise(r => setTimeout(r, 100));

        const valorDepois = slider.getAttribute('aria-valuenow') || '';
        let textoUi = '';
        let p = slider.parentElement;
        for (let i = 0; i < 4; i++) {
          if (p && ((p.innerText || '').includes('%') || /Normal|Low|High|Off|Deslig/i.test(p.innerText || ''))) {
            textoUi = p.innerText.trim().replace(/\n+/g, ' | ');
            break;
          }
          if (p) p = p.parentElement;
        }

        relatorio.push({
          label: item.label,
          valorAntes,
          valorDepois,
          textoUi,
          sucesso: true
        });
      }

      return relatorio;
    });

    if (Array.isArray(resultado)) {
      for (const r of resultado) {
        if (r.sucesso) {
          console.log(`[SunoAutomator] 🎚️ [${r.label}] Ajustado com sucesso: ${r.valorAntes} -> ${r.valorDepois} ("${r.textoUi}")`);
        } else {
          console.warn(`[SunoAutomator] ⚠️ [${r.label}] Falha ao ajustar:`, r.erro);
        }
      }
    }

    console.log('[SunoAutomator] ✅ Sliders calibrados e conferidos na interface do Suno!');
  } catch (err) {
    console.warn('[SunoAutomator] ⚠️ Erro ao calibrar sliders:', err.message);
  }
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
