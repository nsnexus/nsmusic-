// Opções estáticas do wizard de /criar — extraído de page.jsx (M-20 no AUDIT_REPORT.md). Eram
// recriadas a cada render dentro do componente; agora são constantes de módulo.
export const recipients = [
  { id: 'Namorada', label: 'Namorada', icon: '💖' },
  { id: 'Esposa', label: 'Esposa', icon: '💍' },
  { id: 'Namorado', label: 'Namorado', icon: '❤️' },
  { id: 'Marido', label: 'Marido', icon: '💑' },
  { id: 'Mãe', label: 'Mãe', icon: '👩' },
  { id: 'Pai', label: 'Pai', icon: '👨' },
  { id: 'Vó', label: 'Vó', icon: '👵' },
  { id: 'Vô', label: 'Vô', icon: '👴' },
  { id: 'Filha', label: 'Filha', icon: '👧' },
  { id: 'Filho', label: 'Filho', icon: '👦' },
  { id: 'Amiga', label: 'Amiga', icon: '💛' },
  { id: 'Amigo', label: 'Amigo', icon: '🤝' },
  { id: 'Chefe', label: 'Chefe', icon: '💼' },
  { id: 'Eu mesmo', label: 'Eu mesmo', icon: '🎤' },
  { id: 'Outro', label: 'Outro', icon: '🎵' },
];

export const occasions = [
  { id: 'Aniversário', label: 'Aniversário', icon: '🎂' },
  { id: 'Aniv. de Casamento', label: 'Aniv. de Casamento', icon: '💎' },
  { id: 'Dia dos Namorados', label: 'Dia dos Namorados', icon: '💝' },
  { id: 'Dia das Mães', label: 'Dia das Mães', icon: '🌷' },
  { id: 'Declaração de Amor', label: 'Declaração de Amor', icon: '💌' },
  { id: 'Pedido de Namoro', label: 'Pedido de Namoro', icon: '💍' },
  { id: 'Surpresa', label: 'Surpresa', icon: '🎁' },
  { id: 'Homenagem', label: 'Homenagem', icon: '🌟' },
  { id: 'Aniversário de Namoro', label: 'Aniversário de Namoro', icon: '💑' },
  { id: 'Formatura', label: 'Formatura', icon: '🎓' },
  { id: 'Chá Revelação', label: 'Chá Revelação', icon: '👶' },
  { id: 'Outro', label: 'Outro', icon: '✨' },
];

export const stylesList = [
  { id: 'Romântica', label: 'Romântica', icon: '💖', desc: 'Ritmo amoroso e cativante' },
  { id: 'Sertanejo', label: 'Sertanejo', icon: '🤠', desc: 'Estilo romântico ou universitário' },
  { id: 'Pop', label: 'Pop', icon: '⚡', desc: 'Moderno, jovem e dançante' },
  { id: 'Rock', label: 'Rock', icon: '🎸', desc: 'Atitude com guitarras marcantes' },
  { id: 'MPB / Bossa Nova', label: 'MPB / Bossa Nova', icon: '☕', desc: 'Estilo clássico e intimista' },
  { id: 'Gospel / Adoração', label: 'Gospel / Adoração', icon: '⛪', desc: 'Mensagem de fé e inspiração' },
  { id: 'Samba / Pagode', label: 'Samba / Pagode', icon: '🥁', desc: 'Descontraído e alegre' },
  { id: 'Folk Acústico', label: 'Folk Acústico', icon: '🪵', desc: 'Voz e violão aconchegante' },
  { id: 'Forró / Baião', label: 'Forró / Baião', icon: '🪗', desc: 'Ritmo nordestino alegre e envolvente' },
  { id: 'Trap / Rap', label: 'Trap / Rap', icon: '🎙️', desc: 'Batidas urbanas modernas' },
  { id: 'Reggae', label: 'Reggae', icon: '🌴', desc: 'Vibe positiva e relaxada' },
  { id: 'Lo-Fi Chill', label: 'Lo-Fi Chill', icon: '🎧', desc: 'Melodias suaves e tranquilas' },
  { id: 'Funk', label: 'Funk', icon: '🔊', desc: 'Batida forte e envolvente' },
  { id: 'Eletrônica', label: 'Eletrônica', icon: '🎛️', desc: 'Synths modernos e batida eletrônica' },
  { id: 'Piseiro', label: 'Piseiro', icon: '🪘', desc: 'Ritmo nordestino dançante em alta' },
  { id: 'Axé', label: 'Axé', icon: '🌊', desc: 'Animado, ideal pra festa e verão' },
  { id: 'Jazz / Blues', label: 'Jazz / Blues', icon: '🎷', desc: 'Sofisticado, com swing e improviso' },
  { id: 'Infantil', label: 'Infantil', icon: '🧸', desc: 'Leve e divertida, pra crianças' },
];

export const moods = [
  { id: 'Alegre', label: 'Alegre', icon: '☀️', desc: 'Ritmo contagioso e alto astral' },
  { id: 'Emocionante', label: 'Emocionante', icon: '🥺', desc: 'Para tocar o coração e fazer chorar' },
  { id: 'Energética', label: 'Energética', icon: '🔥', desc: 'Vibe vibrante e cheia de ritmo' },
  { id: 'Calma', label: 'Calma', icon: '🍃', desc: 'Suave, relaxante e acolhedora' },
  { id: 'Nostálgica', label: 'Nostálgica', icon: '🍂', desc: 'Recordações marcantes e saudades' },
  { id: 'Romântica', label: 'Romântica', icon: '💖', desc: 'Declaração amorosa e carinhosa' },
  { id: 'Festiva', label: 'Festiva', icon: '🎉', desc: 'Clima de celebração e festa' },
  { id: 'Inspiradora', label: 'Inspiradora', icon: '✨', desc: 'Mensagem de superação e motivação' },
  { id: 'Divertida', label: 'Divertida', icon: '😄', desc: 'Bem-humorada, leve e engraçada' },
  { id: 'Melancólica', label: 'Melancólica', icon: '🕊️', desc: 'Saudade e homenagem, pra quem já partiu' },
];
