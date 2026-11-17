// Converte Timestamp do Firestore, string ISO ou Date em Date (ou null). Sem 'use client':
// usado no navegador (dashboard) e no servidor (widget da tela inicial).
export function paraData(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === 'function') return valor.toDate();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
