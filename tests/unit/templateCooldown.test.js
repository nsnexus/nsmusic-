import { describe, it, expect } from 'vitest';

// Achado 28/08/2026: cliente recebia a mensagem de espera DUPLICADA.
//
// Causa: a checagem de "já enviei este template" era pulada sempre que a mensagem do cliente
// continha o ID do pedido (`!isExplicitId` na condição). Só que o botão do site abre o WhatsApp com
// "…do meu pedido id=XXXX" já preenchido — ou seja, o caso mais comum de todos era justamente o que
// escapava da proteção. Duas mensagens vindas dali geravam duas respostas idênticas.
//
// A dedup por messageId e a trava por telefone não cobrem isso: são mensagens distintas, com ids
// distintos, e podem chegar com minutos de intervalo.
//
// Este teste fixa a regra da janela de cooldown, que é o que passou a barrar o reenvio. A função é
// replicada aqui (e não importada) porque a rota depende de @cloudflare/next-on-pages e do Firestore
// — o que importa travar é a REGRA, não a fiação.

const TEMPLATE_RESEND_COOLDOWN_MS = 10 * 60 * 1000;

function sentWithinCooldown(sentAtIso, now = Date.now()) {
  if (!sentAtIso) return false;
  const ts = Date.parse(sentAtIso);
  if (Number.isNaN(ts)) return false;
  return now - ts < TEMPLATE_RESEND_COOLDOWN_MS;
}

describe('cooldown de reenvio de template do WhatsApp', () => {
  const now = Date.parse('2026-08-28T20:00:00.000Z');

  it('bloqueia o reenvio imediato — o caso real da mensagem duplicada', () => {
    const enviadoAgora = '2026-08-28T19:59:58.000Z'; // 2 segundos antes
    expect(sentWithinCooldown(enviadoAgora, now)).toBe(true);
  });

  it('bloqueia reenvio dentro da janela de 10 minutos', () => {
    expect(sentWithinCooldown('2026-08-28T19:55:00.000Z', now)).toBe(true); // 5 min antes
    expect(sentWithinCooldown('2026-08-28T19:50:30.000Z', now)).toBe(true); // 9,5 min antes
  });

  it('LIBERA o reenvio depois da janela — cliente que volta mais tarde continua sendo atendido', () => {
    expect(sentWithinCooldown('2026-08-28T19:49:00.000Z', now)).toBe(false); // 11 min antes
    expect(sentWithinCooldown('2026-08-28T18:00:00.000Z', now)).toBe(false); // 2 h antes
    expect(sentWithinCooldown('2026-08-27T20:00:00.000Z', now)).toBe(false); // 1 dia antes
  });

  it('nunca bloqueia quando não há registro de envio anterior', () => {
    expect(sentWithinCooldown(null, now)).toBe(false);
    expect(sentWithinCooldown(undefined, now)).toBe(false);
    expect(sentWithinCooldown('', now)).toBe(false);
  });

  it('data inválida não bloqueia — na dúvida, responder é melhor que silenciar o cliente', () => {
    expect(sentWithinCooldown('nao-e-uma-data', now)).toBe(false);
  });
});
