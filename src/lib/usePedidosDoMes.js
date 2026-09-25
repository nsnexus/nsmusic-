'use client';

import { useState, useEffect } from 'react';
import { where } from 'firebase/firestore';
import { buscarPedidosPaginado } from '@/lib/buscarPedidosPaginado';

export function paraData(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === 'function') return valor.toDate();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Busca os pedidos de um mês (por createdAt) — consulta compartilhada por VendasPorDiaTable,
// VendasPorHoraHeatmap e VendasPorEstadoMapa (pedido 12/09/2026), extraída aqui pra não triplicar o
// mesmo código (ver .claude/rules/frontend.md: função repetida em mais de um arquivo vai pra
// src/lib/). Cada componente que usa este hook faz a SUA PRÓPRIA chamada ao Firestore — não
// compartilha estado entre eles, mesmo padrão já adotado nos outros cards do dashboard pra cada um
// funcionar sozinho, independente do filtro de data da lista principal de pedidos.
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
        const [ano, mesNum] = mes.split('-').map(Number);
        const inicio = new Date(ano, mesNum - 1, 1, 0, 0, 0, 0).toISOString();
        const fim = new Date(ano, mesNum, 1, 0, 0, 0, 0).toISOString();

        // Paginado, sem teto fixo: com limit(2000) e ordem crescente, um mês com mais de 2.000
        // pedidos perdia justamente os dias MAIS RECENTES — a tabela mostrava zero vendas nos
        // últimos dias enquanto o banco tinha dezenas por dia (achado 25/09/2026, ver
        // src/lib/buscarPedidosPaginado.js).
        const { pedidos: validos } = await buscarPedidosPaginado([
          where('createdAt', '>=', inicio),
          where('createdAt', '<', fim),
        ]);
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
