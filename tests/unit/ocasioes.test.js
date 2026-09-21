import { describe, it, expect } from 'vitest';
import { ocasioes, getOcasiao } from '@/lib/ocasioes';
import { occasions } from '../../src/app/criar/wizardOptions';

// As páginas de ocasião existem para serem lidas por buscador e assistente. Um slug duplicado, uma
// FAQ vazia ou um `ocasiaoWizard` que não existe no formulário quebram exatamente isso — e sem
// teste ninguém percebe, porque a página continua renderizando bonita.
describe('páginas de ocasião', () => {
  it('todo slug é único e em formato de URL', () => {
    const slugs = ocasioes.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('a ocasião pré-selecionada existe no catálogo do wizard', () => {
    const ids = new Set(occasions.map((o) => o.id));
    for (const ocasiao of ocasioes) {
      // Se falhar aqui, o link /criar?ocasiao=... cai num valor que o passo 3 ignora e o cliente
      // tem que escolher de novo a ocasião que ele já escolheu ao clicar.
      expect(ids.has(ocasiao.ocasiaoWizard)).toBe(true);
    }
  });

  it('todo campo que vira metadado está preenchido', () => {
    for (const ocasiao of ocasioes) {
      expect(ocasiao.titulo.length).toBeGreaterThan(10);
      expect(ocasiao.h1.length).toBeGreaterThan(20);
      // Descrição muito longa é cortada pelo Google; muito curta não diz nada.
      expect(ocasiao.descricao.length).toBeGreaterThan(80);
      expect(ocasiao.descricao.length).toBeLessThan(320);
      expect(ocasiao.palavrasChave.length).toBeGreaterThanOrEqual(3);
      expect(ocasiao.intro.length).toBeGreaterThanOrEqual(2);
      expect(ocasiao.bullets.length).toBeGreaterThanOrEqual(3);
      expect(ocasiao.estilos.length).toBeGreaterThanOrEqual(3);
      expect(ocasiao.climaSugerido).toBeTruthy();
    }
  });

  it('cada FAQ tem pergunta e resposta de verdade', () => {
    for (const ocasiao of ocasioes) {
      expect(ocasiao.faq.length).toBeGreaterThanOrEqual(3);
      for (const [pergunta, resposta] of ocasiao.faq) {
        expect(pergunta.length).toBeGreaterThan(10);
        expect(resposta.length).toBeGreaterThan(40);
      }
    }
  });

  it('getOcasiao acha por slug e devolve null para slug desconhecido', () => {
    expect(getOcasiao('musica-de-aniversario')?.ocasiaoWizard).toBe('Aniversário');
    expect(getOcasiao('nao-existe')).toBeNull();
  });
});
