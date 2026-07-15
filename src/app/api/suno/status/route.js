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
    const token = cookieStr.match(/__session=([^;]+)/)?.[1];

    if (!token) {
      return NextResponse.json({ error: "Token __session não encontrado no SUNO_COOKIE." }, { status: 400 });
    }

    // Call Suno direct API for status!
    const response = await fetch(`https://studio-api.suno.ai/api/feed/?ids=${ids}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Suno direto retornou erro de status: ${errText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao buscar status direto do Suno:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
