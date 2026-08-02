import { describe, it, expect } from 'vitest';
import {
  resolveDeliveryUrl,
  buildMusicReadyMessage,
  buildPaymentApprovedMessage,
  buildVideoApprovedMessage,
  buildApprovalMessage,
} from '@/lib/whatsappTemplates';

// M-19 no AUDIT_REPORT.md: os templates de WhatsApp eram montados em 3 lugares diferentes com texto
// quase idêntico (src/lib/db.js, api/webhooks/mercadopago, admin/pedidos/[id]/page.jsx). Este é
// agora o único lugar onde o texto existe.

describe('resolveDeliveryUrl', () => {
  it('monta a URL de entrega a partir do orderId', () => {
    expect(resolveDeliveryUrl('abc123')).toMatch(/\/entrega\?orderId=abc123$/);
  });
});

describe('templates de mensagem', () => {
  const args = { customerName: 'Maria', honoreeName: 'Vovó Lúcia', deliveryUrl: 'https://nsmusic.nsnexus.com.br/entrega?orderId=1' };

  it('buildMusicReadyMessage menciona o nome do cliente, do homenageado e o link', () => {
    const msg = buildMusicReadyMessage(args);
    expect(msg).toContain('Maria');
    expect(msg).toContain('Vovó Lúcia');
    expect(msg).toContain(args.deliveryUrl);
  });

  it('buildPaymentApprovedMessage confirma o pagamento', () => {
    const msg = buildPaymentApprovedMessage(args);
    expect(msg).toContain('pagamento foi confirmado');
    expect(msg).toContain('Maria');
  });

  it('buildVideoApprovedMessage é específico do vídeo homenagem', () => {
    const msg = buildVideoApprovedMessage(args);
    expect(msg).toContain('Vídeo Homenagem');
  });

  it('buildApprovalMessage escolhe o template certo conforme isVideo', () => {
    expect(buildApprovalMessage({ ...args, isVideo: true })).toBe(buildVideoApprovedMessage(args));
    expect(buildApprovalMessage({ ...args, isVideo: false })).toBe(buildPaymentApprovedMessage(args));
  });

  it('usa valores padrão quando customerName/honoreeName estão ausentes', () => {
    const msg = buildMusicReadyMessage({ deliveryUrl: args.deliveryUrl });
    expect(msg).toContain('Cliente');
    expect(msg).toContain('alguém especial');
  });
});
