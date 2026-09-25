import { doc, getDoc, setDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';

// Registro de "reset de cota": quando o estúdio libera um cliente que estourou o limite de
// gerações, guardamos a data do reset. A partir dela, pedidos anteriores deixam de contar
// (ver calcularCota em src/lib/cotaGeracoes.js) — nenhum pedido é apagado, o histórico continua
// inteiro para consulta e faturamento.
//
// ONDE fica: `orders/config_cotareset_<hash>`.
//   - `orders` porque é a única coleção gravável pelas rotas (não há Admin SDK neste projeto, e as
//     regras do Firestore negam coleções novas — foi o que quebrou a consolidação de métricas, ver
//     src/lib/stats.js). O prefixo `config_` já é ignorado pela limpeza e pelas listagens.
//   - `<hash>` e não o telefone: identificador de documento aparece em log, em URL de console e em
//     qualquer listagem da coleção. Telefone é PII e não entra nisso (.claude/rules/security.md).
//     SHA-256 do telefone só com dígitos, então o mesmo número sempre cai no mesmo documento.

const PREFIXO = 'config_cotareset_';

export function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

export async function idDoReset(telefone) {
  const digitos = normalizarTelefone(telefone);
  if (!digitos) return '';

  const bytes = new TextEncoder().encode(digitos);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // 32 caracteres já tornam colisão irrelevante nesta escala e deixam o id curto de ler no console.
  return `${PREFIXO}${hex.slice(0, 32)}`;
}

/**
 * @returns {Promise<string>} data ISO do último reset, ou '' se nunca houve.
 */
export async function lerResetDeCota(telefone) {
  const id = await idDoReset(telefone);
  if (!id) return '';
  try {
    const snap = await getDoc(doc(db, 'orders', id));
    return snap.exists() ? String(snap.data()?.resetAt || '') : '';
  } catch (err) {
    // Falha de leitura nunca pode LIBERAR ninguém por acidente: sem reset conhecido, a cota normal
    // vale integralmente.
    console.warn('[cotaReset] Falha ao ler reset de cota:', err.message);
    return '';
  }
}

export async function registrarResetDeCota(telefone, { porQuem = '' } = {}) {
  const id = await idDoReset(telefone);
  if (!id) return { ok: false, error: 'telefone_invalido' };

  const agora = new Date().toISOString();
  try {
    await setDoc(doc(db, 'orders', id), {
      productionStatus: 'CONFIG',
      resetAt: agora,
      // Últimos 4 dígitos só para o painel conseguir mostrar a qual cliente o registro pertence sem
      // guardar o telefone inteiro.
      telefoneFinal: normalizarTelefone(telefone).slice(-4),
      resetPor: porQuem || null,
      updatedAt: agora,
    }, { merge: true });
    return { ok: true, resetAt: agora };
  } catch (err) {
    console.warn('[cotaReset] Falha ao gravar reset de cota:', err.message);
    return { ok: false, error: 'falha_ao_gravar' };
  }
}
