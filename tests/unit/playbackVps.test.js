import { describe, it, expect, vi } from 'vitest';
import { playbackTravado, dispararSeparacaoVps, PLAYBACK_LIMITE_MS } from '../../src/lib/playbackVps.js';

describe('playbackTravado', () => {
  const agora = Date.parse('2026-11-23T15:00:00Z');

  it('só vale para pedido em GERANDO', () => {
    expect(playbackTravado({ playbackStatus: 'READY' }, agora)).toBe(false);
    expect(playbackTravado({ playbackStatus: 'FAILED' }, agora)).toBe(false);
    expect(playbackTravado(null, agora)).toBe(false);
  });

  it('separação recente não está travada', () => {
    const inicio = new Date(agora - 60 * 1000).toISOString();
    expect(playbackTravado({ playbackStatus: 'GERANDO', playbackStartedAt: inicio }, agora)).toBe(false);
  });

  it('passou do limite: travada', () => {
    const inicio = new Date(agora - PLAYBACK_LIMITE_MS - 1000).toISOString();
    expect(playbackTravado({ playbackStatus: 'GERANDO', playbackStartedAt: inicio }, agora)).toBe(true);
    expect(playbackTravado({ playbackStatus: 'GERANDO', extras: { playbackStartedAt: inicio } }, agora)).toBe(true);
  });

  it('pedido antigo em GERANDO sem data de início é tratado como travado', () => {
    expect(playbackTravado({ playbackStatus: 'GERANDO' }, agora)).toBe(true);
  });
});

describe('dispararSeparacaoVps', () => {
  const env = { VPS_AUDIO_URL: 'https://vps.exemplo/audio', VPS_VIDEO_SECRET: 'segredo-teste' };

  it('envia orderId e audioUrl para /separate com o segredo', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ queued: true }), { status: 200 }));
    const r = await dispararSeparacaoVps({ orderId: 'P1', audioUrl: 'https://a/x.mp3', env, fetchImpl });
    expect(r).toEqual({ ok: true, dados: { queued: true } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://vps.exemplo/audio/separate');
    expect(init.headers.Authorization).toBe('Bearer segredo-teste');
    expect(JSON.parse(init.body)).toEqual({ orderId: 'P1', audioUrl: 'https://a/x.mp3' });
  });

  it('VPS recusando vira falha, sem lançar', async () => {
    const fetchImpl = vi.fn(async () => new Response('erro', { status: 500 }));
    expect(await dispararSeparacaoVps({ orderId: 'P1', audioUrl: 'u', env, fetchImpl })).toEqual({ ok: false, motivo: 'http_500' });
  });

  it('VPS fora do ar vira falha, sem lançar', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await dispararSeparacaoVps({ orderId: 'P1', audioUrl: 'u', env, fetchImpl })).toEqual({ ok: false, motivo: 'rede' });
  });

  it('sem segredo configurado não chama a VPS', async () => {
    const fetchImpl = vi.fn();
    const r = await dispararSeparacaoVps({ orderId: 'P1', audioUrl: 'u', env: { VPS_AUDIO_URL: 'https://v/audio' }, fetchImpl });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
