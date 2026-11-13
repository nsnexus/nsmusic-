import { readEnvValue } from './envValue.js';

// Número do dono do estúdio, para quando a conversa precisa de gente.
// Fica em variável de ambiente (ADMIN_WHATSAPP) para não exigir deploy quando mudar.
const WHATSAPP_DONO_PADRAO = '5594991064043';

export function numeroDoDono(env = {}) {
  return readEnvValue(env, 'ADMIN_WHATSAPP') || WHATSAPP_DONO_PADRAO;
}

