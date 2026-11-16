import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = {};
vi.mock('../../src/lib/supabase-edge.js', () => ({
  getSupabaseEdge: () => ({
    from: () => {
      let chave = null;
      const q = {
        select: () => q,
        eq: (_col, v) => { chave = v; return q; },
        maybeSingle: async () => ({ data: store[chave] ? { valor: store[chave] } : null, error: null }),
        upsert: async (row) => { store[row.chave] = JSON.parse(JSON.stringify(row.valor)); return { data: [row], error: null }; },
      };
      return q;
    },
  }),
}));

const drive = { pastas: [], arquivos: [], legenda: 'Legenda do dia #nsmusic' };
vi.mock('../../src/lib/googleDrive.js', async (original) => {
  const real = await original();
  return {
    ...real,
    listarPasta: vi.fn(async (_conta, _id, opts = {}) => (opts.apenasPastas ? drive.pastas : drive.arquivos)),
    lerTexto: vi.fn(async () => drive.legenda),
  };
});

vi.mock('../../src/lib/instagramAutomacao.js', () => ({
  carregarContexto: vi.fn(async () => ({ token: 'T'.repeat(60), config: { igUserId: '555555' } })),
  garantirContaInstagram: vi.fn(async () => ({ igUserId: '555555', igUsername: '_nsmusic' })),
}));

import {
  montarPostDaPasta,
  devePublicarAgora,
  normalizarHorario,
  agoraEmBrasilia,
  montarLinkDaMidia,
  conferirAssinatura,
  executarPublicacao,
  liberarDia,
  CHAVE_CONFIG,
  CHAVE_ESTADO,
} from '../../src/lib/instagramPublicacao.js';
import { extrairIdDaPasta, lerContaDeServico } from '../../src/lib/googleDrive.js';
import { getSupabaseEdge } from '../../src/lib/supabase-edge.js';

const jpg = (nome, extra = {}) => ({ id: `id_${nome}_0123456789`.replace(/[^A-Za-z0-9_-]/g, '_'), nome, mime: 'image/jpeg', tamanho: 500000, ...extra });
const txt = { id: 'id_legenda_0123456789', nome: 'legenda.txt', mime: 'text/plain', tamanho: 100 };
const CONTA = { client_email: 'robo@projeto.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' };
const ENV = { CRON_SECRET: 'segredo-de-teste' };
// 16/11/2026 12:30 UTC = 09:30 em Brasília.
const AGORA = new Date('2026-11-16T12:30:00Z');

describe('montarPostDaPasta', () => {
  it('uma imagem + legenda: sem problemas', () => {
    const r = montarPostDaPasta([jpg('post.jpg'), txt]);
    expect(r.imagens).toHaveLength(1);
    expect(r.arquivoLegenda.nome).toBe('legenda.txt');
    expect(r.problemas).toEqual([]);
  });

  it('ordena o carrossel pelo nome, com número natural', () => {
    const r = montarPostDaPasta([jpg('10.jpg'), jpg('2.jpg'), jpg('1.jpg'), txt]);
    expect(r.imagens.map((i) => i.nome)).toEqual(['1.jpg', '2.jpg', '10.jpg']);
  });

  it('PNG é problema, não é publicado', () => {
    const r = montarPostDaPasta([{ ...jpg('post.png'), mime: 'image/png' }, txt]);
    expect(r.imagens).toEqual([]);
    expect(r.problemas.join(' ')).toMatch(/JPG/);
  });

  it('acusa falta de legenda, pasta vazia, imagem pesada e carrossel grande demais', () => {
    expect(montarPostDaPasta([jpg('a.jpg')]).problemas.join(' ')).toMatch(/legenda\.txt/);
    expect(montarPostDaPasta([txt]).problemas.join(' ')).toMatch(/Nenhuma imagem/);
    expect(montarPostDaPasta([jpg('a.jpg', { tamanho: 9 * 1024 * 1024 }), txt]).problemas.join(' ')).toMatch(/8 MB/);
    const onze = Array.from({ length: 11 }, (_, i) => jpg(`${i}.jpg`));
    expect(montarPostDaPasta([...onze, txt]).problemas.join(' ')).toMatch(/no máximo 10/);
  });
});

describe('devePublicarAgora', () => {
  const config = { ligada: true, horario: '09:00' };
  it('respeita liga/desliga e horário', () => {
    expect(devePublicarAgora({ config: { ...config, ligada: false }, registro: null, hora: '10:00' }).publicar).toBe(false);
    expect(devePublicarAgora({ config, registro: null, hora: '08:59' }).motivo).toBe('antes_do_horario');
    expect(devePublicarAgora({ config, registro: null, hora: '09:00' }).publicar).toBe(true);
  });
  it('nunca repete dia publicado nem tentativa sem conclusão; para depois de 3 erros', () => {
    expect(devePublicarAgora({ config, registro: { status: 'publicado' }, hora: '10:00' }).motivo).toBe('ja_publicado');
    expect(devePublicarAgora({ config, registro: { status: 'iniciada' }, hora: '10:00' }).motivo).toBe('tentativa_sem_conclusao');
    expect(devePublicarAgora({ config, registro: { status: 'erro', tentativas: 2 }, hora: '10:00' }).publicar).toBe(true);
    expect(devePublicarAgora({ config, registro: { status: 'erro', tentativas: 3 }, hora: '10:00' }).motivo).toBe('tentativas_esgotadas');
  });
});

describe('helpers', () => {
  it('normalizarHorario', () => {
    expect(normalizarHorario('9:05')).toBe('09:05');
    expect(normalizarHorario('24:00')).toBeNull();
    expect(normalizarHorario('abc')).toBeNull();
  });
  it('agoraEmBrasilia usa o fuso de Brasília, inclusive na virada do dia', () => {
    expect(agoraEmBrasilia(AGORA)).toEqual({ data: '2026-11-16', hora: '09:30' });
    expect(agoraEmBrasilia(new Date('2026-11-17T02:10:00Z'))).toEqual({ data: '2026-11-16', hora: '23:10' });
  });
  it('extrairIdDaPasta aceita link e ID', () => {
    expect(extrairIdDaPasta('https://drive.google.com/drive/folders/1AbC_dEf-GhIjKlMnOpQrStUv?usp=sharing')).toBe('1AbC_dEf-GhIjKlMnOpQrStUv');
    expect(extrairIdDaPasta('1AbC_dEf-GhIjKlMnOpQrStUv')).toBe('1AbC_dEf-GhIjKlMnOpQrStUv');
    expect(extrairIdDaPasta('https://exemplo.com/x')).toBe('');
  });
  it('lerContaDeServico só aceita conta de serviço de verdade e guarda só o necessário', () => {
    expect(lerContaDeServico(JSON.stringify({ ...CONTA, project_id: 'x', private_key_id: 'y' }))).toEqual(CONTA);
    expect(lerContaDeServico('{ quebrado')).toBeNull();
    expect(lerContaDeServico({ client_email: 'eu@gmail.com', private_key: CONTA.private_key })).toBeNull();
  });
});

describe('link assinado', () => {
  it('confere, vence e não aceita troca de arquivo', async () => {
    const t0 = Date.parse('2026-11-16T12:00:00Z');
    const link = new URL(await montarLinkDaMidia('arquivo_0123456789', ENV, t0));
    const p = { arquivoId: link.searchParams.get('f'), expira: link.searchParams.get('e'), assinatura: link.searchParams.get('s') };
    expect(link.pathname).toBe('/api/instagram/midia');
    expect(await conferirAssinatura(p, ENV, t0 + 60000)).toBe(true);
    expect(await conferirAssinatura(p, ENV, t0 + 31 * 60000)).toBe(false);
    expect(await conferirAssinatura({ ...p, arquivoId: 'outro_arquivo_0123456789' }, ENV, t0)).toBe(false);
    expect(await conferirAssinatura({ ...p, expira: String(Number(p.expira) + 1) }, ENV, t0)).toBe(false);
    expect(await conferirAssinatura(p, { CRON_SECRET: 'outro' }, t0)).toBe(false);
    expect(await conferirAssinatura(p, {}, t0)).toBe(false);
  });
});

describe('executarPublicacao', () => {
  let chamadas;
  let falharEm;

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    store[CHAVE_CONFIG] = { ligada: true, horario: '09:00', pastaId: 'pasta_raiz_0123456789', contaDeServico: CONTA };
    drive.pastas = [{ id: 'pasta_dia_0123456789', nome: '2026-11-16', mime: 'application/vnd.google-apps.folder' }];
    drive.arquivos = [jpg('post.jpg'), txt];
    drive.legenda = 'Legenda do dia #nsmusic';
    chamadas = [];
    falharEm = null;
    let seq = 1000;
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const u = new URL(url);
      const body = init.body ? Object.fromEntries(init.body) : null;
      chamadas.push({ method: init.method || 'GET', path: u.pathname, body });
      const json = (data, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => data });
      if (falharEm && u.pathname.endsWith(falharEm)) return json({ error: { code: 1, message: 'x' } }, false);
      if (init.method === 'POST') { seq += 1; return json({ id: String(seq * 1000) }); }
      if (u.searchParams.get('fields') === 'status_code') return json({ status_code: 'FINISHED' });
      if (u.searchParams.get('fields') === 'permalink') return json({ permalink: 'https://www.instagram.com/p/abc/' });
      return json({});
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  const posts = () => chamadas.filter((c) => c.method === 'POST');

  it('antes do horário não lê o Drive nem publica', async () => {
    const r = await executarPublicacao({ env: ENV, agora: new Date('2026-11-16T11:00:00Z') });
    expect(r.motivo).toBe('antes_do_horario');
    expect(chamadas).toEqual([]);
  });

  it('publica foto única e a segunda passada não repete', async () => {
    const r = await executarPublicacao({ env: ENV, agora: AGORA });
    expect(r.motivo).toBe('publicado');
    expect(posts().map((c) => c.path)).toEqual(['/v21.0/555555/media', '/v21.0/555555/media_publish']);
    expect(posts()[0].body.caption).toBe('Legenda do dia #nsmusic');
    expect(posts()[0].body.image_url).toMatch(/^https:\/\/nsmusic\.ia\.br\/api\/instagram\/midia\?f=/);
    expect(store[CHAVE_ESTADO].dias['2026-11-16']).toMatchObject({ status: 'publicado', link: 'https://www.instagram.com/p/abc/', imagens: 1 });

    chamadas.length = 0;
    const r2 = await executarPublicacao({ env: ENV, agora: AGORA });
    expect(r2.motivo).toBe('ja_publicado');
    expect(chamadas).toEqual([]);
    expect((await executarPublicacao({ env: ENV, manual: true, agora: AGORA })).motivo).toBe('ja_publicado');
  });

  it('várias imagens viram carrossel, com a legenda só no container final', async () => {
    drive.arquivos = [jpg('2.jpg'), jpg('1.jpg'), txt];
    const r = await executarPublicacao({ env: ENV, agora: AGORA });
    expect(r.motivo).toBe('publicado');
    const p = posts();
    expect(p).toHaveLength(4);
    expect(p[0].body).toMatchObject({ is_carousel_item: 'true' });
    expect(p[0].body.caption).toBeUndefined();
    expect(p[2].body).toMatchObject({ media_type: 'CAROUSEL', caption: 'Legenda do dia #nsmusic' });
    expect(p[2].body.children.split(',')).toHaveLength(2);
    expect(p[3].path).toBe('/v21.0/555555/media_publish');
  });

  it('sem pasta do dia: espera, sem gastar tentativa', async () => {
    drive.pastas = [{ id: 'x_0123456789', nome: '2026-11-17', mime: 'application/vnd.google-apps.folder' }];
    const r = await executarPublicacao({ env: ENV, agora: AGORA });
    expect(r.motivo).toBe('sem_pasta_hoje');
    expect(store[CHAVE_ESTADO]).toBeUndefined();
  });

  it('PNG na pasta: registra erro e não chama a Meta', async () => {
    drive.arquivos = [{ ...jpg('post.png'), mime: 'image/png' }, txt];
    const r = await executarPublicacao({ env: ENV, agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/JPG/);
    expect(chamadas).toEqual([]);
    expect(store[CHAVE_ESTADO].dias['2026-11-16']).toMatchObject({ status: 'erro', tentativas: 1 });
  });

  it('falha ao criar o container é erro repetível; depois de 3, para', async () => {
    falharEm = '/555555/media';
    for (let i = 1; i <= 3; i += 1) {
      const r = await executarPublicacao({ env: ENV, agora: AGORA });
      expect(r.motivo).toBe('erro');
      expect(store[CHAVE_ESTADO].dias['2026-11-16'].tentativas).toBe(i);
    }
    expect((await executarPublicacao({ env: ENV, agora: AGORA })).motivo).toBe('tentativas_esgotadas');
  });

  it('falha NA publicação trava o dia: não repete sozinho, nem pelo botão, até liberar', async () => {
    falharEm = '/media_publish';
    const r = await executarPublicacao({ env: ENV, agora: AGORA });
    expect(r.motivo).toBe('tentativa_sem_conclusao');
    expect(store[CHAVE_ESTADO].dias['2026-11-16'].status).toBe('iniciada');

    falharEm = null;
    chamadas.length = 0;
    expect((await executarPublicacao({ env: ENV, agora: AGORA })).motivo).toBe('tentativa_sem_conclusao');
    expect((await executarPublicacao({ env: ENV, manual: true, agora: AGORA })).motivo).toBe('tentativa_sem_conclusao');
    expect(chamadas).toEqual([]);

    expect(await liberarDia(getSupabaseEdge(), '2026-11-16')).toBe(true);
    expect((await executarPublicacao({ env: ENV, agora: AGORA })).motivo).toBe('publicado');
    expect(await liberarDia(getSupabaseEdge(), '2026-11-16')).toBe(false);
  });

  it('desligada só publica pelo botão', async () => {
    store[CHAVE_CONFIG].ligada = false;
    expect((await executarPublicacao({ env: ENV, agora: AGORA })).motivo).toBe('desligada');
    expect((await executarPublicacao({ env: ENV, manual: true, agora: AGORA })).motivo).toBe('publicado');
  });
});
