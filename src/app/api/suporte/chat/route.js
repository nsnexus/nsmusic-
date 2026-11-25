import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { findOrdersByPhone } from '@/lib/orderLookup';
import { transcribeAudioWithFailover } from '@/lib/transcribeAudio';
import {
  responderChat, saudacao, acaoPago, acaoAjustePago, acaoNovaVersao, orderIdValido,
} from '@/lib/suporteChat';

export const runtime = 'edge';

// Chat de suporte do site (/suporte). A página manda uma ação por vez e recebe mensagens prontas
// para desenhar. Toda decisão (preço, pagamento, liberação) acontece no servidor — ver
// src/lib/suporteChat.js e src/lib/ajustePago.js.

const ACOES = new Set(['identificar', 'inicio', 'opcao', 'texto', 'audio', 'comprovante', 'pago', 'ajuste_pago', 'nova_versao']);
const MAX_AUDIO_BASE64 = 3 * 1024 * 1024;

function lerAmbiente() {
  let env = {};
  let emSegundoPlano = (p) => p;
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
    if (ctx?.ctx?.waitUntil) emSegundoPlano = (p) => ctx.ctx.waitUntil(p);
  } catch (e) { /* fora do runtime da Cloudflare (dev/testes) */ }
  return { env, emSegundoPlano };
}

const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req) {
  const { env, emSegundoPlano } = lerAmbiente();
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requisição inválida.' }, 400);
  }
  const acao = String(body?.acao || '');
  if (!ACOES.has(acao)) return json({ error: 'Ação inválida.' }, 400);

  try {
    if (acao === 'identificar') {
      const digitos = String(body.telefone || '').replace(/\D/g, '');
      if (digitos.length < 10 || digitos.length > 13) return json({ error: 'Digite o WhatsApp com DDD, só números.' }, 400);
      const pedidos = await findOrdersByPhone(digitos, env, 10);
      const pedido = pedidos.find((p) => p.paymentStatus === 'PAGAMENTO_APROVADO' || p.paymentStatus === 'PAGO') || pedidos[0];
      if (!pedido) {
        return json({
          ok: true,
          mensagens: [
            { tipo: 'texto', texto: 'Não encontrei nenhum pedido com esse número. 😕 Confere se é o mesmo WhatsApp que você usou no site. Se quiser, fala com uma pessoa da equipe:', opcoes: [{ id: 'humano_sem_pedido', label: 'Falar com atendente' }] },
          ],
        });
      }
      return json({ ok: true, orderId: pedido.id, mensagens: saudacao(pedido) });
    }

    const orderId = String(body.orderId || '');
    if (!orderIdValido(orderId)) return json({ error: 'Pedido inválido.' }, 400);

    if (acao === 'pago') return json({ ok: true, orderId, ...(await acaoPago(orderId, env)) });
    if (acao === 'ajuste_pago') {
      const txid = String(body.txid || '');
      if (!/^[A-Za-z0-9]{26,35}$/.test(txid)) return json({ error: 'Cobrança inválida.' }, 400);
      return json({ ok: true, orderId, ...(await acaoAjustePago(orderId, txid, env)) });
    }
    if (acao === 'nova_versao') {
      return json({ ok: true, orderId, ...(await acaoNovaVersao(orderId, String(body.assinatura || '').slice(0, 20), env)) });
    }

    const pedido = await getOrder(orderId, env);
    if (!pedido || pedido.deletedAt) return json({ error: 'Pedido não encontrado.' }, 404);

    if (acao === 'audio') {
      const base64 = String(body.audio?.base64 || '');
      const mimeType = String(body.audio?.mimeType || 'audio/webm').slice(0, 60);
      if (!base64 || base64.length > MAX_AUDIO_BASE64) return json({ error: 'Áudio muito longo. Grave até 1 minuto.' }, 400);
      const transcrito = String(await transcribeAudioWithFailover({ type: 'base64', value: base64, mimeType }, env) || '').trim();
      if (!transcrito) {
        return json({ ok: true, orderId, mensagens: [{ tipo: 'texto', texto: 'Não consegui ouvir direito o seu áudio. 😕 Pode escrever pra mim?' }], modo: body.modo || null });
      }
      const r = await responderChat(pedido, { acao: 'texto', texto: transcrito, modo: body.modo }, env, { emSegundoPlano });
      return json({ ok: true, orderId, transcricao: transcrito, ...r });
    }

    const entrada = {
      acao,
      opcao: typeof body.opcao === 'string' ? body.opcao.slice(0, 60) : undefined,
      texto: typeof body.texto === 'string' ? body.texto.slice(0, 1000) : undefined,
      modo: ['letra', 'ritmo'].includes(body.modo) ? body.modo : null,
    };
    const r = await responderChat(pedido, entrada, env, { emSegundoPlano });
    return json({ ok: true, orderId, ...r });
  } catch (err) {
    console.warn('[suporte/chat] Falha ao responder:', err?.message);
    return json({ error: 'Tive um probleminha aqui. Tenta de novo em instantes.' }, 500);
  }
}
