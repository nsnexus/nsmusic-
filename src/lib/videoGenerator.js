import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';

/**
 * Renderiza um vídeo em formato de slideshow com 10 a 20 fotos sincronizadas com a música MP3
 * @param {string} orderId - ID do pedido
 * @param {string[]} imageUrls - Array com as URLs das fotos (mínimo 10, máximo 20)
 * @param {string} audioUrl - URL da música em MP3
 * @param {Object} orderData - Dados do pedido (nome do homenageado, cliente, etc.)
 */
export async function createSlideshowVideo(orderId, imageUrls, audioUrl, orderData = {}, onProgress = null) {
  if (!orderId || !imageUrls || imageUrls.length < 10) {
    throw new Error('Mínimo de 10 fotos necessárias para gerar o vídeo.');
  }

  // Atualiza status no Firestore para GERANDO
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    videoStatus: 'GERANDO',
    videoProgress: 10,
    updatedAt: new Date().toISOString()
  });

  try {
    // 1. Carrega o elemento de áudio como Blob local via proxy para garantir CORS e obter a duração exata
    let finalAudioSrc = audioUrl;
    if (typeof audioUrl === 'string' && audioUrl.startsWith('http')) {
      try {
        const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(audioUrl)}`);
        if (proxyRes.ok) {
          const audioBlob = await proxyRes.blob();
          finalAudioSrc = URL.createObjectURL(audioBlob);
        } else {
          const audioRes = await fetch(audioUrl);
          if (audioRes.ok) {
            const audioBlob = await audioRes.blob();
            finalAudioSrc = URL.createObjectURL(audioBlob);
          }
        }
      } catch (e) {
        console.warn("Aviso ao baixar áudio via proxy, usando URL direta:", e);
      }
    }

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = finalAudioSrc;

    await new Promise((resolve) => {
      audio.onloadedmetadata = resolve;
      audio.onerror = () => resolve();
      setTimeout(resolve, 4000);
    });

    // Garante que a duração seja um número válido positivo e realista (máx 360s)
    let duration = audio.duration;
    if (!duration || isNaN(duration) || !isFinite(duration) || duration > 360 || duration <= 0) {
      duration = 180; // Duração padrão de 3 minutos
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

    const imageCount = validImages.length;
    const timePerImage = duration / imageCount;

    // 3. Configura o Canvas para formato Stories/Reels vertical — 720x1280 em vez de 1080x1920:
    // metade dos pixels por frame, o que já reduz bastante o tamanho final sem perda perceptível
    // num slideshow de fotos com pan/zoom lento (ver reclamação de vídeo de +50MB e "formato
    // inválido" no WhatsApp).
    const canvas = document.createElement('canvas');
    const width = 720;
    const height = 1280;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Suporte a AudioContext para juntar o áudio com o canvas stream (GRAVAÇÃO SILENCIOSA)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(dest);

    // Essencial para navegadores baseados no Chromium/WebKit: acordar o contexto se tiver sido suspenso
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(e => console.warn("Aviso ao dar resume no audioCtx:", e));
    }

    const canvasStream = canvas.captureStream(24); // 24 FPS — suficiente para pan/zoom lento, mais leve que 30
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
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

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 900000 // ~900 kbps — reduzido de 1.5 Mbps; slideshow de fotos não precisa de bitrate alto
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

    mediaRecorder.start();
    audio.play().catch(e => console.warn("Aviso no áudio play:", e));

    // 4. Loop de Animação com efeito Ken Burns (Pan & Zoom)
    let startTime = performance.now();

    const renderFrame = async () => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;

      if (elapsed >= duration || (audio.ended && elapsed > 5)) {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        audio.pause();
        return;
      }

      // Progresso no Firestore e na UI
      const progressPercent = Math.min(95, Math.floor((elapsed / duration) * 90) + 10);
      if (onProgress) onProgress(progressPercent);
      if (Math.floor(elapsed) % 5 === 0) {
        updateDoc(orderRef, { videoProgress: progressPercent }).catch(() => {});
      }

      const currentIndex = Math.min(
        validImages.length - 1,
        Math.floor(elapsed / timePerImage)
      );
      const img = validImages[currentIndex];
      const imgProgress = (elapsed % timePerImage) / timePerImage;

      // Fundo escuro com gradiente elegante
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        // Efeito Ken Burns (Zoom suave de 1.0 a 1.1)
        const scale = 1.0 + (imgProgress * 0.1);
        const imgAspect = img.naturalWidth / img.naturalHeight;

        // Sempre modo "contain": mostra a foto inteira, nunca corta nenhuma lateral. Quando a foto
        // não bate exatamente com o formato vertical do canvas, sobra barra do fundo escuro (já
        // pintado acima) acima/abaixo ou nas laterais — preferível a cortar parte da imagem.
        const canvasAspect = width / height;
        let drawWidth, drawHeight;
        if (imgAspect > canvasAspect) {
          drawWidth = width * scale;
          drawHeight = drawWidth / imgAspect;
        } else {
          drawHeight = height * scale;
          drawWidth = drawHeight * imgAspect;
        }

        const offsetX = (width - drawWidth) / 2;
        const offsetY = (height - drawHeight) / 2;

        ctx.save();
        // Efeito de transição Fade In nos primeiros 0.5s de cada foto
        const fadeSec = 0.5;
        const timeInImg = elapsed % timePerImage;
        if (timeInImg < fadeSec) {
          ctx.globalAlpha = timeInImg / fadeSec;
        } else {
          ctx.globalAlpha = 1.0;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        ctx.restore();
      }

      requestAnimationFrame(renderFrame);
    };

    renderFrame();

    const videoBlob = await recordingPromise;

    // 5. Upload do vídeo para o Firebase Storage — extensão e Content-Type batendo com o container
    // real gravado (ver comentário acima sobre fileExtension), para o arquivo baixado/compartilhado
    // ser reconhecido corretamente pelo WhatsApp e outros apps.
    const storageRef = ref(storage, `orders/${orderId}/video_homenagem.${fileExtension}`);
    await uploadBytes(storageRef, videoBlob, { contentType: mimeType });
    const videoUrl = await getDownloadURL(storageRef);

    // 6. Atualiza o pedido com a URL do vídeo concluído
    await updateDoc(orderRef, {
      videoUrl: videoUrl,
      videoStatus: 'CONCLUIDO',
      videoProgress: 100,
      videoCreatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return videoUrl;

  } catch (err) {
    console.error("Erro na geração do vídeo:", err);
    await updateDoc(orderRef, {
      videoStatus: 'ERRO',
      videoError: err.message,
      updatedAt: new Date().toISOString()
    });
    throw err;
  }
}
