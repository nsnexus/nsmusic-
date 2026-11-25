// Roteiro de "criar uma música nova" no chat de suporte (/suporte) — puro, sem rede, usado pela
// página e pelos testes.
//
// Perguntas curtas, uma por vez, do jeito do /criar: pra quem é, o que a pessoa é sua, ocasião,
// história, ritmo, voz, clima, seu nome e seu WhatsApp. Pergunta já respondida é pulada — inclusive
// quando o cliente manda a história inteira de cara e a IA preenche o que ele já disse
// (ver src/lib/suporteNovaMusica.js:extrairDadosDaHistoria).
//
// As opções são as mesmas ids do wizard (src/app/criar/wizardOptions.js), para o pedido sair igual
// ao do site.

import { recipients, occasions, stylesList, moods } from '../app/criar/wizardOptions.js';

const op = (lista, ids) => ids.map((id) => {
  const item = lista.find((x) => x.id === id);
  return { id: `nova:${id}`, label: item?.label || id };
});

const RELACOES = op(recipients, ['Mãe', 'Pai', 'Esposa', 'Marido', 'Namorada', 'Namorado', 'Filha', 'Filho', 'Vó', 'Vô', 'Irmã', 'Irmão', 'Amiga', 'Amigo', 'Outro']);
const OCASIOES = op(occasions, ['Aniversário', 'Aniv. de Casamento', 'Dia das Mães', 'Declaração de Amor', 'Pedido de Namoro', 'Homenagem', 'Surpresa', 'Formatura', 'Outro']);
const RITMOS = op(stylesList, ['Sertanejo Universitário', 'Sertanejo Raiz', 'Samba / Pagode', 'Gospel / Adoração', 'Forró / Baião', 'Piseiro', 'Funk', 'MPB / Bossa Nova', 'Pop', 'Romântica', 'Rock']);
const CLIMAS = op(moods, ['Emocionante', 'Alegre', 'Romântica', 'Festiva', 'Nostálgica', 'Calma']);
const VOZES = [{ id: 'nova:masculina', label: 'Masculina' }, { id: 'nova:feminina', label: 'Feminina' }, { id: 'nova:dueto', label: 'Dueto (as duas)' }];

export const VALORES_VALIDOS = {
  relationship: new Set(recipients.map((x) => x.id)),
  occasion: new Set(occasions.map((x) => x.id)),
  musicStyle: new Set(stylesList.map((x) => x.id)),
  musicMood: new Set(moods.map((x) => x.id)),
  voiceType: new Set(['masculina', 'feminina', 'dueto']),
};

export const CAMPOS_VAZIOS = {
  honoreeName: '', relationship: '', occasion: '', story: '', musicStyle: '', voiceType: '', musicMood: '', customerName: '', customerPhone: '',
};

const MIN_HISTORIA = 25;

/** A próxima pergunta, ou null quando já dá pra escrever a letra. */
export function proximaEtapa(c) {
  const nome = c.honoreeName || 'essa pessoa';
  if (!c.honoreeName) return { etapa: 'honoreeName', texto: 'Bora! Pra quem é a música? Me fala o nome da pessoa.', teclado: 'texto' };
  if (!c.relationship) return { etapa: 'relationship', texto: `*${nome}* é o quê seu?`, opcoes: RELACOES };
  if (!c.occasion) return { etapa: 'occasion', texto: 'É pra qual ocasião?', opcoes: OCASIOES };
  if (!c.story || c.story.length < MIN_HISTORIA) {
    return {
      etapa: 'story',
      texto: c.story
        ? `Me conta mais um pouquinho sobre ${nome}: um momento marcante, um jeito, um apelido… Quanto mais detalhe, mais linda fica a letra.`
        : `Agora me conta a história de vocês: momentos marcantes, o jeito de ${nome}, apelidos… Quanto mais detalhe, mais linda fica a letra. Pode escrever ou mandar um áudio 🎤`,
      teclado: 'texto',
    };
  }
  if (!c.musicStyle) return { etapa: 'musicStyle', texto: 'Qual ritmo você quer?', opcoes: [...RITMOS, { id: 'nova:__outro_ritmo', label: 'Outro ritmo' }] };
  if (!c.voiceType) return { etapa: 'voiceType', texto: 'Quem canta: voz masculina, feminina ou as duas?', opcoes: VOZES };
  if (!c.musicMood) return { etapa: 'musicMood', texto: 'E o clima da música?', opcoes: CLIMAS };
  if (!c.customerName) return { etapa: 'customerName', texto: 'Quase lá! Qual é o seu nome? (de quem está dando a homenagem)', teclado: 'texto' };
  if (String(c.customerPhone || '').replace(/\D/g, '').length < 10) {
    return { etapa: 'customerPhone', texto: 'E o seu WhatsApp com DDD? É por ele que você acha sua música depois.', teclado: 'tel' };
  }
  return null;
}

/**
 * Aplica a resposta do cliente à etapa atual. Opção de botão chega como "nova:<id>".
 * @returns {{campos: object, erro?: string, pedirTexto?: string}}
 */
export function aplicarResposta(etapa, resposta, campos) {
  const valor = String(resposta || '').trim();
  const id = valor.startsWith('nova:') ? valor.slice(5) : null;
  const c = { ...campos };

  switch (etapa) {
    case 'honoreeName':
      if (valor.length < 2 || valor.length > 60) return { campos, erro: 'Me fala só o nome da pessoa, tá?' };
      c.honoreeName = valor.replace(/\s+/g, ' ');
      return { campos: c };
    case 'relationship':
    case 'occasion':
    case 'musicMood':
      // Texto livre também vale ("minha sogra") — vai como está, a letra usa o texto.
      c[etapa] = id && VALORES_VALIDOS[etapa].has(id) ? id : valor.slice(0, 40);
      return { campos: c };
    case 'story': {
      const historia = [c.story, valor].filter(Boolean).join('\n').slice(0, 3000);
      if (historia.length < MIN_HISTORIA) return { campos: { ...c, story: historia }, erro: 'Me conta um pouquinho mais, pode ser? Um momento de vocês, um jeito dessa pessoa…' };
      c.story = historia;
      return { campos: c };
    }
    case 'musicStyle':
      if (id === '__outro_ritmo') return { campos, pedirTexto: 'Escreve aqui o ritmo que você quer.' };
      c.musicStyle = id && VALORES_VALIDOS.musicStyle.has(id) ? id : valor.slice(0, 40);
      return { campos: c };
    case 'voiceType': {
      const v = (id || valor).toLowerCase();
      if (!VALORES_VALIDOS.voiceType.has(v)) return { campos, erro: 'Escolhe uma das opções: masculina, feminina ou dueto.' };
      c.voiceType = v;
      return { campos: c };
    }
    case 'customerName':
      if (valor.length < 2 || valor.length > 60) return { campos, erro: 'Me fala só o seu nome, tá?' };
      c.customerName = valor.replace(/\s+/g, ' ');
      return { campos: c };
    case 'customerPhone': {
      const d = valor.replace(/\D/g, '');
      if (d.length < 10 || d.length > 13) return { campos, erro: 'Esse número não parece certo. Manda com DDD, só números (ex.: 94991234567).' };
      c.customerPhone = d;
      return { campos: c };
    }
    default:
      return { campos };
  }
}

/** Junta o que a IA leu da história sem sobrescrever o que o cliente já respondeu. */
export function mesclarExtraidos(campos, extraidos = {}) {
  const c = { ...campos };
  for (const k of ['honoreeName', 'relationship', 'occasion', 'musicStyle', 'voiceType', 'musicMood']) {
    const v = typeof extraidos[k] === 'string' ? extraidos[k].trim() : '';
    if (c[k] || !v) continue;
    if (VALORES_VALIDOS[k] && !VALORES_VALIDOS[k].has(v)) continue;
    c[k] = v.slice(0, 60);
  }
  return c;
}

/** Texto que parece um número de WhatsApp (para quem já tem pedido) e não uma história. */
export function pareceTelefone(texto) {
  const t = String(texto || '').trim();
  const d = t.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 13 && d.length >= t.replace(/\s/g, '').length - 4;
}
