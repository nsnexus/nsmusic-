'use client';

import { useState, useEffect } from 'react';
import { where } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { getPriceForSku } from '@/lib/pricing';
import { buscarPedidosPaginado } from '@/lib/buscarPedidosPaginado';

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
  const [supaStats, setSupaStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      setErro('');
      setSupaStats(null);

      // 1. Tenta buscar direto os totais calculados no Supabase (alta performance)
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          const params = new URLSearchParams({ tipo: 'faturamento' });
          if (dateFrom) params.set('dateFrom', dateFrom);
          if (dateTo) params.set('dateTo', dateTo);

          const res = await fetch(`/api/admin/reports?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json().catch(() => null);
            if (json?.ok && typeof json.faturamentoTotal === 'number') {
              if (!ativo) return;
              setSupaStats(json);
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[FaturamentoCards] Falha ao consultar Supabase, caindo para Firestore:', err.message);
      }

      // 2. Fallback resiliente no Firestore
      try {
        const constraints = [];
        if (dateFrom) {
          const inicio = localDayStart(dateFrom);
          inicio.setDate(inicio.getDate() - LOOKBACK_DAYS);
          constraints.unshift(where('createdAt', '>=', inicio.toISOString()));
        }
        if (dateTo) {
          constraints.unshift(where('createdAt', '<=', localDayEnd(dateTo).toISOString()));
        }

        const { pedidos: validos } = await buscarPedidosPaginado(constraints);
        if (!ativo) return;
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

  // "Gerações" e "Gasto em Geração" são por createdAt — a chamada à Kie.ai acontece na criação do
  // pedido, não no pagamento. Faturamento e vendas são por data de PAGAMENTO (ver comentário de topo).
  const pedidosCriadosNoPeriodo = pedidos.filter((o) => dentroDoPeriodo(o.createdAt));

  const geracoes = pedidosCriadosNoPeriodo.reduce((sum, o) => {
    return sum + (Number(o.sunoGenerationCount) || (o.sunoRequestedAt ? 1 : 0));
  }, 0);

  const gastoGeracao = geracoes * KIE_COST_PER_GENERATION;

  // Faturamento = soma do que a Efí confirmou em cada transação.
  //
  // `paidAmount`/`*PaidAmount` passaram a ser gravados em 25/09/2026 (ver src/lib/payments.js).
  // Antes disso o painel adivinhava a partir de `expectedAmount`, que guarda só a ÚLTIMA cobrança
  // criada no pedido — quem pagasse a música e depois um add-on tinha a música recontada pelo preço
  // do add-on, e o SKU 'impacto' (valor escolhido pelo cliente) não tinha como ser representado.
  // Pedido antigo, sem o campo, cai no preço de catálogo do SKU: é estimativa, mas explícita.
  const somaPagamentos = (lista, campoData, campoValor, precoPadrao) => lista
    .filter((o) => dentroDoPeriodo(o[campoData]))
    .reduce((sum, o) => {
      const valor = parseAmount(o[campoValor], null);
      return sum + (valor !== null ? valor : precoPadrao);
    }, 0);

  const pagosMusica = pedidos.filter((o) =>
    (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') && dentroDoPeriodo(o.paidAt)
  );

  const faturamentoMusica = pagosMusica.reduce((sum, o) => {
    const valor = parseAmount(o.paidAmount, null);
    if (valor !== null) return sum + valor;
    // Sem paidAmount: usa o preço do SKU da cobrança, e só cai em expectedAmount quando o pedido
    // não teve add-on cobrado depois (que sobrescreveria o campo).
    const porSku = getPriceForSku(o.paymentIntentSku);
    if (porSku !== null && o.paymentIntentSku !== 'impacto') return sum + porSku;
    const temAddonPosterior = Boolean(o.videoPaymentId || o.cartaPaymentId || o.retrospectivaPaymentId || o.playbackPaymentId);
    const estimado = temAddonPosterior ? null : parseAmount(o.expectedAmount, null);
    return sum + (estimado !== null ? estimado : AUDIO_PRICE);
  }, 0);

  // Add-ons comprados SEPARADAMENTE (cobrança própria). Add-on que veio junto da música no mesmo
  // checkout já está dentro do valor acima — somá-lo de novo contaria a mesma transação duas vezes.
  const addonsAvulsos = pedidos.filter((o) => o.videoPaymentId && o.videoAddonPaid && dentroDoPeriodo(o.videoPaidAt));
  const faturamentoVideo = somaPagamentos(addonsAvulsos, 'videoPaidAt', 'videoPaidAmount', VIDEO_PRICE);

  const cartasAvulsas = pedidos.filter((o) => o.cartaPaymentId && o.cartaAddonPaid && dentroDoPeriodo(o.cartaPaidAt));
  const faturamentoCarta = somaPagamentos(cartasAvulsas, 'cartaPaidAt', 'cartaPaidAmount', getPriceForSku('carta_addon') || 0);

  const retrosAvulsas = pedidos.filter((o) => o.retrospectivaPaymentId && o.retrospectivaAddonPaid && dentroDoPeriodo(o.retrospectivaPaidAt));
  const faturamentoRetro = somaPagamentos(retrosAvulsas, 'retrospectivaPaidAt', 'retrospectivaPaidAmount', getPriceForSku('retrospectiva_addon') || 0);

  const playbacksAvulsos = pedidos.filter((o) => o.playbackPaymentId && o.playbackAddonPaid && dentroDoPeriodo(o.playbackPaidAt));
  const faturamentoPlayback = somaPagamentos(playbacksAvulsos, 'playbackPaidAt', 'playbackPaidAmount', getPriceForSku('playback_addon') || 0);

  const faturamentoTotal = faturamentoMusica + faturamentoVideo + faturamentoCarta + faturamentoRetro + faturamentoPlayback;

  // Venda = qualquer transação paga no período, sem contar o mesmo pedido duas vezes.
  const vendasCount = new Set([
    ...pagosMusica.map((o) => o.id),
    ...addonsAvulsos.map((o) => o.id),
    ...cartasAvulsas.map((o) => o.id),
    ...retrosAvulsas.map((o) => o.id),
    ...playbacksAvulsos.map((o) => o.id),
  ]).size;

  if (loading) {
    return <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '16px 0' }}>Carregando valores do período...</p>;
  }
  if (erro) {
    return <p style={{ color: '#dc2626', fontSize: '0.9rem', margin: '16px 0' }}>{erro}</p>;
  }

  // Quatro números, a pedido do dono do estúdio (25/09/2026): o que entrou, o que saiu, e o volume
  // dos dois lados. A divisão por produto (músicas, vídeos, cartas...) vive na tabela Vendas por
  // dia, que é o lugar de olhar detalhe.
  const cards = supaStats ? [
    { label: 'Faturamento total', valor: `R$ ${supaStats.faturamentoTotal.toFixed(2).replace('.', ',')}`, cor: '#059669' },
    { label: 'Vendas (pagas)', valor: supaStats.vendasCount, cor: '#0f172a' },
    { label: 'Gerações', valor: supaStats.geracoes, cor: '#d97706' },
    { label: 'Gasto em Geração (Kie.ai)', valor: `R$ ${supaStats.gastoGeracao.toFixed(2).replace('.', ',')}`, cor: '#dc2626' },
  ] : [
    { label: 'Faturamento total', valor: `R$ ${faturamentoTotal.toFixed(2).replace('.', ',')}`, cor: '#059669' },
    { label: 'Vendas (pagas)', valor: vendasCount, cor: '#0f172a' },
    { label: 'Gerações', valor: geracoes, cor: '#d97706' },
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
