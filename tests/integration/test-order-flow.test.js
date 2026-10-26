import { describe, it, expect } from 'vitest';
import fs from 'fs';

// Carregar variáveis de .env.local
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { createOrder, getOrder, updateOrder, softDeleteOrder } from '@/lib/supabaseDb';
import { generateUniqueOrderNumber } from '@/lib/orderNumber';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';
import { sanitizeOrderForResponse } from '@/app/api/orders/[id]/route';

describe('Fluxo Completo de Criação e Validação de Pedido (Teste Real)', () => {
  it('cria, busca, sanitiza, atualiza e limpa pedido com sucesso no Supabase', async () => {
    // 1. Gerar número de pedido único
    const orderNumber = await generateUniqueOrderNumber();
    expect(orderNumber).toMatch(/^NS-/);
    console.log('1. Número de pedido gerado:', orderNumber);

    // 2. Criar pedido de teste no Supabase
    const testPayload = {
      orderNumber,
      customerName: 'Teste de Validação Antigravity',
      customerPhone: '11999990001',
      customerEmail: 'teste-qa@nsmusic.com.br',
      honoreeName: 'Pessoa Homenageada Teste',
      relationship: 'Amigo(a)',
      occasion: 'Aniversário',
      story: 'Esta é uma história de teste automatizado para validar a persistência e segurança do fluxo de pedidos.',
      musicStyle: 'MPB Acústico',
      musicMood: 'Emocionante',
      voiceType: 'feminina',
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      productionStatus: 'LETRA_CRIADA',
      lyrics: '[Verso 1]\nEsta é uma letra de teste\n[Refrão]\nValidando toda a plataforma',
      audioUrl: 'https://audiostream.kie.ai/stream/test-audio-uuid-1234.mp3',
      audioFiles: ['https://audiostream.kie.ai/stream/test-audio-uuid-1234.mp3'],
      extras: {
        rawSunoPayload: { secret: 'should-be-stripped' },
        webhookLogs: [{ step: 'init' }]
      }
    };

    const created = await createOrder(testPayload);
    expect(created.id).toBeDefined();
    expect(created.orderNumber).toBe(orderNumber);
    console.log('2. Pedido criado no Supabase com ID:', created.id);

    try {
      // 3. Buscar pelo banco diretamente
      const fetched = await getOrder(created.id);
      expect(fetched).toBeDefined();
      expect(fetched.customerName).toBe('Teste de Validação Antigravity');
      console.log('3. Pedido recuperado do Supabase com sucesso.');

      // 4. Buscar via orderLookup (por id e por orderNumber)
      const byId = await findOrderByIdOrNumber(created.id);
      const byNum = await findOrderByIdOrNumber(created.orderNumber);
      expect(byId).toBeDefined();
      expect(byNum).toBeDefined();
      expect(byId.id).toBe(created.id);
      expect(byNum.id).toBe(created.id);
      console.log('4. findOrderByIdOrNumber validado com sucesso.');

      // 5. Testar sanitização de pedido não pago (Task 4 / S03)
      const sanitizedUnpaid = sanitizeOrderForResponse(fetched);
      expect(sanitizedUnpaid.audioUrl).toContain('/api/audio/proxy');
      expect(sanitizedUnpaid.audioFiles[0]).toContain('/api/audio/proxy');
      expect(sanitizedUnpaid.extras?.rawSunoPayload).toBeUndefined();
      expect(sanitizedUnpaid.extras?.webhookLogs).toBeUndefined();
      console.log('5. Sanitização de áudio para pedido não pago (S03) verificada com sucesso.');

      // 6. Testar sanitização de pedido após pagamento aprovado
      const sanitizedPaid = sanitizeOrderForResponse({
        ...fetched,
        paymentStatus: 'PAGO'
      });
      expect(sanitizedPaid.audioUrl).toBe(fetched.audioUrl);
      console.log('6. Pedido pago mantém URL original para download direto verificado.');

      // 7. Atualizar status e dados do pedido
      const updateRes = await updateOrder(created.id, {
        productionStatus: 'AUDIO_GERADO',
        testValidated: true
      });
      expect(updateRes.success).toBe(true);

      const updated = await getOrder(created.id);
      expect(updated.productionStatus).toBe('AUDIO_GERADO');
      console.log('7. Atualização do pedido no Supabase verificada.');
    } finally {
      // 8. Limpar pedido de teste via soft delete
      await softDeleteOrder(created.id);
      const afterDelete = await getOrder(created.id);
      expect(afterDelete.deletedAt).toBeDefined();
      console.log('8. Pedido de teste excluído logicamente (softDelete) com sucesso.');
    }
  }, 20000);
});
