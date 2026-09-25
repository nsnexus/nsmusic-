import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { isOurStorage, archiveAudioFiles } from '@/lib/audioArchive';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Arquiva no NOSSO storage (R2, com Firebase Storage de reserva) o áudio dos pedidos.
//
// Motivo original: a Kie.ai apaga os arquivos gerados depois de ~14 dias — está na documentação
// deles ("Cache generated content since files expire after 14 days"), e em 28-29/08/2026 foi pior
// que isso: as URLs pararam de servir muito antes do prazo. Enquanto o áudio mora só lá, o pedido
// vira link quebrado com data marcada, inclusive o link que o cliente já recebeu por WhatsApp.
//
// MEDIDO em 25/09/2026, e é por isso que pedido NÃO PAGO também entra agora: a URL que a Kie.ai
// grava na maioria dos pedidos é `audiostream.kie.ai`, um endpoint de STREAMING que dura poucas
// horas. Depois disso ele responde 200 com CORPO VAZIO — a Kie.ai continua marcando sucesso do lado
// dela, e o player do cliente simplesmente não toca. Três pedidos medidos na mesma varredura:
// 1 hora de vida → 5,6 MB; 5 horas → 0 bytes; 13 horas → 0 bytes e sem fallback vivo.
//
// O cliente ouve a prévia na hora em que gera, pensa até o dia seguinte e volta para pagar — e aí
// encontra uma música muda. A janela entre gerar e pagar é justamente onde a venda acontece, então
// esperar o pagamento para arquivar é esperar demais.
//
// Prévia não paga custa armazenamento (~6 MB por faixa), e é de propósito: é mais barato guardar a
// faixa do que perder a venda. A limpeza periódica (api/cron/cleanup) continua responsável por
// descartar pedido antigo que nunca converteu.
//
// Achado 04/09/2026: desde este commit, o arquivamento também acontece NA HORA da aprovação do
// pagamento (ver src/lib/payments.js) — o cron aqui virou REDE DE SEGURANÇA, não o caminho
// principal. Existe pra pegar pedidos cujo arquivamento imediato falhou (origem instável no
// momento exato do pagamento) e pedidos antigos, de antes dessa mudança. A lógica de cópia em si
// mora em src/lib/audioArchive.js, compartilhada entre os dois caminhos.

// Lote pequeno: cada faixa é uma transferência de vários MB atravessando o Worker, e o Edge Runtime
// tem teto de CPU e de subrequests por requisição.
const MAX_ORDERS_PER_RUN = 5;

function readEnv(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

async function authorize(req, env) {
  const expectedSecret = readEnv(env, 'CLEANUP_SECRET') || readEnv(env, 'RECONCILE_SECRET');
  if (expectedSecret) {
    const provided = req.headers.get('x-cleanup-secret') || req.headers.get('x-reconcile-secret') || '';
    if (provided === expectedSecret) return { ok: true, via: 'secret' };
  }
  const admin = await requireAdmin(req, env);
  if (admin.ok) return { ok: true, via: 'admin' };
  return { ok: false, status: admin.status || 401, error: admin.error || 'Não autorizado.' };
}

function isPaidOrder(order) {
  return Boolean(
    order?.paymentStatus === 'PAGAMENTO_APROVADO' ||
    order?.paymentStatus === 'PAGO' ||
    order?.paidAt
  );
}

// Janela em que a origem da Kie.ai ainda serve o arquivo, medida em 25/09/2026 num pedido de cada
// idade: 0h -> 3,4 MB; 5h -> 0 bytes; 6,7h -> 0 bytes nas duas faixas, e sem cópia em tempfile para
// buscar (404). Fora da janela a tentativa é quase sempre 0 byte, e como o lote é pequeno e roda a
// cada 10 minutos, cada morto tentado rouba a vaga de um pedido que ainda dava para salvar.
//
// Pedido PAGO ignora esta janela: ali vale insistir mesmo com chance baixa.
const HORAS_JANELA_NAO_PAGO = 4;

function dentroDaJanela(order) {
  const criado = order?.createdAt;
  if (!criado) return false;
  const ms = typeof criado === 'string' ? Date.parse(criado) : (criado?.toDate?.()?.getTime?.() ?? NaN);
  if (!Number.isFinite(ms)) return false;
  return (Date.now() - ms) < HORAS_JANELA_NAO_PAGO * 60 * 60 * 1000;
}

async function runArchive(env, { dryRun }) {
  // R2 (binding nsmusic_media) primeiro, Firebase Storage como fallback — mesmo critério de
  // src/lib/payments.js, pra não arquivar num destino diferente dependendo de qual caminho rodou.
  const r2Bucket = env?.nsmusic_media;
  const r2PublicUrl = readEnv(env, 'R2_PUBLIC_URL');
  const firebaseBucket = readEnv(env, 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  const result = { dryRun, scanned: 0, pending: 0, archived: 0, filesCopied: 0, failed: 0, bytesCopied: 0, samples: [] };

  if (!(r2Bucket && r2PublicUrl) && !firebaseBucket) {
    return { ...result, error: 'Nem R2 (nsmusic_media/R2_PUBLIC_URL) nem NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET configurados.' };
  }

  let snap;
  try {
    // orderBy('createdAt','desc') é o que faz esta varredura funcionar.
    //
    // Sem ele (até 21/09/2026) a consulta pegava uma fatia ARBITRÁRIA entre ~600 pedidos com
    // AUDIO_GERADO, e o cron processava sempre os mesmos 5 — todos antigos, com o arquivo já
    // apagado da CDN da Kie.ai. Resultado real observado: 32 pendentes, 0 arquivados, 5 falhas,
    // hora após hora, enquanto pedidos pagos RECENTES (arquivo ainda vivo, dentro da janela de
    // ~14 dias) nunca chegavam a ser tentados e iam morrendo no relógio.
    //
    // Do mais novo para o mais velho: primeiro quem ainda dá para salvar.
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('productionStatus', '==', 'AUDIO_GERADO'),
      orderBy('createdAt', 'desc'),
      limit(MAX_ORDERS_PER_RUN * 20)
    ));
  } catch (err) {
    return { ...result, error: `consulta_falhou: ${err?.code || err?.message}` };
  }

  const candidates = [];
  for (const d of snap.docs) {
    result.scanned++;
    const data = d.data();
    // Pago: sempre. Não pago: só enquanto a origem provavelmente ainda serve o arquivo.
    if (!isPaidOrder(data) && !dentroDaJanela(data)) continue;
    if (data.audioArchivedAt) continue; // já arquivado

    const files = Array.isArray(data.audioFiles) && data.audioFiles.length
      ? data.audioFiles
      : [data.audioUrl].filter(Boolean);

    // Já está tudo no nosso Storage (pedido antigo migrado à mão, por exemplo).
    if (files.length > 0 && files.every(isOurStorage)) continue;
    if (files.length === 0) continue;

    candidates.push({ id: d.id, data, files });
  }

  result.pending = candidates.length;

  if (dryRun) {
    result.samples = candidates.slice(0, 10).map((c) => ({
      id: c.id,
      orderNumber: c.data.orderNumber || null,
      paidAt: c.data.paidAt || null,
      faixas: c.files.length,
    }));
    return result;
  }

  // Pago primeiro: se o lote não couber todo mundo, quem já pagou não pode ficar esperando a vez
  // atrás de prévias que talvez nunca convertam.
  candidates.sort((a, b) => Number(isPaidOrder(b.data)) - Number(isPaidOrder(a.data)));

  for (const c of candidates.slice(0, MAX_ORDERS_PER_RUN)) {
    const { files: archived, anyFailure, filesCopied, bytesCopied } = await archiveAudioFiles(c.id, c.files, { r2Bucket, r2PublicUrl, firebaseBucket });
    result.filesCopied += filesCopied;
    result.bytesCopied += bytesCopied;

    try {
      const updates = {
        audioFiles: archived,
        audioUrl: archived[0],
        updatedAt: new Date().toISOString(),
      };

      if (anyFailure) {
        // Sem audioArchivedAt, o pedido volta na próxima execução para tentar de novo as faixas que
        // falharam — pode ser instabilidade momentânea da CDN de origem.
        updates.audioArchiveFailedAt = new Date().toISOString();
        result.failed++;
      } else {
        updates.audioArchivedAt = new Date().toISOString();
        updates.audioArchiveFailedAt = null;
        result.archived++;
      }

      await updateDoc(doc(db, 'orders', c.id), updates);
    } catch (err) {
      result.failed++;
      console.warn(`[archive-audio] Erro ao gravar URLs arquivadas do pedido ${c.id}:`, err.message);
    }
  }

  return result;
}

// GET = simulação: mostra quantos pedidos pagos ainda dependem da CDN da Kie.ai.
export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await authorize(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(await runArchive(env, { dryRun: true }));
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await authorize(req, env);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true';
    const result = await runArchive(env, { dryRun });

    console.log('[archive-audio] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[archive-audio] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao arquivar os áudios.' }, { status: 500 });
  }
}
