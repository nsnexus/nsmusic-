import { describe, it, expect, vi, beforeEach } from 'vitest';

// M-02 no AUDIT_REPORT.md: orderNumber tinha só 5 dígitos aleatórios (90.000 combinações) sem
// checagem de unicidade, e o ano "2026" era um literal fixo no código.

let callCount;
let collisionsBeforeSuccess;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  collection: () => ({}),
  where: () => ({}),
  query: () => ({}),
  limit: () => ({}),
  getDocs: async () => {
    callCount++;
    const isCollision = callCount <= collisionsBeforeSuccess;
    return { empty: !isCollision };
  },
  addDoc: async () => ({ id: 'mock-doc-id' }),
}));

const { generateUniqueOrderNumber } = await import('@/app/api/orders/create/route');

beforeEach(() => {
  callCount = 0;
  collisionsBeforeSuccess = 0;
});

describe('generateUniqueOrderNumber', () => {
  it('gera um número no formato NS-<tempo>-<aleatório>-<ano real>', async () => {
    const orderNumber = await generateUniqueOrderNumber();
    const year = new Date().getFullYear();
    expect(orderNumber).toMatch(new RegExp(`^NS-[A-Z0-9]+-\\d{4}-${year}$`));
  });

  it('aceita de primeira quando não há colisão', async () => {
    await generateUniqueOrderNumber();
    expect(callCount).toBe(1);
  });

  it('tenta de novo até achar um número único quando há colisão', async () => {
    collisionsBeforeSuccess = 2;
    const orderNumber = await generateUniqueOrderNumber();
    expect(callCount).toBe(3);
    expect(orderNumber).toBeTruthy();
  });

  it('usa o fallback de alta entropia se todas as tentativas colidirem', async () => {
    collisionsBeforeSuccess = 999; // sempre colide dentro do loop de tentativas
    const orderNumber = await generateUniqueOrderNumber();
    expect(orderNumber).toMatch(/^NS-\d+-\d+-\d{4}$/);
  });
});
