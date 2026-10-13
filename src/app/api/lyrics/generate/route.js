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
      customerName,
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

    const sender = (customerName || '').trim() || 'Quem dedica a música';
    const recipient = (honoreeName || '').trim() || 'Pessoa homenageada';

    const prompt = `Você é um compositor e letrista profissional premiado de música brasileira.
Você deve compor uma letra de música personalizada, profundamente tocante, autêntica e inesquecível.
Use as informações reais fornecidas pelo cliente abaixo para criar versos ricos em detalhes reais, evitando clichês, frases genéricas ou estruturas infantis.

Contexto da Homenagem:
- Quem está prestando a homenagem / dedicando a música: ${sender}
- Quem está recebendo a homenagem: ${recipient}
- Relação: ${relationship || 'Especial'}
- Ocasião: ${occasion || 'Homenagem'}
- História real contada: ${story}
${importantMoments ? `- Momentos marcantes: ${importantMoments}` : ''}
- Estilo musical: ${musicStyle || 'Acústico'}
- Clima / Emoção: ${musicMood || 'Emocionante'}
- Tipo de voz na produção: ${voiceType || 'padrão'}

Diretrizes Obrigatórias de Composição:
1. PERSPECTIVA E NARRATIVA:
   - A letra é uma declaração/homenagem cantada sob a perspectiva de ${sender} PARA ${recipient}.
   - ${sender} admira, celebra ou declara seu sentimento por ${recipient}.
   - Se a voz for Dueto: as vozes devem cantar em harmonia ou diálogo poético, mas NUNCA faça ${recipient} cantar elogiando ou exaltando a si mesmo(a). Por exemplo, se ${recipient} é advogada, a letra expressa o orgulho de quem dedica pela carreira dela, nunca o homenageado se gabando de si mesmo.
2. INTEGRAÇÃO DA HISTÓRIA REAL:
   - Cada detalhe da História (${story}) deve ser o coração da letra.
   - Mesmo que a história tenha sido escrita de forma concisa ou em tópicos, extraia a essência, as memórias e o significado desses acontecimentos, transformando-os em poesia tocante.
   - Evite preencher a música com estrofes genéricas e vazias. Cada verso deve soar feito sob medida para a vida dessas duas pessoas.
3. FORMATAÇÃO LIMPA PARA O MOTOR DE ÁUDIO (SUNO AI):
   - É ESTRITAMENTE PROIBIDO incluir anotações de fala entre parênteses como "(Voz masculina)", "(Voz feminina)", "(Juntos)" ou "(Cantor 1)" no meio das estrofes, pois o motor de áudio Suno canta essas palavras literalmente na gravação.
   - Utilize EXCLUSIVAMENTE os cabeçalhos de seção em colchetes indicados abaixo.
4. ELEMENTOS OBRIGATÓRIOS:
   ${requiredPhrase ? `- Incorpore a frase obrigatória "${requiredPhrase}" exatamente no refrão ou refrão final.` : ''}
   ${requiredNames ? `- Incorpore naturalmente os nomes "${requiredNames}" na letra.` : ''}
5. O tom deve refletir o clima "${musicMood}" e o ritmo "${musicStyle}".
6. RETORNE EXCLUSIVAMENTE O TEXTO DA LETRA DA MÚSICA. É ESTRITAMENTE PROIBIDO incluir saudações, explicações, observações ou comentários de cortesia no final ou início, pois o texto será enviado diretamente para o motor de gravação de áudio.

Estrutura da Letra (utilize exatamente estes cabeçalhos em colchetes):
[Verso 1]
[Pré-Refrão]
[Refrão]
[Verso 2]
[Ponte]
[Refrão Final]`;

    const lyrics = await runGeminiWithFailover(prompt);

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Erro na geração da letra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
