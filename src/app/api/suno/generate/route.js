import { NextResponse } from 'next/server';
import { saveTask } from '@/lib/db';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { prompt, tags, orderId } = await req.json();

    const apiKey = '76daad0e2a577569aaaa67715aec3c87'; // Kie.ai API Key

    // Determinar a URL do webhook dinamicamente
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    
    // ATENÇÃO: Se estiver testando localmente (localhost), a Kie.ai não conseguirá acessar este webhook!
    // Nesse caso, o status vai ficar travado em 'PROCESSING'. 
    const callbackUrl = `${protocol}://${host}/api/suno/webhook`;

    const response = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: prompt,
        tags: tags,
        title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`,
        model: "suno-v3.5",
        customMode: true,
        instrumental: false,
        callback_url: callbackUrl
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kie.ai retornou erro: ${errorText}`);
    }

    const data = await response.json();
    
    // A Kie.ai retorna um taskId (pode vir como task_id ou id, dependendo do formato exato deles)
    const taskId = data.task_id || data.id || (data.data && data.data.task_id);
    
    if (!taskId) {
        throw new Error(`Kie.ai não retornou um taskId válido: ${JSON.stringify(data)}`);
    }

    // Salva o task inicial como PROCESSING no nosso "Banco de Dados" local
    saveTask(taskId, 'PROCESSING');

    // Retorna o taskId pro frontend saber qual pedido ele deve ficar checando
    return NextResponse.json({ taskId, status: 'PROCESSING' });
  } catch (error) {
    console.error("Erro na geração via Kie.ai:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
