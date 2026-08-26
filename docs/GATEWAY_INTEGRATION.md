# Guia de Integração — NSNexus Pay (Gateway Centralizado Pix)

Este documento contém o passo a passo completo, especificações da API e códigos de exemplo prontos para plugar o gateway de pagamentos do **NSMusic / NSNexus** em qualquer novo sistema, produto ou plataforma (ex: *Método 21 Dias* e futuros SaaS/e-commerces).

---

## 1. Como a Arquitetura Funciona

```
[ Novo Projeto (ex: Método 21 Dias) ]
    │
    │ 1. POST /api/gateway/v1/charges (Gera Pix)
    ▼
[ NSMusic Gateway Hub ] ───(mTLS via Cloudflare Worker)───► [ Efí Pix ]
    │                                                            │
    │ 2. Webhook /api/webhooks/efi (Pagamento confirmado)       │
    ▼                                                            │
[ NSMusic Gateway Hub ] ◄────────────────────────────────────────┘
    │
    │ 3. POST /api/webhooks/payment (Notifica o novo site)
    ▼
[ Novo Projeto (Libera o acesso do cliente) ]
```

- **Isolamento Total:** Cada site continua com seu próprio banco de dados, autenticação e regras de negócio.
- **Zero burocracia de certificados:** O novo site só faz um `fetch()` JSON comum (não precisa configurar mTLS nem certificado `.pem` na Cloudflare de novo).

---

## 2. Variáveis de Ambiente no Novo Projeto

No `.env.local` (e nas variáveis de deploy) do seu novo projeto, adicione:

```env
# URL do Hub do NSMusic
NSNEXUS_GATEWAY_URL=https://nsmusic.nsnexus.com.br

# A mesma chave secreta configurada no Cloudflare Pages do NSMusic
NSNEXUS_GATEWAY_API_KEY=sua_chave_secreta_aqui
```

---

## 3. Código do Cliente (TypeScript / JavaScript)

Crie o arquivo `src/lib/nsnexusPay.ts` (ou `.js`) no seu novo projeto:

```typescript
export interface CreatePixOptions {
  appId: string;           // Identificador do seu sistema (ex: 'metodo-21-dias')
  externalOrderId: string; // ID do pedido no banco de dados do seu novo site
  amount: number;          // Valor em Reais (ex: 49.90)
  description?: string;    // Mensagem que aparece no extrato do cliente
  webhookUrl?: string;     // URL pública do webhook do seu site que receberá o aviso
  payer?: {
    name?: string;
    email?: string;
    phone?: string;
    cpf?: string;
  };
}

export interface PixResponse {
  success: boolean;
  txid: string;
  pixCopiaECola: string;
  status: 'PENDING' | 'PAID';
  amount: number;
  appId: string;
  externalOrderId: string;
  createdAt: string;
}

/**
 * Gera uma cobrança Pix através do Gateway Centralizado NSNexus
 */
export async function createPixPayment(options: CreatePixOptions): Promise<PixResponse> {
  const gatewayUrl = process.env.NSNEXUS_GATEWAY_URL || 'https://nsmusic.nsnexus.com.br';
  const apiKey = process.env.NSNEXUS_GATEWAY_API_KEY;

  if (!apiKey) {
    throw new Error('NSNEXUS_GATEWAY_API_KEY não configurada no .env.');
  }

  const response = await fetch(`${gatewayUrl}/api/gateway/v1/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Api-Key': apiKey,
    },
    body: JSON.stringify({
      appId: options.appId,
      externalOrderId: options.externalOrderId,
      amount: options.amount,
      description: options.description || `Pagamento ${options.appId} - ${options.externalOrderId}`,
      webhookUrl: options.webhookUrl,
      payer: options.payer,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erro ao gerar Pix no Gateway (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Consulta o status atual de uma cobrança Pix
 */
export async function getPixPaymentStatus(txid: string) {
  const gatewayUrl = process.env.NSNEXUS_GATEWAY_URL || 'https://nsmusic.nsnexus.com.br';
  const apiKey = process.env.NSNEXUS_GATEWAY_API_KEY;

  const response = await fetch(`${gatewayUrl}/api/gateway/v1/charges/${txid}`, {
    headers: {
      'X-Gateway-Api-Key': apiKey || '',
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao consultar status no Gateway (HTTP ${response.status})`);
  }

  return response.json();
}
```

---

## 4. Rota Receptora de Webhook no Novo Projeto

Crie a rota `src/app/api/webhooks/payment/route.ts` no seu novo projeto para liberar o acesso assim que o cliente pagar:

```typescript
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 1. Validação de Segurança: Garante que a requisição veio do seu Gateway
    const signature = req.headers.get('x-gateway-signature') || req.headers.get('x-gateway-secret');
    const expectedSecret = process.env.NSNEXUS_GATEWAY_API_KEY;

    if (!signature || signature !== expectedSecret) {
      return NextResponse.json({ error: 'Não autorizado: assinatura inválida' }, { status: 401 });
    }

    const payload = await req.json();
    const { event, appId, externalOrderId, txid, amount, status, paidAt } = payload;

    // 2. Processamento da Aprovação
    if (event === 'payment.approved' && status === 'PAID') {
      console.log(`[Webhook] Pagamento confirmado para o pedido ${externalOrderId} (R$ ${amount})`);

      // >>> COLOQUE AQUI SUA LÓGICA DE LIBERAÇÃO <<<
      // Exemplo:
      // await db.collection('orders').doc(externalOrderId).update({
      //   status: 'PAGO',
      //   paidAt: paidAt || new Date().toISOString(),
      //   txid: txid
      // });
      // await enviarEmailBoasVindas(externalOrderId);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('[Webhook] Erro ao processar:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

## 5. Especificação dos Endpoints da API

### `POST /api/gateway/v1/charges`
Cria uma nova cobrança Pix.

- **Headers:**
  - `X-Gateway-Api-Key`: `<GATEWAY_API_KEY>` (ou `Authorization: Bearer <GATEWAY_API_KEY>`)
  - `Content-Type`: `application/json`
- **Body:**
  ```json
  {
    "appId": "metodo-21-dias",
    "externalOrderId": "PED-987654",
    "amount": 49.90,
    "description": "Acesso Método 21 Dias",
    "webhookUrl": "https://metodo21dias.com.br/api/webhooks/payment",
    "payer": {
      "name": "Nome do Cliente",
      "email": "cliente@email.com"
    }
  }
  ```
- **Resposta de Sucesso (HTTP 201):**
  ```json
  {
    "success": true,
    "txid": "METODO_PED987654_...",
    "pixCopiaECola": "00020126580014br.gov.bcb.pix...",
    "status": "PENDING",
    "amount": 49.90,
    "appId": "metodo-21-dias",
    "externalOrderId": "PED-987654",
    "createdAt": "2026-08-26T12:00:00.000Z"
  }
  ```

---

### `GET /api/gateway/v1/charges/:txid`
Consulta o status de uma cobrança por `txid` (com auto-reconciliação em tempo real na Efí).

- **Headers:**
  - `X-Gateway-Api-Key`: `<GATEWAY_API_KEY>`
- **Resposta de Sucesso (HTTP 200):**
  ```json
  {
    "success": true,
    "txid": "METODO_PED987654_...",
    "appId": "metodo-21-dias",
    "externalOrderId": "PED-987654",
    "amount": 49.90,
    "status": "PAID",
    "paidAt": "2026-08-26T12:05:00.000Z",
    "createdAt": "2026-08-26T12:00:00.000Z"
  }
  ```
