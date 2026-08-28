import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePhoneVariants, isNewSongIntent, isShortAckMessage } from '@/lib/orderLookup';

let store;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  collection: (_db, name) => ({ name }),
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async (d) => ({
    exists: () => Boolean(store[d.id]),
    id: d.id,
    data: () => store[d.id] || {},
  }),
  limit: (n) => ({ limit: n }),
  query: (ref, ...constraints) => ({ ref, constraints }),
  where: (field, op, val) => ({ field, op, val }),
  getDocs: async (q) => {
    const inConstraint = q.constraints.find((c) => c.op === 'in');
    const eqConstraint = q.constraints.find((c) => c.op === '==');

    let matches = [];
    if (inConstraint) {
      const field = inConstraint.field;
      const values = inConstraint.val || [];
      matches = Object.entries(store)
        .filter(([id, data]) => values.includes(data[field]))
        .map(([id, data]) => ({ id, data: () => data }));
    } else if (eqConstraint) {
      const field = eqConstraint.field;
      const val = eqConstraint.val;
      matches = Object.entries(store)
        .filter(([id, data]) => data[field] === val)
        .map(([id, data]) => ({ id, data: () => data }));
    }

    return {
      empty: matches.length === 0,
      docs: matches,
      forEach: (cb) => matches.forEach(cb),
    };
  },
}));

const { findRecentOrderByPhone, findOrderByIdOrNumber } = await import('@/lib/orderLookup');

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

describe('orderLookup — isShortAckMessage', () => {
  it('identifica confirmações curtas e agradecimentos comuns', () => {
    expect(isShortAckMessage('ok')).toBe(true);
    expect(isShortAckMessage('OK!')).toBe(true);
    expect(isShortAckMessage('beleza')).toBe(true);
    expect(isShortAckMessage('blz')).toBe(true);
    expect(isShortAckMessage('obrigado')).toBe(true);
    expect(isShortAckMessage('obrigada 🙏')).toBe(true);
    expect(isShortAckMessage('valeu')).toBe(true);
    expect(isShortAckMessage('show')).toBe(true);
    expect(isShortAckMessage('tá bom')).toBe(true);
    expect(isShortAckMessage('👍')).toBe(true);
  });

  it('não confunde perguntas ou mensagens complexas com acks', () => {
    expect(isShortAckMessage('Quanto tempo demora?')).toBe(false);
    expect(isShortAckMessage('Quero alterar o nome do homenageado')).toBe(false);
    expect(isShortAckMessage('Onde ouço a prévia?')).toBe(false);
    expect(isShortAckMessage('id=abc12345')).toBe(false);
  });
});

describe('orderLookup — findOrderByIdOrNumber', () => {
  it('localiza por ID de documento direto do Firestore', async () => {
    store['doc12345'] = {
      orderNumber: 'NS-999-2026',
      customerName: 'Maria',
    };

    const found = await findOrderByIdOrNumber('doc12345');
    expect(found).not.toBeNull();
    expect(found.id).toBe('doc12345');
    expect(found.customerName).toBe('Maria');
  });

  it('localiza por orderNumber quando o ID do documento é diferente', async () => {
    store['firestoreRandomKey'] = {
      orderNumber: 'NS-ML1234-5678-2026',
      customerName: 'João',
    };

    const found = await findOrderByIdOrNumber('NS-ML1234-5678-2026');
    expect(found).not.toBeNull();
    expect(found.id).toBe('firestoreRandomKey');
    expect(found.customerName).toBe('João');
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

// Achado 28/08/2026: LID não é telefone, nenhuma variante de DDI/9º dígito faz sentido pra ele — só
// as duas formas que podem estar salvas em whatsappSenderPhone (ver route.js:extractSenderPhone).
describe('generatePhoneVariants — LID', () => {
  it('inclui a forma com e sem sufixo @lid, sem tentar variantes de celular BR', () => {
    const variants = generatePhoneVariants('273005418684627@lid');
    expect(variants).toContain('273005418684627');
    expect(variants).toContain('273005418684627@lid');
    expect(variants).toHaveLength(2);
  });

  it('telefone BR normal continua gerando as variantes de sempre (sem @lid)', () => {
    const variants = generatePhoneVariants('5594991064043');
    expect(variants).toContain('5594991064043');
    expect(variants).not.toContain('5594991064043@lid');
  });
});
