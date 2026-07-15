import { runGeminiWithFailover } from '@/lib/gemini';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Generates highly custom and dynamic fallback lyrics using inputs to avoid generic templates
export async function POST(req) {
  try {
    const body = await req.json();
    const {
      occasion,
      honoreeName,
      relationship,
      story,
      importantMoments,
      requiredNames,
      requiredPhrase,
      musicStyle,
      musicMood,
      voiceType,
    } = body;

    const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    if (!keysString) {
      return NextResponse.json({
        error: "Nenhuma chave GEMINI_API_KEYS está configurada no servidor."
      }, { status: 500 });
    }

    const prompt = `Você é um compositor e letrista profissional premiado de música brasileira.
Você deve compor uma letra de música personalizada, profundamente tocante, autêntica e inesquecível.
Use as informações reais fornecidas pelo cliente abaixo para criar versos ricos em detalhes reais, evitando clichês, frases genéricas ou estruturas infantis.

Diretrizes de Composição:
1. Integre detalhes da História Principal (${story}) e dos Momentos Marcantes (${importantMoments}) diretamente nos versos, de forma poética e natural.
2. O tom deve refletir o clima/emoção "${musicMood}" e o estilo "${musicStyle}".
3. Se fornecido, incorpore a frase obrigatória "${requiredPhrase}" exatamente no refrão ou refrão final.
4. Se fornecido, incorpore os nomes "${requiredNames}" na letra naturalmente.
5. A letra deve soar natural, fluida e com rimas sofisticadas e ricas.

Estrutura da Letra (utilize exatamente estes cabeçalhos em colchetes):
[Verso 1]
[Pré-Refrão]
[Refrão]
[Verso 2]
[Ponte]
[Refrão Final]

Dados da Solicitação:
- Ocasião: ${occasion}
- Homenageado: ${honoreeName}
- Relação: ${relationship}
- História: ${story}
- Momentos especiais: ${importantMoments}
- Estilo: ${musicStyle}
- Clima/Humor: ${musicMood}
- Tipo de Voz: ${voiceType}`;

    const lyrics = await runGeminiWithFailover(prompt);

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Erro na geração da letra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
