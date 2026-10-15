import { runGeminiWithFailover } from '@/lib/gemini';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const body = await req.json();
    const { currentLyrics, comment, formData } = body;
    const rel = (formData?.relationship || '').trim() || 'Especial';

    const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    if (!keysString) {
      console.warn("GEMINI_API_KEYS não configurada. Usando fallback de ajuste.");
      return NextResponse.json({
        lyrics: currentLyrics
      });
    }

    const prompt = `Você é um compositor profissional especializado em músicas personalizadas.
Sua tarefa é AJUSTAR a letra de uma música que já foi criada, com base nos comentários de revisão do cliente.

Letra Atual:
\"\"\"
${currentLyrics}
\"\"\"

Comentário de ajuste do cliente:
\"${comment}\"

Regras estritas:
1. Preserve o máximo da letra original que for possível, focando as alterações apenas nos trechos relacionados ao comentário do cliente.
2. Mantenha os mesmos cabeçalhos de estrutura: [Verso 1], [Pré-Refrão], [Refrão], [Verso 2], [Ponte], [Refrão Final].
3. Não cite artistas ou copie letras de terceiros.
4. Mantenha o estilo e tom geral da música.
5. RESPEITO AO VÍNCULO ("${rel}"): Se a relação for familiar (ex: Mãe, Pai, Filho(a), Irmão/Irmã, etc.), é EXPRESSAMENTE PROIBIDO incluir conotações românticas, termos de casal ou insinuações de marido e mulher. O amor deve ser estritamente filial/familiar.
6. RETORNE EXCLUSIVAMENTE O TEXTO DA LETRA DA MÚSICA. É ESTRITAMENTE PROIBIDO incluir saudações, explicações, observações ou comentários de cortesia (como "As alterações foram feitas...", "Espero que goste", etc.), pois o seu texto será enviado diretamente para a gravação da voz.

Dados do pedido original para referência:
- Homenageado: ${formData?.honoreeName || 'Amigo'}
- Dedicado por: ${formData?.customerName || 'Quem dedica'}
- Relação: ${rel}
- Ocasião: ${formData?.occasion || 'Geral'}
- Qualidades: ${formData?.qualities || ''}`;

    const lyrics = await runGeminiWithFailover(prompt);

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Erro no ajuste da letra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
