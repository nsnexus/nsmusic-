import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: "IDs não informados." }, { status: 400 });
    }

    const sunoApiUrl = process.env.SUNO_API_URL || process.env.NEXT_PUBLIC_SUNO_API_URL;
    if (!sunoApiUrl) {
      return NextResponse.json({ error: "SUNO_API_URL não configurada." }, { status: 400 });
    }

    const response = await fetch(`${sunoApiUrl.replace(/\/$/, '')}/api/get?ids=${ids}`);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao buscar status do Suno:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
