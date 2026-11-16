import { describe, it, expect } from 'vitest';
import { montarPaginaDownload, idDePedidoValido } from '../../src/lib/paginaDownload.js';

describe('idDePedidoValido', () => {
  it('aceita IDs normais e recusa o que poderia injetar HTML', () => {
    expect(idDePedidoValido('aB3_x-9Zk2')).toBe(true);
    expect(idDePedidoValido('"><script>')).toBe(false);
    expect(idDePedidoValido('')).toBe(false);
  });
});

describe('montarPaginaDownload', () => {
  it('mostra player e botão de baixar de cada versão, com a versão tocada primeiro', () => {
    const html = montarPaginaDownload({ orderId: 'abc12345', faixa: 1, totalFaixas: 2, homenageado: 'Ana' });
    expect(html).toContain('/api/audio/proxy?orderId=abc12345&faixa=0&download=NS-Music-Versao-1.mp3');
    expect(html).toContain('/api/audio/proxy?orderId=abc12345&faixa=1&download=NS-Music-Versao-2.mp3');
    expect(html.indexOf('Versão 2</h2>')).toBeLessThan(html.indexOf('Versão 1</h2>'));
    expect(html).toContain('/entrega?orderId=abc12345');
  });

  it('sem áudio, não mostra botão de baixar e aponta para a página do pedido', () => {
    const html = montarPaginaDownload({ orderId: 'abc12345', totalFaixas: 0 });
    expect(html).not.toContain('download=NS-Music');
    expect(html).toContain('/entrega?orderId=abc12345');
  });

  it('escapa o nome do homenageado', () => {
    const html = montarPaginaDownload({ orderId: 'abc12345', totalFaixas: 1, homenageado: '<img src=x>' });
    expect(html).not.toContain('<img src=x>');
  });
});
