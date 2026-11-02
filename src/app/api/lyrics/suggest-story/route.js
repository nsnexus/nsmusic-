import { NextResponse } from 'next/server';
import { runTextCompletion } from '@/lib/gemini';

export const runtime = 'edge';

function getWarmFallbackStory({ honoreeName, relationship, occasion }) {
  const name = honoreeName?.trim() || 'você';
  const rel = (relationship || '').toLowerCase();
  const occ = (occasion || '').toLowerCase();

  if (rel.includes('mãe') || rel.includes('mae')) {
    return `Mãe, desde pequeno o seu colo sempre foi meu porto seguro. Lembro com tanto carinho de cada café passado e do seu cuidado incansável. Essa canção é para te agradecer por ser a mulher mais forte que conheço e a melhor mãe do mundo.`;
  }
  if (rel.includes('pai')) {
    return `Pai, você é meu maior exemplo de honra, trabalho duro e sabedoria. Guardo com muito orgulho cada ensinamento e cada conselho seu. Essa música é para celebrar a sua vida e te dizer o quanto tenho orgulho de ser seu filho.`;
  }
  if (rel.includes('namorad') || rel.includes('espos') || rel.includes('marido') || rel.includes('casal') || occ.includes('amor')) {
    return `Desde que ${name} entrou na minha vida, tudo ganhou mais sentido e cor. Amo nossas risadas à toa, nossos planos juntos e a cumplicidade de cada dia. Essa música celebra o nosso amor e a certeza de que caminhar ao seu lado é a melhor escolha.`;
  }
  if (rel.includes('filh')) {
    return `Ver ${name} crescer é o maior milagre e privilégio da minha vida. Cada sorriso e cada conquista sua me enchem de alegria. Quero que essa canção guarde todo o meu amor e te lembre que estarei sempre aqui para você.`;
  }
  if (rel.includes('amig')) {
    return `Amizade como a nossa é rara e preciosa. Tantas histórias compartilhadas, momentos difíceis superados juntos e gargalhadas que ficam na memória. Essa canção celebra a nossa parceria verdadeira que não tem preço.`;
  }
  if (rel.includes('irmã') || rel.includes('irmao') || rel.includes('irm')) {
    return `Crescer ao lado de ${name} fez da minha infância e da minha vida algo especial. Entre cumplicidades e risadas, sei que sempre posso contar com você. Essa música celebra a nossa irmandade para sempre.`;
  }
  if (rel.includes('vó') || rel.includes('vo') || rel.includes('avô') || rel.includes('avo')) {
    return `Sua casa sempre teve cheiro de afeto e aconchego. Cada história contada e cada bênção sua marcaram meu coração para sempre. Essa canção é uma homenagem repleta de amor e gratidão por tudo o que você é.`;
  }

  return `Quero homenagear ${name} e eternizar o quanto essa presença ilumina os meus dias. Uma história repleta de momentos inesquecíveis, risadas sinceras e um carinho que palavras comuns não conseguem expressar. Essa canção é uma declaração do fundo do coração.`;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { honoreeName, customerName, relationship, occasion } = body;

    const systemPrompt = `Você é um redator e letrista musical sensível e talentoso do estúdio NS Music.
Sua missão é ajudar o cliente a contar a história dele para virar uma canção personalizada emocionante.
REGRA ABSOLUTA DE SAÍDA: Retorne APENAS o parágrafo da história em primeira pessoa (entre 180 e 280 caracteres). NUNCA adicione saudações, introduções, títulos, aspas ou observações explicativas.
O texto deve ser caloroso, sincero, autêntico e falar diretamente de momentos marcantes, sentimentos sinceros ou gratidão profunda pela pessoa homenageada.`;

    const userPrompt = `Contexto da homenagem:
- Nome de quem vai receber: ${honoreeName?.trim() || 'alguém muito especial'}
- Relação: ${relationship?.trim() || 'especial'}
- Ocasião: ${occasion?.trim() || 'Homenagem'}
- Quem dedica: ${customerName?.trim() || 'eu'}

Escreva um parágrafo emocionante em 1ª pessoa, sincero e tocante, para ser usado como a história real dessa homenagem musical.`;

    try {
      const suggestion = await runTextCompletion(systemPrompt, userPrompt);
      if (suggestion && suggestion.length >= 40) {
        return NextResponse.json({ suggestion });
      }
    } catch (aiErr) {
      console.warn('[suggest-story] Falha na IA, usando gerador afetivo de fallback:', aiErr.message || aiErr);
    }

    // Fallback caloroso e personalizado caso as APIs de IA estejam temporariamente indisponíveis
    const fallback = getWarmFallbackStory({ honoreeName, relationship, occasion });
    return NextResponse.json({ suggestion: fallback });
  } catch (err) {
    console.error('[suggest-story] Erro na rota:', err);
    return NextResponse.json(
      { error: 'Não foi possível gerar a sugestão no momento.' },
      { status: 500 }
    );
  }
}

