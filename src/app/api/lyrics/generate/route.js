import { runGeminiWithFailover } from '@/lib/gemini';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Generates highly custom and dynamic fallback lyrics using inputs to avoid generic templates
function generateRichFallbackLyrics(data) {
  const name = data.honoreeName || 'Você';
  const rel = data.relationship || 'pessoa amada';
  const occ = data.occasion || 'momento especial';
  const phrase = data.requiredPhrase || 'para todo o sempre';
  const storyInfo = data.story || '';
  const style = data.musicStyle || 'Acústico';
  const mood = data.musicMood || 'Emocionante';

  // Extract keywords from the story to inject them dynamically
  const words = storyInfo.split(/\s+/).filter(w => w.length > 4).slice(0, 10);
  const storySnippet = words.length > 0 
    ? `Lembro dos detalhes, de cada passo e do nosso jeito de ${words.slice(0, 3).join(' ')}`
    : `Lembro do seu abraço quente e do brilho no seu olhar`;

  const secondSnippet = words.length > 3
    ? `Construímos pontes com carinho e com ${words.slice(3, 6).join(', ')}`
    : `Cada dia ao seu lado é uma nova chance de recomeçar`;

  return `[Verso 1]
No compasso do meu peito, fiz um canto pra te dar
Com você, ${name}, aprendi o que é sonhar
Minha alma se alegra só de te ver sorrir
Nesta linda ocasião de ${occ}, vim aqui me declarar.

[Pré-Refrão]
Como seu(sua) ${rel}, meu coração bate forte e veloz
E o universo silencia pra escutar nossa voz
${storySnippet}.

[Refrão]
${phrase},
Nossos passos desenham um destino de luz
Esse laço bonito que a vida nos traz e conduz
Nada vai nos separar, nosso som é canção.

[Verso 2]
No compasso desse ritmo de ${style} com tom ${mood}
Tudo ganha poesia, cada gesto fica bom
${secondSnippet}
Nossas almas se encontram sob a luz do mesmo sol.

[Ponte]
E se o vento soprar forte querendo nos afastar
Eu canto mais alto pra te fazer lembrar
Do quanto você me faz bem, do tamanho do meu querer.

[Refrão Final]
${phrase},
Nossos passos desenham um destino de luz
Esse laço bonito que a vida nos traz e conduz
Nada vai nos separar, nosso som é canção.`;
}

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
      console.warn("GEMINI_API_KEYS não configurada. Usando gerador fallback personalizado.");
      return NextResponse.json({
        lyrics: generateRichFallbackLyrics(body)
      });
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

    let lyrics;
    try {
      lyrics = await runGeminiWithFailover(prompt);
    } catch (apiError) {
      console.error("Falha ao chamar API do Gemini. Usando fallback rico:", apiError);
      lyrics = generateRichFallbackLyrics(body);
    }

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Erro na geração da letra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
