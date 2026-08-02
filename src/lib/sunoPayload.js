// Monta o payload de /api/suno/generate a partir do formData do wizard — usado nos dois pontos de
// chamada em criar/page.jsx (geração inicial e "Tentar Novamente") para que nunca divirjam entre si
// (ver M-12 no AUDIT_REPORT.md: o retry perdia musicMood e voiceType por montar o payload sozinho).
export function buildSunoPayload(formData) {
  return {
    prompt: formData.lyrics || formData.story || '',
    tags: `${formData.musicStyle || ''} ${formData.musicMood || ''} ${
      formData.voiceType === 'dueto' ? 'duet male and female vocalists' : `voice ${formData.voiceType || ''}`
    }`.trim(),
  };
}
