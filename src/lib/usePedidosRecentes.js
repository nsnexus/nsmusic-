'use client';

import { useState, useEffect } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';
import { paraData } from '@/lib/usePedidosDoMes';

export { paraData };

// Cache em memória de curto prazo (30s) para manter os dados intradiários frescos
const cacheRecentes = new Map();
const promessasAtivas = new Map();

async function buscarPedidosRecentes(dias = 8) {
  const agora = Date.now();
  const emCache = cacheRecentes.get(dias);
  if (emCache && (agora - emCache.timestamp < 30000)) {
    return emCache.pedidos;
  }

  try {
    let token = await getAdminAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let res = await fetch(`/api/admin/reports?tipo=pedidos_recentes&dias=${dias}`, {
      headers
    });

    if (res.status === 401) {
      const freshToken = await getAdminAuthToken(true);
      if (freshToken && freshToken !== token) {
        token = freshToken;
        res = await fetch(`/api/admin/reports?tipo=pedidos_recentes&dias=${dias}`, {
          headers: { Authorization: `Bearer ${freshToken}` }
        });
      }
    }

    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.pedidos)) {
        cacheRecentes.set(dias, { timestamp: agora, pedidos: json.pedidos });
        return json.pedidos;
      }
    }
  } catch (err) {
    console.warn('[usePedidosRecentes] Falha ao carregar pedidos recentes:', err.message);
  }

  return [];
}

export function usePedidosRecentes(dias = 8) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      setErro('');
      try {
        let p = promessasAtivas.get(dias);
        if (!p) {
          p = buscarPedidosRecentes(dias).finally(() => {
            promessasAtivas.delete(dias);
          });
          promessasAtivas.set(dias, p);
        }

        const validos = await p;
        if (!ativo) return;
        setPedidos(validos);
      } catch (e) {
        console.error('[usePedidosRecentes] Erro ao buscar pedidos recentes:', e.message);
        if (ativo) setErro('Não foi possível carregar os pedidos recentes.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [dias]);

  return { pedidos, loading, erro };
}
