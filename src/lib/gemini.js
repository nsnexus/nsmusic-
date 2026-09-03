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
    // Até 2 tentativas extras para erros transitórios (timeout, falha de rede, 5xx, 429). Erros
    // definitivos (401 chave inválida, 400 payload ruim) não são reexecutados, pois repetir não
    // resolveria. Cada tentativa cria seu PRÓPRIO AbortSignal.timeout — reaproveitar o mesmo sinal
    // entre tentativas faria as tentativas seguintes abortarem na hora, já que o relógio do sinal
    // conta a partir da criação, não de cada chamada (mesma armadilha a evitar caso este padrão
    // seja copiado em outro lugar).
    const maxOpenAiAttempts = 3;
    for (let attempt = 1; attempt <= maxOpenAiAttempts; attempt++) {
      try {
        console.log(`Iniciando composição via OpenAI ChatGPT (gpt-4o-mini), tentativa ${attempt}/${maxOpenAiAttempts}...`);
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
          lastError = new Error('OpenAI respondeu sem conteúdo utilizável.');
          break; // resposta ok mas vazia não é transitório — não adianta repetir
        }

        const errText = await openAiRes.text().catch(() => '');
        lastError = new Error(`OpenAI error ${openAiRes.status}: ${errText}`);
        // Só erros transitórios (5xx, 429 rate limit) valem retry; 4xx definitivo (ex: 401, 400)
        // não muda tentando de novo.
        if (openAiRes.status < 500 && openAiRes.status !== 429) {
          console.warn("Aviso: OpenAI retornou erro definitivo, sem retry:", lastError.message);
          break;
        }
        console.warn(`Aviso: OpenAI retornou erro transitório (tentativa ${attempt}/${maxOpenAiAttempts}):`, lastError.message);
      } catch (openAiErr) {
        // Timeout (AbortError) ou falha de rede (TypeError) são transitórios — vale tentar de novo.
        lastError = openAiErr;
        console.warn(`Aviso: Exceção ao conectar à OpenAI (tentativa ${attempt}/${maxOpenAiAttempts}):`, openAiErr.message || openAiErr);
      }

      if (attempt < maxOpenAiAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
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
          // O SDK do Gemini não expõe um timeout nativo (nem aceita AbortSignal aqui) — sem isso,
          // uma chamada lenta travava a função inteira até o Edge Runtime matar a requisição sozinho,
          // sem sequer chegar a tentar o próximo modelo/chave de fallback abaixo. Promise.race impõe
          // um limite de tempo por tentativa para que o loop sempre continue.
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout ao chamar Gemini (${modelName})`)), 20000)
          );
          const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
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

/**
 * Executa um prompt pedindo resposta em JSON estruturado — usado pelo agente conversacional do
 * WhatsApp (src/lib/whatsappAgent.js) pra extrair dados da conversa + gerar a resposta em persona
 * na mesma chamada. Mesmo padrão de failover do runGeminiWithFailover (OpenAI primário, Gemini com
 * rotação de chaves como fallback), mas sem o systemInstruction/sanitizeLyrics específicos de letra.
 *
 * @param {string} systemPrompt Instruções fixas (persona, formato do JSON esperado)
 * @param {string} userPrompt Contexto variável (histórico, campos já conhecidos, mensagem atual)
 * @param {object} env Variáveis de ambiente do Edge Runtime (getRequestContext().env)
 * @returns {Promise<object>} Objeto já parseado do JSON retornado pela IA
 */
export async function runJsonCompletion(systemPrompt, userPrompt, env = {}) {
  let lastError = null;

  const openAiKey = (env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (openAiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          // gpt-4o (não o mini) só nesta função — é a conversa AO VIVO com o cliente no WhatsApp,
          // onde o tom decide a venda. Com gpt-4o-mini a persona saía visivelmente de call center
          // ("Que fofo!", "Ótima escolha!"), empilhava 3 perguntas por mensagem e ignorava a regra
          // de quando parar de perguntar (teste real 03/09/2026, ver histórico da sessão). A
          // composição da letra (runGeminiWithFailover, acima) segue no mini: lá o volume de texto
          // é maior e a diferença de qualidade não se paga.
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.8,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return JSON.parse(text);
        lastError = new Error('OpenAI respondeu sem conteúdo utilizável.');
      } else {
        const errText = await res.text().catch(() => '');
        lastError = new Error(`OpenAI error ${res.status}: ${errText}`);
      }
    } catch (err) {
      lastError = err;
      console.warn('[gemini] Falha OpenAI (JSON):', err.message || err);
    }
  }

  const keysString = env.GEMINI_API_KEYS || process.env.GEMINI_API_KEYS || env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  const keys = keysString.split(',').map((k) => k.trim()).filter(Boolean);
  const validModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

  for (const key of keys) {
    for (const modelName of validModels) {
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: { responseMimeType: 'application/json' },
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ao chamar Gemini (${modelName})`)), 15000)
        );
        const result = await Promise.race([model.generateContent(userPrompt), timeoutPromise]);
        const text = result.response.text();
        if (text) return JSON.parse(text);
      } catch (err) {
        lastError = err;
        console.warn(`[gemini] Falha Gemini JSON (modelo ${modelName}):`, err.message || err);
      }
    }
  }

  throw new Error(`Falha ao gerar resposta JSON. Último erro: ${lastError ? lastError.message : 'nenhum provedor de IA configurado'}`);
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
