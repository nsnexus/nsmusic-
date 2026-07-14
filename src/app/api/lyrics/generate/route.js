import { runGeminiWithFailover } from '@/lib/gemini';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      occasion,
      honoreeName,
      relationship,
      story,
      importantMoments,
      qualities,
      requiredPhrase,
      forbiddenSubjects,
      musicStyle,
      voiceType,
      emotion,
    } = body;

    const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    if (!keysString) {
      console.warn("GEMINI_API_KEYS não configurada. Usando resposta fallback.");
      return NextResponse.json({
        lyrics: `[Verso 1]
No calor desse abraço eu encontrei meu lugar
Com o(a) ${honoreeName || 'homenageado'}, aprendi o que é amar
Desde o início, nossa história foi escrita com emoção
E hoje trago esse canto direto do coração.

[Pré-Refrão]
Cada sorriso seu ilumina meu caminho
Nunca mais me senti sozinho

[Refrão]
O tempo passa, mas a lembrança fica
Essa história que a vida nos ensina e simplifica
${requiredPhrase || 'Para sempre com você'},
Nossa trilha não tem fim, e nada nos afasta.

[Verso 2]
Lembro bem de cada detalhe, de cada risada no quintal
Dos momentos em que tudo parecia especial
Com as qualidades de ${qualities || 'carinho e afeto'}
Construímos nossa estrada, um destino reto.

[Ponte]
Nossa música ecoa no silêncio da noite
Um abraço forte que nos protege do vento

[Refrão Final]
O tempo passa, mas a lembrança fica
Essa história que a vida nos ensina e simplifica
${requiredPhrase || 'Para sempre com você'},
Nossa trilha não tem fim, e nada nos afasta.`
      });
    }

    const prompt = `Você é um compositor profissional especializado em músicas personalizadas e emocionais.

Crie uma letra original em português brasileiro utilizando somente as informações fornecidas pelo cliente abaixo.

Regras Estritas:
- Não invente fatos importantes que não foram fornecidos.
- Não copie músicas existentes.
- Não cite artistas.
- Não imite letras famosas.
- Utilize linguagem natural.
- Evite rimas forçadas ou infantis.
- Inclua o nome do homenageado naturalmente na letra.
- Inclua a frase obrigatória se fornecida.
- Evite absolutamente os assuntos proibidos indicados.
- Crie um refrão marcante e emocionante.
- Mantenha uma duração aproximada equivalente a 2:30 a 3:30 minutos de música.

Estrutura da Letra:
Use exatamente os cabeçalhos abaixo para estruturar a letra:
[Verso 1]
[Pré-Refrão]
[Refrão]
[Verso 2]
[Ponte]
[Refrão Final]

Dados fornecidos pelo cliente:
- Ocasião: ${occasion || 'Homenagem Geral'}
- Nome do Homenageado: ${honoreeName || 'Amigo(a)'}
- Relação: ${relationship || 'Especial'}
- História Principal: ${story || 'Uma história de carinho e parceria.'}
- Momentos Marcantes: ${importantMoments || 'Vários momentos vividos juntos.'}
- Qualidades: ${qualities || 'Generoso(a), inspirador(a)'}
- Frase Obrigatória: ${requiredPhrase || ''}
- Assuntos Proibidos (NÃO incluir): ${forbiddenSubjects || 'Nenhum'}
- Estilo Musical: ${musicStyle || 'Pop Acústico'}
- Tipo de Voz: ${voiceType || 'Qualquer'}
- Emoção Desejada: ${emotion || 'Emocionante'}`;

    const lyrics = await runGeminiWithFailover(prompt);

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Erro na geração da letra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
