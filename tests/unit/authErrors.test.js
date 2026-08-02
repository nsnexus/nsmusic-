import { describe, it, expect } from 'vitest';
import { getFriendlyAuthErrorMessage } from '@/lib/authErrors';

// B-04 no AUDIT_REPORT.md: duplicado literalmente em login/page.jsx e minhas-musicas/page.jsx.

describe('getFriendlyAuthErrorMessage', () => {
  it('traduz credenciais inválidas', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'auth/wrong-password' })).toMatch(/incorretos/);
    expect(getFriendlyAuthErrorMessage({ code: 'auth/user-not-found' })).toMatch(/incorretos/);
  });

  it('traduz e-mail já em uso', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(/já possui uma conta/);
  });

  it('traduz senha fraca e muitas tentativas', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'auth/weak-password' })).toMatch(/fraca/);
    expect(getFriendlyAuthErrorMessage({ code: 'auth/too-many-requests' })).toMatch(/Muitas tentativas/);
  });

  it('cai para err.message em código desconhecido', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'auth/unknown', message: 'algo específico' })).toBe('algo específico');
  });

  it('usa mensagem genérica sem err', () => {
    expect(getFriendlyAuthErrorMessage(undefined)).toMatch(/Não foi possível concluir/);
  });
});
