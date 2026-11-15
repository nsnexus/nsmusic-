// Conferência automática da letra gerada pela IA, ANTES de ela chegar ao cliente.
// Motivo (13/11/2026): a mãe informou o nome do filho (Eric) e a letra saiu só com "filho", sem o
// nome. O cliente ouve, vê o erro e não paga; e o estúdio precisa gerar de novo. São erros
// objetivos, que dá para conferir em código sem gastar outra chamada de IA.

export function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function contem(letraNorm, trecho) {
  const t = normalizarTexto(trecho).trim();
  if (!t) return true;
  return letraNorm.includes(t);
}

// Primeiro nome com 2+ letras (ignora partículas como "de", "da").
function primeiroNome(nomeCompleto) {
  const partes = String(nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
  return partes.find((p) => p.replace(/[^\p{L}]/gu, '').length >= 2) || '';
}

export function validarLetra({ lyrics, honoreeName, requiredNames, requiredPhrase } = {}) {
  const problemas = [];
  const letra = String(lyrics || '');
  const norm = normalizarTexto(letra);

  const nome = primeiroNome(honoreeName);
  if (nome && !contem(norm, nome)) {
    problemas.push(`O nome "${nome}" não aparece na letra. Use o nome "${nome}" de forma explícita, no refrão e em pelo menos mais um verso.`);
  }

  String(requiredNames || '')
    .split(/[,;\n]| e /i)
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)
    .forEach((n) => {
      if (!contem(norm, primeiroNome(n) || n)) problemas.push(`O nome obrigatório "${n}" não aparece na letra.`);
    });

  if (requiredPhrase && !contem(norm, requiredPhrase)) {
    problemas.push(`A frase obrigatória "${requiredPhrase}" não aparece exatamente na letra.`);
  }

  if (/\((?:voz|cantor|juntos|coro)[^)]*\)/i.test(letra)) {
    problemas.push('Há anotações de voz entre parênteses; remova (a Suno canta isso literalmente).');
  }

  if (!/\[(?:refr[aã]o)[^\]]*\]/i.test(letra)) {
    problemas.push('Falta o cabeçalho [Refrão].');
  }

  return problemas;
}
