import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt, tags, orderId } = await req.json();

    const cookieStr = process.env.SUNO_COOKIE || '';

    if (!cookieStr) {
      return NextResponse.json({ 
        error: "SUNO_COOKIE não configurado." 
      }, { status: 400 });
    }

    // O Playwright (no Render) dá crash se enviarmos cookies com espaços.
    // E o Clerk (sistema de login) precisa de quase todos os cookies originais para não deslogar o robô.
    // Solução: Vamos enviar TUDO, exceto os cookies do Optanon que contêm espaços e causam o crash!
    const cleanCookie = cookieStr
      .split(';')
      .map(c => c.trim())
      .filter(c => !c.startsWith('Optanon') && !c.startsWith('_uetsid') && !c.startsWith('_uetvid'))
      .join('; ');

    // Call our private Render proxy!
    const response = await fetch('https://suno-api-9jk6.onrender.com/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cleanCookie
      },
      body: JSON.stringify({
        prompt: prompt,
        tags: tags,
        title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`,
        make_instrumental: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Suno Proxy (Render) retornou erro: ${errorText}`);
    }

    const data = await response.json();
    // suno-api returns { data: [ {id, ...}, {id, ...} ] } or similar.
    // wait, I need to make sure I return tracks: [] properly.
    return NextResponse.json({ tracks: data || [] });
  } catch (error) {
    console.error("Erro na geração via Proxy Render:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
