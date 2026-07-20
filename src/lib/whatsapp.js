/**
 * Módulo de Integração com a Whats Evolution API
 */

export const getEvolutionConfig = () => {
  const url = process.env.EVOLUTION_API_URL || 'https://api.relaxsolucoes.online';
  const apiKey = process.env.EVOLUTION_API_KEY || '64C7EB8C-9A42-4A9C-B660-FC3517257DAD';
  const instance = process.env.EVOLUTION_INSTANCE || 'NSMusic';

  return { url, apiKey, instance };
};

/**
 * Formata um telefone brasileiro para o formato internacional 55+DDD+Número
 */
export const formatToWhatsAppNumber = (phone) => {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (!clean) return '';

  // Se já começar com 55 e tiver 12 ou 13 dígitos
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    return clean;
  }

  // Se for DDD + 8 ou 9 dígitos (ex: 94991064040 ou 9491064040)
  if (clean.length === 10 || clean.length === 11) {
    return `55${clean}`;
  }

  return clean;
};

/**
 * Verifica em tempo real se um número possui conta ativa no WhatsApp
 */
export const verifyWhatsAppNumber = async (phone) => {
  const { url, apiKey, instance } = getEvolutionConfig();
  const formattedNumber = formatToWhatsAppNumber(phone);

  if (!formattedNumber || formattedNumber.length < 12) {
    return { exists: false, reason: 'Número incompleto' };
  }

  try {
    const res = await fetch(`${url}/chat/whatsappNumbers/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        numbers: [formattedNumber]
      })
    });

    if (!res.ok) {
      console.warn("Aviso ao consultar Evolution API:", res.status);
      // Fallback permissivo se a API estiver fora do ar temporariamente
      return { exists: true, fallback: true };
    }

    const data = await res.json();
    
    // Tratamento dos retornos normais da Evolution API
    const result = Array.isArray(data) ? data[0] : (data.response?.[0] || data);
    
    const exists = result?.exists === true || result?.exists === 'true' || Boolean(result?.jid);

    return {
      exists,
      jid: result?.jid || `${formattedNumber}@s.whatsapp.net`,
      number: formattedNumber
    };
  } catch (error) {
    console.error("Erro na verificação de WhatsApp:", error);
    return { exists: true, fallback: true, error: error.message };
  }
};

/**
 * Envia uma mensagem de texto simples via WhatsApp
 */
export const sendWhatsAppMessage = async (phone, text) => {
  const { url, apiKey, instance } = getEvolutionConfig();
  const formattedNumber = formatToWhatsAppNumber(phone);

  if (!formattedNumber) return false;

  try {
    const res = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: formattedNumber,
        text
      })
    });

    return res.ok;
  } catch (error) {
    console.error("Erro ao enviar texto via WhatsApp:", error);
    return false;
  }
};
