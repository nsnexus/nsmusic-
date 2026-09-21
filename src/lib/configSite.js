// Configuração editável pelo painel, sem deploy.
//
// Pedido 21/09/2026: o número de WhatsApp do suporte estava escrito à mão em 10 lugares do código.
// Quando o número principal foi suspenso, os botões "Falar no WhatsApp" continuaram mandando o
// cliente para o número antigo — a mensagem chegava num aparelho que a automação não atende. E o
// dono do estúdio vai alternar de volta em dois dias, então trocar isso não pode exigir deploy.
//
// Mora em `config/site` no Firestore. Escrita só pela rota /api/admin/config, com requireAdmin —
// número de suporte é decisão de negócio, e decisão de negócio não se escreve a partir do browser
// (.claude/rules/security.md).

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Usado enquanto a leitura não volta e se a configuração nunca tiver sido salva. Nunca renderizar
// link de WhatsApp vazio: o cliente clica, não acontece nada, e ele desiste achando que quebrou.
export const WHATSAPP_SUPORTE_PADRAO = '5594991064043';

export const CONFIG_DOC = { colecao: 'config', id: 'site' };

// Aceita o que o admin digitar ("(94) 99106-4043", "+55 94 9910-6043") e devolve só dígitos com o
// 55 na frente, que é o formato que o wa.me exige.
export function normalizarNumeroWhatsapp(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return '';
}

export async function lerConfigSite() {
  try {
    const snap = await getDoc(doc(db, CONFIG_DOC.colecao, CONFIG_DOC.id));
    if (!snap.exists()) return {};
    return snap.data() || {};
  } catch (e) {
    // Falha de leitura não pode derrubar a página — cai no padrão.
    console.warn('[config] não foi possível ler config/site:', e.message);
    return {};
  }
}
