'use client';

import { useState, useEffect } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

export function paraData(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === 'function') return valor.toDate();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Cache em memória e sessionStorage para carregamento instantâneo no celular e desktop.
// Evita requisições pesadas duplicadas quando múltiplos cards (VendasPorPlataformaCard,
// VendasPorDiaTable, VendasPorHoraHeatmap, VendasPorEstadoMapa) montam juntos.
const cacheMes = new Map();
const promessasAtivas = new Map();

const CACHE_VALIDADE_MS = 120000; // 2 minutos

function obterDoCache(mes) {
  const agora = Date.now();
  // 1. Memória RAM (mais rápido, 0ms)
  const emMem = cacheMes.get(mes);
  if (emMem && (agora - emMem.timestamp < CACHE_VALIDADE_MS) && Array.isArray(emMem.pedidos)) {
    return emMem.pedidos;
  }

  // 2. sessionStorage (persiste entre navegações de tela no celular)
  if (typeof window !== 'undefined') {
    try {
      const bruto = sessionStorage.getItem(`nsmusic_cache_pedidos_${mes}`);
      if (bruto) {
        const parsed = JSON.parse(bruto);
        if (parsed?.timestamp && (agora - parsed.timestamp < CACHE_VALIDADE_MS) && Array.isArray(parsed.pedidos)) {
          cacheMes.set(mes, parsed);
          return parsed.pedidos;
        }
      }
    } catch (_) {}
  }

  return null;
}

function salvarNoCache(mes, pedidos) {
  const item = { timestamp: Date.now(), pedidos };
  cacheMes.set(mes, item);
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`nsmusic_cache_pedidos_${mes}`, JSON.stringify(item));
    } catch (_) {}
  }
}

async function buscarPedidosDoMes(mes, forcar = false) {
  if (!forcar) {
    const emCache = obterDoCache(mes);
    if (emCache) return emCache;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout seguro para conexões móveis

  try {
    const token = await getAdminAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/admin/reports?tipo=pedidos_mes&mes=${encodeURIComponent(mes)}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.pedidos)) {
        salvarNoCache(mes, json.pedidos);
        return json.pedidos;
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[usePedidosDoMes] API retornou status ${res.status}:`, errText);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[usePedidosDoMes] Falha ao carregar do Supabase via API:', err.message);
    // Em caso de erro de rede, tenta usar o último cache disponível mesmo que expirado
    if (typeof window !== 'undefined') {
      try {
        const bruto = sessionStorage.getItem(`nsmusic_cache_pedidos_${mes}`);
        if (bruto) {
          const parsed = JSON.parse(bruto);
          if (Array.isArray(parsed?.pedidos) && parsed.pedidos.length > 0) {
            return parsed.pedidos;
          }
        }
      } catch (_) {}
    }
  }

  return null;
}

export function usePedidosDoMes(mes) {
  const [pedidos, setPedidos] = useState(() => obterDoCache(mes) || []);
  const [loading, setLoading] = useState(() => (obterDoCache(mes) ? false : true));
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    const emCache = obterDoCache(mes);
    if (emCache && emCache.length > 0) {
      setPedidos(emCache);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setErro('');

    (async () => {
      try {
        let p = promessasAtivas.get(mes);
        if (!p) {
          p = buscarPedidosDoMes(mes).finally(() => {
            promessasAtivas.delete(mes);
          });
          promessasAtivas.set(mes, p);
        }

        const validos = await p;
        if (!ativo) return;
        if (validos !== null && Array.isArray(validos)) {
          setPedidos(validos);
          setErro('');
        } else if (!emCache || emCache.length === 0) {
          setErro('Não foi possível carregar os pedidos deste mês.');
        }
      } catch (e) {
        console.error('[usePedidosDoMes] Erro ao buscar pedidos do mês:', e.message);
        if (ativo && (!pedidos || pedidos.length === 0)) {
          setErro('Não foi possível carregar os pedidos deste mês.');
        }
      } finally {
        if (ativo) setLoading(false);
      }
    })();

    return () => { ativo = false; };
  }, [mes]);

  return { pedidos, loading, erro };
}
