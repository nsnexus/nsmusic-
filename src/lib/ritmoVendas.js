import { paraData } from '@/lib/usePedidosDoMes';
import { getPriceForSku } from '@/lib/pricing';
import { hasMusicaGerada } from '@/lib/stats';
import { isStripePayment, calculateStripeFee } from '@/lib/paymentFees';

export const PRODUTOS_RITMO = [
  { chave: 'musica', sku: 'audio_only', getPaidAt: (o) => (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') ? (o.paidAt || o.createdAt) : null },
  { chave: 'video', sku: 'video_addon', getPaidAt: (o) => (o.hasVideoAccess || o.videoAddonPaid) ? o.videoPaidAt : null },
  { chave: 'playback', sku: 'playback_addon', getPaidAt: (o) => (o.hasPlaybackAccess || o.playbackAddonPaid) ? o.playbackPaidAt : null },
  { chave: 'carta', sku: 'carta_addon', getPaidAt: (o) => (o.hasCartaAccess || o.cartaAddonPaid) ? o.cartaPaidAt : null },
  { chave: 'retrospectiva', sku: 'retrospectiva_addon', getPaidAt: (o) => (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid) ? o.retrospectivaPaidAt : null },
];

/**
 * Calcula o ritmo intradiário de faturamento e conversão hora a hora.
 * Compara o desempenho acumulado de HOJE contra a média dos dias anteriores.
 *
 * @param {Array} pedidos - Lista de pedidos do mês
 * @param {Object} [options]
 * @param {Date} [options.referenceDate] - Data de referência (padrão: new Date())
 * @param {number} [options.daysLimit] - Limite de dias anteriores a incluir na média (padrão: 30)
 */
export function calculateIntradayPace(pedidos = [], options = {}) {
  const ref = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const currentHour = ref.getHours();

  // Chave única para "Hoje" no fuso local da data de referência
  const todayKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;

  // Janela dos últimos N dias anteriores (padrão: 7 dias / última semana)
  const daysLimit = Number(options.daysLimit) || 7;
  const targetPastDays = [];
  for (let i = 1; i <= daysLimit; i++) {
    const d = new Date(ref);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    targetPastDays.push(key);
  }
  const targetPastDaysSet = new Set(targetPastDays);

  const todayHourlyRevenue = Array(24).fill(0);
  const pastDaysHourlyRevenue = {}; // { 'YYYY-MM-DD': number[24] }

  const todayHourlyCreated = Array(24).fill(0);
  const todayHourlyPaid = Array(24).fill(0);
  const pastDaysCreated = {};
  const pastDaysPaid = {};

  const precoPorSku = Object.fromEntries(
    PRODUTOS_RITMO.map(p => [p.sku, getPriceForSku(p.sku)])
  );

  for (const o of pedidos) {
    if (!o) continue;

    const isBonusOrder = Boolean(
      o.isSecondGeneration ||
      o.origem === 'segunda_geracao' ||
      o.origem === 'segunda_musica' ||
      o.paidSku === 'segunda_geracao_bonus' ||
      o.extras?.isSecondGeneration ||
      o.extras?.paidSku === 'segunda_geracao_bonus' ||
      (o.parentOrderId && (o.paidAmount === 0 || Number(o.paidAmount) === 0))
    );

    // 1. Processa eventos de faturamento líquido real
    const registrarPagamento = (ts, valor) => {
      if (!ts || !valor || valor <= 0) return;
      const d = paraData(ts);
      if (!d) return;

      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const hour = d.getHours();

      if (dayKey === todayKey) {
        todayHourlyRevenue[hour] += valor;
      } else if (targetPastDaysSet.has(dayKey)) {
        if (!pastDaysHourlyRevenue[dayKey]) {
          pastDaysHourlyRevenue[dayKey] = Array(24).fill(0);
        }
        pastDaysHourlyRevenue[dayKey][hour] += valor;
      }
    };

    const musicaPaga = (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') && !isBonusOrder;
    if (musicaPaga) {
      let valorMusica = 9.99;
      if (o.paidAmount !== null && o.paidAmount !== undefined && o.paidAmount !== '') {
        const v = Number(o.paidAmount);
        if (Number.isFinite(v) && v >= 0) valorMusica = v;
      } else if (o.paymentIntentSku) {
        const porSku = precoPorSku[o.paymentIntentSku];
        if (porSku !== null && porSku !== undefined && o.paymentIntentSku !== 'impacto') valorMusica = porSku;
      }
      if (isStripePayment(o)) {
        valorMusica = Math.max(0, valorMusica - calculateStripeFee(valorMusica));
      }
      if (valorMusica > 0) {
        registrarPagamento(o.paidAt || o.createdAt, valorMusica);
      }
    }

    // Add-ons comprados separadamente
    if (o.videoPaymentId && (o.hasVideoAccess || o.videoAddonPaid)) {
      const v = Number(o.videoPaidAmount);
      let valor = (Number.isFinite(v) && v > 0) ? v : 6.90;
      if (isStripePayment(o.videoPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
      registrarPagamento(o.videoPaidAt || o.paidAt || o.createdAt, valor);
    } else if (!o.paidAmount && (o.hasVideoAccess || o.videoAddonPaid) && o.videoPaidAt) {
      // Caso legado (ex: testes sem paidAmount onde videoPaidAt foi fornecido)
      registrarPagamento(o.videoPaidAt, 6.90);
    }

    if (o.cartaPaymentId && (o.hasCartaAccess || o.cartaAddonPaid)) {
      const v = Number(o.cartaPaidAmount);
      let valor = (Number.isFinite(v) && v > 0) ? v : 3.99;
      if (isStripePayment(o.cartaPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
      registrarPagamento(o.cartaPaidAt || o.paidAt || o.createdAt, valor);
    }
    if (o.playbackPaymentId && (o.hasPlaybackAccess || o.playbackAddonPaid)) {
      const v = Number(o.playbackPaidAmount);
      let valor = (Number.isFinite(v) && v > 0) ? v : 4.99;
      if (isStripePayment(o.playbackPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
      registrarPagamento(o.playbackPaidAt || o.paidAt || o.createdAt, valor);
    }
    if (o.retrospectivaPaymentId && (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid)) {
      const v = Number(o.retrospectivaPaidAmount);
      let valor = (Number.isFinite(v) && v > 0) ? v : 9.99;
      if (isStripePayment(o.retrospectivaPaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
      registrarPagamento(o.retrospectivaPaidAt || o.paidAt || o.createdAt, valor);
    }
    if (o.karaokePaymentId && (o.hasKaraokeAccess || o.karaokeAddonPaid)) {
      const v = Number(o.karaokePaidAmount);
      let valor = (Number.isFinite(v) && v > 0) ? v : 9.90;
      if (isStripePayment(o.karaokePaymentId)) valor = Math.max(0, valor - calculateStripeFee(valor));
      registrarPagamento(o.karaokePaidAt || o.paidAt || o.createdAt, valor);
    }

    // 2. Processa cohort de conversão (baseado na hora de criação)
    const dCriacao = paraData(o.createdAt);
    if (dCriacao) {
      const dayKey = `${dCriacao.getFullYear()}-${String(dCriacao.getMonth() + 1).padStart(2, '0')}-${String(dCriacao.getDate()).padStart(2, '0')}`;
      const hour = dCriacao.getHours();

      if (!isBonusOrder) {
        const comMusica = hasMusicaGerada(o);
        const isPaid = (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') || Boolean(o.videoAddonPaid);

        if (dayKey === todayKey) {
          if (comMusica) todayHourlyCreated[hour] += 1;
          if (isPaid) todayHourlyPaid[hour] += 1;
        } else if (targetPastDaysSet.has(dayKey)) {
          if (!pastDaysCreated[dayKey]) {
            pastDaysCreated[dayKey] = Array(24).fill(0);
            pastDaysPaid[dayKey] = Array(24).fill(0);
          }
          if (comMusica) pastDaysCreated[dayKey][hour] += 1;
          if (isPaid) pastDaysPaid[dayKey][hour] += 1;
        }
      } else if (o.videoAddonPaid) {
        if (dayKey === todayKey) {
          todayHourlyPaid[hour] += 1;
        } else if (targetPastDaysSet.has(dayKey)) {
          if (!pastDaysPaid[dayKey]) {
            pastDaysCreated[dayKey] = Array(24).fill(0);
            pastDaysPaid[dayKey] = Array(24).fill(0);
          }
          pastDaysPaid[dayKey][hour] += 1;
        }
      }
    }
  }

  // 3. Monta curvas acumuladas de faturamento (Hora a Hora)
  const todayCumulativeRevenue = Array(24).fill(null);
  let runningTodayRev = 0;
  for (let h = 0; h <= currentHour; h++) {
    runningTodayRev += todayHourlyRevenue[h];
    todayCumulativeRevenue[h] = Math.round(runningTodayRev * 100) / 100;
  }

  const pastDayKeys = Object.keys(pastDaysHourlyRevenue);
  const conversionDayKeys = Object.keys(pastDaysCreated);
  const allPastDayKeys = Array.from(new Set([...pastDayKeys, ...conversionDayKeys]));
  const daysAveragedCount = allPastDayKeys.length;
  const avgCumulativeRevenue = Array(24).fill(0);

  // Médias horárias não-acumuladas (hora a hora) dos dias anteriores
  const avgHourlyRevenue = Array(24).fill(0);
  const avgHourlyPaid = Array(24).fill(0);
  const avgHourlyCreated = Array(24).fill(0);
  const avgHourlyConversion = Array(24).fill(0);

  if (daysAveragedCount > 0) {
    for (let h = 0; h < 24; h++) {
      let sumRev = 0;
      let sumPaid = 0;
      let sumCreated = 0;
      for (const dKey of allPastDayKeys) {
        sumRev += (pastDaysHourlyRevenue[dKey]?.[h] || 0);
        sumPaid += (pastDaysPaid[dKey]?.[h] || 0);
        sumCreated += (pastDaysCreated[dKey]?.[h] || 0);
      }
      avgHourlyRevenue[h] = Math.round((sumRev / daysAveragedCount) * 100) / 100;
      avgHourlyPaid[h] = Math.round((sumPaid / daysAveragedCount) * 10) / 10;
      avgHourlyCreated[h] = Math.round((sumCreated / daysAveragedCount) * 10) / 10;
      avgHourlyConversion[h] = sumCreated > 0
        ? Math.round((sumPaid / sumCreated) * 1000) / 10
        : 0;
    }

    const pastDaysCumMap = {};
    for (const dKey of pastDayKeys) {
      pastDaysCumMap[dKey] = Array(24).fill(0);
      let run = 0;
      for (let h = 0; h < 24; h++) {
        run += pastDaysHourlyRevenue[dKey][h];
        pastDaysCumMap[dKey][h] = run;
      }
    }

    for (let h = 0; h < 24; h++) {
      let sum = 0;
      for (const dKey of pastDayKeys) {
        sum += pastDaysCumMap[dKey][h];
      }
      avgCumulativeRevenue[h] = Math.round((sum / daysAveragedCount) * 100) / 100;
    }
  }

  // 4. Métricas consolidadas até a hora atual
  const todayRevenueSoFar = todayCumulativeRevenue[currentHour] || 0;
  const avgRevenueAtCurrentHour = avgCumulativeRevenue[currentHour] || 0;

  let revenueDiffPercent = 0;
  if (avgRevenueAtCurrentHour > 0) {
    revenueDiffPercent = Math.round(((todayRevenueSoFar - avgRevenueAtCurrentHour) / avgRevenueAtCurrentHour) * 1000) / 10;
  }

  // 5. Linha de Projeção / Tendência de Fechamento do Dia
  const projectedCumulativeRevenue = Array(24).fill(null);
  let projectedDayEndRevenue = todayRevenueSoFar;

  if (avgRevenueAtCurrentHour > 0 && daysAveragedCount > 0) {
    const paceRatio = todayRevenueSoFar / avgRevenueAtCurrentHour;
    for (let h = currentHour; h < 24; h++) {
      const proj = Math.round(Math.max(todayRevenueSoFar, avgCumulativeRevenue[h] * paceRatio) * 100) / 100;
      projectedCumulativeRevenue[h] = proj;
    }
    projectedDayEndRevenue = projectedCumulativeRevenue[23] || todayRevenueSoFar;
  } else {
    for (let h = currentHour; h < 24; h++) {
      projectedCumulativeRevenue[h] = todayRevenueSoFar;
    }
  }

  // 6. Curvas Acumuladas e Horárias de Conversão (%)
  const todayCumulativeConversion = Array(24).fill(null);
  let runCreated = 0;
  let runPaid = 0;
  for (let h = 0; h <= currentHour; h++) {
    runCreated += todayHourlyCreated[h];
    runPaid += todayHourlyPaid[h];
    todayCumulativeConversion[h] = runCreated > 0
      ? Math.round((runPaid / runCreated) * 1000) / 10
      : 0;
  }

  const avgCumulativeConversion = Array(24).fill(0);
  if (conversionDayKeys.length > 0) {
    for (let h = 0; h < 24; h++) {
      let sumRates = 0;
      let validDays = 0;
      for (const dKey of conversionDayKeys) {
        let dayCreated = 0;
        let dayPaid = 0;
        for (let i = 0; i <= h; i++) {
          dayCreated += (pastDaysCreated[dKey]?.[i] || 0);
          dayPaid += (pastDaysPaid[dKey]?.[i] || 0);
        }
        if (dayCreated > 0) {
          sumRates += (dayPaid / dayCreated) * 100;
          validDays++;
        }
      }
      avgCumulativeConversion[h] = validDays > 0
        ? Math.round((sumRates / validDays) * 10) / 10
        : 0;
    }
  }

  const todayConversionSoFar = todayCumulativeConversion[currentHour] || 0;
  const avgConversionSoFar = avgCumulativeConversion[currentHour] || 0;

  // 7. Arrays de exibição hora a hora (hoje: valores reais até currentHour, null no futuro)
  const todayHourlyPaidDisplay = Array(24).fill(null);
  const todayHourlyRevenueDisplay = Array(24).fill(null);
  const todayHourlyCreatedDisplay = Array(24).fill(null);
  const todayHourlyConversionDisplay = Array(24).fill(null);

  for (let h = 0; h <= currentHour; h++) {
    todayHourlyPaidDisplay[h] = todayHourlyPaid[h];
    todayHourlyRevenueDisplay[h] = Math.round(todayHourlyRevenue[h] * 100) / 100;
    todayHourlyCreatedDisplay[h] = todayHourlyCreated[h];
    todayHourlyConversionDisplay[h] = todayHourlyCreated[h] > 0
      ? Math.round((todayHourlyPaid[h] / todayHourlyCreated[h]) * 1000) / 10
      : 0;
  }

  // 8. Ritmo e Projeção de Quantidade de Vendas
  const todayPaidSoFar = runPaid;
  let avgPaidAtCurrentHour = 0;
  for (let h = 0; h <= currentHour; h++) {
    avgPaidAtCurrentHour += avgHourlyPaid[h];
  }
  avgPaidAtCurrentHour = Math.round(avgPaidAtCurrentHour * 10) / 10;

  let paidDiffPercent = 0;
  if (avgPaidAtCurrentHour > 0) {
    paidDiffPercent = Math.round(((todayPaidSoFar - avgPaidAtCurrentHour) / avgPaidAtCurrentHour) * 1000) / 10;
  }

  const projectedHourlyPaid = Array(24).fill(null);
  const projectedHourlyRevenue = Array(24).fill(null);
  let projectedDayEndPaid = todayPaidSoFar;

  if (avgPaidAtCurrentHour > 0 && daysAveragedCount > 0) {
    const paceRatioPaid = todayPaidSoFar / avgPaidAtCurrentHour;
    let projRunPaid = todayPaidSoFar;
    for (let h = currentHour + 1; h < 24; h++) {
      const projH = Math.round(avgHourlyPaid[h] * paceRatioPaid * 10) / 10;
      projectedHourlyPaid[h] = projH;
      projRunPaid += projH;
    }
    projectedDayEndPaid = Math.round(projRunPaid);
  } else {
    for (let h = currentHour + 1; h < 24; h++) {
      projectedHourlyPaid[h] = 0;
    }
  }

  if (avgRevenueAtCurrentHour > 0 && daysAveragedCount > 0) {
    const paceRatioRev = todayRevenueSoFar / avgRevenueAtCurrentHour;
    for (let h = currentHour + 1; h < 24; h++) {
      projectedHourlyRevenue[h] = Math.round(avgHourlyRevenue[h] * paceRatioRev * 100) / 100;
    }
  }

  // 9. Destaques do dia (Melhor hora de vendas e de conversão)
  let bestHourSales = null;
  let maxSales = 0;
  let bestHourConversion = null;
  let maxConv = 0;

  for (let h = 0; h <= currentHour; h++) {
    const p = todayHourlyPaid[h] || 0;
    const c = todayHourlyCreated[h] || 0;
    const conv = c > 0 ? (p / c) * 100 : 0;

    if (p > maxSales) {
      maxSales = p;
      bestHourSales = { hour: h, count: p, revenue: Math.round((todayHourlyRevenue[h] || 0) * 100) / 100 };
    }
    if (conv > maxConv && c >= 1) {
      maxConv = conv;
      bestHourConversion = { hour: h, rate: Math.round(conv * 10) / 10, paid: p, created: c };
    }
  }

  return {
    currentHour,
    todayRevenueSoFar,
    avgRevenueAtCurrentHour,
    revenueDiffPercent,
    projectedDayEndRevenue,
    todayCumulativeRevenue,
    avgCumulativeRevenue,
    projectedCumulativeRevenue,
    todayCumulativeConversion,
    avgCumulativeConversion,
    todayConversionSoFar,
    avgConversionSoFar,
    daysAveragedCount,
    daysLimit,
    todayCreatedTotal: runCreated,
    todayPaidTotal: runPaid,
    // Novos campos hora a hora
    todayHourlyPaid: todayHourlyPaidDisplay,
    todayHourlyRevenue: todayHourlyRevenueDisplay,
    todayHourlyCreated: todayHourlyCreatedDisplay,
    todayHourlyConversion: todayHourlyConversionDisplay,
    avgHourlyPaid,
    avgHourlyRevenue,
    avgHourlyCreated,
    avgHourlyConversion,
    projectedHourlyPaid,
    projectedHourlyRevenue,
    projectedDayEndPaid,
    todayPaidSoFar,
    avgPaidAtCurrentHour,
    paidDiffPercent,
    bestHourSales,
    bestHourConversion,
  };
}
