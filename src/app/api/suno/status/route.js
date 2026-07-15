import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: "IDs não informados." }, { status: 400 });
    }

    const cookieStr = process.env.SUNO_COOKIE || '';
    if (!cookieStr) {
      return NextResponse.json({ error: "SUNO_COOKIE não configurado." }, { status: 400 });
    }

    // Call Suno direct API for status via Render!
    const response = await fetch(`https://suno-api-9jk6.onrender.com/api/get?ids=${ids}`, {
      headers: {
        'Cookie': cookieStr
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Suno Proxy (Render) retornou erro de status: ${errText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao buscar status via Proxy Render:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
