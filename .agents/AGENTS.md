# Regras do Projeto NSMusic

## 1. Visão Geral
O NSMusic é uma plataforma de músicas personalizadas com IA (Suno AI via Kie.ai + Gemini/OpenAI), pagamento via Mercado Pago (PIX), notificações WhatsApp (W-API), Firebase Firestore como banco e Firebase Storage para arquivos. Deploy automático no Cloudflare Pages via Edge Runtime.

## 2. Stack Principal
- **Framework**: Next.js 14 (App Router, JavaScript, sem TypeScript)
- **Runtime**: Cloudflare Pages Edge (`@cloudflare/next-on-pages`)
- **Banco de dados**: Firebase Firestore (coleções: `orders`, `suno_tasks`)
- **Storage**: Firebase Storage (fotos de vídeo homenagem)
- **Autenticação**: Firebase Auth (admin + área "Minhas Músicas")
- **Pagamento**: Mercado Pago API (PIX direto + Preferência)
- **IA**: Kie.ai (Suno AI) para música, OpenAI/Gemini para letras
- **WhatsApp**: W-API (api.w-api.app)
- **Estilização**: CSS inline (`style={{}}`) + classes globais em `globals.css`

## 3. Regras Obrigatórias para Next.js
- **Estilização**: NUNCA utilize classes do Tailwind CSS (ex: `flex`, `hidden`, `z-50`, `fixed`, `inset-0`). Usar apenas CSS inline e classes de `globals.css`.
- NUNCA use `export const runtime = 'edge'` em páginas `'use client'`. Isso é válido APENAS para Route Handlers (rotas em `src/app/api/`).
- Preferir Server Components quando a página não precisa de interatividade (ex: termos de uso, política de privacidade).
- Usar `'use client'` apenas quando necessário (hooks, event handlers, browser APIs).
- Não criar middleware que dependa de Node.js APIs (o runtime é Edge/Cloudflare).
- Todas as rotas API devem ter `export const runtime = 'edge'`.

## 4. Regras para React
- Não alterar ou invocar funções sem verificar previamente a lista de parâmetros e assinaturas exatas no arquivo de origem.
- Não criar componentes com mais de 400 linhas. Decompor em sub-componentes.
- Evitar useEffect desnecessário. Preferir event handlers.
- Sempre verificar dependências de useEffect.
- Não duplicar funções — extrair para `src/lib/`.
- Garantir estados de loading, erro e vazio em todas as telas.

## 5. Regras de Segurança
- **NUNCA hardcodar secrets, tokens, API keys ou credenciais** no código-fonte. Usar SEMPRE `process.env.NOME_DA_VARIAVEL`.
- NUNCA usar fallback hardcoded para secrets (ex: `process.env.TOKEN || 'valor-real-aqui'`).
- Rotas API sensíveis DEVEM validar autenticação (Firebase Auth token no header) antes de processar.
- Webhooks externos (Mercado Pago, Kie.ai) DEVEM validar a autenticidade da requisição (assinatura, re-consulta à API de origem).
- NUNCA expor dados do pagador, tokens de pagamento ou informações pessoais em logs de console.
- Validar e sanitizar TODOS os inputs do usuário no backend antes de persistir.

## 6. Regras para Tratamento de Erros e Respostas de API
- Toda rota de API (`src/app/api/...`) deve tratar exceções de forma explícita e retornar JSON de erro estruturado: `{ error: "mensagem" }`.
- No frontend, chamadas assíncronas devem obrigatoriamente tratar cenários onde `!res.ok` e exibir feedback visual (como `alert()` ou mensagem na tela) em vez de travar o estado em um carregamento infinito (`loading = true`).
- Webhooks devem retornar `status: 200` mesmo em caso de erro para evitar retentativas infinitas.

## 7. Regras para Fluxos de Pagamento (Mercado Pago & Firebase)
- Isolar claramente o pagamento principal do áudio (R$ 9,99) do pagamento adicional do Vídeo Homenagem (R$ 6,90).
- NUNCA conceder acesso a recursos pagos (como upload de fotos para o vídeo) antes da confirmação real do pagamento (seja PIX ou Cartão).
- Sanitizar sempre dados do pagador (`payer`: `email`, `first_name`, `last_name`) para prevenir rejeição do Mercado Pago por campos vazios ou sem sobrenome.
- Comparações de valores monetários devem usar tolerância (`Math.abs(a - b) < 0.01`), NUNCA comparação direta de floats (`===`).
- O campo `paymentStatus` deve seguir os valores padronizados: `PENDENTE`, `PAGAMENTO_APROVADO`, `PAGO`.
- **Webhooks (POST & GET IPN)**: Webhooks do Mercado Pago DEVEM tratar requisições tanto `POST` (body JSON `data.id`) quanto `GET` (IPN `?topic=payment&id=...` ou `?type=payment`).
- **Sanitização de `paymentId` por Regex**: Sempre extrair os dígitos numéricos do `paymentId` via regex (`String(id).match(/\d+/)[0]`) antes de consultar a API do Mercado Pago, eliminando sufixos ou caracteres de formatação (ex: `:1`).
- **Busca de Fallback (`external_reference`)**: Se o `paymentId` específico estiver `pending`, a consulta DEVE realizar busca alternativa no Mercado Pago por `external_reference=${orderId}&sort=date_created&criteria=desc&limit=5`. Se QUALQUER pagamento gerado para aquele pedido foi aprovado, o pedido DEVE ser aprovado imediatamente.
- **Isolamento de Notificações**: Envios de mensagens (WhatsApp) na aprovação do pagamento DEVEM estar isolados em `try/catch` próprios para que uma falha de envio nunca impeça a resposta de sucesso do webhook ou da rota de status.

## 8. Regras para Banco de Dados (Firestore)
- Sempre usar `new Date().toISOString()` para campos de data (nunca `new Date()` que gera Timestamp nativo).
- Ao ler datas, sempre tratar ambos os formatos: Firestore Timestamp (`.toDate()`) e string ISO.
- Não criar queries sem filtro em coleções grandes (usar `where`, `limit`).
- Usar `runTransaction` para operações que precisam de atomicidade (ex: envio de WhatsApp, atualização de status).
- O campo `orderNumber` deve ser único — usar timestamp + random para evitar colisões.

## 9. Regras para Performance
- Não importar o Firebase SDK inteiro — usar imports modulares (`import { doc, getDoc } from 'firebase/firestore'`).
- Considerar `dynamic()` do Next.js para componentes pesados que não são necessários no carregamento inicial.
- Usar `next/image` para imagens quando possível.
- Minimizar código client-side — mover lógica de dados para Server Components ou Route Handlers.

## 10. Regras para UX/UI e Acessibilidade
- Todas as ações assíncronas devem ter loading state visual.
- Todas as ações devem ter feedback de sucesso ou erro.
- Formulários devem ter labels em todos os campos.
- Botões interativos devem ter `type="button"` explícito (exceto submit).
- Usar fontes definidas no Design System (`var(--font-family-title)`, `var(--font-family-body)`).

## 11. Regras para Hospedagem e Deploy
- O projeto roda exclusivamente na **Cloudflare Pages** (usando `@cloudflare/next-on-pages` e Edge Runtime). NUNCA mencione ou assuma Vercel.
- Domínios: `nsmusic.nsnexus.com.br` e `nsmusic.pages.dev`.
- Deploy automático via Webhook do GitHub a cada `git push origin master`.

## 12. Regras para Variáveis de Ambiente
- Secrets de servidor (API keys, tokens): usar `process.env.NOME` sem prefixo `NEXT_PUBLIC_`.
- Configurações públicas (Firebase client config, site URL): usar `NEXT_PUBLIC_` prefix.
- Sempre documentar novas variáveis no `.env.example`.
- NUNCA commitar `.env.local` no repositório.

## 13. Regras para Commits e Alterações
- Fazer alterações pequenas, seguras e rastreáveis.
- Não alterar regra de negócio sem evidência clara.
- Não instalar dependências sem justificar.
- Não mover arquivos sem necessidade.
- Preservar comportamento existente salvo solicitação explícita.
- Explicar impacto das mudanças feitas.

## 14. Regras para Atuação da IA no Projeto
- Antes de alterar código, entender o contexto completo (ler AGENTS.md, SKILL.md, verificar assinaturas).
- Quando o usuário fizer uma pergunta, responder primeiro de forma clara. Não fazer ajustes no código a menos que pedido explicitamente.
- Nunca usar event handlers inline (ex: onclick, onerror) em HTML para projetos SharePoint (CSP bloqueia unsafe-inline).
- Manter build e lint funcionando após qualquer alteração.
- Nunca confiar apenas em validação no frontend.
- Testar alterações verificando build (`npm run build`) quando Node.js estiver disponível.
