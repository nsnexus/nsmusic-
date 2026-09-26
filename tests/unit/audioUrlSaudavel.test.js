import { describe, it, expect, vi, afterEach } from 'vitest';
import { audioUrlSaudavel } from '@/lib/audioUrlSaudavel';

// Esta função é a única coisa entre a música do cliente e um link morto gravado no pedido. Em
// 25/09/2026 ela foi ao ar sem checar tamanho e deixou passar respostas de 404 e de 0 byte — o
// pedido ficava apontando para nada logo depois de o cliente pagar. A regra é simples e está
// fixada aqui: arquivo vazio não é arquivo.

const resposta = (status, headers) => ({
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});

afterEach(() => { vi.restoreAllMocks(); });

describe('audioUrlSaudavel', () => {
  it('aceita 206 com tamanho total de música', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(206, {
      'content-type': 'audio/mpeg',
      'content-range': 'bytes 0-1/6101709',
    }));
    expect(await audioUrlSaudavel('https://cdn/x.mp3')).toBe(true);
  });

  it('recusa arquivo pequeno demais para ser música', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(206, {
      'content-type': 'audio/mpeg',
      'content-range': 'bytes 0-1/2048',
    }));
    expect(await audioUrlSaudavel('https://cdn/x.mp3')).toBe(false);
  });

  it('recusa 200 com content-length zero — o audiostream expirado responde assim', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(200, {
      'content-type': 'audio/mpeg',
      'content-length': '0',
    }));
    expect(await audioUrlSaudavel('https://audiostream.kie.ai/stream/x.mp3')).toBe(false);
  });

  it('recusa página de erro HTML servida com status 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': '27150',
    }));
    expect(await audioUrlSaudavel('https://tempfile/x.mp3')).toBe(false);
  });

  it('recusa 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(404, { 'content-type': 'text/html' }));
    expect(await audioUrlSaudavel('https://tempfile/x.mp3')).toBe(false);
  });

  it('sem tamanho declarado, recusa — não dá para afirmar que tem música', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(206, { 'content-type': 'audio/mpeg' }));
    expect(await audioUrlSaudavel('https://cdn/x.mp3')).toBe(false);
  });

  it('aceita octet-stream com tamanho de música', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(200, {
      'content-type': 'application/octet-stream',
      'content-length': '5242880',
    }));
    expect(await audioUrlSaudavel('https://cdn/x.mp3')).toBe(true);
  });

  it('falha de rede não vira aprovação', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
    expect(await audioUrlSaudavel('https://cdn/x.mp3')).toBe(false);
  });

  it('url inválida nem chega a ser consultada', async () => {
    global.fetch = vi.fn();
    expect(await audioUrlSaudavel('')).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
