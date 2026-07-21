import { NextResponse } from 'next/server';
import { saveTask } from '@/lib/db';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt, tags, orderId } = await req.json();

    const apiKey = '76daad0e2a577569aaaa67715aec3c87'; // Kie.ai API Key

    // Garante a URL do webhook no domínio oficial de produção
    const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
    const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;
    const callbackUrl = `${baseUrl}/api/suno/webhook`;

    const response = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: prompt,
        customMode: true,
        instrumental: false,
        model: "V4_5ALL",
        style: tags,
        title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`,
        callBackUrl: callbackUrl
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kie.ai retornou erro: ${errorText}`);
    }

    const data = await response.json();
    
    // A Kie.ai retorna um taskId (pode vir como task_id ou id, dependendo do formato exato deles)
    const taskId = data.task_id || data.id || (data.data && (data.data.taskId || data.data.task_id));
    
    if (!taskId) {
        throw new Error(`Kie.ai não retornou um taskId válido: ${JSON.stringify(data)}`);
    }

    // Salva o task inicial como PROCESSING no nosso "Banco de Dados" local
    await saveTask(taskId, 'PROCESSING', null, orderId);

    // Retorna o taskId pro frontend saber qual pedido ele deve ficar checando
    return NextResponse.json({ taskId, status: 'PROCESSING' });
  } catch (error) {
    console.error("Erro na geração via Kie.ai:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
