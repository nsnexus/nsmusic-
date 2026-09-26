import { describe, it, expect } from 'vitest';
import { extractSenderPhone } from '@/app/api/whatsapp/webhook/route';

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
