'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPriceForSku } from '@/lib/pricing';

// Cards de faturamento do topo do dashboard admin — extraído de admin/page.jsx (pedido 12/09/2026:
// "os valores não estão batendo" com a tabela Vendas por dia, ver VendasPorDiaTable.jsx).
//
// Achado: os cards antigos filtravam por `createdAt` (dia em que o PEDIDO foi criado) e a tabela por
// `paidAt`/`*PaidAt` (dia em que o PAGAMENTO caiu) — pedido criado num dia e pago no seguinte contava
// na tabela mas não no card "hoje". Decisão do usuário (12/09/2026): cards de FATURAMENTO/VENDAS
// passam a contar por data de PAGAMENTO, igual à tabela. "Pedidos" (todo pedido criado, pago ou não)
// e "Gasto em Geração" (a chamada à Kie.ai acontece na criação, não no pagamento) continuam por
// `createdAt` — são métricas de tráfego/custo, não de faturamento, mudar a base delas não faz sentido.
//
// Consulta própria (não reaproveita a lista paginada de pedidos do admin) pelo mesmo motivo de
// VendasPorDiaTable: a lista principal é pra NAVEGAR pedidos, não pra reportar período fechado.
const LOOKBACK_DAYS = 30; // cobre folgadamente o atraso típico entre criar o pedido e pagar

function paraData(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === 'function') return valor.toDate();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function localDayStart(dateStr) {
  return dateStr ? new Date(`${dateStr}T00:00:00`) : null;
}
function localDayEnd(dateStr) {
  return dateStr ? new Date(`${dateStr}T23:59:59.999`) : null;
}

export default function FaturamentoCards({ dateFrom, dateTo }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      setErro('');
      try {
        const ordersRef = collection(db, 'orders');
        const constraints = [orderBy('createdAt'), limit(3000)];

        // Busca com folga pra trás (LOOKBACK_DAYS) — sem isso, um pedido criado ontem e pago hoje
        // nunca seria buscado quando dateFrom = hoje, e o faturamento "de hoje" ficaria subestimado
        // de novo, exatamente o bug que este componente corrige.
        if (dateFrom) {
          const inicio = localDayStart(dateFrom);
          inicio.setDate(inicio.getDate() - LOOKBACK_DAYS);
          constraints.unshift(where('createdAt', '>=', inicio.toISOString()));
        }
        if (dateTo) {
          constraints.unshift(where('createdAt', '<=', localDayEnd(dateTo).toISOString()));
        }

        const snap = await getDocs(query(ordersRef, ...constraints));
        if (!ativo) return;
        const validos = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((o) => !o.deletedAt && !o.id.startsWith('config_') && !o.id.startsWith('session_')
            && o.productionStatus !== 'CONFIG' && o.productionStatus !== 'RASCUNHO');
        setPedidos(validos);
      } catch (e) {
        console.error('[FaturamentoCards] Erro ao buscar pedidos do período:', e.message);
        if (ativo) setErro('Não foi possível carregar os valores do período.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [dateFrom, dateTo]);

  const AUDIO_PRICE = getPriceForSku('audio_only');
  const VIDEO_PRICE = getPriceForSku('video_addon');
  const KIE_COST_PER_GENERATION = 0.30;

  const periodoInicio = dateFrom ? localDayStart(dateFrom) : null;
  const periodoFim = dateTo ? localDayEnd(dateTo) : null;

  const dentroDoPeriodo = (dataVal) => {
    const d = paraData(dataVal);
    if (!d) return false;
    if (periodoInicio && d < periodoInicio) return false;
    if (periodoFim && d > periodoFim) return false;
    return true;
  };

  const parseAmount = (val, fallback = null) => {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace(',', '.'));
      if (!Number.isNaN(parsed)) return parsed;
    }
    return fallback;
  };

  // "Pedidos" e "Gasto em Geração" continuam por createdAt — ver comentário de topo.
  const pedidosCriadosNoPeriodo = pedidos.filter((o) => dentroDoPeriodo(o.createdAt));

  const gastoGeracao = pedidosCriadosNoPeriodo.reduce((sum, o) => {
    const count = Number(o.sunoGenerationCount) || (o.sunoRequestedAt ? 1 : 0);
    return sum + count * KIE_COST_PER_GENERATION;
  }, 0);

  // Faturamento e vendas: por data de PAGAMENTO, não de criação (ver comentário de topo).
  const pagosMusica = pedidos.filter((o) =>
    (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') && dentroDoPeriodo(o.paidAt)
  );

  const faturamentoMusicas = pagosMusica.reduce((sum, o) => {
    // Vídeo cobrado em intenção de pagamento separada: expectedAmount reflete a cobrança mais
    // recente (a do vídeo), não a da música (ver mesmo comentário em admin/page.jsx original).
    if (o.videoPaymentId) return sum + AUDIO_PRICE;
    let val = parseAmount(o.expectedAmount, null);
    if (val === null) val = parseAmount(o.total, null);
    if (val === null) return sum;
    return sum + (val > AUDIO_PRICE ? AUDIO_PRICE : val);
  }, 0);

  const videoStandalone = pedidos.filter((o) => o.videoAddonPaid && o.videoPaymentId && dentroDoPeriodo(o.videoPaidAt));
  const faturamentoVideoStandalone = videoStandalone.length * VIDEO_PRICE;

  const faturamentoVideoCombo = pagosMusica
    .filter((o) => !o.videoPaymentId)
    .reduce((sum, o) => {
      let val = parseAmount(o.expectedAmount, null);
      if (val === null) val = parseAmount(o.total, null);
      if (val === null) return sum;
      const excess = val - AUDIO_PRICE;
      return sum + (excess > 0 ? excess : 0);
    }, 0);

  const faturamentoVideos = faturamentoVideoStandalone + faturamentoVideoCombo;
  const faturamentoTotal = faturamentoMusicas + faturamentoVideos;

  // Venda = música paga OU vídeo liberado (o que vier primeiro), sem contar o mesmo pedido 2x.
  const vendasCount = new Set([
    ...pagosMusica.map((o) => o.id),
    ...videoStandalone.map((o) => o.id),
  ]).size;

  if (loading) {
    return <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '16px 0' }}>Carregando valores do período...</p>;
  }
  if (erro) {
    return <p style={{ color: '#dc2626', fontSize: '0.9rem', margin: '16px 0' }}>{erro}</p>;
  }

  const cards = [
    { label: 'Total (Músicas + Vídeos)', valor: `R$ ${faturamentoTotal.toFixed(2).replace('.', ',')}`, cor: '#059669' },
    { label: 'Músicas (R$ 9,99)', valor: `R$ ${faturamentoMusicas.toFixed(2).replace('.', ',')}`, cor: '#0f172a' },
    { label: 'Vídeos (R$ 6,90)', valor: `R$ ${faturamentoVideos.toFixed(2).replace('.', ',')}`, cor: '#7c3aed' },
    { label: 'Pedidos', valor: pedidosCriadosNoPeriodo.length, cor: '#d97706' },
    { label: 'Vendas (pagas)', valor: vendasCount, cor: '#059669' },
    { label: 'Gasto em Geração (Kie.ai)', valor: `R$ ${gastoGeracao.toFixed(2).replace('.', ',')}`, cor: '#dc2626' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
      {cards.map((c) => (
        <div key={c.label} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '600' }}>{c.label}</span>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: c.cor }}>{c.valor}</h2>
        </div>
      ))}
    </div>
  );
}
