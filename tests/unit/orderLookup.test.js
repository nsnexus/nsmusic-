import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePhoneVariants, isNewSongIntent } from '@/lib/orderLookup';

let store;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  collection: (_db, name) => ({ name }),
  query: (ref, ...constraints) => ({ ref, constraints }),
  where: (field, op, val) => ({ field, op, val }),
  getDocs: async (q) => {
    const whereConstraint = q.constraints.find((c) => c.op === 'in');
    const field = whereConstraint?.field;
    const values = whereConstraint?.val || [];

    const matches = Object.entries(store)
      .filter(([id, data]) => values.includes(data[field]))
      .map(([id, data]) => ({ id, data: () => data }));

    return {
      empty: matches.length === 0,
      forEach: (cb) => matches.forEach(cb),
    };
  },
}));

const { findRecentOrderByPhone } = await import('@/lib/orderLookup');

beforeEach(() => {
  store = {};
});

describe('orderLookup — generatePhoneVariants', () => {
  it('gera variantes completas a partir de número com DDI 55 e 9 dígitos', () => {
    const variants = generatePhoneVariants('5594991064043');
    expect(variants).toContain('5594991064043');
    expect(variants).toContain('94991064043');
    expect(variants).toContain('9491064043');
    expect(variants).toContain('559491064043');
  });

  it('gera variantes a partir de número formatado com parênteses e traço', () => {
    const variants = generatePhoneVariants('(94) 99106-4043');
    expect(variants).toContain('94991064043');
    expect(variants).toContain('5594991064043');
  });

  it('retorna array vazio para entradas inválidas ou curtas', () => {
    expect(generatePhoneVariants('')).toEqual([]);
    expect(generatePhoneVariants('123')).toEqual([]);
    expect(generatePhoneVariants(null)).toEqual([]);
  });
});

describe('orderLookup — isNewSongIntent', () => {
  it('identifica intenção explícita de nova música ou reinício', () => {
    expect(isNewSongIntent('novo pedido')).toBe(true);
    expect(isNewSongIntent('Quero fazer outra música')).toBe(true);
    expect(isNewSongIntent('Criar outra')).toBe(true);
    expect(isNewSongIntent('Reiniciar')).toBe(true);
    expect(isNewSongIntent('#ia')).toBe(true);
    expect(isNewSongIntent('Começar de novo')).toBe(true);
  });

  it('não confunde mensagens de dúvida/suporte com intenção de nova música', () => {
    expect(isNewSongIntent('Oi')).toBe(false);
    expect(isNewSongIntent('Cadê minha música?')).toBe(false);
    expect(isNewSongIntent('Não recebi o áudio')).toBe(false);
    expect(isNewSongIntent('Como faço para baixar?')).toBe(false);
    expect(isNewSongIntent('Olá! Vim pelo site da NSMusic')).toBe(false);
  });
});

describe('orderLookup — findRecentOrderByPhone', () => {
  it('localiza o pedido mais recente do cliente buscando por customerPhone', async () => {
    store['orderOld'] = {
      orderNumber: '1001',
      customerPhone: '94991064043',
      customerName: 'Carlos',
      createdAt: '2026-08-20T10:00:00.000Z',
    };
    store['orderRecent'] = {
      orderNumber: '1002',
      customerPhone: '5594991064043',
      customerName: 'Carlos',
      createdAt: '2026-08-24T15:00:00.000Z',
    };

    const found = await findRecentOrderByPhone('5594991064043');
    expect(found).not.toBeNull();
    expect(found.id).toBe('orderRecent');
    expect(found.orderNumber).toBe('1002');
  });

  it('ignora sessões temporárias de rascunho', async () => {
    store['session_5594991064043'] = {
      productionStatus: 'RASCUNHO',
      customerPhone: '5594991064043',
      createdAt: '2026-08-25T10:00:00.000Z',
    };

    const found = await findRecentOrderByPhone('5594991064043');
    expect(found).toBeNull();
  });
});
