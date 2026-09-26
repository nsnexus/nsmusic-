import { describe, it, expect } from 'vitest';
import { temAnexoDeComprovante } from '@/app/api/whatsapp/webhook/route';

// O cliente diz que pagou e manda o print do banco. Até 26/09/2026 a imagem sem legenda caía em
// 'empty_content' e a mensagem era ignorada EM SILÊNCIO — pior porque o próprio bot tinha acabado
// de pedir o comprovante. O anexo agora é tratado como o aviso de pagamento que ele é, e quem
// decide se o pagamento existe continua sendo a Efí, consultada na hora.

describe('temAnexoDeComprovante', () => {
  it('reconhece imagem no formato Evolution', () => {
    expect(temAnexoDeComprovante({
      data: { message: { imageMessage: { mimetype: 'image/jpeg' } } },
    })).toBe(true);
  });

  it('reconhece PDF (documentMessage)', () => {
    expect(temAnexoDeComprovante({
      data: { message: { documentMessage: { mimetype: 'application/pdf', fileName: 'comprovante.pdf' } } },
    })).toBe(true);
  });

  it('reconhece documento com legenda', () => {
    expect(temAnexoDeComprovante({
      data: { message: { documentWithCaptionMessage: {} } },
    })).toBe(true);
  });

  it('reconhece pelo messageType', () => {
    expect(temAnexoDeComprovante({ messageType: 'imageMessage' })).toBe(true);
    expect(temAnexoDeComprovante({ data: { messageType: 'documentMessage' } })).toBe(true);
  });

  it('reconhece pelo mimetype solto', () => {
    expect(temAnexoDeComprovante({ mimetype: 'image/png' })).toBe(true);
    expect(temAnexoDeComprovante({ mimetype: 'application/pdf' })).toBe(true);
  });

  it('mensagem de texto comum NÃO é anexo', () => {
    expect(temAnexoDeComprovante({
      data: { message: { conversation: 'oi, tudo bem?' } },
    })).toBe(false);
  });

  it('áudio não é tratado como comprovante — tem transcrição própria', () => {
    expect(temAnexoDeComprovante({
      data: { message: { audioMessage: { mimetype: 'audio/ogg' } } },
    })).toBe(false);
  });

  it('payload vazio não quebra', () => {
    expect(temAnexoDeComprovante({})).toBe(false);
    expect(temAnexoDeComprovante(null)).toBe(false);
  });
});
