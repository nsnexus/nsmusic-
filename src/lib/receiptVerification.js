// Extração automática de dados de comprovante Pix via visão da OpenAI — parte do fluxo PROVISÓRIO
// de liberação automática enquanto a Efí está bloqueada (ver docs/EFI_SETUP.md e CLAUDE.md).
//
// ATENÇÃO — exceção deliberada à regra 3 do CLAUDE.md ("não liberar recurso pago sem confirmação do
// provedor de pagamento verificada no servidor"): isto NÃO é uma confirmação real de pagamento, é
// uma checagem heurística (formato do ID + valor + não-reuso) sobre uma IMAGEM, que pode ser
// forjada. Decisão consciente do dono do produto em 2026-08-13, para vigorar só até o desbloqueio da
// Efí — ver a rota que consome este módulo (api/payments/verify-receipt) para os detalhes da
// validação e o fallback manual quando ela falha.

function readEnvValue(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

// ID ponta-a-ponta (E2E) do Pix, formato fixo do Bacen: "E" + ISPB (8 dígitos) + data AAAAMMDD (8) +
// hora HHmm (4) + sequencial alfanumérico (11) = 32 caracteres. Confere só o FORMATO — não prova que
// o ID existe de verdade num sistema bancário (ver aviso acima).
const E2E_ID_PATTERN = /^E\d{20}[A-Za-z0-9]{11}$/;

export function isValidE2eIdFormat(e2eId) {
  return typeof e2eId === 'string' && E2E_ID_PATTERN.test(e2eId.trim());
}

/**
 * Envia a imagem do comprovante para a OpenAI (gpt-4o-mini, com visão) e pede extração estruturada.
 * @param {string} imageBase64 imagem em base64, sem o prefixo `data:...;base64,`
 * @param {string} mimeType ex: 'image/jpeg', 'image/png'
 * @param {object} env contexto de ambiente resolvido pela rota chamadora
 * @returns {Promise<{valor: number|null, e2eId: string|null, dataHora: string|null, recebedor: string|null}>}
 */
export async function extractReceiptData(imageBase64, mimeType, env) {
  const apiKey = readEnvValue(env, 'OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada.');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Você extrai dados de comprovantes de pagamento Pix brasileiros a partir de uma imagem. ' +
            'Responda SOMENTE com um JSON no formato exato ' +
            '{"valor": number|null, "e2eId": string|null, "dataHora": string|null, "recebedor": string|null}. ' +
            'valor: quantia paga em reais, como número (ex: 9.99). ' +
            'e2eId: o ID da transação / identificador Pix / "ID Fim a Fim" / "E2E ID" — geralmente começa ' +
            'com a letra E seguida de 31 dígitos/letras, total 32 caracteres. Copie exatamente como aparece, ' +
            'sem espaços. Se não encontrar esse campo específico, use null — não invente nem aproxime. ' +
            'dataHora: data e hora do pagamento no formato ISO 8601 se possível. ' +
            'recebedor: nome ou chave Pix de quem recebeu o pagamento, como aparece no comprovante. ' +
            'Se a imagem não for um comprovante Pix legível, retorne todos os campos como null.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia os dados deste comprovante Pix.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`OpenAI vision error ${res.status}: ${errText}`);
    err.openAiStatus = res.status;
    throw err;
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI respondeu sem conteúdo utilizável.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('Resposta da OpenAI não é um JSON válido.');
  }

  return {
    valor: typeof parsed.valor === 'number' ? parsed.valor : null,
    e2eId: typeof parsed.e2eId === 'string' ? parsed.e2eId.trim() : null,
    dataHora: typeof parsed.dataHora === 'string' ? parsed.dataHora : null,
    recebedor: typeof parsed.recebedor === 'string' ? parsed.recebedor : null,
  };
}
