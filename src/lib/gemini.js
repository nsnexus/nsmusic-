import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Executes a prompt using Gemini with fallback capabilities.
 * It will try each configured key in sequence until one succeeds.
 * 
 * @param {string} prompt The text prompt to send to Gemini
 * @param {string} modelName The model to use (default: 'gemini-3.5-flash')
 * @returns {Promise<string>} The generated text
 */
export async function runGeminiWithFailover(prompt, modelName = 'gemini-3.5-flash') {
  const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  const keys = keysString.split(',').map(k => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    throw new Error('Nenhuma chave API do Gemini configurada.');
  }

  let lastError = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (text) {
        console.log(`Sucesso na geração utilizando a chave Gemini index ${i}`);
        return text;
      }
    } catch (err) {
      console.warn(`Aviso: Falha na chave Gemini index ${i}. Erro:`, err.message || err);
      lastError = err;
    }
  }

  throw new Error(`Falha crítica: Todas as chaves API do Gemini configuradas falharam. Último erro: ${lastError ? lastError.message : 'Desconhecido'}`);
}
