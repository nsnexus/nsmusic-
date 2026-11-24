import { describe, it, expect, vi } from 'vitest';
import { roasAcumuladoPorHora, fetchMetaHourlySpend, fetchTikTokHourlySpend } from '../../src/lib/adsSpendHora.js';
import { calcularVendasPorDia } from '../../src/lib/dashboardAgregados.js';

describe('roasAcumuladoPorHora', () => {
  it('acumula faturamento e gasto e para na hora atual', () => {
    const receita = Array(24).fill(0); receita[9] = 50; receita[10] = 30;
    const gasto = Array(24).fill(0); gasto[8] = 20; gasto[10] = 20;
    const h = roasAcumuladoPorHora(receita, gasto, 10);
    expect(h[7].roas).toBe(null); // sem gasto ainda
    expect(h[8]).toEqual({ hora: 8, receita: 0, gasto: 20, roas: 0 });
    expect(h[9].roas).toBe(2.5);
    expect(h[10]).toEqual({ hora: 10, receita: 80, gasto: 40, roas: 2 });
    expect(h[11].roas).toBe(null); // hora futura
  });
});

describe('gasto por hora', () => {
  it('Meta: soma por hora, imposto só na conta em reais', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { hourly_stats_aggregated_by_advertiser_time_zone: '09:00:00 - 09:59:59', spend: '12.50', account_currency: 'BRL' },
        { hourly_stats_aggregated_by_advertiser_time_zone: '13:00:00 - 13:59:59', spend: '7', account_currency: 'BRL' },
      ],
    })));
    const r = await fetchMetaHourlySpend('2026-11-23', { META_AD_ACCOUNT_ID: '123', META_MARKETING_ACCESS_TOKEN: 't' }, fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.porHora[9]).toBe(12.5);
    expect(r.porHora[13]).toBe(7);
    expect(r.tributavelPorHora[9]).toBe(12.5);
    expect(fetchImpl.mock.calls[0][0]).toContain('hourly_stats_aggregated_by_advertiser_time_zone');
  });

  it('Meta sem credencial não chama a API', async () => {
    const fetchImpl = vi.fn();
    const r = await fetchMetaHourlySpend('2026-11-22', {}, fetchImpl);
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('TikTok: lê stat_time_hour', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: { list: [{ dimensions: { stat_time_hour: '2026-11-23 14:00:00' }, metrics: { spend: '3.2' } }] },
    })));
    const r = await fetchTikTokHourlySpend('2026-11-23', { TIKTOK_ADVERTISER_ID: 'a', TIKTOK_BUSINESS_ACCESS_TOKEN: 'b' }, fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.porHora[14]).toBe(3.2);
  });
});

describe('Vendas por dia: voz clonada e Pacote Família', () => {
  const base = { paymentStatus: 'PAGAMENTO_APROVADO', createdAt: '2026-11-10T12:00:00.000Z', paidAt: '2026-11-10T12:05:00.000Z' };

  it('conta voz avulsa (com faturamento) e voz do combo_voz (sem somar de novo)', () => {
    const linhas = calcularVendasPorDia([
      { ...base, paidAmount: 9.99, customVoiceAddonPaid: true, customVoicePaymentId: 'p1', customVoicePaidAmount: 14.9, customVoicePaidAt: '2026-11-10T13:00:00.000Z' },
      { ...base, paidAmount: 24.9, paidSku: 'combo_voz', customVoiceAddonPaid: true, customVoicePaidAt: '2026-11-10T12:05:00.000Z' },
    ], 2026, 11);
    expect(linhas[9].vozes).toBe(2);
    expect(linhas[9].faturamento).toBeCloseTo(9.99 + 14.9 + 24.9, 2);
  });

  it('conta o Pacote Família pela compra principal', () => {
    const linhas = calcularVendasPorDia([
      { ...base, paidAmount: 39.9, paidSku: 'combo_familia' },
      { ...base, paidAmount: 16.9, paidSku: 'combo' },
    ], 2026, 11);
    expect(linhas[9].familias).toBe(1);
    expect(linhas[9].musicas).toBe(2);
  });
});
