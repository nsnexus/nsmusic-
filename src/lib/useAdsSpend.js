// src/lib/useAdsSpend.js
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAdminAuthToken } from './authClient.js';

export function useAdsSpend(mes) {
  const [adsSpend, setAdsSpend] = useState({
    meta: { byDate: {}, total: 0 },
    tiktok: { byDate: {}, total: 0 },
  });
  const [loadingAds, setLoadingAds] = useState(false);
  const [adsError, setAdsError] = useState(null);

  const fetchSpend = useCallback(async () => {
    if (!mes) return;
    setLoadingAds(true);
    setAdsError(null);
    try {
      const token = await getAdminAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/admin/ads-spend?mes=${encodeURIComponent(mes)}`, { headers });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.ok) {
          setAdsSpend({
            meta: json.meta || { byDate: {}, total: 0 },
            tiktok: json.tiktok || { byDate: {}, total: 0 },
          });
        }
      }
    } catch (err) {
      setAdsError(err?.message);
    } finally {
      setLoadingAds(false);
    }
  }, [mes]);

  useEffect(() => {
    fetchSpend();
  }, [fetchSpend]);

  const saveManualSpend = useCallback(async ({ channel, date, spend }) => {
    try {
      const token = await getAdminAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch('/api/admin/ads-spend', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel, date, spend }),
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

  return { adsSpend, loadingAds, adsError, refetch: fetchSpend, saveManualSpend };
}

