// Tabela metricas_diarias: totais do dia (mesmas contas do Dashboard) e as curvas hora a hora do
// card "Ritmo de vendas", guardados por dia. O widget lê daqui em vez de baixar milhares de pedidos:
//  - hoje: recalculado com os pedidos que mexeram no dia, no máximo a cada 5 min;
//  - dias passados: recalculados até ficarem "fechados" (2 dias depois, quando pagamentos atrasados
//    de pedidos daquele dia já não mudam a coorte), no máximo 1x por hora; depois, só leitura.
// Migração: supabase/migrations/20261117_metricas_diarias.sql. Sem a tabela, calcula sem guardar.
import { COLUNAS_LEVES_RELATORIO, mapearPedidoRelatorio, remontarExtras } from './pedidosRelatorio';
import { calcularMetricasPorPlataforma } from './trafficSource';
import { agregarRitmoPorDia } from './ritmoVendas';
import { montarDetalhesDia, VERSAO_DETALHES } from './dashboardAgregados';
import { paraRelogioSp } from './relogioSp';

export const VALIDADE_HOJE_MS = 5 * 60 * 1000;
const VALIDADE_DIA_ABERTO_MS = 60 * 60 * 1000;
const DIA_MS = 24 * 3600 * 1000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const inicioDiaUtc = (dia) => new Date(`${dia}T00:00:00-03:00`).toISOString();
export function somarDias(dia, n) {
  return new Date(new Date(`${dia}T12:00:00-03:00`).getTime() + n * DIA_MS).toISOString().slice(0, 10);
}

async function paginar(supabase, montar) {
  const out = [];
  let ultimo = null;
  while (true) {
    let q = montar(supabase.from('orders').select(COLUNAS_LEVES_RELATORIO), ultimo);
    q = q.is('deleted_at', null).order('created_at', { ascending: true }).limit(1000);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    ultimo = data[data.length - 1].created_at;
  }
  return out;
}

/**
 * Pedidos que mexeram no dia, SEM filtrar por campos do extras no banco (sem índice; abrir o JSON
 * de cada pedido estourava o limite de 10 s por consulta). Três consultas por colunas comuns:
 *  A) criados no dia;  B) criados antes e pagos no dia;
 *  C) criados antes com algum add-on — a data do add-on é conferida depois, nas contas.
 * Pedidos com mais de 10 dias são apagados pela limpeza diária; 12 dias de janela cobre com folga.
 */
export async function buscarPedidosQueTocaramODia(supabase, dia) {
  const ini = inicioDiaUtc(dia);
  const fim = inicioDiaUtc(somarDias(dia, 1));
  const desde = inicioDiaUtc(somarDias(dia, -12));
  const desdeOu = (u, padrao) => (u ? ['gt', u] : ['gte', padrao]);
  const faixa = (q, u, inicio, fimExcl) => { const [op, v] = desdeOu(u, inicio); return q[op]('created_at', v).lt('created_at', fimExcl); };

  const [a, b, c] = await Promise.all([
    paginar(supabase, (q, u) => faixa(q, u, ini, fim)),
    paginar(supabase, (q, u) => faixa(q, u, desde, ini).gte('paid_at', ini).lt('paid_at', fim)),
    paginar(supabase, (q, u) => faixa(q, u, desde, ini).or('has_video_access.is.true,has_carta_access.is.true,has_playback_access.is.true,has_retrospectiva_access.is.true,has_karaoke_access.is.true')),
  ]);
  const porId = new Map();
  for (const row of [...a, ...b, ...c]) porId.set(row.id, row);
  return [...porId.values()].map((row) => mapearPedidoRelatorio(remontarExtras(row)));
}

/** Calcula a linha de um dia a partir dos pedidos (sem gravar). */
export async function calcularDia(supabase, dia, agora = new Date()) {
  const pedidos = paraRelogioSp(await buscarPedidosQueTocaramODia(supabase, dia));
  const mes = dia.slice(0, 7);
  // Totais do Dashboard: ele carrega os pedidos CRIADOS no mês e filtra o dia.
  const doMes = pedidos.filter((p) => String(p.createdAt || '').slice(0, 7) >= mes);
  const { totais, plataformas } = calcularMetricasPorPlataforma(doMes, String(Number(dia.slice(8, 10))), mes);
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
    // Tudo o que os cards do Dashboard precisam deste dia (ver dashboardAgregados.js)
    detalhes: montarDetalhesDia(doMes, dia, plataformas),
    calculado_em: agora.toISOString(),
  };
}

/** A linha guardada ainda serve? */
export function linhaValida(linha, hoje, agora = new Date()) {
  if (!linha?.calculado_em) return false;
  if (linha.detalhes?.v !== VERSAO_DETALHES) return false; // linha antiga, sem os detalhes do Dashboard
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
export async function obterMetricasDias(supabase, dias, hoje, agora = new Date(), opcoes = {}) {
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

  // No máximo 2 dias ao mesmo tempo, para não sobrecarregar o banco na primeira montagem.
  // Mais recentes primeiro; com opcoes.maxRecalculos, o resto fica em opcoes.pendentes (o chamador
  // pede de novo depois), para uma chamada não passar do tempo limite.
  let vencidos = dias.filter((d) => !linhaValida(guardadas[d], hoje, agora)).sort().reverse();
  if (opcoes.maxRecalculos && vencidos.length > opcoes.maxRecalculos) {
    if (Array.isArray(opcoes.pendentes)) opcoes.pendentes.push(...vencidos.slice(opcoes.maxRecalculos));
    vencidos = vencidos.slice(0, opcoes.maxRecalculos);
  }
  const novas = [];
  for (let i = 0; i < vencidos.length; i += 2) {
    novas.push(...await Promise.all(vencidos.slice(i, i + 2).map((d) => calcularDia(supabase, d, agora))));
  }
  for (const l of novas) guardadas[l.dia] = l;

  if (tabelaOk && novas.length) {
    try {
      let { error } = await supabase.from('metricas_diarias').upsert(novas, { onConflict: 'dia' });
      if (error && /detalhes/i.test(error.message || '')) {
        // Coluna detalhes ainda não criada (migração 20261117b): guarda o resto.
        ({ error } = await supabase.from('metricas_diarias').upsert(novas.map(({ detalhes, ...resto }) => resto), { onConflict: 'dia' }));
      }
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
