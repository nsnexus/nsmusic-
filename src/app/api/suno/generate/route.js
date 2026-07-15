import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt, tags, orderId } = await req.json();

    const sunoApiUrl = process.env.SUNO_API_URL || process.env.NEXT_PUBLIC_SUNO_API_URL;
    if (!sunoApiUrl) {
      return NextResponse.json({ 
        error: "A URL da API do Suno (SUNO_API_URL) não foi configurada nas variáveis de ambiente." 
      }, { status: 400 });
    }

    // Call Suno-API with wait_audio: false to prevent Vercel/NextJS Edge timeout during generation
    const response = await fetch(`${sunoApiUrl.replace(/\/$/, '')}/api/custom_generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        tags: tags,
        title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`,
        make_instrumental: false,
        wait_audio: false,
        model: "chirp-v3-0",
        mv: "chirp-v3-0"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API do Suno: ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json({ tracks: data });
  } catch (error) {
    console.error("Erro na geração do Suno:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
