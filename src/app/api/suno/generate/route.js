import { NextResponse } from 'next/server';
import { saveTask } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

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

        // Só erros transitórios (5xx, 429) valem retry; 4xx definitivo não muda tentando de novo.
        if (response.status < 500 && response.status !== 429) break;
        console.warn(`[api/suno/generate] Erro transitório da Kie.ai (tentativa ${attempt}/${maxKieAttempts}):`, response.status, data);
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

    if (!response || !response.ok || (data.code && data.code !== 200)) {
      console.error("Erro no retorno da Kie.ai:", response?.status, data);
      const errMsg = data?.msg || data?.message || `Status HTTP ${response?.status || 'desconhecido'}`;
      return NextResponse.json({ error: `Falha ao solicitar geração na Kie.ai: ${errMsg}` }, { status: 502 });
    }

    // A Kie.ai retorna o taskId no formato data.data.taskId ou fallbacks
    const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.task_id || data?.id;

    if (!taskId) {
      console.error("Kie.ai não retornou um taskId válido:", data);
      return NextResponse.json({ error: "API da Kie.ai respondeu sem um ID de tarefa (taskId) válido." }, { status: 502 });
    }

    // Salva o task inicial como PROCESSING no Firebase Firestore
    await saveTask(taskId, 'PROCESSING', null, orderId);

    if (orderId) {
      try {
        await updateDoc(doc(db, 'orders', orderId), {
          productionStatus: 'GERANDO_AUDIO',
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Erro ao atualizar status do pedido para GERANDO_AUDIO:", err);
      }
    }

    return NextResponse.json({ taskId, status: 'PROCESSING' });
  } catch (error) {
    console.error("Erro fatal na rota /api/suno/generate:", error);
    return NextResponse.json({ error: error.message || 'Erro interno de servidor' }, { status: 500 });
  }
}

