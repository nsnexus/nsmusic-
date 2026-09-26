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
// Só pedido PAGO é arquivado: prévia não convertida é a maior parte do volume e não justifica o
// custo de armazenamento (~6 MB por faixa). Quem pagou tem direito a voltar e baixar meses depois.
//
// A prévia NÃO paga é protegida por outro caminho, sem custo de storage: api/orders/refresh-audio
// troca a URL efêmera da Kie.ai pela URL definitiva do arquivo, que dura os ~14 dias documentados.
// A efêmera é `audiostream.kie.ai`, endpoint de STREAMING do preview — medido em 25/09/2026, ele
// serve 3,4 MB num pedido de 0h e 0 byte num de 6,7h, enquanto a Kie.ai segue marcando sucesso do
// lado dela. Era essa troca que faltava (e não o arquivamento da prévia) para a música parar de
// tocar na geração e sumir no dia seguinte.
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

async function runArchive(env, { dryRun, incluirNaoPagos = false }) {
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

    const files = Array.isArray(data.audioFiles) && data.audioFiles.length
      ? data.audioFiles
      : [data.audioUrl].filter(Boolean);

    if (files.length === 0) continue;
    // Já está tudo no nosso Storage: nada a fazer.
    if (files.every(isOurStorage)) continue;

    // O pedido aponta para uma origem que morre (audiostream/musicfile da Kie.ai).
    const temUrlEfemera = files.some((u) => typeof u === 'string' && (u.includes('audiostream.kie.ai') || u.includes('musicfile.kie.ai')));

    // `audioArchivedAt` preenchido NÃO significa mais "resolvido": entre 20:12 e 22:01 de
    // 25/09/2026, updateTaskResult regravava a URL da Kie.ai por cima da nossa a cada ciclo do
    // polling, e o pedido terminava marcado como arquivado apontando para um stream que morre em
    // horas. Quem está nesse estado precisa ser copiado de novo.
    if (data.audioArchivedAt && !temUrlEfemera) continue;

    // Pedido não pago entra só quando pedido explicitamente (?incluirNaoPagos=true): é o resgate
    // dos que ficaram com áudio prestes a expirar, não o comportamento de rotina.
    if (!isPaidOrder(data) && !incluirNaoPagos) continue;

    candidates.push({ id: d.id, data, files });
  }

  // Pago primeiro: produto já entregue não espera atrás de prévia que talvez nunca converta.
  candidates.sort((a, b) => Number(isPaidOrder(b.data)) - Number(isPaidOrder(a.data)));

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

    const params = new URL(req.url).searchParams;
    const dryRun = params.get('dryRun') === 'true';
    const incluirNaoPagos = params.get('incluirNaoPagos') === 'true';
    const result = await runArchive(env, { dryRun, incluirNaoPagos });

    console.log('[archive-audio] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[archive-audio] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao arquivar os áudios.' }, { status: 500 });
  }
}
