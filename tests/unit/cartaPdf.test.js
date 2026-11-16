import { describe, it, expect } from 'vitest';
import { textoParaPdf, nomeArquivoCarta, gerarCartaPdf } from '@/lib/cartaPdf';

describe('cartaPdf', () => {
  it('mantém acentos e remove emoji', () => {
    expect(textoParaPdf('Coração ❤️ de mãe 🎶 — “sempre”…')).toBe('Coração  de mãe  - "sempre"...');
  });
  it('nome do arquivo sem acento', () => {
    expect(nomeArquivoCarta('Júlia Goulart')).toBe('carta-para-julia-goulart.pdf');
    expect(nomeArquivoCarta('')).toBe('carta.pdf');
  });
  it('gera um PDF de verdade, com várias páginas se o texto for longo', async () => {
    const blob = await gerarCartaPdf({ texto: 'Linha de carinho.\n'.repeat(120), honoree: 'Ana', remetente: 'João', url: 'https://nsmusic.ia.br/c/x' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const inicio = new TextDecoder().decode(bytes.slice(0, 5));
    expect(inicio).toBe('%PDF-');
    const conteudo = new TextDecoder('latin1').decode(bytes);
    expect((conteudo.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
  });
});
