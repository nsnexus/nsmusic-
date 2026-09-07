// Arquiva no NOSSO Firebase Storage o áudio de um pedido PAGO — extraído de
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

const MIN_AUDIO_BYTES = 100 * 1024;      // 100 KB — abaixo disso não é música de verdade
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB — teto de segurança pro Worker

export function isOurStorage(url) {
  return typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
}

/**
 * Copia uma URL externa (Kie.ai/Suno) para o nosso Storage e devolve a URL pública.
 *
 * Usa a REST API do Firebase Storage: o SDK `firebase/storage` não tem build `lite` e importá-lo
 * numa rota/lib Edge quebra o build do Cloudflare (.claude/rules/backend.md). O corpo é repassado
 * como ArrayBuffer porque o upload precisa do tamanho conhecido.
 */
export async function copyAudioToStorage(sourceUrl, destPath, bucket) {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'audio/mpeg, audio/*, */*' },
    signal: AbortSignal.timeout(45000),
  });

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
 * array pronto pra gravar em orders/{id}.audioFiles/audioUrl. Faixa já no nosso Storage é
 * preservada como está — não recopia. Faixa que falhar mantém a URL antiga (a origem ainda pode
 * estar de pé; melhor um link que talvez funcione do que nenhum).
 *
 * @param {string} orderId
 * @param {string[]} files URLs atuais das faixas (Kie.ai/Suno ou já nossas)
 * @param {string} bucket NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 * @returns {Promise<{files: string[], anyFailure: boolean, filesCopied: number, bytesCopied: number}>}
 */
export async function archiveAudioFiles(orderId, files, bucket) {
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
    const copy = await copyAudioToStorage(source, destPath, bucket);

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

  return { files: archived, anyFailure, filesCopied, bytesCopied };
}
