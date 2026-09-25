'use client';

import { useState, useEffect } from 'react';
import { where } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { buscarPedidosPaginado } from '@/lib/buscarPedidosPaginado';

export function paraData(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === 'function') return valor.toDate();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Cache em memória para evitar chamadas duplicadas simultâneas
// quando VendasPorDiaTable, VendasPorHoraHeatmap e VendasPorEstadoMapa montam juntos
const cacheMes = new Map();
const promessasAtivas = new Map();

async function buscarPedidosDoMesComFallback(mes) {
  const agora = Date.now();
  const emCache = cacheMes.get(mes);
  if (emCache && (agora - emCache.timestamp < 45000)) {
    return emCache.pedidos;
  }

  // 1. Tenta carregar via API Edge / Supabase com token de admin
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      const res = await fetch(`/api/admin/reports?tipo=pedidos_mes&mes=${encodeURIComponent(mes)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.ok && Array.isArray(json.pedidos)) {
          cacheMes.set(mes, { timestamp: agora, pedidos: json.pedidos });
          return json.pedidos;
        }
      }
    }
  } catch (err) {
    console.warn('[usePedidosDoMes] Falha ao carregar do Supabase via API, caindo para Firestore:', err.message);
  }

  // 2. Fallback resiliente no Firestore
  const [ano, mesNum] = mes.split('-').map(Number);
  const inicio = new Date(ano, mesNum - 1, 1, 0, 0, 0, 0).toISOString();
  const fim = new Date(ano, mesNum, 1, 0, 0, 0, 0).toISOString();

  const { pedidos: validos } = await buscarPedidosPaginado([
    where('createdAt', '>=', inicio),
    where('createdAt', '<', fim),
  ]);

  cacheMes.set(mes, { timestamp: agora, pedidos: validos });
  return validos;
}

export function usePedidosDoMes(mes) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      setErro('');
      try {
        let p = promessasAtivas.get(mes);
        if (!p) {
          p = buscarPedidosDoMesComFallback(mes).finally(() => {
            promessasAtivas.delete(mes);
          });
          promessasAtivas.set(mes, p);
        }

        const validos = await p;
        if (!ativo) return;
        setPedidos(validos);
      } catch (e) {
        console.error('[usePedidosDoMes] Erro ao buscar pedidos do mês:', e.message);
        if (ativo) setErro('Não foi possível carregar os pedidos deste mês.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [mes]);

  return { pedidos, loading, erro };
}
