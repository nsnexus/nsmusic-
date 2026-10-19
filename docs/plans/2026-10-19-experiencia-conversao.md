# NS Music — Projeto de experiência, visual e conversão

Data: 19/10/2026. Base de código analisada: `2e4c6c7`.

**Status: especificação para implementação + conceito visual navegável.** Este documento não publica as novas telas nem ativa a oferta. A prévia visual fica em `docs/design/experiencia-v2/index.html`; utiliza dados demonstrativos, não gera cobrança, áudio ou indicação real.

## 1. Resultado esperado

Fazer o cliente conseguir criar um presente pessoal pelo celular, ouvir sua música, entender o que compra e receber os arquivos com pouca fricção. Depois de entregar o valor principal, oferecer uma segunda criação e um motivo claro para indicar.

Prioridades, nesta ordem:

1. Criação bonita e simples, começando pela etapa 1.
2. Prévia e escolha de pacote com uma única experiência em todo o site.
3. Pagamento compreensível e recuperável ao trocar de aplicativo.
4. Entrega imediata dos direitos confirmados e destaque para ouvir/baixar.
5. Oferta opcional de 1 crédito por R$ 4,99 e indicação.
6. Conta organizada para voltar a comprar e acompanhar indicações.

Conversão é objetivo a medir, não resultado garantido. Também medir custo por música vendida: gerar mais prévias sem aumentar vendas pode piorar o negócio.

## 2. Decisões confirmadas e propostas

### Confirmadas pelo proprietário

- Prioridade mobile e aparência profissional; fotografias bonitas e personalizadas no lugar de ilustrações genéricas como conteúdo principal.
- Sem pop-ups automáticos de marketing na jornada.
- Prévia gratuita de até 60 segundos; áudio completo e downloads após confirmação de pagamento.
- Compra sem login continua possível no fluxo principal.
- Conta com Google ou e-mail e senha; número do pedido associado com verificação de posse quando necessário.
- Crédito sem vencimento. Cartinha custa 0,5 crédito; cada um dos demais produtos avulsos custa 1 crédito.
- Pacotes: 1 crédito por R$ 9,99; 5 por R$ 29,90; 10 por R$ 49,90.
- Após o pagamento, mostrar oferta de uma segunda música: **1 crédito por R$ 4,99**.
- Cada novo comprador indicado elegível gera 1 crédito; a cada 5 compradores confirmados, mais 1 de bônus. Cinco compradores = 6 créditos.

### Propostas para fechar os detalhes durante a implementação

- Oferta de R$ 4,99: uma utilização por cliente, vinculada ao primeiro pedido principal elegível pago em dinheiro e efetivamente confirmado. Evita transformar cada uso de crédito em nova oferta ilimitada. Essa frequência é recomendação, não regra comercial já autorizada em detalhe.
- Não impor prazo artificial à oferta. O crédito adquirido nunca expira. Caso se adote prazo comercial da oferta, ele precisa ser real, persistido no servidor e informado separadamente da validade do saldo.
- O crédito promocional entra na mesma carteira e segue a regra geral de uso; o texto pode destacar a segunda música, mas deve informar que a unidade também serve nos produtos permitidos. Restringir o crédito somente a música exigiria outra regra e outro tipo de saldo.
- Indicação: atribuição ao primeiro indicador válido, janela inicial sugerida de 30 dias, um novo comprador por conta verificada. Primeira compra principal em dinheiro qualifica; recarga, oferta de crédito, add-ons e resgate não geram uma segunda recompensa para o mesmo comprador.
- Fraude e devolução: cancelar direito/recompensa por eventos compensatórios no histórico, conforme política comercial definida; nunca apagar movimentos financeiros já lançados.
- Pacotes em créditos: cobrar a soma dos produtos incluídos, descontando direitos já comprados. Não presumir que um combo inteiro custa 1 crédito. Exemplo música + carta = 1,5; música + vídeo + carta = 2,5; completo com retrospectiva = 3,5; música + voz = 2. Preço final de combo em créditos deve ser confirmado no catálogo antes da ativação.

## 3. Evidência do estado atual

| Área | O que existe | Consequência para o projeto |
|---|---|---|
| Criação | `src/app/criar/WizardSteps.jsx:30`: ocasião, dedicante, homenageado e relação na primeira etapa, blocos de emoji e selects longos | Reorganizar a entrada mantendo os mesmos dados e identificadores |
| Criação | `WizardSteps.jsx:360`, `:509`, `:728`: história, preferências e revisão/WhatsApp | Manter quatro etapas inicialmente; melhorar cada uma sem reescrever a geração |
| Persistência | `src/app/criar/page.jsx:343`, `:442`: restauração e salvamento local | Preservar rascunho e compatibilidade dos campos; lidar com indisponibilidade e limpeza |
| Jornada duplicada | `criar/page.jsx:1843`, `:2253` e `src/app/entrega/page.jsx`: ambas renderizam prévia e checkout | Um componente de experiência para a prévia e a compra, com os dois pontos usando a mesma composição |
| Prévia | `entrega/page.jsx`: capa, dois players, letra e ofertas; apenas cabeçalho/abertura foram ajustados | O corpo do novo layout ainda precisa ser implementado |
| PIX | `entrega/page.jsx`: `escolherFaixa` gera cobrança no clique; efeito também gera cobrança automaticamente | Separar seleção, revisão e criação explícita de cobrança; reutilizar cobrança pendente da mesma seleção |
| Pop-ups | Os dois modais automáticos de entrega foram removidos em `2e4c6c7`; `criar/page.jsx:2723` ainda tem modal de limite | Manter remoção e migrar o aviso de limite para estado inline, preservando bloqueio do servidor |
| Catálogo | `src/lib/pricing.js`: preços principais e pacotes de crédito centralizados | Reutilizar catálogo; impedir preço derivado de texto ou valor informado pelo navegador |
| Carteira | `src/lib/credits.js:16`: saldo calculado somente sobre últimos 50 movimentos | Corrigir saldo autoritativo por agregação completa antes de ampliar uso comercial; histórico pode continuar paginado |
| Indicação | `api/orders/create/route.js:119`: aceita código quando cliente está autenticado; usa upsert | Conservar atribuição entre visitas/login e impedir troca indevida de indicador |
| Saldo/indicação | `supabase/credits.sql`: RPCs, locks e ledger existentes | Evoluir com migração aditiva e validar permissões reais no banco; arquivo SQL não prova implantação em produção |
| Compra de crédito | `api/credits/purchase/route.js`: cria cobrança antes de registrar compra e não recebe chave de idempotência | Projetar reserva persistida/reutilização e conciliação antes de ativar a oferta de R$ 4,99 |
| Login | `src/app/login/page.jsx`: Google/e-mail existentes, destino padrão ainda `/minhas-musicas` | Padronizar retorno e destino da conta; preservar pedido, oferta e indicação ao autenticar |

As referências de linha são da análise inicial e podem se deslocar na implementação. Nenhum pedido real foi usado nesta análise.

## 4. Direção de arte

### Personalidade

Um estúdio de presentes musicais, acolhedor e confiável. A tecnologia aparece na explicação do serviço, sem dominar a estética ou virar personagem da interface.

- Base clara quente `#FAF8F5`, superfícies brancas e texto ameixa escuro `#29232D`.
- Violeta profundo `#67408B` para ação principal; rose suave `#EFE3E8` para apoio. Verde somente em pagamento confirmado e estados de sucesso.
- Manter logo oficial, visível e sem deformação, entre 36 e 48 px; não trocar identidade por uma nota musical genérica.
- Reduzir gradientes saturados, brilho/glass, corações flutuantes, emojis em títulos e badges sobrepostos.
- Reutilizar Outfit e Work Sans do projeto. Serif editorial pontual pode ser avaliada no hero, sem adicionar uma coleção de fontes.
- Botões e inputs entre 48 e 52 px; raio de 12–16 px; cards 20–24 px; espaçamento em múltiplos de 4/8.
- Texto mínimo de 16 px nos campos mobile; apoio de formulário preferencialmente 14 px. Contraste mínimo 4,5:1 no texto comum.
- Ícones pequenos para ação (tocar, baixar, compartilhar, voltar), com nomes acessíveis; fotografias para comunicar emoção e ocasião.

### Fotografia

- Pessoas brasileiras variadas, luz natural, textura real, gestos espontâneos. Nada de pele plástica, poses de catálogo ou notas musicais neon.
- Coleção inicial: família, amor/casal, aniversário/amizade, pai/filho, saudade e fé. Produzir o restante somente quando as telas de consumo estiverem definidas.
- Fotografias editoriais ilustrativas não devem aparecer como depoimentos ou clientes reais. Provas sociais exigem autorização, origem e conteúdo verificável.
- Foto do próprio cliente sempre prevalece na capa. Foto editorial é fallback escolhido pelo contexto; sem enviar história/telefone para gerar imagens de marketing.
- Cada imagem deve ter recorte desktop e mobile revisado; rostos fora das áreas de texto; alt apropriado (vazio para decoração).
- Formatos WebP/AVIF, tamanhos responsivos e dimensões reservadas. Orçamento inicial: imagem principal até 160 KB, thumbnails até 45 KB; ajustar por qualidade real.
- Não carregar vídeo de fundo no formulário. A foto apoia o preenchimento sem disputar com os campos.

## 5. Criação — nova experiência

### Estrutura comum às quatro etapas

Cabeçalho compacto com logo e “Minha conta”. Progresso com nome da etapa, por exemplo “1 de 4 · A pessoa”, não sete números misturando formulário e geração. Link “Voltar” preserva todos os campos.

No celular: uma coluna, margem de 20 px, formulário no centro e imagem editorial compacta. CTA inferior fixo apenas quando não cobre o teclado/campos; respeitar safe-area. No desktop: formulário de aproximadamente 540 px e painel editorial ao lado.

Mensagem comercial curta e constante: “Ouça uma prévia grátis. Música completa a partir de R$ 9,99.” Não prometer música completa gratuita, prazo de geração fixo ou possibilidade de tentativas ilimitadas.

### Etapa 1 — A pessoa

Título: **“Para quem é essa música?”**

Apoio: “Comece por alguém que merece ouvir o quanto é especial.”

Ordem dos campos:

1. Categorias visuais Família / Meu amor; alternativas Amizade, Para mim e Outra pessoa em opções textuais claras. Cards selecionáveis com foto e label fora da imagem, sem depender de cor para marcar seleção.
2. Relação exata por opções filtradas do catálogo atual. Família não deve virar automaticamente Mãe; pedir a escolha Mãe/Pai/Filha/Vó/etc. Preservar todos os tipos existentes em “Ver todas”.
3. “Qual é o nome de quem vai receber?”; depois “E o seu primeiro nome?”. Nada de duplicar campos obrigatórios.
4. “Qual é o motivo?” com opções curtas: Aniversário / Amor / Agradecimento / Homenagem / Outro. Mapear aos IDs reais do catálogo; se não houver equivalência, abrir a seleção exata. Ocasiões vindas da landing/campanha podem iniciar preenchidas e visíveis para edição.
5. CTA “Continuar para a história”.

“Para mim” associa os nomes e relação de forma explícita e reversível. Ao trocar para outra pessoa, recuperar ou limpar com critério os dados anteriores para não misturar homenageados.

Validação: mensagem junto do campo, foco no primeiro erro; não usar somente botão desabilitado sem motivo. Não mudar de etapa automaticamente após tocar num card. Navegação para trás recupera seleção e foco.

Aceite da etapa 1: todos os campos atuais necessários continuam disponíveis; nenhum campo essencial desaparece para caber no layout. A primeira dobra em 390×844 mostra pergunta, contexto e escolha inicial; CTA é alcançável sem caça ao botão. Em 320 px não há rolagem horizontal.

### Etapa 2 — A história

Título dinâmico: “O que torna a história com [nome] tão especial?”

- Um campo principal, sem cinco caixas simultâneas. Exemplo contextual curto: “Minha mãe sempre me apoiou. Quero agradecer pelas noites em que ficou ao meu lado...”.
- Três sugestões acionáveis: Uma lembrança / Uma qualidade / Uma frase de vocês. Mostrar uma pergunta por vez e deixar o cliente incorporar a resposta.
- Contador discreto orienta o mínimo já exigido pelo sistema (50 caracteres na validação atual); melhorar a qualidade com contexto, não com um textão obrigatório.
- “Prefiro contar por voz” como ação secundária: pedir permissão somente no clique e oferecer digitação se o navegador não suportar. Transcrição editável, indicação clara de gravação e botão parar.
- Quem já tem letra mantém o caminho existente; não confundir ditado da história com clonagem da própria voz, que é produto distinto.
- Salvar rascunho de forma limitada: texto/IDs, sem tokens, arquivos binários ou fotos em base64. Informar “Rascunho salvo neste aparelho”; opção de apagar em dispositivo compartilhado.

### Etapa 3 — O som

- Título “Como você imagina essa música?”.
- Mostrar 4–6 estilos iniciais e “Ver todos”. Recomendações pelo contexto são editáveis e não escondem o catálogo.
- Cada opção pode ter um trecho demonstrativo curto e real, licenciado/autorizado. Um áudio por vez; iniciar só no clique; indicar que é exemplo de estilo, não a música final.
- Ritmo, clima e voz continuam campos distintos, com linguagem compreensível. Sem prometer reproduzir cantor conhecido ou clonar terceiros.
- Preferências avançadas em seção expansível. O produto “Minha voz” deve informar necessidade de gravação e compra; não ser ligado automaticamente.
- Não produzir uma imagem nova para cada clique no estilo: coleção editorial preparada e leve.

### Etapa 4 — Revisar e receber

- Resumo compacto “Para [nome], de [nome]”, ocasião e som; “Editar” retorna à etapa certa preservando os dados.
- Foto de capa opcional. Upload com andamento, erro recuperável e fallback editorial coerente.
- WhatsApp pedido uma vez, com explicação: “Enviaremos o link para você acompanhar e ouvir”. Não tratar validação de formato/existência do número como prova de posse.
- Cliente autenticado vê dados preenchidos e pode corrigir; visitante continua sem cadastro obrigatório para ouvir/comprar.
- Botão “Criar minha letra”. Abaixo: “Você revisa a letra antes de gerar a música”. Informar consentimento e finalidade do contato sem misturar autorização de marketing.

### Letra e geração

- Revisão da letra legível, com botão “Ajustar letra” e ação principal “Aprovar e gerar minha música”.
- Andamento baseado em estados reais: pedido recebido, compondo, produzindo áudio, prévia pronta. Sem percentual fictício ou timer reiniciando.
- Se demorar, manter pedido salvo e acompanhamento. Falha oferece retentativa controlada sobre a mesma tarefa, sem gerar outro pedido por clique duplo.
- Proteger custo: manter cotas e bloqueios no servidor; substituir modal de limite por aviso dentro da página com acesso às próprias prévias e suporte.

## 6. Prévia e compra

Reaproveitar `previa-pedido.html` como referência visual, adaptando aos dados reais. O novo corpo deve aparecer tanto para quem acabou de criar quanto para quem abriu o link do WhatsApp.

Ordem mobile:

1. Título curto “A história de [nome] já virou música”.
2. Um card com capa, dedicatória e seletor de versões. Um player visível; versões 1 e 2 continuam acessíveis.
3. Player começa no clique; limite `min(60 segundos, duração da faixa)`. Mostrar `1:00`, não `0:60`. Ouvir novamente não abre oferta.
4. Mensagem junto ao player: “Prévia de 60 segundos. A compra libera as duas versões completas.”
5. Letra expansível; não ocupar a coluna inteira antes de explicar a compra.
6. Escolha de pacote com total e inclusões reais; CTA “Revisar presente · R$ X”.
7. Demonstrações secundárias dos complementos, fora do primeiro foco de escuta.

### Pacotes

| Apresentação | Reais atuais | Inclusões a validar pelo contrato/servidor |
|---|---:|---|
| Só a música | R$ 9,99 | Duas versões completas e página de presente |
| Música + carta | R$ 13,98 | Música + carta |
| Música + vídeo | R$ 16,89 | Música + vídeo + carta quando cobrado pela escada atual |
| Presente completo | R$ 19,98 | Música + retrospectiva + vídeo + carta quando cobrado pela escada atual |
| Música + minha voz | R$ 24,89 | Música + produto de voz; não sugerir que inclui todos os demais bônus |

Há diferença entre flags dos SKUs diretos e a escada `impacto` cumulativa. Antes de lançar cards novos, consolidar um contrato server-side de inclusões e testar cada pacote para não anunciar carta/vídeo que o SKU escolhido não concede. Preservar direitos de pedidos antigos.

- Pacote básico inicialmente selecionado na proposta. Comparar, após estabilizar a nova experiência, com o comportamento comercial atual; não trocar posição/preço/default silenciosamente no mesmo experimento.
- Destacar “Com fotos e carta” em vez de “Mais escolhido” sem dados que comprovem popularidade.
- No mobile, cards compactos em lista com rádio e detalhes; duas colunas só se a leitura continuar boa. No desktop, quatro cards. Voz fica em “Outras opções”.
- Escolha altera resumo local. Revisão inline mostra todos os itens, preço total e forma de pagamento, com opção de voltar.
- Botão “Gerar PIX de R$ X” é a ação que cria ou recupera a cobrança, com chave idempotente. Trocar pacote invalida a revisão anterior sem cobrar automaticamente.
- Para créditos, mostrar saldo e custo real; se insuficiente, explicar a diferença sem empurrar recarga no lugar do PIX principal. Não debitar sem confirmação explícita.

O corte no player é uma regra de experiência, não prova de proteção do MP3 completo. Antes de afirmar que arquivos pagos estão protegidos, verificar proxy, URLs e autorizações no servidor. Se a URL original completa continua acessível ao visitante, preparar uma mídia de prévia separada e acesso autorizado à versão integral; essa correção deve ter escopo e validação próprios.

### Estados de pagamento

Resumo → gerando cobrança → pendente → confirmado. Também tratar erro, expiração, recuperação ao reabrir e consulta “Já paguei”.

No celular, “Copiar código PIX” é ação de destaque; QR disponível para outro aparelho. Instruções em três frases curtas. Ao voltar do banco, consultar o servidor; não apagar o PIX nem gerar outro automaticamente. Se o cliente trocar de pacote com cobrança anterior aberta, conciliar pagamentos antigos e informar divergência, sem aprovar pacote mais caro com PIX mais barato.

PIX estático e comprovante mantêm o caminho de contingência existente até revisão específica. Não anunciar “instantâneo garantido” para uma verificação que possa atrasar. Mensagens de erro inline e dados financeiros privados.

## 7. Entrega após pagamento

Ordem de conteúdo:

1. Confirmação discreta “Pagamento confirmado. Seu presente está pronto para ouvir”.
2. Card da música: capa, versões, player completo, baixar MP3, compartilhar por ícone no próprio card com nome acessível.
3. Letra expansível e direitos comprados com próximo passo: escrever carta, enviar fotos, acompanhar vídeo, baixar arquivo pronto.
4. **Oferta da segunda música por R$ 4,99**, inline, depois do acesso principal.
5. Indicação em card menor.
6. Complementos ainda não adquiridos em seção expansível; conta e suporte como links de apoio.

Pagamento confirma direito de uso; vídeo, voz e retrospectiva podem depender de dados e processamento. Exibir “Adicionar fotos”, “Em produção”, “Falhou” ou “Pronto” conforme o estado real.

O compartilhamento do presente não expõe a conta, carteira, ofertas privadas ou dados do pagador. A página recebida pelo homenageado permanece voltada à homenagem.

## 8. Oferta pós-compra: 1 crédito por R$ 4,99

### Apresentação

Título: **“Já pensou em quem vai ser a próxima surpresa?”**

Texto: “Garanta 1 crédito por R$ 4,99 para sua próxima música. Use quando quiser: seus créditos não vencem.”

CTA: “Quero 1 crédito por R$ 4,99”. Ação secundária: “Agora não”. Apoio: “Compra adicional opcional. A música que você acabou de comprar já está liberada.” Se a carteira for de uso geral, acrescentar “Também pode ser usado nos demais produtos da carteira”.

Não abrir modal, ocupar a tela inteira, pré-selecionar ou esconder download. A oferta recusada pode ficar acessível pela conta se continuar elegível; não perseguir o cliente com aberturas repetidas.

### Elegibilidade e propriedade

- Consultada no servidor: pagamento principal real, cliente proprietário, pedido não reembolsado, regra de frequência vigente e nenhuma compra aprovada da mesma oferta.
- Nunca aceitar `isPaid`, valor, quantidade de crédito ou elegibilidade enviados pelo navegador como verdade.
- Visitante pode ouvir e baixar a compra principal. Para guardar crédito, criar/entrar na conta e provar vínculo com o pedido por fluxo de posse (sessão de compra segura ou código de uso único enviado ao WhatsApp do pedido).
- Não vincular todas as músicas por coincidência de telefone digitado; Google autentica a conta Google, não a posse de qualquer telefone informado.
- Após login/OTP, retornar ao mesmo card. Identificadores privados e tokens não entram em URL compartilhável ou analytics.

### Implementação proposta

1. Catálogo ganha SKU exclusivo `creditos_pos_compra_1` com 1 crédito, R$ 4,99 e regra de elegibilidade. O pacote normal de 1 crédito continua R$ 9,99.
2. Migração aditiva versionada amplia a restrição de `credit_purchases.package_sku` e registra origem do pedido/oferta, estado de reserva e referência idempotente.
3. Criar entidade de oferta/resgate vinculada à conta, com índice único que materialize a frequência definida (por cliente na proposta). Uma variável React/localStorage não representa limite comercial.
4. Endpoint de consulta retorna elegibilidade, total e estado público seguro; evolução de `/api/credits/purchase` recebe SKU, pedido de origem e chave idempotente, valida tudo e recupera cobrança pendente equivalente.
5. Reservar intenção no banco antes de chamar a Efí; guardar a identificação necessária para recuperar uma cobrança se o provedor confirmar e a gravação local falhar. Expiração da reserva não elimina o direito de conciliar um PIX pago depois.
6. Webhook e polling convergem em `approve_credit_purchase`. Somente status do provedor e valor realmente recebido validados geram movimento positivo no ledger. Uma confirmação repetida gera zero créditos extras.
7. Após confirmação, mostrar “1 crédito adicionado. Saldo: X”, ação “Criar próxima música” e “Usar depois”. Criar nova música não debita saldo por si só: consumo no desbloqueio de um novo pedido confirmado pelo usuário.
8. Excluir a recarga promocional da recompensa de indicação e da geração de novas ofertas. Reabrir a página recupera o estado real.
9. Tratar cancelamento/devolução por operação compensatória auditável, incluindo destino da promoção se o pedido original for devolvido; política comercial deve ser explicitada antes de ativar.

### Testes obrigatórios

- Dois cliques, duas abas e webhook + polling simultâneos: um pagamento aprovado, um crédito.
- Pedido alheio, não pago, pago com crédito ou revogado não cria oferta indevida.
- Pagamento de valor errado não credita; `charge.valor.original` sozinho não substitui valor efetivamente recebido quando o provedor disponibiliza ambos.
- Conta criada após compra visitante consegue continuar depois de verificar a posse; conta sem verificação não apropria pedido.
- Falha da recarga não revoga nem bloqueia áudio da primeira compra.
- Crédito persiste ao trocar de dispositivo e não depende de prazo do navegador.

## 9. Indicação

Mensagem principal: **“Sua indicação também pode virar música.”**

Texto claro: “Cada novo comprador indicado com compra confirmada rende 1 crédito. Ao completar 5, você ganha mais 1. Seus créditos não vencem.”

### Cliente indicador

- Card secundário na entrega; área completa em “Minha conta → Indicações”.
- Compartilhar convite e copiar link. Compartilhar a homenagem é ação diferente: o presente não recebe banner invasivo por causa de um convite.
- Mostrar progresso “3 de 5 compradores confirmados” e saldo ganho. Não apresentar cliques como vendas nem identificar visitantes anônimos.
- Sem programa de múltiplos níveis. Não oferecer bônus ao comprador indicado sem uma decisão comercial explícita.

### Atribuição e recompensa

1. Capturar `ref` no primeiro acesso válido e guardar identificador mínimo com política de privacidade e prazo definidos. Persistir em redirects internos e Google; não depender só da URL da etapa final.
2. Associar no servidor quando há conta e posse adequada; compra visitante fica com atribuição pendente vinculada à sessão/pedido, para conciliar após conta verificada.
3. Não substituir indicador depois de primeira atribuição elegível ou compra; rejeitar autoindicação e pedidos de terceiros.
4. Só a primeira compra principal elegível realmente confirmada bonifica aquele comprador. Cliques, cadastros, compras reembolsadas, recargas e consumo do mesmo saldo não contam outra vez.
5. Reaproveitar RPC de recompensa, adicionando serialização por indicador e marca única de cada marco de 5. O lock atual na linha do indicado não garante sozinho dois marcos concorrentes do mesmo indicador.
6. Agregados de saldo/indicadores calculados sobre todo histórico; lista paginada. Não derivar ganho/contagem total somente dos últimos 50 registros.
7. Falha temporária na recompensa não pode desfazer compra. Reprocessamento idempotente via mecanismo operacional já existente; se faltar rotina durável, criá-la como parte deste lote.
8. Antes de expor RPCs `security definer`, auditar e restringir `EXECUTE` às identidades necessárias. RLS das tabelas não comprova proteção das funções. Validar permissões no ambiente real.

Aceite: 5 compradores elegíveis confirmados resultam em exatamente 6 créditos, inclusive em concorrência; reentrega de webhook não altera saldo. As métricas de clique/cadastro só aparecem se efetivamente coletadas.

## 10. Minha conta e autenticação

- Uma entrada “Minha conta” em todas as telas. Login retorna ao destino interno validado; rejeitar URL externa/protocol-relative.
- Abas Músicas / Créditos / Indicações. `/minhas-musicas` preserva compatibilidade e encaminha à coleção adequada sem deixar visitante em tela antiga desconectada da conta.
- Cada música exibe capa, pessoa, status e uma ação principal: ouvir prévia, finalizar compra, ouvir/baixar ou acompanhar.
- Carteira exibe saldo real, unidades claras, extrato com paginação e pacotes 1/5/10; nada de saldo truncado ou dados de demonstração.
- 5 créditos: R$ 5,98 por crédito. 10 créditos: R$ 4,99 por crédito. Não chamar todo produto de “1 música”: carta usa metade e combos podem somar unidades.
- Solicitar conta como benefício (“Guarde suas músicas e seu crédito”), depois que o cliente entendeu o presente; não obrigar novo login em cada CTA.
- Migração de pedidos visitantes para conta demanda prova de posse. Dados novos de contato não podem sobrescrever histórico de clientes automaticamente.

## 11. Estrutura técnica proposta

Manter Next.js 14, JavaScript, Supabase Edge, R2 e Efí. Sem biblioteca nova para montar o redesign. Classes CSS com prefixo da experiência e tokens locais para não alterar admin/home acidentalmente.

Componentes sugeridos, criados por necessidade de cada lote:

| Responsabilidade | Destino sugerido | Reutilização |
|---|---|---|
| Cabeçalho/progresso/ações | `src/components/creation/CreationShell.jsx` | Usar autenticação e navegação atuais |
| Pessoa e ocasião | `src/components/creation/RecipientStep.jsx` | `formData`, `updateField`, `wizardOptions` |
| História | `src/components/creation/StoryStep.jsx` | Ditado e dados atuais |
| Som | `src/components/creation/SoundStep.jsx` | Catálogo de preferências e exemplos existentes |
| Revisão | `src/components/creation/ReviewStep.jsx` | Upload/compressão/telefone atuais |
| Prévia e pacotes | `src/components/delivery/PreviewExperience.jsx` | Mesmo componente em `/criar` e `/entrega` |
| Player | `src/components/delivery/SongPlayer.jsx` | Readiness, watchdog, proxy, pausa concorrente e corte atuais |
| Revisão e PIX | `src/components/delivery/PurchaseReview.jsx` | `requestPixCharge`, `PixQrCode` e status existentes |
| Entrega paga | `src/components/delivery/PaidDelivery.jsx` | Downloads, presente e add-ons atuais |
| Oferta secundária | `src/components/delivery/SecondSongOffer.jsx` | Carteira e compra Efí centralizadas |
| Indicação | `src/components/account/ReferralCard.jsx` | Carteira/atribuição verificadas no servidor |

Extrair por responsabilidade, com componentes até aproximadamente 400 linhas. Não mover o arquivo inteiro de 3 mil linhas para outro lugar. Evitar dois controladores de áudio/polling quando as telas compartilharem componentes.

Rotas novas sugeridas somente onde há função nova: consulta de elegibilidade da oferta e vinculação verificada de pedido visitante. Compra/status de crédito devem preferencialmente evoluir rotas existentes. Nomes finais dependem de inspeção dos fluxos de autenticação; todas as APIs novas precisam de Edge e autorização server-side.

Migrações separadas e reversíveis. Desligar UI da oferta não apaga ledger nem impede conciliação de PIX já emitido. Documentar somente nomes de eventual variável nova em `.env.example`; preferir configuração de negócio server-side já suportada.

## 12. Medição de conversão e custo

Estabelecer baseline antes do rollout e definir os mesmos denominadores para comparar versões. Eventos com `flow_id` opaco e versão da experiência; nunca nome, história, telefone, e-mail, token de pedido ou arquivo privado.

| Etapa | Evento proposto | Indicador |
|---|---|---|
| Entrada | `creation_started` | Sessões que iniciam o fluxo |
| Formulário | `creation_step_completed` + número | Abandono por etapa, erros e tempo |
| Letra | `lyrics_approved` | Aprovação e pedidos de ajuste |
| Prévia | `preview_ready`, `preview_played`, `preview_limit_reached` | Prévias prontas/realmente ouvidas |
| Compra | `package_selected`, `checkout_reviewed`, `pix_created` | Intenção e cobrança gerada, separados |
| Pagamento | `payment_confirmed` no servidor | Conversão paga por pedido único |
| Entrega | `download_completed` quando verificável, `gift_shared` | Acesso ao resultado; clique sozinho não prova download |
| Recorrência | `second_offer_viewed`, `second_offer_confirmed` | Adesão entre clientes elegíveis |
| Indicação | `referral_link_shared`, `referral_purchase_confirmed` | Novos compradores pagos e custo do incentivo |

Métrica principal: pedidos principais pagos / sessões elegíveis de criação, acompanhando também pagos / prévias ouvidas. Guardrails: falha de geração, erro de PIX, demora até ouvir/baixar, pedidos de suporte, devoluções, margem por comprador e custo de geração por venda.

Simulação da oferta, não previsão: se 10%, 20% ou 30% dos compradores elegíveis comprarem o crédito adicional, o faturamento bruto incremental por comprador principal será aproximadamente R$ 0,50, R$ 1,00 ou R$ 1,50. Descontar taxa de pagamento, geração de áudio, suporte, devoluções e créditos gratuitos para avaliar margem. Não usar crédito não consumido como premissa de lucro: ele representa obrigação futura sem vencimento.

Meta inicial técnica: LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no percentil 75 mobile, medidos em usuários reais quando houver instrumentação. Primeiro obter baseline; não anunciar meta como resultado já atingido.

Testes posteriores, um por vez: primeira pergunta, formato dos pacotes e texto/posição da oferta. Não mudar preço, layout, anúncio e atribuição ao mesmo tempo e atribuir todo resultado à nova interface. Comparar fontes e públicos equivalentes; janelas e amostra definidas pelo tráfego real. Não criar contadores falsos, escassez fictícia ou depoimentos fabricados para otimizar conversão.

## 13. Plano de execução por lotes

| Lote | Entrega concreta | Dependência | Critério para encerrar |
|---|---|---|---|
| 0 · Preparação | Baseline, pedidos próprios de teste, inventário do fluxo, contratos de pacote e checklist mobile | Nenhuma | Estado atual e regras reproduzíveis documentados; catálogo sem promessa divergente |
| 1 · Visual + etapa 1 | Tokens escopados, fotos responsivas, novo cabeçalho e RecipientStep | Conceito visual revisado | Fluxo existente recebe mesmos dados; 320–430 px sem quebra; rascunho/auto-homenagem funcionam |
| 2 · Etapas 2–4 | História, som, resumo/WhatsApp, letra e estados inline | Lote 1 | Criar e revisar letra no celular; ditado/upload têm fallback; formulário não perde dados |
| 3 · Prévia + checkout | Player único, letra expansível, cards e revisão inline compartilhados | Lote 0 + catálogo | Duas versões, corte em 60 s e mesma experiência em criar/entrega; PIX idempotente e retomável |
| 4 · Entrega | Música/download no topo, compartilhar por ícone, bônus por estado real | Lote 3 | Cliente próprio pago ouve/baixa; pendente continua em prévia; nenhum popup automático |
| 5 · Carteira + oferta | Correção de agregados, migração aditiva, reserva de oferta, conta/prova de posse, compra R$ 4,99 | Regras de elegibilidade + carteira validada | Exatamente 1 crédito por pagamento verificado, sem duplicar; primeiro pedido sempre acessível |
| 6 · Indicação | Atribuição persistida, milestones transacionais e dashboard consistente | Carteira/propriedade verificadas | 5 compras = 6 créditos, sem dupla recompensa nem perda em concorrência |
| 7 · Otimização | Observação real, acessibilidade, performance e testes controlados | Eventos e tráfego | Comparação com baseline incluindo margem/custos; corrigir regressão antes de ampliar |

Ordem recomendada: começar pelo lote 1, que atende a queixa visual mais urgente; preparar contratos e carteira em paralelo somente com escopos de arquivo separados. Não chamar mudança de logo de redesign completo.

Cada lote exige revisão do diff, lint/build e fluxo pertinente antes de publicar. O push para `master` publica automaticamente; montar preview/revisão em branch ou execução local antes de integrar. Estimativa em dias só depois do lote 0 e de verificar migrações/auth reais, para não prometer prazo sem evidência.

## 14. Verificação e publicação

Dispositivos: 320, 360, 390 e 430 px; tablet e desktop; Safari iOS, Chrome Android e navegador interno do WhatsApp/Instagram. Teclado aberto, retorno do banco e retorno do Google fazem parte da jornada.

### Casos manuais com pedidos próprios

1. Visitante completa criação, volta etapas, recarrega e recupera rascunho.
2. Homenagem própria, relação “Outro”, nome longo e história com acentos.
3. Ditado negado/indisponível e foto recusada/erro de upload permitem seguir pelo caminho alternativo.
4. Letra ajustada, geração lenta/falha e retry sem pedido duplicado.
5. Ouvir versões 1/2, buscar além do limite, áudio com menos de 60 s e voltar após limite sem popup.
6. Trocar pacotes não cria cobranças; revisão corresponde exatamente ao PIX/itens concedidos.
7. Copiar PIX, trocar para app do banco, voltar/recarregar; reutilizar cobrança, consultar aprovação e desbloquear.
8. Não pago permanece sem download completo, mesmo com `status=success` na URL.
9. Pago ouve/baixa, compartilha e usa somente direitos comprados; presente público não exibe carteira privada.
10. Oferta autenticada e visitante com vínculo verificado; recusar, recarregar, pagar, receber crédito e criar novo pedido.
11. Indicação com Google/visitante/URL sem `ref` após primeira visita; cinco compras, callbacks duplicados e pagamentos concorrentes.

### Provas automatizadas onde há dinheiro/autorização

Preço server-side; matriz SKU→inclusões; idempotência de PIX/crédito; saldo com mais de 50 movimentos; controle de proprietário; atribuição imutável; marcos concorrentes; resgate de 0,5 crédito; SKU inválido; revogação conforme política. Executar a suíte real do `package.json` (`npm test`) e os casos adicionados. Testes de layout trivial não substituem esses cenários.

Checagens: `npm run build`, `npm run lint`, varredura de segredos e auditoria de dependências. Reportar resultados reais e distinguir falha de ambiente de erro de código. Não usar dados ou pedidos reais de clientes para testar.

Rollback: desabilitar nova oferta mantém cobrança/status/ledger conciliáveis; reverter layout preserva dados e contratos. Nunca reverter migração removendo saldo já comprado. Publicação de cada lote acompanha commit, estado do deploy e smoke test próprio de criar/entrega.

## 15. O que fica entregue nesta etapa de projeto

- Este documento com decisões, propostas, contratos e ordem de implementação.
- Conceito navegável de criação e pós-compra, com tamanhos responsivos e dados ilustrativos.
- Duas fotografias editoriais geradas para a direção de arte, salvas no projeto em `docs/design/experiencia-v2/assets/`.
- Briefs/prompts e origem em `docs/design/experiencia-v2/IMAGENS.md`.

O redesign funcional completo, a nova cobrança de R$ 4,99 e as migrações serão implementados pelos lotes acima. O conceito não deve ser confundido com tela já publicada em produção.

## 16. Verificação deste entregável de projeto

- Sintaxe JavaScript do conceito validada; IDs sem duplicação e todos os recursos locais referenciados existentes.
- Quatro áreas do conceito identificadas: criação, prévia, entrega e indicações. A criação possui quatro passos demonstrativos.
- Fotografias inspecionadas e codificadas em WebP: família aproximadamente 92 KB e casal 90 KB, ambas 1280 × 853.
- Validação interativa e de layout em navegador não realizada nesta etapa: o navegador disponível bloqueou arquivos `file://` pela política de acesso. Os comportamentos e recortes ainda precisam de revisão manual no HTML antes de implementar as telas funcionais.
- Nenhum arquivo de aplicação, preço ativo, banco ou variável de ambiente foi alterado. Build e fluxo financeiro não foram executados novamente para este pacote de documentação/conceito.
- Não houve commit, push ou publicação deste novo projeto de experiência.
