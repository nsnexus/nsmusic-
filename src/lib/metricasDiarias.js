// Tabela metricas_diarias: totais do dia (mesmas contas do Dashboard) e as curvas hora a hora do
// card "Ritmo de vendas", guardados por dia. O widget lê daqui em vez de baixar milhares de pedidos:
//  - hoje: recalculado com os pedidos que mexeram no dia, no máximo a cada 5 min;
//  - dias passados: recalculados até ficarem "fechados" (2 dias depois, quando pagamentos atrasados
//    de pedidos daquele dia já não mudam a coorte), no máximo 1x por hora; depois, só leitura.
// Migração: supabase/migrations/20261117_metricas_diarias.sql. Sem a tabela, calcula sem guardar.
import { COLUNAS_PEDIDO_RELATORIO, mapearPedidoRelatorio } from './pedidosRelatorio';
import { calcularMetricasPorPlataforma } from './trafficSource';
import { agregarRitmoPorDia } from './ritmoVendas';
import { paraRelogioSp } from './relogioSp';

export const VALIDADE_HOJE_MS = 5 * 60 * 1000;
const VALIDADE_DIA_ABERTO_MS = 60 * 60 * 1000;
const DIA_MS = 24 * 3600 * 1000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Campos do extras que mapearPedidoRelatorio usa — baixar só eles, não o JSON inteiro do pedido.
const CAMPOS_EXTRAS = [
  'audioUrl', 'cartaAddonPaid', 'cartaPaidAmount', 'cartaPaidAt', 'cartaPaymentId', 'fbclid', 'gclid',
  'hasKaraokeAccess', 'isSecondGeneration', 'karaokeAddonPaid', 'karaokePaidAmount', 'karaokePaidAt',
  'karaokePaymentId', 'origem', 'paidAmount', 'paidSku', 'parentOrderId', 'paymentIntentSku',
  'paymentWhatsappSent', 'platform', 'playbackAddonPaid', 'playbackPaidAmount', 'playbackPaidAt',
  'playbackPaymentId', 'productionStatus', 'readyTemplateSent', 'referrer', 'retrospectivaAddonPaid',
  'retrospectivaPaidAmount', 'retrospectivaPaidAt', 'retrospectivaPaymentId', 'trafficSource', 'ttclid',
  'userAgent', 'utmCampaign', 'utmContent', 'utmMedium', 'utmSource', 'utmTerm', 'videoAddonPaid',
  'videoPaidAmount', 'videoPaidAt', 'videoPaymentId', 'whatsappSent',
];
const PAGAMENTOS_EXTRAS = ['videoPaidAt', 'cartaPaidAt', 'playbackPaidAt', 'retrospectivaPaidAt', 'karaokePaidAt'];
const COLUNAS_LEVES = COLUNAS_PEDIDO_RELATORIO.split(',').filter((c) => c !== 'extras')
  .concat(CAMPOS_EXTRAS.map((k) => `x_${k}:extras->${k}`)).join(',');

function linhaParaPedido(row) {
  const extras = {};
  for (const k of CAMPOS_EXTRAS) {
    const v = row[`x_${k}`];
    if (v !== undefined && v !== null) extras[k] = v;
  }
  return mapearPedidoRelatorio({ ...row, extras });
}

export const inicioDiaUtc = (dia) => new Date(`${dia}T00:00:00-03:00`).toISOString();
export function somarDias(dia, n) {
  return new Date(new Date(`${dia}T12:00:00-03:00`).getTime() + n * DIA_MS).toISOString().slice(0, 10);
}

/** Pedidos que mexeram no dia: criados no dia OU com algum pagamento (música ou add-on) no dia. */
export async function buscarPedidosQueTocaramODia(supabase, dia) {
  const ini = `"${inicioDiaUtc(dia)}"`;
  const fim = `"${inicioDiaUtc(somarDias(dia, 1))}"`;
  const naJanela = (col) => `and(${col}.gte.${ini},${col}.lt.${fim})`;
  const condicoes = ['created_at', 'paid_at', ...PAGAMENTOS_EXTRAS.map((c) => `extras->>${c}`)].map(naJanela).join(',');
  // Pedidos com mais de 10 dias são apagados pela limpeza diária; 12 dias cobre com folga.
  const criadoDesde = inicioDiaUtc(somarDias(dia, -12));
  const pedidos = [];
  let ultimo = null;
  while (true) {
    let q = supabase.from('orders').select(COLUNAS_LEVES);
    q = ultimo ? q.gt('created_at', ultimo) : q.gte('created_at', criadoDesde);
    q = q.lt('created_at', inicioDiaUtc(somarDias(dia, 1))).or(condicoes).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(1000);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) pedidos.push(linhaParaPedido(row));
    if (data.length < 1000) break;
    ultimo = data[data.length - 1].created_at;
  }
  return pedidos;
}

/** Calcula a linha de um dia a partir dos pedidos (sem gravar). */
export async function calcularDia(supabase, dia, agora = new Date()) {
  const pedidos = paraRelogioSp(await buscarPedidosQueTocaramODia(supabase, dia));
  const mes = dia.slice(0, 7);
  // Totais do Dashboard: ele carrega os pedidos CRIADOS no mês e filtra o dia.
  const doMes = pedidos.filter((p) => String(p.createdAt || '').slice(0, 7) >= mes);
  const { totais } = calcularMetricasPorPlataforma(doMes, String(Number(dia.slice(8, 10))), mes);
  const ritmo = agregarRitmoPorDia(pedidos)[dia] || { receita: Array(24).fill(0), criados: Array(24).fill(0), pagos: Array(24).fill(0), temReceita: false, temCoorte: false };
  return {
    dia,
    faturamento: r2(totais.faturamento),
    vendas: totais.pedidosPagos || 0,
    pedidos_criados: totais.pedidosCriados || 0,
    musicas_geradas: totais.musicasGeradas || 0,
    gasto_kie: r2(totais.gastoKie),
    gasto_whatsapp: r2(totais.gastoWhatsApp),
    receita_hora: ritmo.receita.map(r2),
    criados_hora: ritmo.criados,
    pagos_hora: ritmo.pagos,
    tem_receita: ritmo.temReceita,
    tem_coorte: ritmo.temCoorte,
    calculado_em: agora.toISOString(),
  };
}

/** A linha guardada ainda serve? */
export function linhaValida(linha, hoje, agora = new Date()) {
  if (!linha?.calculado_em) return false;
  const calc = Date.parse(linha.calculado_em);
  if (Number.isNaN(calc)) return false;
  const idade = agora.getTime() - calc;
  if (linha.dia === hoje) return idade >= 0 && idade < VALIDADE_HOJE_MS;
  if (calc >= Date.parse(inicioDiaUtc(somarDias(linha.dia, 2)))) return true; // dia fechado
  return idade >= 0 && idade < VALIDADE_DIA_ABERTO_MS;
}

/**
 * Linhas de `dias` (AAAA-MM-DD), lendo de metricas_diarias e recalculando só as vencidas.
 * @returns {Promise<Object<string, Object>>} { dia: linha }
 */
export async function obterMetricasDias(supabase, dias, hoje, agora = new Date()) {
  let guardadas = {};
  let tabelaOk = true;
  try {
    const { data, error } = await supabase.from('metricas_diarias').select('*').in('dia', dias);
    if (error) throw new Error(error.message);
    for (const l of data || []) guardadas[String(l.dia).slice(0, 10)] = { ...l, dia: String(l.dia).slice(0, 10) };
  } catch (e) {
    tabelaOk = false;
    guardadas = {};
    console.warn('[metricasDiarias] Tabela indisponível, calculando sem guardar:', e?.message);
  }

  const vencidos = dias.filter((d) => !linhaValida(guardadas[d], hoje, agora));
  const novas = await Promise.all(vencidos.map((d) => calcularDia(supabase, d, agora)));
  for (const l of novas) guardadas[l.dia] = l;

  if (tabelaOk && novas.length) {
    try {
      const { error } = await supabase.from('metricas_diarias').upsert(novas, { onConflict: 'dia' });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.warn('[metricasDiarias] Falha ao gravar:', e?.message);
    }
  }
  return guardadas;
}

/** Converte as linhas no formato de agregarRitmoPorDia, para calcularRitmoDeAgregados. */
export function linhasParaRitmo(linhas) {
  const porDia = {};
  for (const [dia, l] of Object.entries(linhas)) {
    porDia[dia] = {
      receita: (l.receita_hora || []).map(Number),
      criados: (l.criados_hora || []).map(Number),
      pagos: (l.pagos_hora || []).map(Number),
      temReceita: Boolean(l.tem_receita),
      temCoorte: Boolean(l.tem_coorte),
    };
  }
  return porDia;
}
