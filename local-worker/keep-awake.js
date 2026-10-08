import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let keepAwakeProcess = null;

/**
 * Ativa a prevenção de suspensão de tela e hibernação no Windows.
 * Utiliza SetThreadExecutionState (API oficial Win32) e pulso discreto de F15 para manter a tela ligada.
 *
 * @param {number} intervalSeconds Intervalo em segundos entre atualizações (padrão: 30)
 * @returns {boolean} Retorna true se o serviço foi iniciado
 */
export function startKeepAwake(intervalSeconds = 30) {
  if (process.platform !== 'win32') {
    return false;
  }

  if (keepAwakeProcess && !keepAwakeProcess.killed) {
    return true;
  }

  const psScript = path.resolve(__dirname, 'keep-awake.ps1');
  if (!fs.existsSync(psScript)) {
    console.warn('[KeepAwake] ⚠️ Arquivo keep-awake.ps1 não encontrado em:', psScript);
    return false;
  }

  try {
    keepAwakeProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScript,
      '-IntervalSeconds', String(intervalSeconds)
    ], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    });

    keepAwakeProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg && msg.includes('[KeepAwake]')) {
        console.log(`[RobôSuno] 🖥️ ${msg}`);
      }
    });

    keepAwakeProcess.on('error', (err) => {
      console.warn('[RobôSuno] ⚠️ Aviso: Não foi possível ativar proteção contra desligamento de tela:', err.message);
      keepAwakeProcess = null;
    });

    keepAwakeProcess.on('exit', () => {
      keepAwakeProcess = null;
    });

    // Finalização limpa em caso de encerramento do processo
    const cleanup = () => stopKeepAwake();
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    return true;
  } catch (err) {
    console.warn('[RobôSuno] ⚠️ Erro ao ativar anti-suspensão de tela:', err.message);
    return false;
  }
}

/**
 * Desativa a prevenção de suspensão, permitindo que a tela e o computador durmam normalmente.
 */
export function stopKeepAwake() {
  if (keepAwakeProcess) {
    try {
      keepAwakeProcess.kill();
    } catch {}
    keepAwakeProcess = null;
  }
}
