import { describe, it, expect, vi } from 'vitest';
import { enviarFotosEmSerie, comPrazo } from '../../src/lib/envioFotos.js';

describe('comPrazo', () => {
  it('devolve a reserva quando a promessa trava', async () => {
    const travada = new Promise(() => {});
    expect(await comPrazo(travada, 10, 'reserva')).toBe('reserva');
  });
  it('devolve o valor quando termina a tempo', async () => {
    expect(await comPrazo(Promise.resolve('ok'), 50, 'reserva')).toBe('ok');
  });
});

describe('enviarFotosEmSerie', () => {
  it('uma foto que falha não derruba as outras, e cada sucesso é avisado na hora', async () => {
    const enviar = vi.fn(async (file) => {
      if (file === 'ruim') throw new Error('Falha no envio da foto.');
      return `url-${file}`;
    });
    const vistos = [];
    const r = await enviarFotosEmSerie(['a', 'ruim', 'c'], enviar, { aoSucesso: (u) => vistos.push(u) });
    expect(r.urls).toEqual(['url-a', 'url-c']);
    expect(vistos).toEqual(['url-a', 'url-c']);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].indice).toBe(1);
  });

  it('tenta de novo uma vez antes de desistir', async () => {
    let chamadas = 0;
    const enviar = vi.fn(async () => {
      chamadas++;
      if (chamadas === 1) throw new Error('rede');
      return 'url';
    });
    const r = await enviarFotosEmSerie(['a'], enviar);
    expect(r.urls).toEqual(['url']);
    expect(r.falhas).toEqual([]);
  });
});
