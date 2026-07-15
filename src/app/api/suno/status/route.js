import { NextResponse } from 'next/server';
import { getValidToken } from '@/lib/sunoToken';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: "IDs não informados." }, { status: 400 });
    }

    const cookieStr = process.env.SUNO_COOKIE || '';
    const token = await getValidToken(cookieStr);

    // Call Suno direct API for status!
    const response = await fetch(`https://studio-api.prod.suno.com/api/feed/?ids=${ids}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Suno direto (suno.com) retornou erro de status: ${errText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao buscar status direto do Suno:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
