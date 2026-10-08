'use client';

import { useState, useEffect } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';
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

export default function FaturamentoCards({ dateFrom, dateTo, reloadTrigger }) {
  const [pedidos, setPedidos] = useState([]);
  const [supaStats, setSupaStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!supaStats) setLoading(true);
      setErro('');

      // 1. Tenta buscar direto os totais calculados no Supabase (alta performance)
      try {
        let token = await getAdminAuthToken();
        const params = new URLSearchParams({ tipo: 'faturamento' });
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);

        let res = await fetch(`/api/admin/reports?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        // Se 401, tenta renovar o token e repetir
        if (res.status === 401) {
          const freshToken = await getAdminAuthToken(true);
          if (freshToken && freshToken !== token) {
            token = freshToken;
            res = await fetch(`/api/admin/reports?${params.toString()}`, {
              headers: { Authorization: `Bearer ${freshToken}` }
            });
          }
        }

        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json?.ok && typeof json.faturamentoTotal === 'number') {
            if (!ativo) return;
            setSupaStats(json);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('[FaturamentoCards] Falha ao consultar relatórios:', err.message);
        if (ativo && !supaStats) setErro('Não foi possível carregar os valores do período.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [dateFrom, dateTo, reloadTrigger]);

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

  // "Gerações" e "Gasto em Geração" são por createdAt — a chamada de IA acontece na criação do
  // pedido, não no pagamento. Faturamento e vendas são por data de PAGAMENTO (ver comentário de topo).
  const pedidosCriadosNoPeriodo = pedidos.filter((o) => dentroDoPeriodo(o.createdAt));

  const geracoesBot = pedidosCriadosNoPeriodo
    .filter((o) => o.sunoProvider === 'suno_local')
    .reduce((sum, o) => sum + (Number(o.sunoGenerationCount) || 1), 0);

  const geracoesKie = pedidosCriadosNoPeriodo
    .filter((o) => o.sunoProvider !== 'suno_local')
    .reduce((sum, o) => sum + (Number(o.sunoGenerationCount) || (o.sunoRequestedAt ? 1 : 0)), 0);

  const geracoes = geracoesBot + geracoesKie;
  const gastoKie = geracoesKie * KIE_COST_PER_GENERATION;
  const economiaBot = geracoesBot * KIE_COST_PER_GENERATION;

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

  // Cards de visão geral com separação clara do Robô PC e da Kie.ai
  const cards = supaStats ? [
    { label: 'Faturamento total', valor: `R$ ${supaStats.faturamentoTotal.toFixed(2).replace('.', ',')}`, cor: '#059669', sub: null },
    { label: 'Vendas (pagas)', valor: supaStats.vendasCount, cor: '#0f172a', sub: null },
    { label: 'Total Gerações', valor: supaStats.geracoesTotal ?? supaStats.geracoes, cor: '#d97706', sub: null },
    { label: '🖥️ Feitas pelo Robô PC', valor: supaStats.geracoesBot ?? 0, cor: '#0284c7', sub: 'Custo R$ 0,00' },
    { label: '🟣 Feitas pela Kie.ai', valor: supaStats.geracoesKie ?? 0, cor: '#7c3aed', sub: null },
    { label: '💸 Gasto c/ Kie.ai', valor: `R$ ${(supaStats.gastoKie ?? supaStats.gastoGeracao).toFixed(2).replace('.', ',')}`, cor: '#dc2626', sub: `Economia Robô: R$ ${(supaStats.economiaBot ?? 0).toFixed(2).replace('.', ',')}` },
  ] : [
    { label: 'Faturamento total', valor: `R$ ${faturamentoTotal.toFixed(2).replace('.', ',')}`, cor: '#059669', sub: null },
    { label: 'Vendas (pagas)', valor: vendasCount, cor: '#0f172a', sub: null },
    { label: 'Total Gerações', valor: geracoes, cor: '#d97706', sub: null },
    { label: '🖥️ Feitas pelo Robô PC', valor: geracoesBot, cor: '#0284c7', sub: 'Custo R$ 0,00' },
    { label: '🟣 Feitas pela Kie.ai', valor: geracoesKie, cor: '#7c3aed', sub: null },
    { label: '💸 Gasto c/ Kie.ai', valor: `R$ ${gastoKie.toFixed(2).replace('.', ',')}`, cor: '#dc2626', sub: `Economia Robô: R$ ${economiaBot.toFixed(2).replace('.', ',')}` },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          }}
        >
          <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: '600', lineHeight: '1.2' }}>{c.label}</span>
          <h2 style={{ margin: 0, fontSize: '1.28rem', fontWeight: '800', color: c.cor, letterSpacing: '-0.02em', lineHeight: '1.2' }}>{c.valor}</h2>
          {c.sub && (
            <span style={{ fontSize: '0.68rem', fontWeight: '700', color: c.sub.includes('Economia') ? '#059669' : '#0284c7', marginTop: '2px' }}>
              {c.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
