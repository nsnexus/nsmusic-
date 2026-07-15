import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt, tags, orderId } = await req.json();

    const cookieStr = process.env.SUNO_COOKIE || '';
    const token = cookieStr.match(/__session=([^;]+)/)?.[1];

    if (!token) {
      return NextResponse.json({ 
        error: "O Token de sessão (__session) não foi encontrado na variável SUNO_COOKIE." 
      }, { status: 400 });
    }

    // Call Suno direct API, completely bypassing the Vercel suno-api wrapper!
    const response = await fetch('https://studio-api.suno.ai/api/generate/v2/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        tags: tags,
        title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`,
        make_instrumental: false,
        mv: "chirp-v4-5"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Suno direto retornou erro: ${errorText}`);
    }

    const data = await response.json();
    // Suno returns { clips: [ ... ] }
    return NextResponse.json({ tracks: data.clips || [] });
  } catch (error) {
    console.error("Erro na geração direta do Suno:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
