import { NextResponse } from 'next/server';
import { saveTask } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, updateDoc, increment } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// A Kie.ai sinaliza a maioria dos erros com HTTP 200 e um `code` no corpo (429/430 = limite de
// taxa, 455 = manutenção, 500 = erro interno deles) — só olhar response.status não pegava esses
// casos e o retry abaixo nunca rodava para o modo de falha mais comum da API.
const TRANSIENT_KIE_CODES = new Set([429, 430, 455, 500, 501, 503]);
function isTransientKieFailure(status, code) {
  if (status >= 500 || status === 429) return true;
  return code != null && TRANSIENT_KIE_CODES.has(Number(code));
}

// Grava no pedido que a geração falhou, para o admin ver o motivo e reprocessar em lote — sem isso
// o pedido só fica preso em EM_PRODUCAO/LETRA_CRIADA sem nenhum rastro do que aconteceu.
async function recordSunoFailure(orderId, reason) {
  if (!orderId) return;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      sunoError: reason,
      sunoErrorAt: new Date().toISOString(),
      sunoErrorCount: increment(1),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Erro ao registrar falha de geração no pedido:", err);
  }
}

export async function POST(req) {
  try {
    const { prompt, tags, orderId } = await req.json();

    if (!prompt?.trim() || !tags?.trim()) {
      return NextResponse.json({ error: 'Estilo musical e detalhes do homenageado são obrigatórios.' }, { status: 400 });
    }

    // Tenta obter a chave do Cloudflare Edge context primeiro, depois do process.env
    let apiKey = '';
    try {
      const ctx = getRequestContext();
      if (ctx?.env?.KIE_API_KEY) {
        apiKey = String(ctx.env.KIE_API_KEY).trim();
      }
    } catch (e) {}

    if (!apiKey) {
      apiKey = String(process.env.KIE_API_KEY || '').trim();
    }

    if (!apiKey) {
      console.error('[api/suno/generate] Variável de ambiente KIE_API_KEY não configurada.');
      return NextResponse.json({ error: 'Configuração ausente: KIE_API_KEY não definida no servidor.' }, { status: 500 });
    }

    // Garante a URL do webhook no domínio oficial de produção
    const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
    const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;

    // Segredo compartilhado no callback: /api/suno/webhook confere este valor antes de processar
    // (ver A-03 no AUDIT_REPORT.md — o webhook não tinha nenhuma autenticação).
    let webhookSecret = '';
    try {
      const ctx = getRequestContext();
      if (ctx?.env?.KIE_WEBHOOK_SECRET) webhookSecret = String(ctx.env.KIE_WEBHOOK_SECRET).trim();
    } catch (e) {}
    if (!webhookSecret) webhookSecret = String(process.env.KIE_WEBHOOK_SECRET || '').trim();

    const callbackUrl = webhookSecret
      ? `${baseUrl}/api/suno/webhook?secret=${encodeURIComponent(webhookSecret)}`
      : `${baseUrl}/api/suno/webhook`;

    // Até 2 tentativas extras para erros transitórios (timeout, falha de rede, 5xx). Erros
    // definitivos (4xx, ex: payload ou chave inválida) não são reexecutados. Cada tentativa cria
    // seu PRÓPRIO AbortSignal.timeout — reaproveitar o mesmo sinal entre tentativas faria as
    // tentativas seguintes abortarem na hora, já que o relógio do sinal conta a partir da criação.
    const maxKieAttempts = 3;
    let response, data;
    for (let attempt = 1; attempt <= maxKieAttempts; attempt++) {
      try {
        response = await fetch('https://api.kie.ai/api/v1/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            prompt: prompt,
            customMode: true,
            instrumental: false,
            model: "V5",
            style: tags,
            title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`.substring(0, 80),
            callBackUrl: callbackUrl
          }),
          signal: AbortSignal.timeout(15000)
        });

        data = await response.json().catch(() => ({}));

        if (response.ok && (!data.code || data.code === 200)) break;

        // Só erros transitórios valem retry (rate limit, manutenção, 5xx); erro definitivo (ex:
        // payload ou chave inválida) não muda tentando de novo.
        if (!isTransientKieFailure(response.status, data.code)) break;
        console.warn(`[api/suno/generate] Erro transitório da Kie.ai (tentativa ${attempt}/${maxKieAttempts}):`, response.status, data.code);
      } catch (fetchErr) {
        // Timeout (AbortError) ou falha de rede (TypeError): transitório, vale tentar de novo.
        console.warn(`[api/suno/generate] Falha de rede ao chamar Kie.ai (tentativa ${attempt}/${maxKieAttempts}):`, fetchErr.message);
        response = null;
        data = { msg: fetchErr.message };
      }
      if (attempt < maxKieAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }

    // Mensagem ao cliente nunca ecoa o texto bruto do provedor externo (ver .claude/rules/security.md)
    // — o motivo detalhado fica só no log do servidor e no campo sunoError do pedido, para o admin.
    if (!response || !response.ok || (data.code && data.code !== 200)) {
      console.error("Erro no retorno da Kie.ai:", response?.status, data?.code, data?.msg || data?.message);
      await recordSunoFailure(orderId, `kie_${data?.code || response?.status || 'network'}`);
      return NextResponse.json({ error: 'Não foi possível iniciar a geração da música agora. Tente novamente em instantes.' }, { status: 502 });
    }

    // A Kie.ai retorna o taskId no formato data.data.taskId ou fallbacks
    const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.task_id || data?.id;

    if (!taskId) {
      console.error("Kie.ai não retornou um taskId válido:", data);
      await recordSunoFailure(orderId, 'kie_no_taskid');
      return NextResponse.json({ error: 'A geração da música não pôde ser confirmada. Tente novamente em instantes.' }, { status: 502 });
    }

    // Salva o vínculo taskId->orderId e marca o pedido como GERANDO_AUDIO. Envolvido em waitUntil:
    // se o cliente fechar a aba/desconectar bem aqui, o Cloudflare pode cancelar o resto da execução
    // do Worker antes desses awaits terminarem — a Kie.ai já recebeu e vai gerar a música mesmo assim,
    // então sem waitUntil o taskId ficava órfão (sem orderId associado) e o webhook não achava pra
    // onde escrever o resultado. waitUntil garante que a gravação conclui mesmo com a conexão caída.
    const persistPromise = (async () => {
      const saved = await saveTask(taskId, 'PROCESSING', null, orderId);
      if (!saved) {
        await recordSunoFailure(orderId, 'save_task_failed');
        return false;
      }
      if (orderId) {
        try {
          await updateDoc(doc(db, 'orders', orderId), {
            productionStatus: 'GERANDO_AUDIO',
            sunoRequestedAt: new Date().toISOString(),
            sunoError: null,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error("Erro ao atualizar status do pedido para GERANDO_AUDIO:", err);
          await recordSunoFailure(orderId, 'order_update_failed');
          return false;
        }
      }
      return true;
    })();

    try {
      const { ctx } = getRequestContext();
      if (ctx?.waitUntil) ctx.waitUntil(persistPromise.catch(() => {}));
    } catch (e) {}

    const persisted = await persistPromise;
    if (!persisted) {
      // A Kie.ai já aceitou a tarefa (créditos consumidos), mas não conseguimos gravar o vínculo —
      // não é seguro dizer "sucesso" ao cliente, pois o resultado não vai encontrar o pedido depois.
      return NextResponse.json({ error: 'A geração foi iniciada, mas houve uma falha ao registrar o pedido. A equipe será notificada.' }, { status: 502 });
    }

    return NextResponse.json({ taskId, status: 'PROCESSING' });
  } catch (error) {
    console.error("Erro fatal na rota /api/suno/generate:", error);
    return NextResponse.json({ error: 'Erro interno ao iniciar a geração da música.' }, { status: 500 });
  }
}

