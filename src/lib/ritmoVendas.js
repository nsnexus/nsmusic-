import { paraData } from '@/lib/usePedidosDoMes';
import { getPriceForSku } from '@/lib/pricing';

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

    // 1. Processa eventos de faturamento por produto
    for (const prod of PRODUTOS_RITMO) {
      const ts = prod.getPaidAt(o);
      if (!ts) continue;

      const d = paraData(ts);
      if (!d) continue;

      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const hour = d.getHours();
      const price = precoPorSku[prod.sku] || 0;

      if (dayKey === todayKey) {
        todayHourlyRevenue[hour] += price;
      } else if (targetPastDaysSet.has(dayKey)) {
        if (!pastDaysHourlyRevenue[dayKey]) {
          pastDaysHourlyRevenue[dayKey] = Array(24).fill(0);
        }
        pastDaysHourlyRevenue[dayKey][hour] += price;
      }
    }

    // 2. Processa cohort de conversão (baseado na hora de criação)
    const dCriacao = paraData(o.createdAt);
    if (dCriacao) {
      const dayKey = `${dCriacao.getFullYear()}-${String(dCriacao.getMonth() + 1).padStart(2, '0')}-${String(dCriacao.getDate()).padStart(2, '0')}`;
      const hour = dCriacao.getHours();
      const isPaid = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO' || Boolean(o.videoAddonPaid);

      if (dayKey === todayKey) {
        todayHourlyCreated[hour] += 1;
        if (isPaid) todayHourlyPaid[hour] += 1;
      } else if (targetPastDaysSet.has(dayKey)) {
        if (!pastDaysCreated[dayKey]) {
          pastDaysCreated[dayKey] = Array(24).fill(0);
          pastDaysPaid[dayKey] = Array(24).fill(0);
        }
        pastDaysCreated[dayKey][hour] += 1;
        if (isPaid) pastDaysPaid[dayKey][hour] += 1;
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
  const daysAveragedCount = pastDayKeys.length;
  const avgCumulativeRevenue = Array(24).fill(0);

  if (daysAveragedCount > 0) {
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

  // 6. Curvas Acumuladas de Conversão (%)
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
  const conversionDayKeys = Object.keys(pastDaysCreated);
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
  };
}
