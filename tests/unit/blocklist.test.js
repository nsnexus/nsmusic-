import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockFirestoreDocData = null;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => null }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _coll, id) => ({ id }),
  getDoc: async () => ({
    exists: () => mockFirestoreDocData !== null,
    data: () => mockFirestoreDocData,
  }),
  setDoc: async (_ref, data) => {
    mockFirestoreDocData = data;
    return {};
  },
}));

const {
  normalizarTelefoneParaBloqueio,
  obterVariacoesTelefone,
  normalizarEmailParaBloqueio,
  gerarIdBloqueio,
  isContactBlocked,
  addBlockContact,
  removeBlockContact,
  getBlocklist,
} = await import('@/lib/blocklist');

beforeEach(() => {
  mockFirestoreDocData = null;
});

describe('blocklist', () => {
  describe('normalizações e variações', () => {
    it('normaliza telefones com máscaras e caracteres especiais', () => {
      expect(normalizarTelefoneParaBloqueio('(98) 98457-8421')).toBe('98984578421');
      expect(normalizarTelefoneParaBloqueio('+55 98 98457-8421')).toBe('5598984578421');
      expect(normalizarTelefoneParaBloqueio('')).toBe('');
      expect(normalizarTelefoneParaBloqueio(null)).toBe('');
    });

    it('gera variações coerentes com e sem 55', () => {
      const vars1 = obterVariacoesTelefone('(98) 98457-8421');
      expect(vars1).toContain('98984578421');
      expect(vars1).toContain('5598984578421');

      const vars2 = obterVariacoesTelefone('+5598984578421');
      expect(vars2).toContain('5598984578421');
      expect(vars2).toContain('98984578421');
    });

    it('normaliza emails limpando espaços e caixa alta', () => {
      expect(normalizarEmailParaBloqueio('  Teste@Exemplo.Com  ')).toBe('teste@exemplo.com');
      expect(normalizarEmailParaBloqueio('')).toBe('');
    });

    it('gera IDs consistentes', () => {
      expect(gerarIdBloqueio('phone', '(98) 98457-8421')).toBe('phone_98984578421');
      expect(gerarIdBloqueio('email', 'User@Domain.com')).toBe('email_user@domain.com');
    });
  });

  describe('isContactBlocked e manipulação', () => {
    it('retorna blocked: false quando a lista está vazia', async () => {
      const res = await isContactBlocked('98984578421', 'teste@exemplo.com');
      expect(res.blocked).toBe(false);
    });

    it('adiciona bloqueio por telefone e detecta', async () => {
      await addBlockContact({
        phone: '(98) 98457-8421',
        name: 'Werley',
        reason: 'Gerou 9+ músicas sem pagar',
        blockedBy: 'admin@nsmusic.com',
      });

      const list = await getBlocklist();
      expect(list.length).toBe(1);
      expect(list[0].value).toBe('98984578421');

      // Teste com o mesmo número formatado
      const checagemFormatada = await isContactBlocked('(98) 98457-8421', '');
      expect(checagemFormatada.blocked).toBe(true);
      expect(checagemFormatada.reason).toBe('Gerou 9+ músicas sem pagar');

      // Teste com +55 na frente
      const checagemCom55 = await isContactBlocked('+5598984578421', '');
      expect(checagemCom55.blocked).toBe(true);

      // Outro número não deve ser bloqueado
      const checagemOutro = await isContactBlocked('11999999999', '');
      expect(checagemOutro.blocked).toBe(false);
    });

    it('adiciona bloqueio por e-mail e detecta', async () => {
      await addBlockContact({
        email: 'Abusador@Email.com',
        reason: 'Spam de geração',
      });

      const res = await isContactBlocked('', '  abusador@email.com ');
      expect(res.blocked).toBe(true);

      const resOutro = await isContactBlocked('', 'outro@email.com');
      expect(resOutro.blocked).toBe(false);
    });

    it('remove bloqueio com sucesso', async () => {
      await addBlockContact({ phone: '98984578421' });
      expect((await isContactBlocked('98984578421')).blocked).toBe(true);

      await removeBlockContact('phone_98984578421');
      expect((await isContactBlocked('98984578421')).blocked).toBe(false);
    });
  });
});
