'use client';

import { useEffect, useRef } from 'react';

// Enquanto o pedido estiver com a URL EFÊMERA da Kie.ai (`audiostream.kie.ai`), pede ao servidor
// que troque pela definitiva, de tempos em tempos, por trás da tela.
//
// O cliente não espera por isso: ele já está ouvindo o stream, que funciona nos primeiros minutos.
// A troca acontece sozinha e o `onSnapshot` que a página pai já mantém atualiza o player quando o
// documento muda — sem recarregar, sem interromper quem está ouvindo.
//
// Por que é necessário (medido em 25/09/2026): o stream serve 3,84 MB com 10 minutos de vida e
// 0 byte com 185. O polling da geração para no primeiro sucesso, que é o stream, então sem isto a
// URL temporária fica salva como se fosse a final — e a música "some" algumas horas depois.
//
// O cron api/orders/refresh-audio continua existindo para quem fechou a aba. Este hook é o caminho
// rápido para quem está na tela agora.

const INTERVALO_MS = 30000;
// ~10 minutos de tentativas. A Kie.ai costuma publicar o MP3 final bem antes disso; passado o
// limite, o cron assume — insistir para sempre numa aba aberta só gastaria chamada à toa.
const MAX_TENTATIVAS = 20;

function ehEfemera(url) {
  return typeof url === 'string' && (url.includes('audiostream.kie.ai') || url.includes('musicfile.kie.ai'));
}

export function precisaPromoverAudio(order) {
  if (!order) return false;
  const urls = [order.audioUrl, ...(Array.isArray(order.audioFiles) ? order.audioFiles : [])];
  return urls.some(ehEfemera);
}

/**
 * @param {string} orderId
 * @param {object} order documento do pedido (ou um objeto com audioUrl/audioFiles)
 * @param {(audioFiles: string[]) => void} [aoTrocar] chamado quando a troca acontece. A pagina de
 *   entrega nao precisa (o onSnapshot dela ja reage ao documento); a tela de geracao precisa,
 *   porque guarda as faixas em estado local.
 */
export function usePromoverAudio(orderId, order, aoTrocar) {
  // Conta tentativas fora do estado: isto nunca deve provocar re-render — é trabalho de bastidor.
  const tentativasRef = useRef(0);
  // Guarda o callback numa ref para o efeito não reiniciar a cada render do pai.
  const aoTrocarRef = useRef(aoTrocar);
  aoTrocarRef.current = aoTrocar;

  const precisa = precisaPromoverAudio(order);

  useEffect(() => {
    if (!orderId || !precisa) return;

    let cancelado = false;

    const tentar = async () => {
      if (cancelado) return;
      tentativasRef.current += 1;
      try {
        const res = await fetch('/api/suno/promote-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelado && data?.estado === 'trocada' && Array.isArray(data.audioFiles) && data.audioFiles.length > 0) {
          aoTrocarRef.current?.(data.audioFiles);
        }
      } catch (e) {
        console.warn('[promover-audio] Tentativa falhou:', e?.message);
      }
    };

    tentar();

    const intervalo = setInterval(() => {
      if (tentativasRef.current >= MAX_TENTATIVAS) {
        clearInterval(intervalo);
        return;
      }
      tentar();
    }, INTERVALO_MS);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [orderId, precisa]);
}
