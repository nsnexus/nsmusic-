import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let linhas = [];
let consultas = [];
vi.mock('../../src/lib/supabase-edge.js', () => ({
  getSupabaseEdge: () => ({
    from: () => {
      const filtros = {};
      const q = {
        select: () => q,
        is: () => q,
        order: () => q,
        ilike: (col, v) => { filtros.ilike = v; return q; },
        filter: (col, op, v) => { filtros.ip = v; return q; },
        limit: async () => {
          consultas.push({ ...filtros });
          if (filtros.ip) return { data: linhas.filter((l) => l.ip === filtros.ip), error: null };
          const fim = filtros.ilike.replace('*', '');
          return { data: linhas.filter((l) => String(l.customer_phone).endsWith(fim)), error: null };
        },
      };
      return q;
    },
  }),
}));

let blocklist = [];
vi.mock('../../src/lib/blocklist.js', async (original) => ({ ...(await original()), getBlocklist: vi.fn(async () => blocklist) }));

import { mesmoTelefone, ipPublico, agruparPorIp, buscarPessoaPorTelefone } from '../../src/lib/buscaPorTelefone.js';

const pedido = (phone, ip, created_at, extra = {}) => ({
  order_number: `NS${created_at}`, customer_name: 'Fulana', customer_phone: phone, payment_status: 'AGUARDANDO_PAGAMENTO', created_at, ip, ...extra,
});

describe('funções puras', () => {
  it('mesmoTelefone ignora máscara, 55 e o nono dígito', () => {
    expect(mesmoTelefone('(94) 99999-1234', '5594999991234')).toBe(true);
    expect(mesmoTelefone('94 9999-1234', '94999991234')).toBe(true);
    expect(mesmoTelefone('94999991234', '94999995678')).toBe(false);
    expect(mesmoTelefone('1234', '1234')).toBe(false);
  });

  it('ipPublico recusa rede interna, CGNAT e lixo', () => {
    expect(ipPublico('200.10.20.30')).toBe(true);
    expect(ipPublico('2804:14c:1234::1')).toBe(true);
    for (const ip of ['10.0.0.1', '192.168.1.1', '172.16.0.1', '127.0.0.1', '100.64.0.1', '::1', 'fe80::1', '999.1.1.1', 'abc', '']) {
      expect(ipPublico(ip)).toBe(false);
    }
  });

  it('agruparPorIp ordena pelo mais usado e guarda o último uso', () => {
    const r = agruparPorIp([
      { ip: '1.1.1.1', createdAt: '2026-11-01' },
      { ip: '2.2.2.2', createdAt: '2026-11-05' },
      { ip: '2.2.2.2', createdAt: '2026-11-03' },
      { ip: '', createdAt: '2026-11-06' },
    ]);
    expect(r).toEqual([
      { ip: '2.2.2.2', pedidos: 2, ultimoUso: '2026-11-05' },
      { ip: '1.1.1.1', pedidos: 1, ultimoUso: '2026-11-01' },
    ]);
  });
});

describe('buscarPessoaPorTelefone', () => {
  beforeEach(() => {
    consultas = [];
    blocklist = [];
    linhas = [
      pedido('(94) 99999-1234', '200.10.20.30', '2026-11-15T10:00:00Z'),
      pedido('5594999991234', '200.10.20.30', '2026-11-14T10:00:00Z', { payment_status: 'PAGAMENTO_APROVADO' }),
      pedido('94999991234', null, '2026-11-10T10:00:00Z'),
      pedido('11988881234', '200.10.20.30', '2026-11-12T10:00:00Z', { customer_name: 'Outra' }),
      pedido('21977775555', '200.10.20.30', '2026-11-11T10:00:00Z', { customer_name: 'Mais uma' }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      expect(String(url)).toContain('ipwho.is/200.10.20.30');
      return { ok: true, json: async () => ({ success: true, city: 'Parauapebas', region: 'Pará', country: 'Brasil', connection: { isp: 'Provedor X' } }) };
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('acha a pessoa em qualquer formato de telefone e não mistura com outro número de mesmo final', async () => {
    const r = await buscarPessoaPorTelefone('94 99999-1234');
    expect(r.encontrado).toBe(true);
    expect(r.pessoa).toMatchObject({ telefone: '94999991234', pedidos: 3, pagos: 1, semIp: 1, bloqueado: false, nomes: ['Fulana'] });
    expect(consultas[0].ilike).toBe('*1234');
    expect(r.ips).toEqual([{
      ip: '200.10.20.30', pedidos: 2, ultimoUso: '2026-11-15T10:00:00Z', bloqueado: false, outrosTelefones: 2,
      local: { cidade: 'Parauapebas', estado: 'Pará', pais: 'Brasil', provedor: 'Provedor X' },
    }]);
  });

  it('marca telefone e IP já bloqueados', async () => {
    blocklist = [
      { id: 'phone_5594999991234', type: 'phone', value: '5594999991234' },
      { id: 'ip_200.10.20.30', type: 'ip', value: '200.10.20.30' },
    ];
    const r = await buscarPessoaPorTelefone('94999991234');
    expect(r.pessoa.bloqueado).toBe(true);
    expect(r.ips[0].bloqueado).toBe(true);
  });

  it('geolocalização fora do ar não derruba a busca', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    const r = await buscarPessoaPorTelefone('94999991234');
    expect(r.ips[0].local).toBeNull();
    expect(r.ips[0].outrosTelefones).toBe(2);
  });

  it('telefone curto é recusado e telefone sem pedido volta vazio', async () => {
    expect(await buscarPessoaPorTelefone('1234')).toEqual({ ok: false, motivo: 'telefone_invalido' });
    expect(await buscarPessoaPorTelefone('94911110000')).toEqual({ ok: true, encontrado: false });
  });
});
