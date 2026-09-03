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
  'Sertanejo': 'sertanejo, brazilian country, acoustic guitar and viola caipira, accordion, heartfelt',
  'Pop': 'brazilian pop, catchy chorus, modern production, polished vocals, upbeat',
  'Rock': 'brazilian rock, electric guitars, driving drums, anthemic chorus',
  'MPB / Bossa Nova': 'mpb, bossa nova, nylon guitar, smooth jazzy chords, warm intimate vocals',
  'Gospel / Adoração': 'brazilian gospel worship, piano and strings, choir backing vocals, uplifting build',
  'Samba / Pagode': 'samba, pagode, cavaquinho and pandeiro, surdo groove, joyful swing',
  'Folk Acústico': 'acoustic folk, fingerpicked guitar, organic warm production, storytelling vocals',
  'Forró / Baião': 'forró, baião, accordion-led, zabumba and triangle, northeastern brazilian, mid-tempo',
  'Trap / Rap': 'brazilian trap, 808 bass, hi-hat rolls, rhythmic flow, modern urban',
  'Reggae': 'brazilian reggae, offbeat guitar skank, warm bassline, laid-back groove',
  'Lo-Fi Chill': 'lo-fi chill, mellow keys, soft drums, vinyl warmth, relaxed tempo',
  'Funk': 'brazilian funk, heavy beat, punchy bass, danceable groove',
  'Eletrônica': 'electronic, synth layers, four-on-the-floor beat, modern dance production',
  'Piseiro': 'piseiro, brazilian northeastern electronic accordion, danceable beat, festive',
  'Axé': 'axé, bahian carnival groove, brass section, percussion, energetic',
  'Jazz / Blues': 'jazz blues, brushed drums, upright bass, saxophone, swing feel',
  'Infantil': "children's song, playful melody, light instrumentation, simple singalong chorus",
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
  masculina: 'male lead vocal',
  feminina: 'female lead vocal',
};

export function buildSunoPayload(formData) {
  const style = formData.musicStyle || '';
  const mood = formData.musicMood || '';
  const voice = String(formData.voiceType || '').toLowerCase();

  // Fallback usa o próprio texto do cliente quando o valor não está no catálogo (estilo digitado à
  // mão no WhatsApp, por exemplo) — perder a intenção dele seria pior que perder a instrumentação.
  const stylePart = STYLE_TAGS[style] || style;
  const moodPart = MOOD_TAGS[mood] || mood;
  const voicePart = VOICE_TAGS[voice] || (voice ? `${voice} vocal` : '');

  const tags = [stylePart, moodPart, voicePart, 'brazilian portuguese lyrics, studio quality']
    .filter(Boolean)
    .join(', ');

  return {
    prompt: formData.lyrics || formData.story || '',
    tags,
  };
}
