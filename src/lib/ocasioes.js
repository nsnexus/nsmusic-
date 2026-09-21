// Páginas de ocasião — pedido 20/09/2026: "se uma pessoa pesquisar em uma IA uma plataforma para
// gerar música, eu corro o risco de ser relacionado?".
//
// A resposta honesta era "hoje não": buscador e LLM só citam o que conseguem ler, e o site tinha
// duas páginas indexáveis (home e /criar), ambas genéricas. Quem pergunta "música para o
// aniversário da minha mãe" não casa com uma home que fala de "música personalizada" em abstrato.
//
// Cada entrada aqui vira uma página estática própria, com H1, texto, FAQ e JSON-LD específicos da
// ocasião. É conteúdo de cauda longa: é o que o crawler indexa e o que o assistente cita.
//
// Regra do conteúdo: só fato verificável do produto (2 versões em MP3 HD, letra revisável antes do
// áudio, 2 a 3 minutos, Pix, sem cadastro). Nada de depoimento inventado nem promessa que o sistema
// não cumpre — resposta errada aqui vira cliente cobrando na entrega.

export const ocasioes = [
  {
    slug: 'musica-de-aniversario',
    // Casa com um id de src/app/criar/wizardOptions.js:occasions — o link do CTA leva o wizard já
    // sabendo a ocasião (ver src/app/criar/page.jsx, leitura de ?ocasiao=).
    ocasiaoWizard: 'Aniversário',
    titulo: 'Música de Aniversário Personalizada com IA',
    h1: 'Música de aniversário personalizada, feita com a história de quem faz anos',
    descricao:
      'Crie uma música de aniversário personalizada com o nome, a história e as manias de quem '
      + 'faz anos. A IA escreve a letra e entrega 2 versões em MP3 HD em cerca de 3 minutos, a '
      + 'partir de R$ 9,99.',
    palavrasChave: [
      'música de aniversário personalizada', 'música de parabéns personalizada',
      'presente de aniversário diferente', 'música com o nome da pessoa',
    ],
    intro: [
      'Parabéns pra você todo mundo canta. Uma música que cita o apelido, a mania, a viagem que '
      + 'vocês fizeram e a frase que só a sua família entende, só existe se alguém escrever. É isso '
      + 'que a NS Music faz: você conta a história de quem faz anos e recebe uma canção sobre ela.',
      'Serve para aniversário de mãe, pai, esposa, marido, filho, avó, amigo ou chefe. E para os '
      + 'aniversários redondos, 15, 30, 50, 60 anos, quando o presente precisa ser à altura da data.',
    ],
    bullets: [
      'A letra cita nome, apelido, datas e os momentos que você contar.',
      'Você lê a letra antes do áudio e ouve a prévia da música antes de pagar.',
      'Duas versões completas, com arranjos diferentes, para escolher qual tocar na festa.',
      'Pronta em cerca de 2 a 3 minutos, dá para fazer no mesmo dia da festa.',
    ],
    estilos: ['Sertanejo', 'Pop', 'Forró / Baião', 'Samba / Pagode', 'Infantil', 'Gospel / Adoração'],
    climaSugerido: 'Festiva, Alegre ou Emocionante',
    faq: [
      ['Dá para fazer a música no dia da festa?',
        'Dá. A letra e os áudios ficam prontos em cerca de 2 a 3 minutos depois que você envia a '
        + 'história, direto no site. Depois do pagamento por Pix o download em MP3 HD é liberado na '
        + 'hora e o link também vai para o seu WhatsApp.'],
      ['A música fala o nome do aniversariante?',
        'Fala. O nome, o apelido e os detalhes que você contar entram na letra, e você lê tudo '
        + 'antes de gerar o áudio. Se algum nome estiver errado, é só ajustar.'],
      ['Posso tocar essa música na festa?',
        'Pode. Você recebe os arquivos em MP3 HD e pode baixar quantas vezes quiser, tocar na caixa '
        + 'de som, colocar em vídeo da família ou mandar no grupo.'],
      ['Serve para aniversário infantil?',
        'Serve. Existe o estilo Infantil, com melodia leve e divertida, feita para criança cantar '
        + 'junto.'],
    ],
  },
  {
    slug: 'musica-para-dia-das-maes',
    ocasiaoWizard: 'Dia das Mães',
    titulo: 'Música para o Dia das Mães Personalizada com IA',
    h1: 'Uma música para a sua mãe, escrita com a história de vocês duas',
    descricao:
      'Presente de Dia das Mães personalizado: conte a história da sua mãe e receba uma música '
      + 'exclusiva com o nome e as lembranças dela, em 2 versões MP3 HD, a partir de R$ 9,99.',
    palavrasChave: [
      'música para o dia das mães', 'presente dia das mães personalizado',
      'homenagem para mãe em música', 'música para mãe com o nome dela',
    ],
    intro: [
      'Flor murcha e chocolate acaba. Uma música que conta o que a sua mãe fez por você, com o nome '
      + 'dela cantado, fica guardada no celular e é reouvida por anos.',
      'Você escreve o que quiser contar: a comida que ela faz, o sacrifício que ela nunca '
      + 'comentou, a frase que ela repete desde que você era criança. A inteligência artificial '
      + 'transforma isso em letra e canção.',
    ],
    bullets: [
      'A letra nasce da sua história, não de um modelo pronto trocando o nome.',
      'Você ouve a prévia das duas versões antes de decidir se leva.',
      'Duas versões completas em MP3 HD, com arranjos diferentes.',
      'Dá para somar um Vídeo Homenagem com as fotos dela, sincronizado com a música.',
    ],
    estilos: ['Gospel / Adoração', 'MPB / Bossa Nova', 'Sertanejo', 'Folk Acústico', 'Romântica'],
    climaSugerido: 'Emocionante ou Nostálgica',
    faq: [
      ['Como faço para minha mãe ouvir?',
        'Depois do pagamento você baixa o MP3 e manda para ela como quiser: WhatsApp, story, ou '
        + 'tocando na caixa de som no almoço. O link também chega no seu WhatsApp.'],
      ['Posso colocar fotos dela junto?',
        'Pode. O Vídeo Homenagem (R$ 6,90) monta um slideshow vertical com 10 a 20 fotos '
        + 'sincronizadas com a música, pronto para postar ou mandar na família.'],
      ['E se a letra não ficar do jeito que eu queria?',
        'A letra aparece na tela antes de qualquer áudio ser gerado. Você lê, ajusta e só aprova '
        + 'quando estiver do jeito certo.'],
      ['Serve para homenagear uma mãe que já faleceu?',
        'Serve, e é um dos pedidos mais comuns. Escolha o clima Melancólica ou Nostálgica e conte '
        + 'as lembranças. A letra é escrita como memória, não como despedida.'],
    ],
  },
  {
    slug: 'musica-para-declaracao-de-amor',
    ocasiaoWizard: 'Declaração de Amor',
    titulo: 'Música de Declaração de Amor Personalizada com IA',
    h1: 'Declaração de amor em forma de música, com a história de vocês dois',
    descricao:
      'Faça uma declaração de amor em música: conte como vocês se conheceram e receba uma canção '
      + 'exclusiva em 2 versões MP3 HD, pronta em minutos, a partir de R$ 9,99.',
    palavrasChave: [
      'música de declaração de amor', 'música romântica personalizada',
      'presente para namorada', 'pedido de namoro em música',
    ],
    intro: [
      'Escrever o que se sente é difícil. Contar o que aconteceu é fácil, e é disso que a música '
      + 'precisa: onde vocês se conheceram, o que ela disse, o apelido que só vocês usam, o dia em '
      + 'que quase deu errado.',
      'A partir dessa história a IA escreve a letra e grava a canção. Serve para declaração, pedido '
      + 'de namoro, aniversário de namoro, pedido de desculpa e reconciliação.',
    ],
    bullets: [
      'A letra cita os fatos que você contar, com nome e apelido.',
      'Escolha a voz: masculina, feminina ou dueto.',
      'Duas versões em MP3 HD para escolher a que mais combina.',
      'Pronta em cerca de 2 a 3 minutos, sem precisar de cadastro.',
    ],
    estilos: ['Romântica', 'Sertanejo', 'Pop', 'MPB / Bossa Nova', 'Trap / Rap', 'Folk Acústico'],
    climaSugerido: 'Romântica ou Emocionante',
    faq: [
      ['Posso usar como pedido de namoro?',
        'Pode. Escolha a ocasião Pedido de Namoro no formulário e escreva na história o que você '
        + 'quer pedir. A letra é construída em cima disso.'],
      ['Consigo escolher a voz que canta?',
        'Consegue. Voz masculina, feminina ou dueto, e o estilo musical entre 18 opções.'],
      ['Posso mandar a música com uma carta junto?',
        'Pode. A Carta Virtual (R$ 3,99) é escrita a partir da mesma história e abre numa página '
        + 'própria, com envelope animado, para você mandar o link.'],
      ['A pessoa vai saber que foi feito com IA?',
        'A gravação tem qualidade de estúdio e a letra fala da história de vocês, então o que ela '
        + 'reconhece é a história. Contar ou não como foi feito é escolha sua.'],
    ],
  },
  {
    slug: 'musica-de-homenagem',
    ocasiaoWizard: 'Homenagem',
    titulo: 'Música de Homenagem Personalizada com IA',
    h1: 'Música de homenagem para quem marcou a sua vida',
    descricao:
      'Crie uma música de homenagem com a história de quem você quer honrar: pai, mãe, avó, amigo '
      + 'ou alguém que já partiu. 2 versões em MP3 HD, prontas em minutos, a partir de R$ 9,99.',
    palavrasChave: [
      'música de homenagem', 'homenagem em música para falecido',
      'música para missa de sétimo dia', 'homenagem personalizada com IA',
    ],
    intro: [
      'Homenagem boa é a que só cabe numa pessoa. Quando a letra cita o apelido, o ofício, o bordão '
      + 'e o gesto que a família inteira reconhece, quem ouve entende de quem se trata antes do '
      + 'refrão.',
      'A NS Music é usada para homenagear pai e mãe, avós, professores, profissionais aposentados, '
      + 'times e igrejas. Também serve para despedida de quem já partiu, em missa de sétimo dia, '
      + 'aniversário de falecimento e vídeo de família.',
    ],
    bullets: [
      'Conte a trajetória, as frases e os gestos: é isso que entra na letra.',
      'Você revisa a letra antes do áudio e ouve a prévia da música antes de pagar.',
      'Duas versões em MP3 HD, para tocar na cerimônia e para guardar.',
      'Dá para somar o Vídeo Homenagem com as fotos, sincronizado com a música.',
    ],
    estilos: ['Gospel / Adoração', 'Folk Acústico', 'MPB / Bossa Nova', 'Sertanejo', 'Rock'],
    climaSugerido: 'Emocionante, Nostálgica, Melancólica ou Inspiradora',
    faq: [
      ['Serve para homenagear alguém que já faleceu?',
        'Serve, e é um uso frequente. Escolha o clima Melancólica ou Nostálgica e conte as '
        + 'lembranças. A letra é escrita como memória de quem a pessoa foi.'],
      ['Posso tocar na missa ou no velório?',
        'Pode. Você recebe os arquivos MP3 HD e usa onde quiser: caixa de som, celular, vídeo da '
        + 'família, redes sociais.'],
      ['Consigo juntar as fotos da pessoa?',
        'Consegue. O Vídeo Homenagem (R$ 6,90) monta um slideshow com 10 a 20 fotos no ritmo da '
        + 'música, no formato vertical de celular.'],
      ['E se alguém da família quiser cantar na cerimônia?',
        'Existe o Playback (R$ 4,99): a mesma música sem a voz, para cantar ao vivo em cima do '
        + 'arranjo.'],
    ],
  },
  {
    slug: 'musica-para-casamento',
    ocasiaoWizard: 'Aniv. de Casamento',
    titulo: 'Música para Casamento e Bodas Personalizada com IA',
    h1: 'Música personalizada para casamento, bodas e aniversário de casamento',
    descricao:
      'Música exclusiva para casamento ou bodas, escrita a partir da história do casal. 2 versões '
      + 'em MP3 HD prontas em minutos, a partir de R$ 9,99.',
    palavrasChave: [
      'música para casamento personalizada', 'música para bodas',
      'música para entrada da noiva', 'presente de aniversário de casamento',
    ],
    intro: [
      'A trilha do casamento costuma ser a música de outra pessoa. Aqui a canção conta a história '
      + 'do casal: como se conheceram, quanto tempo esperaram, o que superaram, os nomes dos filhos.',
      'Serve para a cerimônia, para a festa, para a valsa, para a surpresa no jantar e para bodas '
      + 'de qualquer idade: 1, 10, 25 ou 50 anos de casamento.',
    ],
    bullets: [
      'A letra cita os dois nomes, as datas e os fatos que você contar.',
      'Você ouve a prévia das duas versões antes de pagar.',
      'Duas versões com arranjos diferentes: uma para a cerimônia, outra para a festa.',
      'Playback instrumental disponível, se alguém for cantar ao vivo.',
    ],
    estilos: ['Romântica', 'MPB / Bossa Nova', 'Sertanejo', 'Folk Acústico', 'Gospel / Adoração', 'Jazz / Blues'],
    climaSugerido: 'Romântica, Emocionante ou Festiva',
    faq: [
      ['Dá para usar na entrada da noiva?',
        'Dá. Você recebe o MP3 HD e entrega para quem opera o som. Vale pedir com antecedência para '
        + 'ouvir com calma e escolher entre as duas versões.'],
      ['E se alguém for cantar ao vivo na cerimônia?',
        'O Playback (R$ 4,99) entrega a mesma música sem voz, para cantar em cima do arranjo.'],
      ['Serve para bodas e aniversário de casamento?',
        'Serve. É uma das ocasiões mais pedidas: a letra recapitula os anos juntos, com as datas e '
        + 'os nomes que você contar.'],
      ['Posso fazer surpresa sem a outra pessoa saber?',
        'Pode. Todo o pedido acontece no site, sem cadastro obrigatório, e a entrega vai para o seu '
        + 'WhatsApp.'],
    ],
  },
];

export function getOcasiao(slug) {
  return ocasioes.find((o) => o.slug === slug) || null;
}
