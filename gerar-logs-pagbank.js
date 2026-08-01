const fs = require('fs');

// COLOQUE SEU TOKEN DE SANDBOX AQUI
const PAGBANK_TOKEN = 'SEU_TOKEN_SANDBOX_AQUI';

async function testPagBank() {
  if (!PAGBANK_TOKEN || PAGBANK_TOKEN === 'SEU_TOKEN_SANDBOX_AQUI') {
    console.error("❌ ERRO: Por favor, edite este arquivo e coloque o seu Token de Sandbox na variável PAGBANK_TOKEN.");
    return;
  }

  const payload = {
    reference_id: `NS-TESTE-${Date.now()}`,
    customer: {
      name: "Cliente Teste Silva",
      email: "teste@nsmusic.com.br",
      tax_id: "00851895298", // CPF válido de teste
      phones: [
        { country: "55", area: "11", number: "999999999", type: "MOBILE" }
      ]
    },
    items: [
      {
        name: "Música Personalizada - Homenagem Teste",
        quantity: 1,
        unit_amount: 999
      }
    ],
    qr_codes: [
      {
        amount: { value: 999 }
      }
    ],
    notification_urls: [
      "https://nsmusic.nsnexus.com.br/api/webhooks/pagbank"
    ]
  };

  console.log("Enviando requisição real para o Sandbox do PagBank...\n");
  
  const requestLog = `=== REQUEST ENVIADO ===\nPOST https://sandbox.api.pagseguro.com/orders\nHeaders:\n- Authorization: Bearer [OCULTO por segurança]\n- Content-Type: application/json\n- accept: application/json\n\nBody (JSON enviado):\n${JSON.stringify(payload, null, 2)}\n\n`;
  
  try {
    const res = await fetch('https://sandbox.api.pagseguro.com/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    
    const responseLog = `=== RESPONSE RECEBIDA ===\nHTTP Status: ${res.status}\n\nBody (JSON retornado pelo PagBank):\n${JSON.stringify(data, null, 2)}\n`;
    
    const fullLog = requestLog + responseLog;
    fs.writeFileSync('pagbank_sandbox_logs.txt', fullLog);
    
    console.log("✅ SUCESSO! A requisição foi feita e o arquivo de log real foi gerado.");
    console.log("O arquivo 'pagbank_sandbox_logs.txt' foi salvo na pasta do seu projeto.");
    console.log("Pode anexar esse arquivo lá no formulário do PagSeguro!");
  } catch (error) {
    console.error("❌ Erro de conexão:", error);
  }
}

testPagBank();
