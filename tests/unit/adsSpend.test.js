import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeMetaAccountId,
  fetchMetaDailySpend,
  fetchTikTokDailySpend,
  getConsolidatedAdsSpend,
} from '../../src/lib/adsSpend.js';

describe('adsSpend module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeMetaAccountId', () => {
    it('adiciona prefixo act_ se ausente', () => {
      expect(normalizeMetaAccountId('3247434285438445')).toBe('act_3247434285438445');
    });

    it('mantém prefixo act_ se já presente', () => {
      expect(normalizeMetaAccountId('act_3247434285438445')).toBe('act_3247434285438445');
    });

    it('retorna vazio para entrada vazia ou nula', () => {
      expect(normalizeMetaAccountId('')).toBe('');
      expect(normalizeMetaAccountId(null)).toBe('');
    });
  });

  describe('fetchMetaDailySpend', () => {
    it('retorna not_configured se faltar token ou ID', async () => {
      const res = await fetchMetaDailySpend({ since: '2026-10-01', until: '2026-10-03' }, { META_AD_ACCOUNT_ID: '' });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('not_configured');
      expect(res.total).toBe(0);
    });

    it('processa e agrupa resposta com sucesso da Graph API', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { spend: '150.25', date_start: '2026-10-01', date_stop: '2026-10-01' },
            { spend: '200.75', date_start: '2026-10-02', date_stop: '2026-10-02' },
          ],
        }),
      });
      global.fetch = fakeFetch;

      const res = await fetchMetaDailySpend(
        { since: '2026-10-01', until: '2026-10-02' },
        { META_AD_ACCOUNT_ID: '123', META_MARKETING_ACCESS_TOKEN: 'token123' }
      );

      expect(res.ok).toBe(true);
      expect(res.byDate['2026-10-01']).toBe(150.25);
      expect(res.byDate['2026-10-02']).toBe(200.75);
      expect(res.total).toBe(351);
    });
  });

  describe('fetchTikTokDailySpend', () => {
    it('retorna not_configured se faltar credencial', async () => {
      const res = await fetchTikTokDailySpend({ since: '2026-10-01', until: '2026-10-02' }, {});
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('not_configured');
    });

    it('processa dados retornados pelo TikTok Marketing API', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          message: 'OK',
          data: {
            list: [
              { dimensions: { stat_time_day: '2026-10-01 00:00:00' }, metrics: { spend: '80.50' } },
              { dimensions: { stat_time_day: '2026-10-02' }, metrics: { spend: '95.00' } },
            ],
          },
        }),
      });
      global.fetch = fakeFetch;

      const res = await fetchTikTokDailySpend(
        { since: '2026-10-01', until: '2026-10-02' },
        { TIKTOK_ADVERTISER_ID: '777', TIKTOK_BUSINESS_ACCESS_TOKEN: 'tt_token' }
      );

      expect(res.ok).toBe(true);
      expect(res.byDate['2026-10-01']).toBe(80.50);
      expect(res.byDate['2026-10-02']).toBe(95.00);
      expect(res.total).toBe(175.50);
    });
  });

  describe('getConsolidatedAdsSpend', () => {
    it('consolida Meta e TikTok', async () => {
      const res = await getConsolidatedAdsSpend(
        { since: '2026-10-01', until: '2026-10-02' },
        { META_AD_ACCOUNT_ID: '', TIKTOK_ADVERTISER_ID: '' }
      );
      expect(res.meta.ok).toBe(false);
      expect(res.tiktok.ok).toBe(false);
      expect(res.period.since).toBe('2026-10-01');
    });
  });
});
