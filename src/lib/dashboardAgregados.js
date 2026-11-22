// Contas dos cards do Dashboard, num lugar só (sem 'use client'): usadas pelos cards (a partir dos
// pedidos) e pelo servidor, que guarda o resultado de cada dia em metricas_diarias.detalhes para o
// Dashboard não precisar baixar milhares de pedidos (ver src/lib/metricasDiarias.js e
// /api/admin/dashboard-mes). As contas são as mesmas que estavam dentro de cada card.
import { paraData } from './paraData';
import { getPriceForSku } from './pricing';
import { isBonusOrder, PLATFORMS } from './trafficSource';
import { isStripePayment, calculateStripeFee } from './paymentFees';
import { hasMusicaGerada } from './stats';
import { ufFromPhone } from './dddToUf';

export const VERSAO_DETALHES = 1;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const PRODUTOS_VENDAS = [
  { chave: 'musicas', label: '🎵 Músicas', sku: 'audio_only' },
  { chave: 'videos', label: '🎬 Vídeos', sku: 'video_addon' },
  { chave: 'playbacks', label: '🎧 Playback', sku: 'playback_addon' },
  { chave: 'cartas', label: '💌 Cartas', sku: 'carta_addon' },
  { chave: 'retrospectivas', label: '📖 Retrospectivas', sku: 'retrospectiva_addon' },
];

export const linhaVendasVazia = (dia) => ({
  dia,
  musicas: 0, videos: 0, playbacks: 0, cartas: 0, retrospectivas: 0,
  geracoes: 0, pedidosCriados: 0, pedidosComMusica: 0, pedidosPagos: 0,
  faturamento: 0,
});

/** Card "Vendas por dia": uma linha por dia do mês (contas idênticas às do card). */
export function calcularVendasPorDia(pedidos, ano, mesNum) {
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const porDiaList = Array.from({ length: diasNoMes }, (_, i) => linhaVendasVazia(i + 1));

  const somar = (campo, dataVal) => {
    const d = paraData(dataVal);
    if (!d) return;
    if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return; // pago em outro mês, não conta aqui
    const linha = porDiaList[d.getDate() - 1];
    if (linha) linha[campo] += 1;
  };

  const somarFaturamento = (dataVal, valor) => {
    if (!dataVal || !valor || valor <= 0) return;
    const d = paraData(dataVal);
    if (!d) return;
    if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return;
    const linha = porDiaList[d.getDate() - 1];
    if (linha) linha.faturamento += valor;
  };

  const precoMusicaPadrao = getPriceForSku('audio_only') || 9.99;
  const precoVideoPadrao = getPriceForSku('video_addon') || 6.90;
  const precoPlaybackPadrao = getPriceForSku('playback_addon') || 4.99;
  const precoCartaPadrao = getPriceForSku('carta_addon') || 4.99;
  const precoRetroPadrao = getPriceForSku('retrospectiva_addon') || 14.90;

  for (const o of pedidos || []) {
    if (!o) continue;
    const bonus = isBonusOrder(o);
    const musicaPaga = (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') && !bonus;

    // 1. Contagem e Faturamento de Música
    if (musicaPaga) {
      somar('musicas', o.paidAt || o.createdAt);
      let valorMusica = precoMusicaPadrao;
      if (o.paidAmount !== null && o.paidAmount !== undefined && o.paidAmount !== '') {
        const v = Number(o.paidAmount);
        if (Number.isFinite(v) && v >= 0) valorMusica = v;
      } else {
        const porSku = getPriceForSku(o.paymentIntentSku);
        if (porSku !== null && o.paymentIntentSku !== 'impacto') valorMusica = porSku;
      }
      if (isStripePayment(o)) {
        valorMusica = Math.max(0, valorMusica - calculateStripeFee(valorMusica));
      }
      somarFaturamento(o.paidAt || o.createdAt, valorMusica);
    }

    // 2. Contagem e Faturamento de Add-ons
    if (o.hasVideoAccess || o.videoAddonPaid) {
      somar('videos', o.videoPaidAt);
      if (o.videoPaymentId) {
        const v = Number(o.videoPaidAmount);
        let valor = (Number.isFinite(v) && v > 0) ? v : precoVideoPadrao;
        if (isStripePayment(o.videoPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
        somarFaturamento(o.videoPaidAt || o.paidAt || o.createdAt, valor);
      }
    }

    if (o.hasPlaybackAccess || o.playbackAddonPaid) {
      somar('playbacks', o.playbackPaidAt);
      if (o.playbackPaymentId) {
        const v = Number(o.playbackPaidAmount);
        let valor = (Number.isFinite(v) && v > 0) ? v : precoPlaybackPadrao;
        if (isStripePayment(o.playbackPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
        somarFaturamento(o.playbackPaidAt || o.paidAt || o.createdAt, valor);
      }
    }

    if (o.hasCartaAccess || o.cartaAddonPaid) {
      somar('cartas', o.cartaPaidAt);
      if (o.cartaPaymentId) {
        const v = Number(o.cartaPaidAmount);
        let valor = (Number.isFinite(v) && v > 0) ? v : precoCartaPadrao;
        if (isStripePayment(o.cartaPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
        somarFaturamento(o.cartaPaidAt || o.paidAt || o.createdAt, valor);
      }
    }

    if (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid) {
      somar('retrospectivas', o.retrospectivaPaidAt);
      if (o.retrospectivaPaymentId) {
        const v = Number(o.retrospectivaPaidAmount);
        let valor = (Number.isFinite(v) && v > 0) ? v : precoRetroPadrao;
        if (isStripePayment(o.retrospectivaPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
        somarFaturamento(o.retrospectivaPaidAt || o.paidAt || o.createdAt, valor);
      }
    }

    // 3. Gerações e conversão por data de CRIAÇÃO do pedido
    const dCriacao = paraData(o.createdAt);
    if (dCriacao && dCriacao.getFullYear() === ano && dCriacao.getMonth() === mesNum - 1) {
      const linha = porDiaList[dCriacao.getDate() - 1];
      if (linha) {
        const count = Number(o.sunoGenerationCount) || (o.sunoRequestedAt ? 1 : 0);
        linha.geracoes += count;
        if (o.sunoProvider === 'suno_local') {
          linha.geracoesBot = (linha.geracoesBot || 0) + count;
        } else {
          linha.geracoesKie = (linha.geracoesKie || 0) + count;
        }
        if (!bonus) {
          linha.pedidosCriados += 1;
          if (hasMusicaGerada(o)) linha.pedidosComMusica += 1;
          if (musicaPaga || o.videoAddonPaid) linha.pedidosPagos += 1;
        } else if (o.videoAddonPaid) {
          linha.pedidosPagos += 1;
        }
      }
    }
  }

  for (const l of porDiaList) l.faturamento = r2(l.faturamento);
  return porDiaList;
}

/** Card "Vendas por horário": vendas por hora do pagamento no mês (ou só no dia `diaNum`). */
export function calcularVendasPorHora(pedidos, mes, diaNum = null) {
  const [ano, mesNum] = mes.split('-').map(Number);
  const horas = Array.from({ length: 24 }, () => 0);
  const somar = (dataVal) => {
    const d = paraData(dataVal);
    if (!d) return;
    if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return;
    if (diaNum && d.getDate() !== diaNum) return;
    horas[d.getHours()] += 1;
  };
  for (const o of pedidos || []) {
    const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
    if (musicaPaga) somar(o.paidAt || o.createdAt);
    if (o.hasVideoAccess || o.videoAddonPaid) somar(o.videoPaidAt);
    if (o.hasPlaybackAccess || o.playbackAddonPaid) somar(o.playbackPaidAt);
    if (o.hasCartaAccess || o.cartaAddonPaid) somar(o.cartaPaidAt);
    if (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid) somar(o.retrospectivaPaidAt);
  }
  return horas;
}

export const pagouAlgumProduto = (o) => Boolean(
  o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO' ||
  o.videoAddonPaid || o.hasPlaybackAccess || o.playbackAddonPaid ||
  o.hasCartaAccess || o.cartaAddonPaid || o.hasRetrospectivaAccess || o.retrospectivaAddonPaid
);

/** Card "Vendas por estado": pedidos com algum produto pago, por UF do DDD. */
export function calcularVendasPorEstado(pedidos) {
  const porEstado = {};
  let semEstado = 0;
  let totalVendas = 0;
  for (const o of pedidos || []) {
    if (!pagouAlgumProduto(o)) continue;
    totalVendas += 1;
    const uf = ufFromPhone(o.customerPhone);
    if (!uf) { semEstado += 1; continue; }
    porEstado[uf] = (porEstado[uf] || 0) + 1;
  }
  return { porEstado, semEstado, totalVendas };
}

/** Gráfico "Músicas geradas x conversões": geradas pela data de criação, convertidas pela de pagamento. */
export function calcularSerieMensal(pedidos, mes) {
  const [year, month] = mes.split('-').map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const feito = new Array(totalDays).fill(0);
  const convertido = new Array(totalDays).fill(0);
  for (const o of pedidos || []) {
    const c = paraData(o.createdAt);
    if (c && c.getFullYear() === year && c.getMonth() + 1 === month && hasMusicaGerada(o)) feito[c.getDate() - 1]++;
    const p = paraData(o.paidAt);
    if (p && p.getFullYear() === year && p.getMonth() + 1 === month) convertido[p.getDate() - 1]++;
  }
  return { feito, convertido };
}

const CAMPOS_PLATAFORMA = ['pedidosCriados', 'musicasGeradas', 'pedidosPagos', 'faturamento', 'geracoesKie', 'gastoKie', 'mensagensWhatsApp', 'gastoWhatsApp'];

/** Soma as métricas de plataforma de vários dias e refaz conversão, ticket e % (como o card). */
export function somarPlataformas(listas) {
  const soma = {};
  for (const lista of listas) {
    for (const p of lista || []) {
      const alvo = soma[p.key] || (soma[p.key] = { key: p.key, ...Object.fromEntries(CAMPOS_PLATAFORMA.map((c) => [c, 0])) });
      for (const c of CAMPOS_PLATAFORMA) alvo[c] += Number(p[c]) || 0;
    }
  }
  const ordem = Object.keys(PLATFORMS);
  const base = ordem.map((k) => soma[k] || { key: k, ...Object.fromEntries(CAMPOS_PLATAFORMA.map((c) => [c, 0])) });
  const faturamentoTotal = base.reduce((a, p) => a + p.faturamento, 0);
  const plataformas = base.map((m) => {
    const baseConversao = m.musicasGeradas > 0 ? m.musicasGeradas : (m.pedidosPagos > 0 ? m.pedidosPagos : 0);
    return {
      ...PLATFORMS[m.key],
      ...m,
      faturamento: r2(m.faturamento),
      gastoKie: r2(m.gastoKie),
      gastoWhatsApp: r2(m.gastoWhatsApp),
      conversao: baseConversao > 0 ? Math.round((m.pedidosPagos / baseConversao) * 1000) / 10 : 0,
      ticketMedio: m.pedidosPagos > 0 ? r2(m.faturamento / m.pedidosPagos) : 0,
      percFaturamento: faturamentoTotal > 0 ? Math.round((m.faturamento / faturamentoTotal) * 1000) / 10 : 0,
    };
  });
  const t = Object.fromEntries(CAMPOS_PLATAFORMA.map((c) => [c, base.reduce((a, p) => a + p[c], 0)]));
  const totais = {
    faturamento: r2(t.faturamento),
    pedidosPagos: t.pedidosPagos,
    pedidosCriados: t.pedidosCriados,
    musicasGeradas: t.musicasGeradas,
    geracoesKie: t.geracoesKie,
    gastoKie: r2(t.gastoKie),
    mensagensWhatsApp: t.mensagensWhatsApp,
    gastoWhatsApp: r2(t.gastoWhatsApp),
    conversaoGeral: t.musicasGeradas > 0 ? Math.round((t.pedidosPagos / t.musicasGeradas) * 1000) / 10 : (t.pedidosPagos > 0 ? 100 : 0),
    ticketMedioGeral: t.pedidosPagos > 0 ? r2(t.faturamento / t.pedidosPagos) : 0,
  };
  return { plataformas, totais };
}

/**
 * Tudo o que os cards precisam de UM dia (dia = 'AAAA-MM-DD'), a partir dos pedidos que mexeram
 * nele, já no relógio de Brasília. `plataformas` vem pronto de calcularMetricasPorPlataforma.
 */
export function montarDetalhesDia(pedidos, dia, plataformas) {
  const [ano, mesNum, diaNum] = dia.split('-').map(Number);
  const mes = dia.slice(0, 7);
  const criadosNoDia = (pedidos || []).filter((o) => {
    const c = paraData(o.createdAt);
    return c && c.getFullYear() === ano && c.getMonth() === mesNum - 1 && c.getDate() === diaNum;
  });
  const serie = calcularSerieMensal(pedidos, mes);
  const estados = calcularVendasPorEstado(criadosNoDia);
  return {
    v: VERSAO_DETALHES,
    vendas: calcularVendasPorDia(pedidos, ano, mesNum)[diaNum - 1],
    horas: calcularVendasPorHora(pedidos, mes, diaNum),
    estados: estados.porEstado,
    semEstado: estados.semEstado,
    totalVendasEstado: estados.totalVendas,
    feito: serie.feito[diaNum - 1],
    convertido: serie.convertido[diaNum - 1],
    plataformas: (plataformas || []).map((p) => ({ key: p.key, ...Object.fromEntries(CAMPOS_PLATAFORMA.map((c) => [c, Number(p[c]) || 0])) })),
  };
}

/** Junta os dias do mês no formato que cada card usa. `detalhesPorDia`: { 'AAAA-MM-DD': detalhes }. */
export function combinarMes(detalhesPorDia, mes, diasSelecionados) {
  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const dias = diasSelecionados || Array.from({ length: diasNoMes }, (_, i) => i + 1);
  const vendasPorDia = [];
  const feito = [];
  const convertido = [];
  const horas = Array(24).fill(0);
  const porEstado = {};
  let semEstado = 0;
  let totalVendasEstado = 0;
  const plataformasPorDia = {};
  for (const d of dias) {
    const chave = `${mes}-${String(d).padStart(2, '0')}`;
    const x = detalhesPorDia[chave];
    vendasPorDia.push(x?.vendas ? { ...x.vendas, dia: d } : linhaVendasVazia(d));
    feito.push(x?.feito || 0);
    convertido.push(x?.convertido || 0);
    if (!x) continue;
    (x.horas || []).forEach((n, h) => { horas[h] += Number(n) || 0; });
    for (const [uf, n] of Object.entries(x.estados || {})) porEstado[uf] = (porEstado[uf] || 0) + n;
    semEstado += x.semEstado || 0;
    totalVendasEstado += x.totalVendasEstado || 0;
    plataformasPorDia[d] = x.plataformas || [];
  }
  return {
    mes,
    vendasPorDia,
    serie: { feito, convertido },
    horas,
    estados: { porEstado, semEstado, totalVendas: totalVendasEstado },
    plataformasPorDia,
  };
}
