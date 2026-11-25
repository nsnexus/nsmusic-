import { runGeminiWithFailover } from '@/lib/gemini';
import { NextResponse } from 'next/server';
import { montarPromptDaLetra } from '@/lib/letraPrompt';

export const runtime = 'edge';

// Generates highly custom and dynamic fallback lyrics using inputs to avoid generic templates
export async function POST(req) {
  try {
    const body = await req.json();
    const geminiKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    const openAiKey = process.env.OPENAI_API_KEY || '';
    if (!geminiKeys && !openAiKey) {
      return NextResponse.json({
        error: "Nenhuma chave de IA (GEMINI_API_KEYS ou OPENAI_API_KEY) está configurada no servidor."
      }, { status: 500 });
    }

    const prompt = montarPromptDaLetra(body);

    const lyrics = await runGeminiWithFailover(prompt);

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Erro na geração da letra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
