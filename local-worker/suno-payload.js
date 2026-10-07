// Mapeamento oficial de tags de estilo, clima e voz para o Suno (mesmo padrão do projeto NSMusic)
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
  'Reggae': 'brazilian reggae, guitar chords on the offbeat, one drop drum groove, warm rolling bassline, laid-back tempo',
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

/**
 * Constrói as tags musicais completas para a Suno a partir dos dados do pedido.
 */
export function buildSunoTags(pedido = {}) {
  // Se o pedido já possui o prompt pronto montado pelo sistema
  if (pedido.suno_prompt && String(pedido.suno_prompt).trim()) {
    return String(pedido.suno_prompt).trim();
  }
  if (pedido.sunoPrompt && String(pedido.sunoPrompt).trim()) {
    return String(pedido.sunoPrompt).trim();
  }

  const style = pedido.music_style || pedido.musicStyle || pedido.occasion || '';
  const mood = pedido.music_mood || pedido.musicMood || '';
  const voice = String(pedido.voice_type || pedido.voiceType || '').toLowerCase();

  const stylePart = STYLE_TAGS[style] || style;
  const moodPart = MOOD_TAGS[mood] || mood;
  const voicePart = VOICE_TAGS[voice] || (voice ? `${voice} vocal` : '');

  const tags = [stylePart, moodPart, voicePart, 'brazilian portuguese lyrics, studio quality']
    .filter(Boolean)
    .join(', ');

  return tags || 'Acoustic Pop, heartfelt, warm vocals';
}
