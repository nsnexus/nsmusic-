// O AudioContext vive em módulo próprio porque precisa ser destravado de forma síncrona no clique
// do usuário, e este arquivo só é carregado por import dinâmico — ver src/lib/audioContext.js.
import { primeAudioContext } from '@/lib/audioContext';
import { drawSlideshowFrame, VIDEO_WIDTH, VIDEO_HEIGHT } from './videoFrames.js';

async function updateOrderClient(orderId, updates) {
  try {
    await fetch('/api/orders/client-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, ...updates }),
    });
  } catch (err) {
    console.warn('[VideoGen] Falha ao atualizar pedido via client-update:', err?.message);
  }
}

// Baixa os bytes do MP3 pelo proxy do próprio domínio. Devolver bytes (em vez de apontar um
// <audio src>) é o que elimina de vez a segunda causa de vídeo mudo: um elemento de mídia
// cross-origin sem CORS válido faz createMediaElementSource emitir silêncio por especificação,
// sem erro nenhum. Com os bytes em mãos, decodeAudioData sempre produz amostras reais ou lança.
async function fetchAudioBytes(audioUrl) {
  // A URL que chega aqui pode JÁ ser do nosso próprio domínio: /entrega monta o player com
  // formatAudioUrl, que devolve "/api/audio/proxy?url=...". Envolver isso no proxy de novo produz
  // "/api/audio/proxy?url=%2Fapi%2Faudio%2Fproxy%3F..." — o proxy recebe um caminho relativo, a
  // allowlist de domínio recusa, e o download falha com o áudio estando perfeitamente acessível.
  const jaEhMesmaOrigem = audioUrl.startsWith('/') || audioUrl.startsWith('blob:');

  const attempts = jaEhMesmaOrigem
    ? [audioUrl]
    : [
        `/api/audio/proxy?url=${encodeURIComponent(audioUrl)}`,
        `/api/image-proxy?url=${encodeURIComponent(audioUrl)}`,
      ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        console.warn(`[VideoGen] Proxy de áudio respondeu HTTP ${res.status} em ${url}`);
        continue;
      }
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > 0) return buffer;
      console.warn(`[VideoGen] Proxy de áudio devolveu 0 bytes em ${url}`);
    } catch (e) {
      console.warn(`[VideoGen] Falha ao baixar o áudio em ${url}:`, e?.message);
    }
  }

  return null;
}

/**
 * Etapa compartilhada pelos dois motores do navegador. Nunca publica um arquivo
 * antes de o motor de vídeo terminar e validar áudio/imagens. Retém o upload R2
 * e o status de entrega atuais, inclusive para a música bônus.
 */
async function uploadCompletedVideo(orderId, videoBlob, extension, contentType) {
  const uploadRes = await fetch(`/api/video/upload?orderId=${encodeURIComponent(orderId)}&ext=${extension}`, {
    method: 'POST',
    headers: { 'Content-Type': videoBlob.type || contentType },
    body: videoBlob,
    signal: AbortSignal.timeout(120000),
  });
  if (!uploadRes.ok) {
    throw new Error(`Falha no upload do vídeo para o R2 (HTTP ${uploadRes.status})`);
  }
  const data = await uploadRes.json();
  const videoUrl = data?.url || null;
  if (!videoUrl) {
    throw new Error('URL do vídeo não foi retornada pelo servidor');
  }
  const nowIso = new Date().toISOString();
  await updateOrderClient(orderId, {
    videoUrl,
    videoStatus: 'CONCLUIDO',
    videoProgress: 100,
    videoCreatedAt: nowIso,
    updatedAt: nowIso,
  });
  return videoUrl;
}

/**
 * Renderiza um vídeo em formato de slideshow com 10 a 20 fotos sincronizadas com a música MP3
 * @param {string} orderId - ID do pedido
 * @param {string[]} imageUrls - Array com as URLs das fotos (mínimo 10, máximo 20)
 * @param {string} audioUrl - URL da música em MP3
 * @param {Object} orderData - Dados do pedido (nome do homenageado, cliente, etc.)
 */
export async function createSlideshowVideo(orderId, imageUrls, audioUrl, orderData = {}, onProgress = null) {
  if (!orderId || !imageUrls || imageUrls.length < 3) {
    throw new Error('Mínimo de 3 fotos necessárias para gerar o vídeo.');
  }

  // Atualiza status para GERANDO
  await updateOrderClient(orderId, {
    videoStatus: 'GERANDO',
    videoProgress: 10,
    updatedAt: new Date().toISOString()
  });

  try {
    // 1. Áudio primeiro, e sempre decodificado em amostras reais.
    //
    // A ordem importa: se o áudio não puder ser carregado, o vídeo é abortado ANTES de gastar
    // minutos carregando fotos e renderizando. Antes desta mudança o áudio era o último passo e
    // qualquer falha dele resultava num vídeo mudo entregue como se estivesse correto.
    if (!audioUrl) {
      throw new Error('Nenhuma música foi encontrada para este pedido. Recarregue a página e tente novamente.');
    }

    const audioCtx = primeAudioContext();
    if (!audioCtx) {
      throw new Error('Seu navegador não permite gerar o vídeo com áudio. Tente pelo Chrome no celular ou no computador.');
    }

    const audioBytes = await fetchAudioBytes(audioUrl);
    if (!audioBytes) {
      throw new Error('Não foi possível baixar a música para montar o vídeo. Tente novamente em instantes.');
    }

    let audioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(audioBytes);
    } catch (decodeErr) {
      console.warn('[VideoGen] Falha ao decodificar o áudio:', decodeErr?.message);
      throw new Error('A música baixada veio corrompida. Tente novamente em instantes.');
    }

    // Duração exata do arquivo decodificado — não existe mais o palpite de 180s que sobrava do
    // antigo timeout de 4s esperando os metadados do <audio>.
    // A música inteira deve ir para o vídeo: o limite antigo de 360s cortava músicas de 7 minutos.
    const duration = audioBuffer.duration;
    if (!duration || !isFinite(duration) || duration <= 0) {
      throw new Error('A música deste pedido está com duração inválida. Fale com o suporte.');
    }

    // Se o contexto não destravou, um BufferSource não produz som nenhum — abortar aqui é melhor do
    // que gravar 3 minutos de silêncio e só descobrir na entrega.
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    if (audioCtx.state !== 'running') {
      throw new Error('O navegador bloqueou o áudio. Toque na tela e clique novamente em "Criar Vídeo Homenagem".');
    }

    // 2. Pré-carrega todas as imagens via proxy para garantir Blob URLs de mesma origem sem contaminar o Canvas (CORS tainting)
    console.log(`[VideoGen] Carregando ${imageUrls.length} imagens...`);
    const loadedImages = await Promise.all(
      imageUrls.map(async (url, imgIndex) => {
        if (!url) {
          console.warn(`[VideoGen] Imagem ${imgIndex}: URL vazia, ignorada.`);
          return null;
        }
        let blobUrl = null;

        if (typeof url === 'string' && url.startsWith('http')) {
          // Tenta via proxy primeiro
          try {
            const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
            if (proxyRes.ok) {
              const imgBlob = await proxyRes.blob();
              if (imgBlob.size > 0) {
                blobUrl = URL.createObjectURL(imgBlob);
                console.log(`[VideoGen] Imagem ${imgIndex}: carregada via proxy (${imgBlob.size} bytes)`);
              } else {
                console.warn(`[VideoGen] Imagem ${imgIndex}: proxy retornou blob vazio`);
              }
            } else {
              console.warn(`[VideoGen] Imagem ${imgIndex}: proxy retornou HTTP ${proxyRes.status}`);
            }
          } catch (e) {
            console.warn(`[VideoGen] Imagem ${imgIndex}: erro no proxy, tentando fetch direto:`, e);
          }

          // Fallback: fetch direto (pode falhar por CORS)
          if (!blobUrl) {
            try {
              const imgRes = await fetch(url, { mode: 'cors' });
              if (imgRes.ok) {
                const imgBlob = await imgRes.blob();
                if (imgBlob.size > 0) {
                  blobUrl = URL.createObjectURL(imgBlob);
                  console.log(`[VideoGen] Imagem ${imgIndex}: carregada via fetch direto (${imgBlob.size} bytes)`);
                }
              }
            } catch (e) {
              console.warn(`[VideoGen] Imagem ${imgIndex}: falha no fetch direto:`, e);
            }
          }
        }

        const srcToLoad = blobUrl || (typeof url === 'string' ? url : '');
        if (!srcToLoad) {
          console.warn(`[VideoGen] Imagem ${imgIndex}: nenhuma fonte válida disponível`);
          return null;
        }

        // Carrega o Image() element com timeout de 15s
        return new Promise((resolve) => {
          const img = new Image();
          const timeout = setTimeout(() => {
            console.warn(`[VideoGen] Imagem ${imgIndex}: timeout de 15s ao carregar`);
            resolve(null);
          }, 15000);

          const onSuccess = () => {
            clearTimeout(timeout);
            // Valida que a imagem tem dimensões reais
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              console.log(`[VideoGen] Imagem ${imgIndex}: OK (${img.naturalWidth}x${img.naturalHeight})`);
              resolve(img);
            } else {
              console.warn(`[VideoGen] Imagem ${imgIndex}: carregou mas dimensões inválidas (${img.naturalWidth}x${img.naturalHeight})`);
              resolve(null);
            }
          };

          const onError = () => {
            clearTimeout(timeout);
            console.warn(`[VideoGen] Imagem ${imgIndex}: erro ao carregar de ${blobUrl ? 'blobUrl' : 'url direta'}`);
            // Se falhou com blobUrl, tenta URL direta sem crossOrigin como último recurso
            if (blobUrl && url) {
              const fallbackImg = new Image();
              fallbackImg.onload = () => {
                if (fallbackImg.naturalWidth > 0 && fallbackImg.naturalHeight > 0) {
                  console.log(`[VideoGen] Imagem ${imgIndex}: OK via fallback final (${fallbackImg.naturalWidth}x${fallbackImg.naturalHeight})`);
                  resolve(fallbackImg);
                } else {
                  resolve(null);
                }
              };
              fallbackImg.onerror = () => resolve(null);
              fallbackImg.src = url;
            } else {
              resolve(null);
            }
          };

          if (blobUrl) {
            // Blob URLs de mesma origem -> NUNCA contaminam o canvas
            img.onload = onSuccess;
            img.onerror = onError;
            img.src = srcToLoad;
          } else {
            img.crossOrigin = 'anonymous';
            img.onload = onSuccess;
            img.onerror = onError;
            img.src = srcToLoad;
          }
        });
      })
    );

    const validImages = loadedImages.filter(Boolean);
    console.log(`[VideoGen] ${validImages.length} de ${imageUrls.length} imagens carregadas com sucesso`);
    if (validImages.length === 0) {
      throw new Error('Nenhuma imagem válida pôde ser carregada. Por favor, selecione as fotos novamente.');
    }

    // Prioridade: WebCodecs/Mediabunny no próprio navegador, com frames e áudio
    // codificados sem esperar o áudio tocar. Não mexe na VPS.
    // Sem suporte ou com falha, volta ao MediaRecorder tradicional e seguro.
    let fastBlob = null;
    try {
      const { renderFastSlideshow } = await import('./videoFast.js');
      fastBlob = await renderFastSlideshow({ images: validImages, audioBuffer, duration, onProgress });
    } catch (fastErr) {
      console.warn('[VideoGen] Motor WebCodecs indisponível/falhou; usando MediaRecorder no navegador:', fastErr?.message);
    }
    if (fastBlob) {
      if (onProgress) onProgress(99);
      // MP4 já convencional, H.264 + AAC e com Fast Start: dispensa o remux.
      return await uploadCompletedVideo(orderId, fastBlob, 'mp4', 'video/mp4');
    }

    // 3. Fallback: o mesmo Canvas/MediaRecorder que já funciona em produção.
    // Resolução, FPS, efeitos, integridade e compatibilidade WhatsApp mantidos.
    // metade dos pixels por frame, o que já reduz bastante o tamanho final sem perda perceptível
    // num slideshow de fotos com pan/zoom lento (ver reclamação de vídeo de +50MB e "formato
    // inválido" no WhatsApp).
    const canvas = document.createElement('canvas');
    const width = VIDEO_WIDTH;
    const height = VIDEO_HEIGHT;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Áudio ligado ao stream por AudioBufferSourceNode (amostras já decodificadas), não por
    // createMediaElementSource — ver comentário de topo de primeAudioContext. `source` só é
    // conectado ao destino do MediaRecorder, nunca a audioCtx.destination: a gravação continua
    // silenciosa para quem está com a página aberta.
    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);

    // Um AudioContext cujo grafo não chega a `destination` pode ser considerado ocioso pelo
    // navegador e ter o processamento suspenso ou reduzido — e aí o MediaStreamDestination recebe
    // silêncio, sem erro nenhum. Ligar o mesmo source a um ganho ZERO que chega ao destination real
    // mantém o grafo ativo sem tocar som para quem está com a página aberta. É a causa de vídeo mudo
    // que sobrevivia mesmo com o AudioContext em estado "running".
    const keepAliveGain = audioCtx.createGain();
    keepAliveGain.gain.value = 0;
    source.connect(keepAliveGain);
    keepAliveGain.connect(audioCtx.destination);

    // Mede o sinal que está de fato indo para a gravação. É o que permite detectar vídeo mudo
    // ENQUANTO ele grava — a validação por tamanho de arquivo não pega esse caso: vídeo com imagem e
    // sem áudio tem tamanho normal e passava como se estivesse bom.
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const analyserBuffer = new Uint8Array(analyser.fftSize);
    let maxAudioLevel = 0;
    const sampleAudioLevel = () => {
      try {
        analyser.getByteTimeDomainData(analyserBuffer);
        // 128 é o zero do domínio do tempo em 8 bits; desvio a partir daí é sinal real.
        for (let i = 0; i < analyserBuffer.length; i += 32) {
          const level = Math.abs(analyserBuffer[i] - 128);
          if (level > maxAudioLevel) maxAudioLevel = level;
        }
      } catch (e) {}
    };

    const audioTracks = dest.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('Não foi possível preparar o áudio do vídeo. Tente novamente pelo Chrome.');
    }

    // 15 FPS: slideshow é foto parada com pan/zoom lento, não tem movimento que justifique 24.
    // Menos quadros = menos bytes, e é o único controle de tamanho que o navegador NÃO ignora
    // (ver o bloco do MediaRecorder abaixo — achado 03/09/2026).
    const canvasStream = canvas.captureStream(15);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks
    ]);

    const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=h264')
      ? 'video/mp4;codecs=h264'
      : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : 'video/webm');

    // A extensão do arquivo salvo no Storage precisa bater com o container real gravado pelo
    // MediaRecorder — muitos navegadores (a maioria do Chrome/Edge no desktop e quase todo Android)
    // não suportam gravar em .mp4 de verdade e caem no fallback video/webm. Salvar esse conteúdo
    // como "video_homenagem.mp4" produzia um arquivo com extensão .mp4 mas conteúdo WebM por
    // dentro — o WhatsApp valida o container e recusava como "formato inválido".
    const fileExtension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

    // ACHADO 03/09/2026: um vídeo gerado com ESTA configuração de 900 kbps saiu com 136 MB (~6 Mbps
    // reais) — ou seja, o navegador IGNOROU `videoBitsPerSecond`. Isso acontece principalmente no
    // caminho `video/mp4;codecs=h264`, onde várias implementações usam um bitrate próprio.
    // Consequências reais: download quebrado (o arquivo nem passava pelo proxy, ver
    // api/image-proxy), upload lento no celular do cliente e conta de Storage inflada.
    //
    // Por isso agora: `bitsPerSecond` junto de `videoBitsPerSecond` (navegadores que ignoram um
    // costumam respeitar o outro), áudio limitado, e sobretudo 15 FPS no captureStream acima — a
    // taxa de quadros é o controle que nenhum navegador ignora.
    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 900000,  // ~900 kbps
      audioBitsPerSecond: 128000,  // 128 kbps já é bom para música
      bitsPerSecond: 1028000,      // total (vídeo + áudio), para quem ignora os dois campos acima
    });

    const chunks = [];
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const recordingPromise = new Promise((resolve, reject) => {
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };
      mediaRecorder.onerror = err => reject(err);
    });

    // Monitora se o usuário trocou de aba durante a gravação. O requestAnimationFrame é
    // estrangulado em abas em segundo plano, mas o AudioBufferSourceNode continua tocando —
    // isso dessincroniza áudio e vídeo e pode produzir um vídeo mudo ou com áudio cortado.
    let tabWasHidden = false;
    const onVisibilityChange = () => {
      if (document.hidden) {
        tabWasHidden = true;
        console.warn('[VideoGen] Usuário trocou de aba durante a gravação — risco de vídeo sem áudio!');
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Re-destravar o AudioContext imediatamente antes de iniciar a gravação. O primeAudioContext()
    // original foi chamado no clique, mas o upload de fotos pode ter levado minutos — alguns
    // navegadores (especialmente iOS Safari) re-suspendem o contexto de áudio após inatividade
    // prolongada, mesmo que ele tenha sido destravado por gesto do usuário.
    if (audioCtx.state === 'suspended') {
      try {
        await Promise.race([
          audioCtx.resume(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
      } catch (resumeErr) {
        console.warn('[VideoGen] Falha ao re-destravar AudioContext:', resumeErr?.message);
      }
    }
    if (audioCtx.state !== 'running') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      throw new Error(
        'O navegador bloqueou o áudio antes de iniciar a gravação. ' +
        'Toque na tela e clique novamente em "Criar Vídeo Homenagem".'
      );
    }

    // timeslice de 1s: sem ele o MediaRecorder acumula o vídeo inteiro em memória até o stop, o que
    // em celular mais fraco pode derrubar a aba no meio de um slideshow de 3 minutos.
    mediaRecorder.start(1000);
    source.start();

    // 4. Loop de Animação com efeito Ken Burns (Pan & Zoom)
    //
    // O relógio é o do próprio AudioContext, não performance.now(): se o cliente trocar de aba, o
    // navegador estrangula requestAnimationFrame (chega a 1 quadro por segundo ou menos) enquanto o
    // áudio continua correndo no ritmo normal. Com dois relógios diferentes, a imagem dessincroniza
    // da música e o vídeo termina no lugar errado. audioCtx.currentTime acompanha exatamente o que
    // está sendo gravado na trilha de áudio.
    const startTime = audioCtx.currentTime;
    let ultimoProgresso = -1;
    let ultimoSegundoPersistido = 0;
    let ultimoQuadroDesenhado = -1;

    const renderFrame = () => {
      const elapsed = audioCtx.currentTime - startTime;

      // Amostra o sinal de áudio a cada quadro: é assim que se descobre que o vídeo saiu mudo antes
      // de entregá-lo ao cliente (ver sampleAudioLevel).
      sampleAudioLevel();

      if (elapsed >= duration) {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        try { source.stop(); } catch (e) {}
        return;
      }

      // Antes: dezenas de POSTs por segundo enquanto floor(elapsed) % 10 === 0,
      // além de callbacks de UI a cada requestAnimationFrame. No celular, isso
      // competia com o encoder do vídeo. Agora: 1 callback por percentual real
      // e no máximo 1 gravação de progresso a cada 10 segundos de áudio.
      const progressPercent = Math.min(95, Math.floor((elapsed / duration) * 90) + 10);
      if (progressPercent !== ultimoProgresso) {
        ultimoProgresso = progressPercent;
        if (onProgress) onProgress(progressPercent);
      }
      const segundoAtual = Math.floor(elapsed);
      if (segundoAtual - ultimoSegundoPersistido >= 10) {
        ultimoSegundoPersistido = segundoAtual;
        updateOrderClient(orderId, { videoProgress: progressPercent }).catch(() => {});
      }

      // captureStream grava 15 FPS: desenhar 60 vezes/segundo não melhora o
      // arquivo e usa CPU/GPU do celular. Redesenha em até ~20 FPS para
      // alimentar com folga o encoder de 15 FPS.
      if (ultimoQuadroDesenhado >= 0 && elapsed - ultimoQuadroDesenhado < 1 / 20) {
        requestAnimationFrame(renderFrame);
        return;
      }
      ultimoQuadroDesenhado = elapsed;

      drawSlideshowFrame(ctx, validImages, elapsed, duration, width, height);

      requestAnimationFrame(renderFrame);
    };

    renderFrame();

    let videoBlob = await recordingPromise;

    // Remove o listener de visibilidade — a gravação já terminou
    document.removeEventListener('visibilitychange', onVisibilityChange);

    // Validação pós-gravação: um vídeo de ~3min com áudio a 900kbps de vídeo + áudio deveria ter
    // ao menos algumas centenas de KB. Um blob muito pequeno (< 50KB) indica que o MediaRecorder
    // gravou silêncio ou frames vazios — é melhor avisar o usuário do que entregar vídeo mudo.
    const blobSizeKB = videoBlob.size / 1024;
    const minExpectedKB = Math.max(50, duration * 5); // ~5 KB por segundo é o mínimo razoável
    console.log(`[VideoGen] Blob gerado: ${blobSizeKB.toFixed(1)} KB (mínimo esperado: ${minExpectedKB.toFixed(1)} KB, duração: ${duration.toFixed(1)}s)`);

    if (blobSizeKB < minExpectedKB) {
      console.error(`[VideoGen] Blob muito pequeno (${blobSizeKB.toFixed(1)} KB) — provável vídeo sem áudio ou corrompido.`);
      throw new Error(
        'O vídeo gerado ficou muito pequeno e provavelmente está sem áudio. ' +
        (tabWasHidden
          ? 'Isso pode ter acontecido porque você trocou de aba durante a geração. '
          : '') +
        'Por favor, tente novamente sem sair desta página.'
      );
    }

    // Verificação que a checagem de tamanho NÃO cobre: vídeo com imagem e sem áudio tem tamanho
    // perfeitamente normal e passava como bom — era a reclamação recorrente de "vídeo veio mudo".
    // maxAudioLevel é o pico medido no sinal que foi de fato para a gravação; ficar praticamente em
    // zero durante o vídeo inteiro significa trilha silenciosa.
    console.log(`[VideoGen] Pico de áudio medido durante a gravação: ${maxAudioLevel} (0 = silêncio absoluto)`);
    if (maxAudioLevel <= 2) {
      console.error('[VideoGen] Trilha de áudio silenciosa — vídeo não será entregue.');
      throw new Error(
        'O vídeo foi gerado sem áudio. ' +
        (tabWasHidden
          ? 'Você trocou de aba durante a geração — o navegador interrompe o áudio nesse caso. '
          : 'O navegador bloqueou o áudio durante a gravação. ') +
        'Toque na tela e tente novamente, mantendo esta página aberta e visível.'
      );
    }

    // Se o usuário trocou de aba, o vídeo PODE estar OK (nem sempre corrompe), mas vale alertar
    // no console para facilitar debugging futuro.
    if (tabWasHidden) {
      console.warn('[VideoGen] Vídeo gerado com sucesso, mas o usuário trocou de aba durante a gravação. O áudio pode estar dessincronizado.');
    }

    // 4b. MP4 normal para o WhatsApp ler o vídeo inteiro (ver src/lib/mp4ParaWhatsapp.js).
    if (onProgress) onProgress(99);
    const { mp4ParaWhatsapp } = await import('@/lib/mp4ParaWhatsapp');
    videoBlob = await mp4ParaWhatsapp(videoBlob, { duracaoEsperada: duration });

    // 5. Upload do vídeo e status de conclusão (compartilhado com WebCodecs).
    return await uploadCompletedVideo(orderId, videoBlob, fileExtension, mimeType);

  } catch (err) {
    console.error("Erro na geração do vídeo:", err);
    // Limpa o listener de visibilidade caso tenha sido registrado antes do erro
    try { document.removeEventListener('visibilitychange', onVisibilityChange); } catch (_) {}
    const errIso = new Date().toISOString();
    await updateOrderClient(orderId, {
      videoStatus: 'ERRO',
      videoError: err.message,
      updatedAt: errIso
    });
    throw err;
  }
}
