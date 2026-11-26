import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { findOrdersByPhone } from '@/lib/orderLookup';
import { transcribeAudioWithFailover } from '@/lib/transcribeAudio';
import {
  responderChat, saudacao, acaoPago, acaoAjustePago, acaoNovaVersao, orderIdValido,
  acaoMusicaNovaPronta, dadosDoCliente, reescreverLetra, listaDePedidos, transcricaoValida, gruposDoNumero, contextoDoPedido,
} from '@/lib/suporteChat';
import { extrairDadosDaHistoria } from '@/lib/suporteNovaMusica';
import { registrarConversa, historicoDoCliente } from '@/lib/suporteHistorico';
import { responderComIA } from '@/lib/atendenteIA';
import { DOMINIO_CANONICO } from '@/lib/siteUrl';

export const runtime = 'edge';

// Chat de suporte do site (/suporte). A página manda uma ação por vez e recebe mensagens prontas
// para desenhar. Toda decisão (preço, pagamento, liberação) acontece no servidor — ver
// src/lib/suporteChat.js e src/lib/ajustePago.js.

const ACOES = new Set([
  'identificar', 'inicio', 'opcao', 'texto', 'audio', 'comprovante', 'pago', 'ajuste_pago', 'nova_versao',
  // Música nova pelo chat (roteiro em src/lib/novaMusicaChat.js):
  'nova_extrair', 'nova_ajustar_letra', 'transcrever', 'nova_dados', 'musica_pronta',
  // Histórico para a aba Atendimentos do painel (src/lib/suporteHistorico.js):
  'registrar',
  // Atendente com IA (src/lib/atendenteIA.js):
  'ia',
]);
const MAX_AUDIO_BASE64 = 3 * 1024 * 1024;

function lerAmbiente() {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) { /* fora do runtime da Cloudflare (dev/testes) */ }
  return { env };
}

// O que a página está esperando (só para escolher a resposta; não libera nada).
function lerAguardando(a) {
  if (!a || typeof a !== 'object') return null;
  const tipo = ['pagamento', 'musica', 'musica_nova'].includes(a.tipo) ? a.tipo : null;
  if (!tipo) return null;
  return { tipo, kind: a.kind === 'ajuste' ? 'ajuste' : 'pedido' };
}

const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req) {
  const { env } = lerAmbiente();
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
      const pedidos = await findOrdersByPhone(digitos, env, 20);
      const grupos = gruposDoNumero(pedidos);
      const pedido = grupos[0]?.principal;
      if (grupos.length > 1) {
        const lista = listaDePedidos(pedidos);
        return json({ ok: true, mensagens: [lista], escolherPedido: lista.opcoes });
      }
      return json({ ok: true, orderId: pedido.id, mensagens: saudacao(pedido, await contextoDoPedido(pedido, env)) });
    }

    if (acao === 'ia') {
      const orderIdIA = orderIdValido(String(body.orderId || '')) ? String(body.orderId) : '';
      const pedido = orderIdIA ? await getOrder(orderIdIA, env) : null;
      const texto = String(body.texto || '').trim().slice(0, 1500);
      if (!texto) return json({ error: 'Mensagem vazia.' }, 400);
      const historico = (Array.isArray(body.historico) ? body.historico : []).slice(-20)
        .map((m) => ({ de: m?.de === 'eu' ? 'eu' : 'bot', texto: String(m?.texto || '').slice(0, 600) }))
        .filter((m) => m.texto);
      const urlAtual = typeof body.urlAtual === 'string' && body.urlAtual.startsWith(`${DOMINIO_CANONICO}/suporte`) ? body.urlAtual.slice(0, 300) : '';
      const aguardando = lerAguardando(body.aguardando);
      const pedidoValido = pedido && !pedido.deletedAt ? pedido : null;
      const telefoneIA = String(body.telefone || '').replace(/\D/g, '').slice(0, 13);
      // Conversas anteriores do mesmo WhatsApp: a IA continua de onde o cliente parou.
      const historicoAnterior = await historicoDoCliente(
        pedidoValido?.customerPhone || telefoneIA,
        { excetoConversa: typeof body.conversaId === 'string' ? body.conversaId.slice(0, 40) : '' },
        env
      );
      const r = await responderComIA({
        pedido: pedidoValido,
        telefone: telefoneIA,
        historico, historicoAnterior, aguardando, mensagem: texto,
        dispositivo: ['android', 'ios'].includes(body.dispositivo) ? body.dispositivo : '',
        dentroDeApp: body.dentroDeApp === true,
        urlAtual,
      }, env);
      if (r.falhou) {
        // IA desligada ou fora do ar: segue o atendimento por regras de antes.
        if (pedido && !pedido.deletedAt) {
          const rr = await responderChat(pedido, { acao: 'texto', texto, modo: null, aguardando }, env);
          return json({ ok: true, orderId: pedido.id, ...rr });
        }
        return json({ ok: true, fallback: true });
      }
      return json({ ok: true, ...r, orderId: r.orderId || orderIdIA || undefined });
    }

    if (acao === 'registrar') {
      const orderIdLog = orderIdValido(String(body.orderId || '')) ? String(body.orderId) : '';
      const r = await registrarConversa({ conversaId: body.conversaId, orderId: orderIdLog, mensagens: body.mensagens, marcas: body.marcas, telefone: String(body.telefone || '').replace(/\D/g, '').slice(0, 13) }, env);
      return json({ ok: r.ok });
    }

    // Sem pedido: cliente novo criando música pelo chat.
    if (acao === 'nova_extrair') {
      const texto = String(body.texto || '').slice(0, 3000);
      return json({ ok: true, extraidos: await extrairDadosDaHistoria(texto, env) });
    }
    if (acao === 'nova_ajustar_letra') {
      const letra = String(body.letra || '');
      const instrucao = String(body.instrucao || '').trim();
      if (letra.length < 40 || letra.length > 8000 || !instrucao) return json({ error: 'Faltou dizer o que mudar na letra.' }, 400);
      const nova = await reescreverLetra(letra, instrucao, String(body.homenageado || '').slice(0, 60), env);
      if (nova.length < 40) return json({ error: 'Não consegui ajustar a letra agora. Tenta escrever de outro jeito.' }, 502);
      return json({ ok: true, letra: nova });
    }
    if (acao === 'transcrever') {
      const base64 = String(body.audio?.base64 || '');
      if (!base64 || base64.length > MAX_AUDIO_BASE64) return json({ error: 'Áudio muito longo. Grave até 1 minuto.' }, 400);
      const mimeType = String(body.audio?.mimeType || 'audio/webm').slice(0, 60);
      const texto = String(await transcribeAudioWithFailover({ type: 'base64', value: base64, mimeType }, env) || '').trim();
      return json({ ok: true, texto: transcricaoValida(texto) ? texto : '' });
    }

    const orderId = String(body.orderId || '');
    if (!orderIdValido(orderId)) return json({ error: 'Pedido inválido.' }, 400);

    if (acao === 'musica_pronta') return json({ ok: true, orderId, ...(await acaoMusicaNovaPronta(orderId, env)) });

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

    if (acao === 'nova_dados') return json({ ok: true, orderId, cliente: dadosDoCliente(pedido) });

    if (acao === 'audio') {
      const base64 = String(body.audio?.base64 || '');
      const mimeType = String(body.audio?.mimeType || 'audio/webm').slice(0, 60);
      if (!base64 || base64.length > MAX_AUDIO_BASE64) return json({ error: 'Áudio muito longo. Grave até 1 minuto.' }, 400);
      const transcrito = String(await transcribeAudioWithFailover({ type: 'base64', value: base64, mimeType }, env) || '').trim();
      if (!transcricaoValida(transcrito)) {
        return json({ ok: true, orderId, mensagens: [{ tipo: 'texto', texto: 'Não consegui ouvir direito o seu áudio. 😕 Pode escrever pra mim?' }], modo: body.modo || null });
      }
      const r = await responderChat(pedido, { acao: 'texto', texto: transcrito, modo: body.modo, aguardando: lerAguardando(body.aguardando) }, env);
      return json({ ok: true, orderId, transcricao: transcrito, ...r });
    }

    const entrada = {
      acao,
      opcao: typeof body.opcao === 'string' ? body.opcao.slice(0, 60) : undefined,
      texto: typeof body.texto === 'string' ? body.texto.slice(0, 1000) : undefined,
      modo: ['letra', 'ritmo'].includes(body.modo) ? body.modo : null,
      aguardando: lerAguardando(body.aguardando),
      escolhido: body.escolhido === true,
      listar: body.listar === true,
    };
    const r = await responderChat(pedido, entrada, env);
    return json({ ok: true, orderId, ...r });
  } catch (err) {
    console.warn('[suporte/chat] Falha ao responder:', err?.message);
    return json({ error: 'Tive um probleminha aqui. Tenta de novo em instantes.' }, 500);
  }
}
