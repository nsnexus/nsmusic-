import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Executes a prompt using OpenAI (ChatGPT gpt-4o-mini) as PRIMARY engine, 
 * with automatic failover to Gemini and fallback models.
 * 
 * @param {string} prompt The text prompt to send to AI
 * @returns {Promise<string>} The generated text
 */
export async function runGeminiWithFailover(prompt) {
  let lastError = null;

  // 1. PRIMÁRIO: Tenta a API da OpenAI (ChatGPT gpt-4o-mini) primeiro se configurada
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey && openAiKey.trim().length > 0) {
    try {
      console.log("Iniciando composição via OpenAI ChatGPT (gpt-4o-mini)...");
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openAiKey.trim()}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Você é um compositor e letrista profissional premiado de música brasileira. REGRA ABSOLUTA E CRÍTICA DE FORMATO: Sua resposta deve conter EXCLUSIVAMENTE o texto da letra da música. É ESTRITAMENTE PROIBIDO incluir qualquer tipo de conversa, saudação, observação, nota de rodapé ou mensagem de cortesia (como 'As alterações foram feitas...', 'Espero que goste', 'Ajustei o refrão', etc.). Retorne APENAS a letra."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (openAiRes.ok) {
        const data = await openAiRes.json();
        const lyrics = data.choices[0]?.message?.content?.trim();
        if (lyrics) {
          console.log("Sucesso na geração utilizando OpenAI ChatGPT!");
          return sanitizeLyrics(lyrics);
        }
      } else {
        const errText = await openAiRes.text();
        console.warn("Aviso: Chamada OpenAI retornou status de erro:", errText);
        lastError = new Error(`OpenAI error: ${errText}`);
      }
    } catch (openAiErr) {
      console.warn("Aviso: Exceção ao conectar à OpenAI:", openAiErr.message || openAiErr);
      lastError = openAiErr;
    }
  }

  // 2. SECUNDÁRIO (FALLBACK): Tenta o Google Gemini com rotação de chaves e modelos válidos
  const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  const keys = keysString.split(',').map(k => k.trim()).filter(Boolean);

  if (keys.length > 0) {
    const validModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      for (const modelName of validModels) {
        try {
          const genAI = new GoogleGenerativeAI(key);
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: "REGRA ABSOLUTA: Retorne APENAS E EXCLUSIVAMENTE o texto da letra da música. NUNCA adicione mensagens de cortesia, explicações, notas ou cumprimentos de revisão (ex: 'As alterações foram feitas...', 'Espero que goste')."
          });
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();
          
          if (text) {
            console.log(`Sucesso na geração utilizando a chave Gemini index ${i} e modelo ${modelName}`);
            return sanitizeLyrics(text);
          }
        } catch (err) {
          console.warn(`Aviso: Falha na chave Gemini index ${i} (modelo ${modelName}):`, err.message || err);
          lastError = err;
        }
      }
    }
  }

  throw new Error(`Falha nos serviços de composição. Último erro: ${lastError ? lastError.message : 'Verifique suas chaves de API da OpenAI ou Gemini'}`);
}

function sanitizeLyrics(rawLyrics) {
  if (!rawLyrics) return '';
  let cleaned = rawLyrics.trim();

  // Remove aspas triplas ou blocos markdown de código (ex: ```, """)
  cleaned = cleaned.replace(/^```[a-z]*/gmi, '').replace(/```$/gmi, '').replace(/^"""/gmi, '').replace(/"""$/gmi, '').trim();

  // Encontra a primeira ocorrência de seção em colchetes
  const firstSectionIndex = cleaned.search(/\[(Verso|Intro|Pré-Refrão|Pre-Refrao|Refrão|Refrao|Ponte|Outro|Final)/i);
  if (firstSectionIndex > 0) {
    cleaned = cleaned.substring(firstSectionIndex).trim();
  }

  // Remove qualquer nota explicativa no final (ex: "Essa versão...", "Nota:", "As alterações...")
  const lastSectionRegex = /(\[Refrão Final\]|\[Refrao Final\]|\[Refrão\]|\[Refrao\]|\[Outro\]|\[Final\])/i;
  const matches = [...cleaned.matchAll(new RegExp(lastSectionRegex, 'gi'))];
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const lastIndex = lastMatch.index;
    const afterLast = cleaned.substring(lastIndex);
    const noteMatch = afterLast.match(/\n\n+(Essa versão|Nota:|Observação:|Espero que|Aqui está|As alterações|Ajustes|Qualquer|Espero ter|Comentário|Solicitação|Versão|Tudo pronto|Segue|Espero|Qualquer dúvida|Atenciosamente)/i);
    if (noteMatch) {
      cleaned = cleaned.substring(0, lastIndex + noteMatch.index).trim();
    }
  }

  // Remove qualquer linha ou parágrafo que comece ou contenha termos conversacionais típicos de IA
  cleaned = cleaned.replace(/\n\n*(As alterações|Ajustes? realizado|Espero que|Nota:|Observação:|Qualquer dúvida|Tudo pronto|Segue a letra|Esta versão).*$/gsi, '').trim();

  return cleaned;
}
