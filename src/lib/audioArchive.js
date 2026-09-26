// Arquiva no NOSSO storage o áudio de um pedido PAGO — extraído de
// src/app/api/orders/archive-audio/route.js (04/09/2026) pra ser chamado direto na aprovação do
// pagamento (src/lib/payments.js), não só pelo cron horário do workers/efi-proxy.
//
// Motivo original (continua valendo pro cron, que fica como rede de segurança): a Kie.ai apaga os
// arquivos gerados depois de ~14 dias — está na documentação deles ("files expire after 14 days") —
// e em 28-29/08/2026 ficou pior que isso: as URLs pararam de servir bem antes do prazo. Enquanto o
// áudio mora só lá, todo pedido pago vira um link quebrado com data marcada, e o Vídeo Homenagem
// (que busca o áudio de novo a cada renderização, ver src/lib/videoGenerator.js) fica refém da
// mesma instabilidade.
//
// Achado 04/09/2026: o cron nunca arquivou nada em produção (0 de 43 pedidos pagos recentes tinham
// audioArchivedAt) — provável dessincronia entre o secret configurado no Worker e no app, ou o
// cron trigger não estar na versão realmente publicada do Worker. Em vez de só depender de
// descobrir e consertar isso, o pedido agora arquiva o próprio áudio na hora que o pagamento é
// aprovado — mesmo padrão de efeito colateral isolado já usado pro playback/carta.
//
// 07/09/2026: destino trocado de Firebase Storage pra Cloudflare R2 (binding `nsmusic_media` no
// projeto Pages) — egress do Firebase/GCS custa ~US$0,12/GB, R2 é US$0 de egress, e esse arquivo é
// exatamente o caminho que mais serve bytes repetidos (prévia, download, Vídeo Homenagem buscando
// de novo a cada render). Fallback pro Firebase Storage é mantido só pra ambiente sem o binding
// (ex: antes do primeiro deploy com o binding configurado) — nunca falha por falta de R2.

const MIN_AUDIO_BYTES = 100 * 1024;      // 100 KB — abaixo disso não é música de verdade
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB — teto de segurança

export function isOurStorage(url) {
  return typeof url === 'string' && (
    url.includes('firebasestorage.googleapis.com') ||
    url.includes('.r2.dev') ||
    url.includes('/audios/') // custom domain futuro do R2 também cai aqui pelo path que usamos
  );
}

// Monta as origens a tentar, em ordem, a partir da URL gravada no pedido.
//
// ACHADO 21/09/2026, investigando "archived: 0, failed: 5" hora após hora: os pedidos recentes
// guardam o áudio como `audiostream.kie.ai/stream/<uuid>.mp3`, um endpoint de STREAMING que
// responde **HTTP 200 com corpo VAZIO** para quem baixa direto (medido: 0 bytes). O arquivador
// então achava que a origem era pequena demais e desistia — enquanto a MESMA faixa estava
// inteira em `tempfile.aiquickdraw.com/r/<uuid>.mp3` (medido: 7,4 MB em 2 segundos).
//
// O /api/audio/proxy já fazia essa derivação e por isso os players funcionavam; só o arquivamento
// não sabia, e era justamente ele que precisava salvar o arquivo antes de a Kie.ai apagá-lo.
export function origensParaArquivar(sourceUrl) {
  const url = String(sourceUrl || '').trim();
  if (!url) return [];

  const candidatos = [];
  const uuid = (url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i) || [])[1];

  // musicfile.kie.ai guarda o UUID em base64 no path (ver o comentário equivalente no proxy).
  let uuidDeBase64 = '';
  if (!uuid && url.includes('musicfile.kie.ai')) {
    try {
      const path = new URL(url).pathname.replace(/^\/+/, '').replace(/\.[a-z0-9]+$/i, '');
      const decodificado = atob(path);
      if (/^[a-f0-9-]{36}$/i.test(decodificado)) uuidDeBase64 = decodificado;
    } catch (e) { /* path que não é base64: segue sem derivar */ }
  }

  const id = uuid || uuidDeBase64;
  if (id) {
    // Arquivo direto primeiro. O stream fica por último porque costuma vir vazio.
    candidatos.push(`https://tempfile.aiquickdraw.com/r/${id}.mp3`);
    candidatos.push(`https://file.aiquickdraw.com/r/${id}.mp3`);
  }
  candidatos.push(url);

  return [...new Set(candidatos)];
}

async function fetchSourceAudio(sourceUrl) {
  // Tenta cada origem derivada; só desiste quando todas falharem. Devolve o motivo da ÚLTIMA
  // tentativa, que é o que aparece no log para investigação.
  const origens = origensParaArquivar(sourceUrl);
  let ultimoMotivo = 'sem_origem';
  for (const origem of origens) {
    const tentativa = await fetchUmaOrigem(origem);
    if (tentativa.ok) return tentativa;
    ultimoMotivo = `${tentativa.reason} (${origens.length} origens tentadas)`;
  }
  return { ok: false, reason: ultimoMotivo };
}

async function fetchUmaOrigem(sourceUrl) {
  let res;
  try {
    res = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'audio/mpeg, audio/*, */*' },
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    return { ok: false, reason: `origem_inacessivel: ${err?.message || 'erro desconhecido'}` };
  }

  if (!res.ok) return { ok: false, reason: `origem_http_${res.status}` };

  const contentType = res.headers.get('content-type') || '';
  // A CDN já devolveu HTML/XML de erro com status 200 (incidente 28/08/2026) — sem esta checagem,
  // arquivaríamos uma página de erro achando que era a música.
  if (contentType.includes('text/') || contentType.includes('xml')) {
    return { ok: false, reason: `origem_nao_audio_${contentType.split(';')[0]}` };
  }

  let buffer;
  try {
    buffer = await res.arrayBuffer();
  } catch (err) {
    // Mesmo achado do /api/audio/proxy (04/09/2026): conexão cortada no meio devolve arquivo
    // truncado sem erro nenhum se só olharmos o primeiro chunk — arrayBuffer() rejeita em vez de
    // devolver parcial, então um erro aqui já É a proteção.
    return { ok: false, reason: `conexao_cortada: ${err?.message || 'erro desconhecido'}` };
  }

  if (buffer.byteLength < MIN_AUDIO_BYTES) return { ok: false, reason: `origem_muito_pequena_${buffer.byteLength}b` };
  if (buffer.byteLength > MAX_AUDIO_BYTES) return { ok: false, reason: `origem_muito_grande_${buffer.byteLength}b` };

  return { ok: true, buffer };
}

/**
 * Copia uma URL externa (Kie.ai/Suno) pro bucket R2 (binding `env.nsmusic_media`) e devolve a URL
 * pública (R2_PUBLIC_URL + destPath). `.put()` do binding R2 aceita ArrayBuffer direto — sem base64,
 * sem REST API, sem timeout manual de upload (roda no mesmo Worker, não é uma chamada HTTP externa).
 */
export async function copyAudioToR2(sourceUrl, destPath, r2Bucket, publicBaseUrl) {
  const fetched = await fetchSourceAudio(sourceUrl);
  if (!fetched.ok) return fetched;

  try {
    await r2Bucket.put(destPath, fetched.buffer, { httpMetadata: { contentType: 'audio/mpeg' } });
  } catch (err) {
    return { ok: false, reason: `r2_put_falhou: ${err?.message || 'erro desconhecido'}` };
  }

  const publicUrl = `${publicBaseUrl.replace(/\/$/, '')}/${destPath}`;
  return { ok: true, url: publicUrl, bytes: fetched.buffer.byteLength };
}

/**
 * Fallback: copia pro Firebase Storage via REST API (usado só quando o binding R2 não está
 * disponível no ambiente). Body repassado como ArrayBuffer porque o upload precisa do tamanho
 * conhecido; SDK `firebase/storage` não tem build `lite` e quebraria o build Edge se importado aqui.
 */
export async function copyAudioToStorage(sourceUrl, destPath, bucket) {
  const fetched = await fetchSourceAudio(sourceUrl);
  if (!fetched.ok) return fetched;
  const buffer = fetched.buffer;

  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(destPath)}`;
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/mpeg' },
    body: buffer,
    signal: AbortSignal.timeout(60000),
  });

  if (!upload.ok) {
    const detail = await upload.text().catch(() => '');
    return { ok: false, reason: `upload_http_${upload.status}`, detail: detail.slice(0, 200) };
  }

  const meta = await upload.json().catch(() => null);
  const token = meta?.downloadTokens;
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(destPath)}?alt=media${token ? `&token=${token}` : ''}`;
  return { ok: true, url: publicUrl, bytes: buffer.byteLength };
}

/**
 * Arquiva TODAS as faixas de um pedido (audioFiles, ou audioUrl como única faixa) e devolve o novo
 * array pronto pra gravar em orders/{id}.audioFiles/audioUrl. Faixa já no nosso storage é
 * preservada como está — não recopia. Faixa que falhar mantém a URL antiga (a origem ainda pode
 * estar de pé; melhor um link que talvez funcione do que nenhum).
 *
 * Prefere R2 (`opts.r2Bucket` = binding `env.nsmusic_media`, `opts.r2PublicUrl` = env R2_PUBLIC_URL);
 * cai pro Firebase Storage (`opts.firebaseBucket`) só se o binding R2 não estiver disponível nesse
 * ambiente — nunca deixa de arquivar por falta de um dos dois.
 *
 * @param {string} orderId
 * @param {string[]} files URLs atuais das faixas (Kie.ai/Suno ou já nossas)
 * @param {{r2Bucket?: object, r2PublicUrl?: string, firebaseBucket?: string}} opts
 * @returns {Promise<{files: string[], anyFailure: boolean, filesCopied: number, bytesCopied: number, destino: string}>}
 */
export async function archiveAudioFiles(orderId, files, opts = {}) {
  const { r2Bucket, r2PublicUrl, firebaseBucket } = opts;
  const usaR2 = Boolean(r2Bucket && r2PublicUrl);
  const archived = [];
  let anyFailure = false;
  let filesCopied = 0;
  let bytesCopied = 0;

  for (let i = 0; i < files.length; i++) {
    const source = files[i];
    if (isOurStorage(source)) {
      archived.push(source);
      continue;
    }

    const destPath = `audios/${orderId}/versao-${i + 1}.mp3`;
    const copy = usaR2
      ? await copyAudioToR2(source, destPath, r2Bucket, r2PublicUrl)
      : firebaseBucket
        ? await copyAudioToStorage(source, destPath, firebaseBucket)
        : { ok: false, reason: 'sem_destino_configurado' };

    if (copy.ok) {
      archived.push(copy.url);
      filesCopied++;
      bytesCopied += copy.bytes;
    } else {
      anyFailure = true;
      console.warn(`[audioArchive] Falha ao arquivar faixa ${i + 1} do pedido ${orderId}: ${copy.reason}`);
      archived.push(source);
    }
  }

  return { files: archived, anyFailure, filesCopied, bytesCopied, destino: usaR2 ? 'r2' : 'firebase' };
}

/**
 * Copia o áudio do pedido para o nosso storage AGORA, com reserva contra corrida.
 *
 * Extraído de src/lib/payments.js (25/09/2026) para poder ser chamado também no instante em que a
 * música fica pronta — antes de qualquer pagamento. Motivo: a Kie.ai entrega a prévia num endpoint
 * de streaming que morre em poucas horas, e todo o resto (proxy, troca de URL, cron) é remendo em
 * cima de um arquivo que já está sumindo. Copiando na chegada, a música passa a existir no nosso
 * storage desde o primeiro minuto e nada mais depende do prazo deles.
 *
 * Nunca lança: arquivamento é efeito colateral e não pode derrubar a entrega da música nem a
 * aprovação de um pagamento. Falhou, o cron (api/orders/archive-audio) tenta de novo.
 *
 * @returns {Promise<{arquivou: boolean, motivo?: string, files?: string[]}>}
 */
export async function arquivarAudioDoPedido({ orderRef, orderId, env, doc: docRef, getDoc, updateDoc }) {
  try {
    let filesParaArquivar = [];
    let deveArquivar = false;

    const freshSnap = await getDoc(orderRef);
    if (freshSnap.exists()) {
      const freshData = freshSnap.data();
      filesParaArquivar = Array.isArray(freshData.audioFiles) && freshData.audioFiles.length
        ? freshData.audioFiles
        : [freshData.audioUrl].filter(Boolean);

      // Reserva sequencial: webhook e polling chegam em paralelo e copiariam os mesmos MB duas vezes.
      const temArquivosExternos = filesParaArquivar.some((u) => !isOurStorage(u));
      if (filesParaArquivar.length > 0 && temArquivosExternos && !freshData.audioArchiving) {
        await updateDoc(orderRef, { audioArchiving: true });
        deveArquivar = true;
      }
    }

    if (!deveArquivar) return { arquivou: false, motivo: 'nada_a_fazer' };

    // R2 primeiro (binding `nsmusic_media`, só existe no runtime real da Cloudflare); Firebase
    // Storage como reserva quando o binding falta.
    const r2Bucket = env?.nsmusic_media;
    const r2PublicUrl = env?.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;
    const firebaseBucket = env?.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    if (!((r2Bucket && r2PublicUrl) || firebaseBucket)) {
      console.warn('[audioArchive] Nem R2 nem Firebase Storage configurados — áudio não arquivado.');
      await updateDoc(orderRef, { audioArchiving: false }).catch(() => {});
      return { arquivou: false, motivo: 'sem_destino' };
    }

    const { files: archived, anyFailure } = await archiveAudioFiles(orderId, filesParaArquivar, { r2Bucket, r2PublicUrl, firebaseBucket });

    // Nunca gravar menos faixas do que o pedido já tinha: a Suno entrega duas versões e o cliente
    // pagou pelas duas (mesma trava de api/orders/refresh-audio, 25/09/2026).
    if (archived.length < filesParaArquivar.length) {
      await updateDoc(orderRef, { audioArchiving: false, audioArchiveFailedAt: new Date().toISOString() }).catch(() => {});
      return { arquivou: false, motivo: 'copia_parcial' };
    }

    const nowIso = new Date().toISOString();
    const archivePayload = {
      audioFiles: archived,
      audioUrl: archived[0],
      audioArchiving: false,
      ...(anyFailure
        ? { audioArchiveFailedAt: nowIso }
        : { audioArchivedAt: nowIso, audioArchiveFailedAt: null }),
    };
    await updateDoc(orderRef, archivePayload);

    // Espelha a URL definitiva do R2 para o Supabase
    try {
      const { mirrorOrderToSupabase } = await import('./supabaseSync.js');
      mirrorOrderToSupabase(orderId, archivePayload, env).catch(() => {});
    } catch {}

    return { arquivou: !anyFailure, files: archived };
  } catch (err) {
    console.warn('[audioArchive] Falha ao arquivar áudio na chegada:', err.message);
    try { await updateDoc(orderRef, { audioArchiving: false }); } catch (e) {}
    return { arquivou: false, motivo: 'erro' };
  }
}
