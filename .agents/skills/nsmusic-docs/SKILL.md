---
name: nsmusic-docs
description: Guia de arquitetura, banco de dados e fluxos do projeto NSMusic para o assistente Antigravity.
---

# Arquitetura do Sistema NSMusic

## 1. Visão Geral do Fluxo do Usuário
1. **Página Inicial / Criar (`/criar`)**:
   - O usuário escolhe o estilo da música e insere os dados do homenageado (nome, história, tom, etc.).
   - A letra é gerada via Gemini API (`/api/lyrics/generate`), que faz failover inteligente caso uma chave falhe.
   - A música é solicitada via Suno AI / Kie.ai API (`/api/suno/generate`). O backend da Kie.ai processa isso assincronamente.
   - **Prévia de Áudio**: O cliente ouve a prévia de 60s da música (`/entrega` em estado PENDENTE). Aqui é apresentado o card opcional de Vídeo Homenagem (+ R$ 6,90).
   - **Checkout**: O usuário seleciona a forma de pagamento (PIX direto via Mercado Pago API ou Cartão via Preferência). O valor é R$ 9,99 só áudio ou R$ 16,89 combo com vídeo.
2. **Página de Entrega (`/entrega`)**:
   - Centraliza o player e liberação dos recursos após o pagamento.
   - Se comprou apenas música, há um upsell do Vídeo (R$ 6,90).
   - Quando pago (`paymentStatus === 'PAGO'` ou `'PAGAMENTO_APROVADO'`), o áudio completo e download são liberados.
   - Acesso ao vídeo (`hasVideoAccess === true`) permite o envio de fotos para a geração de um slideshow MP4 em HD.
3. **Página Acompanhar (`/acompanhar`)**:
   - Permite ao usuário ver a timeline e o status de sua homenagem.

## 2. Estrutura do Banco de Dados (Firestore)
- **Coleção `orders`**: Armazena os pedidos. Campos essenciais:
  - `customerName`, `customerPhone`, `customerEmail`, `honoreeName`
  - `lyrics` (texto final da letra), `sunoTaskId`, `sunoTracks` (array de objetos com áudios da Kie.ai)
  - `orderNumber`: formato `NS-XXXXX-2026`.
  - `paymentStatus`: Deve ser ESTRITAMENTE um de `'PENDENTE'`, `'PAGAMENTO_APROVADO'`, ou `'PAGO'`.
  - `paymentId`: ID do pagamento principal (Mercado Pago).
  - `videoPaymentId`: ID do pagamento avulso do vídeo (se aplicável).
  - `hasVideoAccess`: boolean.
  - `videoAddonPaid`: boolean.
  - `videoUrl`: link do Storage.
  - `whatsappSent`: boolean garantindo envio único.
  - `paymentWhatsappSent`: boolean garantindo envio único.

- **Mercado Pago (`/api/webhooks/mercadopago`)**: Recebe requisições POST (`data.id`) e GET (IPN `topic=payment&id=...`). Sanitiza o `paymentId` com regex (`\d+`), valida no MP, atualiza Firestore para `PAGAMENTO_APROVADO` e realiza busca alternativa por `external_reference` (`payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=5`) para garanitir resiliência se múltiplos PIX forem gerados.
- **Kie.ai (Suno) (`/api/suno/webhook` e `/api/suno/status`)**: Webhook recebe POST quando a geração é concluída. Há também uma rota de polling em `/api/suno/status`.
- **W-API (WhatsApp) (`/api/whatsapp/notify`, `/send`, `/verify`)**: Integração com Evolution API/W-API. Exige os cabeçalhos de token e validação correta do número.

## 4. Nuvem e Runtime (Cloudflare)
- **Edge Runtime**: O projeto é hospedado na Cloudflare Pages.
- TODAS as rotas em `src/app/api/` devem possuir `export const runtime = 'edge'`.
- NUNCA use bibliotecas exclusivas de ambiente Node.js nas APIs e páginas, pois elas quebrarão no Edge. (ex: `fs`, dependências pesadas do Firebase Admin, etc).

## 5. Cuidados de Segurança
- As chaves de API (W-API, Mercado Pago, Firebase, Kie.ai, Gemini/OpenAI) NUNCA devem estar "hardcoded" no código. Acesse SEMPRE via `process.env`.
- Não confie apenas no frontend para liberação de features pagas. Confirme dados no backend/Firestore.

## 6. Documentos Importantes (Leia AGENTS.md)
O comportamento, as restrições e regras de estilo e projeto estão definidas de maneira exaustiva no arquivo `.agents/AGENTS.md`. SEMPRE revise-o antes de alterar as rotas.
