'use client';

import { useState, useEffect } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

// Resumo do mês do Dashboard, já calculado no servidor a partir de metricas_diarias
// (/api/admin/dashboard-mes). Substitui baixar todos os pedidos do mês no navegador.
// Na primeira montagem de um mês o servidor calcula alguns dias por vez e responde
// `incompleto: true`; aqui pedimos de novo até completar, mostrando o que já veio.

const MAX_RODADAS = 12;

async function pedir(mes, renovar = false) {
  const token = await getAdminAuthToken(renovar);
  return fetch(`/api/admin/dashboard-mes?mes=${encodeURIComponent(mes)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(60000),
  });
}

export function useResumoMes(mes) {
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [montando, setMontando] = useState(false);

  useEffect(() => {
    if (!mes) return undefined;
    let ativo = true;
    setLoading(true);
    setErro('');
    setResumo(null);
    (async () => {
      for (let rodada = 0; rodada < MAX_RODADAS && ativo; rodada++) {
        try {
          let res = await pedir(mes);
          if (res.status === 401) res = await pedir(mes, true);
          const json = await res.json().catch(() => null);
          if (!ativo) return;
          if (!res.ok || !json?.ok) {
            setErro(json?.error || 'Não foi possível carregar o resumo do mês.');
            break;
          }
          setResumo(json);
          setLoading(false);
          setMontando(Boolean(json.incompleto));
          if (!json.incompleto) break;
        } catch (e) {
          if (!ativo) return;
          setErro('O resumo do mês demorou demais para responder. Tente atualizar a página.');
          break;
        }
      }
      if (ativo) { setLoading(false); setMontando(false); }
    })();
    return () => { ativo = false; };
  }, [mes]);

  return { resumo, loading, erro, montando };
}
