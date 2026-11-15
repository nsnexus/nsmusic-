import { runGeminiWithFailover } from '@/lib/gemini';
import { validarLetra } from '@/lib/letraValidacao';
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

    const geminiKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    const openAiKey = process.env.OPENAI_API_KEY || '';
    if (!geminiKeys && !openAiKey) {
      return NextResponse.json({
        error: "Nenhuma chave de IA (GEMINI_API_KEYS ou OPENAI_API_KEY) está configurada no servidor."
      }, { status: 500 });
    }

    const sender = (customerName || '').trim() || 'Quem dedica a música';
    const recipient = (honoreeName || '').trim() || 'Pessoa homenageada';
    const rel = (relationship || '').trim() || 'Especial';

    const prompt = `Você é um compositor e letrista profissional premiado de música brasileira.
Você deve compor uma letra de música personalizada, profundamente tocante, autêntica e inesquecível.
Use as informações reais fornecidas pelo cliente abaixo para criar versos ricos em detalhes reais, evitando clichês, frases genéricas ou estruturas infantis.

Contexto da Homenagem:
- Quem está prestando a homenagem / dedicando a música: ${sender}
- Quem está recebendo a homenagem: ${recipient}
- Relação / Vínculo entre eles: ${rel}
- Ocasião: ${occasion || 'Homenagem'}
- História real contada: ${story}
${importantMoments ? `- Momentos marcantes: ${importantMoments}` : ''}
- Estilo musical: ${musicStyle || 'Acústico'}
- Clima / Emoção: ${musicMood || 'Emocionante'}
- Tipo de voz na produção: ${voiceType || 'padrão'}

Diretrizes Obrigatórias de Composição:
1. DIRETRIZ CRÍTICA DE RELAÇÃO E VÍNCULO (NUNCA CONFUNDA O TIPO DE AMOR):
   - Relação declarada: "${rel}".
   - RELAÇÕES FAMILIARES (Mãe, Pai, Filho, Filha, Vó, Vô, Irmão, Irmã, Tia, Tio, Primo, Padrinho, Madrinha, etc.):
     * O amor expressado DEVE SER ESTRITAMENTE familiar, filial, paternal/maternal ou fraterno.
     * É TERMINANTEMENTE PROIBIDO qualquer conotação romântica, sensual, de casal ou de marido e mulher.
     * NUNCA use termos de relacionamento de casal (como "minha mulher", "meu homem", "namorada(o)", "nosso amor de casal", "beijos na boca", "nossa cama", "o destino nos uniu como parceiros amorosos", etc.).
     * Se for para MÃE: a letra retrata gratidão profunda pelo ventre, colo protetor, ensinamentos, noites de cuidado, a força de mãe e o amor incondicional de filho(a). ${sender} canta como FILHO(A), NUNCA como companheiro amoroso!
     * Se for para PAI: a letra retrata honra, exemplo paterno, sabedoria, conselhos de vida e o abraço seguro de filho(a).
     * Se for para FILHO(A): amor incondicional de pai/mãe, a emoção de vê-lo(a) crescer e a bênção de proteção.
     * Se for para IRMÃO/IRMÃ: parceria de vida, infância compartilhada, cumplicidade de sangue e amizade verdadeira.
   - RELAÇÕES ROMÂNTICAS DE CASAL (Esposa, Marido, Namorado, Namorada, Noivo, Noiva):
     * O tom deve ser de paixão, cumplicidade amorosa de casal, história do relacionamento e planos de vida a dois.
   - AMIZADE / PROFISSIONAL (Amigo, Amiga, Chefe, Colega):
     * O tom deve ser de companheirismo, lealdade, momentos inesquecíveis, risadas compartilhadas e respeito mútuo. NUNCA romântico.
   - AUTO-HOMENAGEM ("Eu mesmo"):
     * A canção é sobre autoamor, superação pessoal, resiliência, fé na própria história e orgulho das conquistas.

2. PERSPECTIVA E NARRATIVA:
   - A letra é uma declaração cantada sob a perspectiva de ${sender} PARA ${recipient}.
   - Respeite rigorosamente a relação ("${rel}") na perspectiva vocal (ex: se for mãe, o cantor canta com sentimento de filho/filha).
   - ${sender} admira, celebra ou declara seu sentimento sincero por ${recipient}.
   - Se a voz for Dueto: as vozes devem cantar em harmonia ou diálogo poético, mas NUNCA faça ${recipient} cantar elogiando ou exaltando a si mesmo(a). Por exemplo, se ${recipient} é advogada, a letra expressa o orgulho de quem dedica pela carreira dela, nunca o homenageado se gabando de si mesmo.

3. INTEGRAÇÃO DA HISTÓRIA REAL:
   - Cada detalhe da História (${story}) deve ser o coração da letra.
   - Mesmo que a história tenha sido escrita de forma concisa ou em tópicos, extraia a essência, as memórias e o significado desses acontecimentos, transformando-os em poesia tocante.
   - Evite preencher a música com estrofes genéricas e vazias. Cada verso deve soar feito sob medida para a vida dessas duas pessoas.

4. FORMATAÇÃO LIMPA PARA O MOTOR DE ÁUDIO (SUNO AI):
   - É ESTRITAMENTE PROIBIDO incluir anotações de fala entre parênteses como "(Voz masculina)", "(Voz feminina)", "(Juntos)" ou "(Cantor 1)" no meio das estrofes, pois o motor de áudio Suno canta essas palavras literalmente na gravação.
   - Utilize EXCLUSIVAMENTE os cabeçalhos de seção em colchetes indicados abaixo.

5. ELEMENTOS OBRIGATÓRIOS:
   ${requiredPhrase ? `- Incorpore a frase obrigatória "${requiredPhrase}" exatamente no refrão ou refrão final.` : ''}
   ${requiredNames ? `- Incorpore naturalmente os nomes "${requiredNames}" na letra.` : ''}

6. USO DO NOME E FIDELIDADE AOS FATOS (REGRAS QUE JÁ FORAM ERRADAS ANTES):
   - O nome "${recipient}" DEVE aparecer escrito na letra, no refrão e em pelo menos mais um verso. NUNCA troque o nome só pelo parentesco ("meu filho", "minha mãe"). O parentesco pode acompanhar o nome (ex: "meu filho ${recipient}"), mas o nome tem que estar lá.
   - Use SOMENTE fatos presentes na história e nos momentos informados. É proibido inventar nomes, idades, profissões, cidades, datas ou acontecimentos.
   - Se a história citar outras pessoas (irmãos, pais, cônjuge), use os nomes exatamente como escritos.
   - Conserve o gênero gramatical correto para ${recipient} e para ${sender} conforme a relação ("${rel}") e a história.

7. O tom deve refletir o clima "${musicMood}" e o ritmo "${musicStyle}".

8. RETORNE EXCLUSIVAMENTE O TEXTO DA LETRA DA MÚSICA. É ESTRITAMENTE PROIBIDO incluir saudações, explicações, observações ou comentários de cortesia no final ou início, pois o texto será enviado diretamente para o motor de gravação de áudio.

Estrutura da Letra (utilize exatamente estes cabeçalhos em colchetes):
[Verso 1]
[Pré-Refrão]
[Refrão]
[Verso 2]
[Ponte]
[Refrão Final]`;

    let lyrics = await runGeminiWithFailover(prompt);

    // Conferência objetiva antes de entregar ao cliente: se faltar o nome do homenageado, a frase
    // obrigatória etc., pede UMA correção à IA mostrando a letra e os problemas. Se ainda assim
    // houver problema, entrega a melhor versão (e avisa nos logs) em vez de travar o cliente.
    const checar = (texto) => validarLetra({ lyrics: texto, honoreeName: recipient, requiredNames, requiredPhrase });
    let problemas = checar(lyrics);
    if (problemas.length > 0) {
      try {
        const correcao = `${prompt}\n\nA versão abaixo ficou com problemas. Reescreva a letra COMPLETA corrigindo TODOS eles, mantendo o que já está bom.\n\nPROBLEMAS A CORRIGIR:\n- ${problemas.join('\n- ')}\n\nVERSÃO ATUAL:\n${lyrics}`;
        const corrigida = await runGeminiWithFailover(correcao);
        const novosProblemas = checar(corrigida);
        if (novosProblemas.length <= problemas.length) {
          lyrics = corrigida;
          problemas = novosProblemas;
        }
      } catch (e) {
        console.warn('[lyrics/generate] Falha na correção automática da letra:', e?.message);
      }
      if (problemas.length > 0) console.warn('[lyrics/generate] Letra entregue com pendências:', problemas.length);
    }

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Erro na geração da letra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
