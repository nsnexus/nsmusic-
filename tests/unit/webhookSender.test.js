import { describe, it, expect } from 'vitest';
import { extractSenderPhone, extractCandidateOrderId } from '@/app/api/whatsapp/webhook/route';

// O agente ficou respondendo a SI MESMO em laço (relatado em 26/09/2026, logo depois da troca para
// a Evolution API). Causa: a Evolution manda no nível raiz do payload um campo `sender` com o
// número da PRÓPRIA instância — o do estúdio —, enquanto o cliente fica em data.key.remoteJid.
// Como `body.sender` era um dos candidatos a remetente, o bot lia o próprio número como se fosse o
// cliente e mandava a resposta para ele mesmo, que voltava como nova mensagem.

const ESTUDIO = '5594991081351';
const CLIENTE = '5511998887777';

describe('extractSenderPhone — payload da Evolution API', () => {
  it('pega o cliente do data.key.remoteJid, nunca o número da instância', () => {
    const body = {
      event: 'messages.upsert',
      instance: 'nsmusic',
      sender: `${ESTUDIO}@s.whatsapp.net`,
      data: {
        key: { remoteJid: `${CLIENTE}@s.whatsapp.net`, fromMe: false, id: 'ABC' },
        message: { conversation: 'cadê minha música?' },
      },
    };

    const phone = extractSenderPhone(body);
    expect(phone).toContain(CLIENTE);
    expect(phone).not.toContain(ESTUDIO);
  });

  it('em grupo, usa o participant', () => {
    const body = {
      sender: `${ESTUDIO}@s.whatsapp.net`,
      data: {
        key: {
          remoteJid: '120363000000000000@g.us',
          participant: `${CLIENTE}@s.whatsapp.net`,
          fromMe: false,
        },
      },
    };
    expect(extractSenderPhone(body)).toContain(CLIENTE);
  });

  it('nunca devolve o número da instância, mesmo que seja o único candidato', () => {
    const body = {
      sender: `${ESTUDIO}@s.whatsapp.net`,
      data: { key: { fromMe: false } },
    };
    expect(extractSenderPhone(body)).not.toContain(ESTUDIO);
  });

  it('formato antigo da W-API continua funcionando', () => {
    const body = { sender: { id: `${CLIENTE}@s.whatsapp.net`, pushName: 'Cliente' } };
    expect(extractSenderPhone(body)).toContain(CLIENTE);
  });
});

describe('extractCandidateOrderId — extração de identificadores de pedido', () => {
  it('identifica orderNumber canônico completo', () => {
    expect(extractCandidateOrderId('NS-MUL83L99-6308-2026')).toBe('NS-MUL83L99-6308-2026');
    expect(extractCandidateOrderId('olá meu pedido é o NS-MUL83L99-6308-2026 obrigado')).toBe('NS-MUL83L99-6308-2026');
  });

  it('identifica bloco de 4 dígitos com prefixo num:', () => {
    expect(extractCandidateOrderId('6308')).toBe('num:6308');
    expect(extractCandidateOrderId('#6308')).toBe('num:6308');
  });

  it('identifica prefixos com id ou pedido', () => {
    expect(extractCandidateOrderId('pedido: 123456')).toBe('123456');
    expect(extractCandidateOrderId('id=w4misqMQd27xN3XVIExj')).toBe('w4misqMQd27xN3XVIExj');
  });
});
