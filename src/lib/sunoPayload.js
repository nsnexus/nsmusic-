// Monta o payload de /api/suno/generate a partir do formData do wizard — usado nos dois pontos de
// chamada em criar/page.jsx (geração inicial e "Tentar Novamente") e também pelo agente do WhatsApp,
// para que nunca divirjam entre si (ver M-12 no AUDIT_REPORT.md: o retry perdia musicMood e
// voiceType por montar o payload sozinho).
//
// REESCRITO 03/09/2026 (reclamação do dono do estúdio: "o prompt da melodia pro Suno não tá ficando
// legal, muito genérico"). Antes as tags eram a concatenação crua dos rótulos em português da tela:
// "Forró / Baião Emocionante voice masculina". A Suno interpreta muito melhor descrição musical em
// inglês com INSTRUMENTAÇÃO e ANDAMENTO — "forró, baião, accordion, zabumba and triangle,
// mid-tempo" produz um arranjo característico, enquanto o rótulo solto produz o genérico de sempre.
//
// Estilos e climas abaixo espelham exatamente os `id` de src/app/criar/wizardOptions.js. Um valor
// fora dessa lista (ex: estilo digitado à mão pelo cliente no WhatsApp) cai no fallback, que usa o
// próprio texto do cliente — nunca perde a intenção dele, só não ganha a instrumentação extra.

const STYLE_TAGS = {
  'Romântica': 'romantic ballad, soft piano and strings, intimate vocals, slow tempo',
  'Sertanejo Universitário': 'sertanejo universitário, modern brazilian country, acoustic guitar and electric guitar, modern drums, polished radio production, catchy, emotional',
  'Sertanejo Raiz': 'sertanejo raiz, modão caipira, viola caipira and acoustic guitar, traditional accordion, acoustic duet harmony, nostalgic, emotional',
  'Sertanejo': 'sertanejo, brazilian country, acoustic guitar and viola caipira, accordion, heartfelt',
  'Pop': 'brazilian pop, catchy chorus, modern production, polished vocals, upbeat',
  'Rock': 'brazilian rock, electric guitars, driving drums, anthemic chorus',
  'MPB / Bossa Nova': 'mpb, bossa nova, nylon guitar, smooth jazzy chords, warm intimate vocals',
  'Gospel / Adoração': 'brazilian gospel worship, piano and strings, choir backing vocals, uplifting build',
  'Samba / Pagode': 'samba, pagode, cavaquinho and pandeiro, surdo groove, joyful swing',
  'Folk Acústico': 'acoustic folk, fingerpicked guitar, organic warm production, storytelling vocals',
  'Forró / Baião': 'forró, baião, accordion-led, zabumba and triangle, northeastern brazilian, mid-tempo',
  'Trap / Rap': 'brazilian trap, 808 bass, hi-hat rolls, rhythmic flow, modern urban',
  // NÃO reintroduzir a palavra "skank" aqui. É o termo técnico da batida de guitarra no
  // contratempo do reggae, mas junto com "brazilian" o filtro da Suno lê como nome de banda
  // brasileira e RECUSA a geração inteira (relatado pelo dono do estúdio em 21/09/2026: reggae
  // parou de gerar). "guitar chords on the offbeat" descreve a mesma coisa sem a palavra, e
  // "one drop" acrescenta a levada de bateria característica.
  'Reggae': 'brazilian reggae, guitar chords on the offbeat, one drop drum groove, warm rolling bassline, laid-back tempo',
  'Lo-Fi Chill': 'lo-fi chill, mellow keys, soft drums, vinyl warmth, relaxed tempo',
  'Funk': 'brazilian funk, heavy beat, punchy bass, danceable groove',
  'Eletrônica': 'electronic, synth layers, four-on-the-floor beat, modern dance production',
  'Piseiro': 'piseiro, brazilian northeastern electronic accordion, danceable beat, festive',
  'Axé': 'axé, bahian carnival groove, brass section, percussion, energetic',
  'Jazz / Blues': 'jazz blues, brushed drums, upright bass, saxophone, swing feel',
  'Infantil': "children's song, playful melody, light instrumentation, simple singalong chorus",
  'K-Pop': 'k-pop, modern korean pop production, bright synths, catchy melodic hook, dynamic electronic beat, emotional and vibrant',
  'Pagode Anos 90': 'pagode anos 90, retro brazilian pagode, cavaquinho, repique de mão, tan-tan, romantic harmonies, nostalgic 90s brazilian swing',
  'Flash Back': 'flashback, classic 70s 80s 90s pop dance, disco funk groove, retro synthesizers, vintage bassline, nostalgic, melodic, danceable',
  'Flashback': 'flashback, classic 70s 80s 90s pop dance, disco funk groove, retro synthesizers, vintage bassline, nostalgic, melodic, danceable',
  'Trap Acústico': 'acoustic trap, fingerstyle nylon acoustic guitar, deep 808 sub bass, crisp trap hi-hats, intimate modern melodic flow',
  'Indie Pop': 'indie pop, warm indie acoustic, melodic guitars, shimmering soft synths, uplifting dreamy vocals',
  'R&B / Soul': 'r&b soul, smooth rhodes piano, warm bassline, soulful lead vocals, mellow groove, emotional',
};

const MOOD_TAGS = {
  'Alegre': 'happy, bright, uplifting',
  'Emocionante': 'emotional, touching, heartfelt, cinematic build',
  'Energética': 'energetic, powerful, driving',
  'Calma': 'calm, gentle, soothing, soft dynamics',
  'Nostálgica': 'nostalgic, wistful, warm memories',
  'Romântica': 'romantic, tender, loving',
  'Festiva': 'festive, celebratory, party atmosphere',
  'Inspiradora': 'inspiring, hopeful, triumphant',
  'Divertida': 'fun, playful, lighthearted',
  'Melancólica': 'melancholic, bittersweet, mournful, tribute',
};

const VOICE_TAGS = {
  dueto: 'duet male and female vocalists, alternating verses, harmonized chorus',
  masculina: 'male lead vocal, man singing',
  masculino: 'male lead vocal, man singing',
  homem: 'male lead vocal, man singing',
  male: 'male lead vocal, man singing',
  feminina: 'female lead vocal, woman singing',
  feminino: 'female lead vocal, woman singing',
  mulher: 'female lead vocal, woman singing',
  female: 'female lead vocal, woman singing',
};

export function buildSunoPayload(formData = {}) {
  const style = formData.musicStyle || '';
  const mood = formData.musicMood || '';
  let voice = String(formData.voiceType || '').toLowerCase().trim();

  // Se o pedido era voz personalizada/minha_voz ou solo, tenta inferir ou manter o gênero correto
  if (voice === 'minha_voz' || voice === 'solo' || !voice) {
    if (formData.customVoiceGender === 'female' || formData.voiceGender === 'female' || formData.isFemaleVoice || formData.generoVoz === 'feminina') {
      voice = 'feminina';
    } else if (formData.customVoiceGender === 'male' || formData.voiceGender === 'male' || formData.isMaleVoice || formData.generoVoz === 'masculina') {
      voice = 'masculina';
    }
  }

  // Fallback usa o próprio texto do cliente quando o valor não está no catálogo (estilo digitado à
  // mão no WhatsApp, por exemplo) — perder a intenção dele seria pior que perder a instrumentação.
  const stylePart = STYLE_TAGS[style] || style;
  const moodPart = MOOD_TAGS[mood] || mood;
  const voicePart = VOICE_TAGS[voice] || (voice && voice !== 'solo' && voice !== 'minha_voz' ? `${voice} vocal` : '');

  const tags = [stylePart, moodPart, voicePart, 'brazilian portuguese lyrics, studio quality']
    .filter(Boolean)
    .join(', ');

  return {
    prompt: formData.lyrics || formData.story || '',
    tags,
  };
}
