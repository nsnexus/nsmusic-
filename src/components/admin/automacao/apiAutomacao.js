import { getAdminAuthToken } from '@/lib/authClient';

// Chamada autenticada às rotas do painel. Sempre devolve { ok, data, error } — nunca lança — para
// que cada tela mostre o erro em vez de ficar presa em "carregando".
export async function chamarAdmin(url, { method = 'GET', body } = {}) {
  try {
    const token = await getAdminAuthToken();
    const res = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: data?.error || `Erro ${res.status}. Tente de novo.` };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: 'Sem conexão com o servidor.' };
  }
}

export function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const estilos = {
  cartao: {
    background: '#0f1623',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '16px',
  },
  botao: {
    padding: '8px 14px',
    borderRadius: '8px',
    background: '#1e293b',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#f8fafc',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  botaoPrimario: {
    padding: '8px 16px',
    borderRadius: '8px',
    background: '#2563eb',
    border: '1px solid #2563eb',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  campo: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: '8px',
    background: '#0a0f1a',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    color: '#f8fafc',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  rotulo: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' },
  erro: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#fca5a5',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
  },
  aviso: {
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.28)',
    color: '#fcd34d',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
  },
  sucesso: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.28)',
    color: '#6ee7b7',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
  },
  mudo: { color: '#94a3b8', fontSize: '13px' },
};
