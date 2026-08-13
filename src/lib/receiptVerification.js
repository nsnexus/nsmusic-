// Extração automática de dados de comprovante Pix via IA (OpenAI) — parte do fluxo PROVISÓRIO de
// liberação automática enquanto a Efí está bloqueada (ver docs/EFI_SETUP.md e CLAUDE.md).
//
// ATENÇÃO — exceção deliberada à regra 3 do CLAUDE.md ("não liberar recurso pago sem confirmação do
// provedor de pagamento verificada no servidor"): isto NÃO é uma confirmação real de pagamento, é
// uma checagem heurística (formato do ID + valor + não-reuso) sobre um arquivo enviado pelo cliente,
// que pode ser forjado. Decisão consciente do dono do produto em 2026-08-13, para vigorar só até o
// desbloqueio da Efí — ver a rota que consome este módulo (api/payments/verify-receipt) para os
// detalhes da validação e o fallback manual quando ela falha.
//
// Dois caminhos de extração, conforme o tipo de arquivo:
//   - Imagem (foto/print do app do banco): visão da OpenAI direto sobre a imagem.
//   - PDF (comprovante exportado pelo banco): a maioria tem texto selecionável, não é digitalização
//     escaneada — extrai o texto com `unpdf` (roda em Edge Runtime, sem canvas/Node nativo) e manda
//     o TEXTO pra IA, mais barato e mais confiável que tentar "ver" o PDF.

import { extractText, getDocumentProxy } from 'unpdf';

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

const SYSTEM_PROMPT =
  'Você extrai dados de comprovantes de pagamento Pix brasileiros. ' +
  'Responda SOMENTE com um JSON no formato exato ' +
  '{"valor": number|null, "e2eId": string|null, "dataHora": string|null, "recebedor": string|null}. ' +
  'valor: quantia paga em reais, como número (ex: 9.99). ' +
  'e2eId: o ID da transação / identificador Pix / "ID Fim a Fim" / "E2E ID" — geralmente começa ' +
  'com a letra E seguida de 31 dígitos/letras, total 32 caracteres. Copie exatamente como aparece, ' +
  'sem espaços. Se não encontrar esse campo específico, use null — não invente nem aproxime. ' +
  'dataHora: data e hora do pagamento no formato ISO 8601 se possível. ' +
  'recebedor: nome ou chave Pix de quem recebeu o pagamento, como aparece no comprovante. ' +
  'Se o conteúdo não for um comprovante Pix legível, retorne todos os campos como null.';

async function callOpenAiJson(userContent, env) {
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`OpenAI error ${res.status}: ${errText}`);
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

// PDFs de comprovante às vezes vêm sem nenhuma camada de texto (ex: um scan/foto salva como PDF) —
// nesse caso `unpdf` devolve string vazia/só espaços, e é melhor falhar cedo com um motivo claro do
// que mandar uma string vazia pra IA e deixá-la inventar campos.
async function extractTextFromPdf(fileBase64) {
  const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  if (!text || !text.trim()) {
    throw new Error('PDF sem texto extraível (provável digitalização/imagem dentro do PDF).');
  }
  return text;
}

/**
 * Extrai valor/ID/data/recebedor de um comprovante Pix, imagem ou PDF.
 * @param {string} fileBase64 arquivo em base64, sem o prefixo `data:...;base64,`
 * @param {string} mimeType 'image/jpeg' | 'image/png' | ... | 'application/pdf'
 * @param {object} env contexto de ambiente resolvido pela rota chamadora
 * @returns {Promise<{valor: number|null, e2eId: string|null, dataHora: string|null, recebedor: string|null}>}
 */
export async function extractReceiptData(fileBase64, mimeType, env) {
  if (mimeType === 'application/pdf') {
    const text = await extractTextFromPdf(fileBase64);
    // Corta pra não estourar o limite de contexto em PDFs anormalmente longos — um comprovante
    // Pix real tem poucas linhas; texto muito maior que isso já indica arquivo errado.
    const trimmed = text.slice(0, 6000);
    return callOpenAiJson(
      [{ type: 'text', text: `Extraia os dados deste comprovante Pix (texto extraído de um PDF):\n\n${trimmed}` }],
      env
    );
  }

  return callOpenAiJson(
    [
      { type: 'text', text: 'Extraia os dados deste comprovante Pix.' },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
    ],
    env
  );
}
