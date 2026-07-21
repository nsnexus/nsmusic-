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
            { role: "system", content: "Você é um compositor e letrista profissional premiado de música brasileira." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        })
      });

      if (openAiRes.ok) {
        const data = await openAiRes.json();
        const lyrics = data.choices[0]?.message?.content?.trim();
        if (lyrics) {
          console.log("Sucesso na geração utilizando OpenAI ChatGPT!");
          return lyrics;
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
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();
          
          if (text) {
            console.log(`Sucesso na geração utilizando a chave Gemini index ${i} e modelo ${modelName}`);
            return text;
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
