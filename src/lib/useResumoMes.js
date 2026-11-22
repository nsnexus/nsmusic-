'use client';

import { useState, useEffect } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

async function pedir(params, signal, renovar = false) {
  const token = await getAdminAuthToken(renovar);
  return fetch(`/api/admin/dashboard-mes?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
}

export function useResumoMes(periodo, mes = null, tentativa = 0) {
  const chave = periodo ? `${periodo}:${mes || ''}:${tentativa}` : null;
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!periodo) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({ periodo });
    if (mes) params.set('mes', mes);
    const detalhes = {};
    let resumo = null;

    (async () => {
      try {
        // O mês pode vir em lotes se alguns dias ainda não estiverem consolidados.
        do {
          let res = await pedir(params, controller.signal);
          if (res.status === 401) res = await pedir(params, controller.signal, true);
          const json = await res.json().catch(() => null);
          if (controller.signal.aborted) return;
          if (!res.ok || !json?.ok) throw new Error(json?.error || 'Não foi possível carregar os dados.');

          Object.assign(detalhes, json.detalhes);
          resumo = json;
          if (params.has('dias')) {
            const { combinarMes } = await import('@/lib/dashboardAgregados');
            const dias = Object.keys(detalhes).sort().map((data) => Number(data.slice(-2)));
            resumo = { ...json, dias, ...combinarMes(detalhes, json.mes, dias) };
          }
          if (controller.signal.aborted) return;
          setResultado({ chave, resumo, loading: false, erro: '', montando: json.incompleto });
          if (!json.pendentes?.length) break;
          params.set('dias', json.pendentes.join(','));
        } while (!controller.signal.aborted);
      } catch (e) {
        if (controller.signal.aborted) return;
        const erro = e?.name === 'TimeoutError' ? 'O painel demorou para responder.' : e.message;
        setResultado({ chave, resumo, loading: false, erro, montando: false });
      }
    })();

    return () => controller.abort();
  }, [chave, periodo, mes]);

  return resultado?.chave === chave
    ? resultado
    : { resumo: null, loading: Boolean(periodo), erro: '', montando: false };
}
