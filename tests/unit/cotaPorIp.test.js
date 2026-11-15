import { describe, it, expect } from 'vitest';
import { calcularCotaPorIp, normalizarIp, obterIpDoCliente, COTA_IP_INICIAL } from '@/lib/cotaPorIp';
import { isContactBlocked } from '@/lib/blocklist';

describe('cotaPorIp', () => {
  it('bloqueia ao atingir a cota inicial sem pagamentos', () => {
    const pedidos = Array.from({ length: COTA_IP_INICIAL }, () => ({ paymentStatus: 'AGUARDANDO_PAGAMENTO' }));
    expect(calcularCotaPorIp(pedidos.slice(0, COTA_IP_INICIAL - 1)).bloqueado).toBe(false);
    expect(calcularCotaPorIp(pedidos).bloqueado).toBe(true);
  });

  it('cada compra paga do mesmo IP soma 5 à cota', () => {
    const pedidos = [
      ...Array.from({ length: COTA_IP_INICIAL }, () => ({ paymentStatus: 'AGUARDANDO_PAGAMENTO' })),
      { paymentStatus: 'PAGAMENTO_APROVADO' },
    ];
    const r = calcularCotaPorIp(pedidos);
    expect(r.cota).toBe(COTA_IP_INICIAL + 5);
    expect(r.bloqueado).toBe(false);
  });

  it('normaliza IPs e descarta lixo', () => {
    expect(normalizarIp(' 200.10.20.30 ')).toBe('200.10.20.30');
    expect(normalizarIp('2804:14d:1::1')).toBe('2804:14d:1::1');
    expect(normalizarIp("1.2.3.4'; drop")).toBe('');
    expect(normalizarIp('')).toBe('');
  });

  it('lê o IP de cf-connecting-ip antes de x-forwarded-for', () => {
    const req = { headers: new Headers({ 'x-forwarded-for': '9.9.9.9', 'cf-connecting-ip': '200.1.1.1' }) };
    expect(obterIpDoCliente(req)).toBe('200.1.1.1');
  });
});

describe('blocklist por IP', () => {
  it('sem Supabase configurado não bloqueia ninguém', async () => {
    const r = await isContactBlocked('11999999999', 'a@b.com', {}, '200.1.1.1');
    expect(r.blocked).toBe(false);
  });
});
