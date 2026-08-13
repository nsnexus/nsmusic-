const PAGBANK_API_URL = 'https://api.pagseguro.com/orders';

/**
 * Cria uma cobrança PIX via API do PagBank.
 * @param {string} orderId ID do pedido no nosso sistema.
 * @param {number} amount Valor em reais (ex: 9.99).
 * @param {string} customerName Nome do cliente.
 * @param {string} customerEmail E-mail do cliente.
 * @param {object} env Variáveis de ambiente (process.env ou env do Cloudflare Edge).
 * @returns {object} Objeto com txid e pixCopiaECola.
 */
export async function createPagBankPixCharge(orderId, amount, customerName, customerEmail, env) {
  const token = env.PAGBANK_TOKEN || process.env.PAGBANK_TOKEN;
  
  if (!token) {
    throw new Error('PAGBANK_TOKEN não configurado.');
  }

  // PagBank espera valores em centavos inteiros (ex: 9.99 -> 999)
  const amountInCents = Math.round(amount * 100);
  
  // URL base para os webhooks. Idealmente vir de variável, fallback para o domínio principal.
  const baseUrl = env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://nsmusic.nsnexus.com.br';
  const notificationUrl = `${baseUrl}/api/webhooks/pagbank`;

  // Dados do pagador com o CNPJ hardcoded conforme combinado (Paliativo de conversão)
  const customer = {
    name: customerName || 'Cliente NSMusic',
    email: customerEmail || 'contato@nsnexus.com.br',
    tax_id: '68471413000198' // CNPJ Fixo da empresa
  };

  const payload = {
    reference_id: orderId,
    customer,
    items: [
      {
        name: 'Música Homenagem Personalizada',
        quantity: 1,
        unit_amount: amountInCents
      }
    ],
    qr_codes: [
      {
        amount: {
          value: amountInCents
        }
      }
    ],
    notification_urls: [
      notificationUrl
    ]
  };

  const response = await fetch(PAGBANK_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[PagBank] Erro HTTP ${response.status}:`, errorText);
    throw new Error(`Erro na API do PagBank: ${response.status}`);
  }

  const data = await response.json();

  if (!data.qr_codes || data.qr_codes.length === 0 || !data.qr_codes[0].text) {
    console.error('[PagBank] Resposta inválida (sem QR Code):', data);
    throw new Error('PagBank não retornou o QR Code.');
  }

  return {
    txid: data.id, // O ID do pedido no PagBank
    pixCopiaECola: data.qr_codes[0].text
  };
}

/**
 * Consulta o status de um pedido no PagBank.
 * @param {string} pagbankOrderId ID do pedido retornado pelo PagBank.
 * @param {object} env Variáveis de ambiente.
 * @returns {object} Status da cobrança (ex: PAID, WAITING).
 */
export async function getPagBankChargeStatus(pagbankOrderId, env) {
  const token = env.PAGBANK_TOKEN || process.env.PAGBANK_TOKEN;
  
  if (!token) {
    throw new Error('PAGBANK_TOKEN não configurado.');
  }

  const url = `${PAGBANK_API_URL}/${pagbankOrderId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Erro ao consultar PagBank: ${response.status}`);
  }

  const data = await response.json();
  
  // No PagBank, os status de cobrança costumam ser: PAID, WAITING, CANCELED, DECLINED
  const status = data.charges && data.charges.length > 0 
    ? data.charges[0].status 
    : 'WAITING';

  return {
    status: status, // Ex: 'PAID'
    amount: data.charges && data.charges.length > 0 && data.charges[0].amount ? (data.charges[0].amount.value / 100) : 0
  };
}
