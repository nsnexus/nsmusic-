import { describe, it, expect, vi, afterEach } from 'vitest';
import { listarMidiasDeAnuncios, separarContasDeAnuncio } from '../../src/lib/instagramGraph.js';

function respostaAds(mediaIds) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: mediaIds.map((id, i) => ({ name: `AN${i}`, creative: { effective_instagram_media_id: id } })) }),
    text: async () => '',
  };
}
function respostaErro() {
  return {
    ok: false,
    status: 400,
    json: async () => ({ error: { message: 'sem acesso', code: 200 } }),
    text: async () => '',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('separarContasDeAnuncio', () => {
  it('aceita a lista separada por vírgula que o painel de Anúncios grava', () => {
    expect(separarContasDeAnuncio('act_111111, 222222,act_111111, lixo')).toEqual(['111111', '222222']);
  });
});

describe('listarMidiasDeAnuncios com várias contas', () => {
  it('lê todas as contas, cada uma com o primeiro token que tiver acesso', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const u = `${url} ${init?.headers?.Authorization || ''}`;
      if (u.includes('act_111111')) return respostaAds(['17900000000000001']);
      if (u.includes('act_222222') && u.includes('token-b')) return respostaAds(['17900000000000002', '17900000000000001']);
      return respostaErro();
    });
    vi.stubGlobal('fetch', fetchMock);

    const midias = await listarMidiasDeAnuncios(['token-a', 'token-b'], 'act_111111,act_222222');
    expect(midias.map((m) => m.id).sort()).toEqual(['17900000000000001', '17900000000000002']);
  });

  it('só lança erro se nenhuma conta puder ser lida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro()));
    await expect(listarMidiasDeAnuncios(['t'], 'act_111111')).rejects.toBeTruthy();
  });
});
