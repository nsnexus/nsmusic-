// src/lib/useAdsSpend.js
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAdminAuthToken } from './authClient.js';

const SEM_GASTOS = { meta: { byDate: {}, total: 0 }, tiktok: { byDate: {}, total: 0 }, google: { byDate: {}, total: 0 } };

export function useAdsSpend(mes, dia) {
  const periodo = dia || mes;
  const [resultado, setResultado] = useState(null);
  const [loadingAds, setLoadingAds] = useState(false);
  const [adsError, setAdsError] = useState(null);

  const fetchSpend = useCallback(async (signal) => {
    if (!mes) return;
    setLoadingAds(true);
    setAdsError(null);
    try {
      const token = await getAdminAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const params = new URLSearchParams(dia ? { since: dia, until: dia } : { mes });
      const res = await fetch(`/api/admin/ads-spend?${params}`, { headers, signal });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.ok && !signal?.aborted) {
          setResultado({
            periodo,
            adsSpend: {
              meta: json.meta || SEM_GASTOS.meta,
              tiktok: json.tiktok || SEM_GASTOS.tiktok,
              google: json.google || SEM_GASTOS.google,
            },
          });
        }
      }
    } catch (err) {
      if (!signal?.aborted) setAdsError(err?.message);
    } finally {
      if (!signal?.aborted) setLoadingAds(false);
    }
  }, [mes, dia, periodo]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSpend(controller.signal);
    return () => controller.abort();
  }, [fetchSpend]);

  const saveManualSpend = useCallback(async ({ channel, date, spend, entries, days }) => {
    try {
      const token = await getAdminAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const body = (entries || days)
        ? JSON.stringify({ channel, entries, days })
        : JSON.stringify({ channel, date, spend });
      const res = await fetch('/api/admin/ads-spend', {
        method: 'POST',
        headers,
        body,
      });
      if (res.ok) {
        await fetchSpend();
        return { ok: true };
      }
      const data = await res.json().catch(() => null);
      return { ok: false, error: data?.error || 'Falha ao salvar' };
    } catch (err) {
      return { ok: false, error: err?.message };
    }
  }, [fetchSpend]);

  const adsSpend = resultado?.periodo === periodo ? resultado.adsSpend : SEM_GASTOS;
  return { adsSpend, loadingAds, adsError, refetch: fetchSpend, saveManualSpend };
}

