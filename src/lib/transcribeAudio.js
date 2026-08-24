import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Extrai URL ou base64 de áudio do payload de webhook da W-API ou Meta Cloud API.
 */
export function extractAudioFromWebhook(body) {
  if (!body) return null;

  // 1. URLs diretas de mídia
  const urlCandidates = [
    // Formato real da W-API (ver src/app/api/whatsapp/webhook/route.js) — mídia vem em
    // msgContent.audioMessage, não em data.message.audioMessage.
    body.msgContent?.audioMessage?.url,
    body.mediaUrl,
    body.audioUrl,
    body.fileUrl,
    body.url,
    body.data?.mediaUrl,
    body.data?.audioUrl,
    body.data?.fileUrl,
    body.data?.url,
    body.data?.message?.audioMessage?.url,
    body.message?.audioMessage?.url,
    body.data?.msg?.audioMessage?.url,
    body.msg?.audioMessage?.url,
  ];

  for (const candidate of urlCandidates) {
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return { type: 'url', value: candidate, mimeType: 'audio/ogg' };
    }
  }

  // 2. Base64
  const base64Candidates = [
    body.msgContent?.audioMessage?.base64,
    body.base64,
    body.data?.base64,
    body.data?.media?.base64,
    body.media?.base64,
    body.data?.message?.base64,
  ];

  for (const candidate of base64Candidates) {
    if (typeof candidate === 'string' && candidate.length > 50) {
      let clean = candidate;
      let mimeType = 'audio/ogg';
      if (candidate.includes(';base64,')) {
        const parts = candidate.split(';base64,');
        mimeType = parts[0].replace('data:', '') || 'audio/ogg';
        clean = parts[1];
      }
      return { type: 'base64', value: clean, mimeType };
    }
  }

  return null;
}

/**
 * Transcreve áudio para texto em português utilizando OpenAI Whisper (primário)
 * com fallback automático para Google Gemini.
 */
export async function transcribeAudioWithFailover(audioSource, env = {}) {
  if (!audioSource || !audioSource.value) return '';

  let audioBuffer = null;
  let base64Data = '';
  let mimeType = audioSource.mimeType || 'audio/ogg';

  // 1. Obter buffer e base64
  try {
    if (audioSource.type === 'url') {
      const res = await fetch(audioSource.value, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        audioBuffer = await res.arrayBuffer();
        const contentType = res.headers.get('content-type');
        if (contentType) mimeType = contentType;
        // Gera base64 para fallback se necessário
        const uint8 = new Uint8Array(audioBuffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        base64Data = btoa(binary);
      }
    } else if (audioSource.type === 'base64') {
      base64Data = audioSource.value;
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      audioBuffer = bytes.buffer;
    }
  } catch (err) {
    console.error('[Transcribe] Erro ao carregar arquivo de áudio:', err.message);
    return '';
  }

  if (!audioBuffer) return '';

  // 2. Tentar OpenAI Whisper (Whisper-1)
  const openAiKey = (env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (openAiKey) {
    try {
      console.log('[Transcribe] Transcrevendo áudio via OpenAI Whisper-1...');
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (whisperRes.ok) {
        const data = await whisperRes.json();
        const text = data.text?.trim();
        if (text) {
          console.log('[Transcribe] ✅ Transcrição Whisper concluída com sucesso!');
          return text;
        }
      } else {
        const errText = await whisperRes.text().catch(() => '');
        console.warn('[Transcribe] Erro na OpenAI Whisper:', whisperRes.status, errText);
      }
    } catch (whisperErr) {
      console.warn('[Transcribe] Falha na conexão com OpenAI Whisper:', whisperErr.message);
    }
  }

  // 3. Fallback: Google Gemini Multimodal Audio
  const keysString = env.GEMINI_API_KEYS || process.env.GEMINI_API_KEYS || env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  const keys = keysString.split(',').map((k) => k.trim()).filter(Boolean);

  if (keys.length > 0 && base64Data) {
    for (const key of keys) {
      try {
        console.log('[Transcribe] Tentando transcrição via Google Gemini Multimodal...');
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: mimeType.includes('audio') ? mimeType : 'audio/ogg',
              data: base64Data,
            },
          },
          {
            text: 'Transcreva com máxima fidelidade o que foi dito neste áudio em português. Retorne EXCLUSIVAMENTE o texto transcrito, sem introduções, aspas ou observações.',
          },
        ]);

        const text = result.response.text()?.trim();
        if (text) {
          console.log('[Transcribe] ✅ Transcrição Gemini concluída com sucesso!');
          return text;
        }
      } catch (geminiErr) {
        console.warn('[Transcribe] Erro no fallback Gemini:', geminiErr.message);
      }
    }
  }

  return '';
}
