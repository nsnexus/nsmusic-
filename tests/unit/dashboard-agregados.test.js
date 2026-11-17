import { describe, expect, it } from 'vitest';
import {
  calcularVendasPorDia, calcularVendasPorHora, calcularVendasPorEstado, calcularSerieMensal,
  montarDetalhesDia, combinarMes, somarPlataformas,
} from '../../src/lib/dashboardAgregados.js';
import { calcularMetricasPorPlataforma } from '../../src/lib/trafficSource.js';

process.env.TZ = 'UTC';

// Pedidos de exemplo em novembro: criados em vários dias, alguns pagos no dia seguinte, add-ons
// pagos depois, bônus, cartão, plataformas e DDDs variados.
const ddds = ['11', '21', '31', '41', '51', '61', '71', '81', '91', '94'];
const fontes = [{ fbclid: 'x' }, { ttclid: 'y' }, { utmSource: 'google' }, {}, { referrer: 'https://instagram.com' }];
function gerarPedidos() {
  const lista = [];
  let n = 0;
  for (let d = 1; d <= 16; d++) {
    for (let h = 8; h < 23; h += 2) {
      n++;
      const criado = new Date(Date.UTC(2026, 10, d, h, 10)).toISOString();
      const pago = n % 3 !== 0;
      const pagoNoDiaSeguinte = n % 7 === 0;
      const paidAt = pago ? new Date(Date.UTC(2026, 10, d + (pagoNoDiaSeguinte ? 1 : 0), h + 1, 5)).toISOString() : null;
      const video = pago && n % 4 === 0;
      lista.push({
        id: `p${n}`,
        customerPhone: `(${ddds[n % ddds.length]}) 9${String(10000000 + n).slice(-8)}`,
        paymentStatus: pago ? 'PAGO' : 'AGUARDANDO_PAGAMENTO',
        createdAt: criado,
        paidAt,
        paidAmount: pago ? (n % 5 === 0 ? 16.9 : 9.99) : null,
        paymentId: n % 6 === 0 ? `cs_${n}` : `efi${n}`,
        sunoGenerationCount: 1 + (n % 2),
        sunoProvider: n % 5 === 0 ? 'suno_local' : 'kie',
        productionStatus: 'AUDIO_GERADO',
        audioUrl: 'a.mp3',
        hasAudio: true,
        hasVideoAccess: video,
        videoAddonPaid: video,
        videoPaymentId: video ? `efiv${n}` : undefined,
        videoPaidAmount: video ? 6.9 : undefined,
        videoPaidAt: video ? new Date(Date.UTC(2026, 10, d + 2, 12, 0)).toISOString() : undefined,
        isSecondGeneration: n % 11 === 0,
        readyTemplateSent: n % 2 === 0,
        paymentWhatsappSent: pago,
        ...fontes[n % fontes.length],
      });
    }
  }
  return lista;
}

const MES = '2026-11';
const datas = (o) => [o.createdAt, o.paidAt, o.videoPaidAt].filter(Boolean).map((t) => t.slice(0, 10));

function detalhesPorDia(pedidos) {
  const out = {};
  for (let d = 1; d <= 18; d++) {
    const dia = `${MES}-${String(d).padStart(2, '0')}`;
    const tocaram = pedidos.filter((o) => datas(o).includes(dia)); // o que a busca do dia traz
    const { plataformas } = calcularMetricasPorPlataforma(tocaram, String(d), MES);
    out[dia] = montarDetalhesDia(tocaram, dia, plataformas);
  }
  return out;
}

describe('Dashboard: guardar por dia e somar = calcular o mês inteiro', () => {
  const pedidos = gerarPedidos();
  const mes = combinarMes(detalhesPorDia(pedidos), MES);

  it('Vendas por dia', () => {
    expect(mes.vendasPorDia).toEqual(calcularVendasPorDia(pedidos, 2026, 11));
  });
  it('Vendas por horário', () => {
    expect(mes.horas).toEqual(calcularVendasPorHora(pedidos, MES));
  });
  it('Vendas por estado', () => {
    expect(mes.estados).toEqual(calcularVendasPorEstado(pedidos));
  });
  it('Gráfico gerados x convertidos', () => {
    const s = calcularSerieMensal(pedidos, MES);
    expect(mes.serie).toEqual(s);
  });
  it('Plataformas: cada dia igual ao filtro do card, e o mês = soma dos dias', () => {
    for (const d of [3, 9, 16]) {
      const card = calcularMetricasPorPlataforma(pedidos, String(d), MES);
      const doDia = somarPlataformas([mes.plataformasPorDia[d]]);
      expect(doDia.totais.faturamento).toBeCloseTo(card.totais.faturamento, 2);
      expect(doDia.totais.pedidosPagos).toBe(card.totais.pedidosPagos);
      expect(doDia.totais.musicasGeradas).toBe(card.totais.musicasGeradas);
      for (const p of card.plataformas) {
        const q = doDia.plataformas.find((x) => x.key === p.key);
        expect(q.faturamento).toBeCloseTo(p.faturamento, 2);
        expect(q.pedidosPagos).toBe(p.pedidosPagos);
      }
    }
    const somaMes = somarPlataformas(Object.values(mes.plataformasPorDia));
    const somaDiasCard = [...Array(18)].map((_, i) => calcularMetricasPorPlataforma(pedidos, String(i + 1), MES).totais.faturamento).reduce((a, b) => a + b, 0);
    expect(somaMes.totais.faturamento).toBeCloseTo(somaDiasCard, 2);
  });
});
