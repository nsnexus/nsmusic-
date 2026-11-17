// O Dashboard roda no navegador e agrupa por dia/hora com getDate()/getHours() locais (Brasília).
// No servidor (Cloudflare) o relógio é UTC: deslocamos as datas em −3 h para que essas mesmas
// funções enxerguem o horário de Brasília (fuso fixo, sem horário de verão desde 2019).
export const DESLOCAMENTO_SP_MS = 3 * 3600 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}T/;

export function diaSp(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function paraRelogioSp(valor) {
  if (typeof valor === 'string' && ISO.test(valor)) {
    const t = Date.parse(valor);
    return Number.isNaN(t) ? valor : new Date(t - DESLOCAMENTO_SP_MS).toISOString();
  }
  if (Array.isArray(valor)) return valor.map(paraRelogioSp);
  if (valor && typeof valor === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = paraRelogioSp(v);
    return out;
  }
  return valor;
}
