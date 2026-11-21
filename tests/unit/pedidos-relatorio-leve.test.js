import { describe, expect, it } from 'vitest';
import { mapearPedidoRelatorio, remontarExtras, CAMPOS_EXTRAS_RELATORIO, COLUNAS_LEVES_RELATORIO, colunasLeves } from '../../src/lib/pedidosRelatorio.js';

const extrasCompleto = {
  videoAddonPaid: true, videoPaidAt: '2026-11-17T12:00:00Z', videoPaidAmount: 6.9, videoPaymentId: 'efi_v',
  cartaAddonPaid: false, paidAmount: 16.9, paymentIntentSku: 'combo', isSecondGeneration: false, origem: null,
  trafficSource: 'facebook_ads', utmSource: 'fb', fbclid: 'abc', readyTemplateSent: true, whatsappSent: true,
  // campos pesados que os relatórios não usam:
  lyrics: 'x'.repeat(5000), story: 'y'.repeat(3000), sunoTracks: [{ audioUrl: 'a' }],
};
const base = {
  id: 'p1', order_number: 'NS-1', customer_phone: '11999', payment_status: 'PAGO', paid_at: '2026-11-17T11:00:00Z',
  created_at: '2026-11-17T10:00:00Z', has_video_access: true, has_carta_access: false, has_playback_access: false,
  has_retrospectiva_access: false, has_karaoke_access: false, suno_generation_count: 1, suno_requested_at: null,
  suno_provider: 'kie', ready_template_sent: null, payment_whatsapp_sent: null, whatsapp_sent: null,
  production_status: 'AUDIO_GERADO', audio_url: 'a.mp3',
};

describe('consulta leve dos relatórios', () => {
  it('mesmo pedido, mesmo resultado (com extras inteiro ou só os campos usados)', () => {
    const completo = mapearPedidoRelatorio({ ...base, extras: extrasCompleto });
    const leve = { ...base };
    for (const k of CAMPOS_EXTRAS_RELATORIO) if (k in extrasCompleto) leve[`x_${k}`] = extrasCompleto[k];
    // null e ausente são equivalentes nas contas (o banco devolve null para chave que não existe)
    const semNulos = (o) => JSON.parse(JSON.stringify(o, (_k, v) => (v === null ? undefined : v)));
    expect(semNulos(mapearPedidoRelatorio(remontarExtras(leve)))).toEqual(semNulos(completo));
  });

  it('não pede o extras inteiro ao banco', () => {
    expect(COLUNAS_LEVES_RELATORIO.split(',')).not.toContain('extras');
    expect(COLUNAS_LEVES_RELATORIO).toContain('x_videoPaidAt:extras->videoPaidAt');
    expect(colunasLeves('id, extras, created_at')).toMatch(/^id,created_at,x_/);
  });

  it('todo campo do extras lido pelo mapeamento está na lista', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../src/lib/pedidosRelatorio.js', import.meta.url), 'utf8');
    const usados = new Set([...src.matchAll(/extras\.([A-Za-z_]+)/g)].map((m) => m[1]));
    for (const k of usados) expect(CAMPOS_EXTRAS_RELATORIO).toContain(k);
  });
});

import { calcularMetricasPorPlataforma } from '../../src/lib/trafficSource.js';

describe('custo do WhatsApp com recuperação (marketing)', () => {
  it('lê a marcação da recuperação do extras', () => {
    const o = mapearPedidoRelatorio({ id: 'a', created_at: '2026-11-21T15:00:00Z', payment_status: 'AGUARDANDO_PAGAMENTO', extras: { abandoned_pix_recovery_sent: true } });
    expect(o.recuperacaoWhatsappSent).toBe(true);
    const leve = mapearPedidoRelatorio(remontarExtras({ id: 'b', created_at: '2026-11-21T15:00:00Z', x_abandoned_pix_recovery_sent: true }));
    expect(leve.recuperacaoWhatsappSent).toBe(true);
  });
});

describe('gasto de WhatsApp no Dashboard', () => {
  it('recuperação entra a R$ 0,30 e a música pronta a R$ 0,035', () => {
    const pedidos = [
      { id: 'a', createdAt: '2026-11-21T15:00:00Z', readyTemplateSent: true, recuperacaoWhatsappSent: true },
      { id: 'b', createdAt: '2026-11-21T16:00:00Z', readyTemplateSent: true },
    ];
    const { totais } = calcularMetricasPorPlataforma(pedidos);
    expect(totais.mensagensWhatsApp).toBe(3);
    expect(totais.gastoWhatsApp).toBeCloseTo(0.37, 2);
  });
});
