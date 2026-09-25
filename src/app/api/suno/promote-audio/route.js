import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { extractAudioTracks } from '@/lib/db';
import { readEnvValue } from '@/lib/envValue';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Troca a URL EFÊMERA de um pedido pela definitiva, na hora, para UM pedido só.
//
// Por que existe, e por que é pública:
//
// A Kie.ai entrega primeiro um endpoint de streaming (`audiostream.kie.ai`) e só depois o MP3
// final. O polling do cliente para no primeiro sucesso — que é justamente o stream — então a URL
// que fica salva no pedido é a temporária. Medido em 25/09/2026: com 10 minutos ela ainda servia
// 3,84 MB; com 185, 341, 806 e 1070 minutos, respondia 200 com 0 byte. O cliente ouve a prévia ao
// gerar, volta no dia seguinte e encontra uma música muda.
//
// O cron (api/orders/refresh-audio, de 10 em 10 minutos, 25 pedidos por vez) cobre quem fechou a
// aba, mas chega tarde para quem está na tela agora. Esta rota é o outro lado: o cliente continua
// ouvindo o stream imediatamente e a própria página fica pedindo a troca por trás, até a definitiva
// existir. Quando existe, o onSnapshot atualiza o player sozinho.
//
// Sem segredo de propósito: quem abre a página de entrega não tem credencial nenhuma, e é ele quem
// precisa disso. O que a rota faz é limitado e não destrutivo: só age quando a URL salva é efêmera,
// e só grava o que a própria Kie.ai devolve para a tarefa daquele pedido. Não aceita URL do cliente
// (ver .claude/rules/security.md: orderId é alegação, nunca permissão — aqui ele só escolhe QUAL
// pedido reconsultar, e a resposta vem inteira do provedor).

const DOMINIOS_EFEMEROS = ['audiostream.kie.ai', 'musicfile.kie.ai'];

function urlEfemera(u) {
  return typeof u === 'string' && DOMINIOS_EFEMEROS.some((d) => u.includes(d));
}

function precisaTrocar(order) {
  const urls = [order?.audioUrl, ...(Array.isArray(order?.audioFiles) ? order.audioFiles : [])];
  return urls.some(urlEfemera);
}

async function resolverTaskId(order, orderId) {
  if (order?.sunoTaskId) return order.sunoTaskId;
  try {
    const snap = await getDocs(query(collection(db, 'suno_tasks'), where('orderId', '==', orderId), limit(1)));
    if (!snap.empty) return snap.docs[0].id;
  } catch (err) {
    console.warn('[promote-audio] Falha ao buscar taskId:', err.message);
  }
  return '';
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const apiKey = readEnvValue(env, 'KIE_API_KEY');
    if (!apiKey) {
      console.error('[promote-audio] KIE_API_KEY não configurada.');
      return NextResponse.json({ error: 'Configuração ausente no servidor.' }, { status: 500 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const order = snap.data();

    // Já está com URL definitiva (o cron chegou antes, ou o áudio já foi arquivado): nada a fazer.
    if (!precisaTrocar(order)) {
      return NextResponse.json({ ok: true, estado: 'ja_definitiva' });
    }

    const taskId = await resolverTaskId(order, orderId);
    if (!taskId) {
      return NextResponse.json({ ok: false, estado: 'sem_task' });
    }

    const res = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, estado: 'consulta_falhou' });
    }

    const data = await res.json().catch(() => null);
    const tracks = data ? extractAudioTracks(data) : [];
    const definitivas = tracks.filter((t) => t.audio_url && !urlEfemera(t.audio_url));

    // A Kie.ai ainda não terminou o MP3: devolveu o stream de novo. O cliente continua ouvindo o
    // que já está tocando, e a página tenta de novo daqui a pouco.
    if (definitivas.length === 0) {
      return NextResponse.json({ ok: false, estado: 'ainda_processando' });
    }

    const audioFiles = definitivas.map((t) => t.audio_url);
    const audioIds = definitivas.map((t) => t.trackId).filter(Boolean);

    const updates = {
      audioUrl: audioFiles[0],
      audioFiles,
      audioRefreshedAt: new Date().toISOString(),
      audioRefreshFailed: null,
      updatedAt: new Date().toISOString(),
    };
    if (audioIds.length > 0) updates.audioIds = audioIds;
    if (!order.sunoTaskId) updates.sunoTaskId = taskId;

    await updateDoc(orderRef, updates);

    // Devolve as URLs: a tela de geracao (/criar) guarda as faixas em estado local, sem
    // onSnapshot, entao precisa trocar a fonte do player por conta propria.
    return NextResponse.json({ ok: true, estado: 'trocada', audioFiles });
  } catch (error) {
    console.error('[promote-audio] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao atualizar o áudio.' }, { status: 500 });
  }
}
