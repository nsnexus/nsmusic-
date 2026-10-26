// https://docs.kie.ai/suno-api/suno-voice-generate
// The validation task is the reusable Voice ID; create-voice only acknowledges submission.
export function readKieJob(payload = {}) {
  const job = payload.data || payload;
  let result = job.resultJson || {};
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { result = {}; }
  }
  const targets = [result.data, result.resultObject, result, job.response?.data, job.response, job];
  const pick = (...keys) => {
    for (const target of targets) {
      if (!target || typeof target !== 'object') continue;
      for (const key of keys) {
        if (typeof target[key] === 'string' && target[key].trim()) return target[key].trim();
      }
    }
    return null;
  };
  return {
    state: String(job.state || job.status || '').toLowerCase(), model: job.model || '', result,
    phrase: pick('verify_phrase_text', 'phrase', 'validation_phrase', 'validationPhrase', 'phrase_text'),
    verifyPhraseId: pick('verify_phrase_id', 'verifyPhraseId'),
    voiceRecordingId: pick('voice_recording_id', 'voiceRecordingId'),
    accountId: pick('account_id', 'accountId', 'suno_user_id'),
    linkedVoiceId: Array.isArray(result.resultUrls) ? result.resultUrls[0] : null,
    failMsg: job.failMsg || job.errorMessage || null, progress: job.progress || 0,
  };
}

export function buildVoiceSongPayload({ voiceId, prompt, style = 'Acoustic Pop', title = 'Música com minha voz' }, callBackUrl) {
  return {
    model: 'ai-music-api/generate', callBackUrl,
    input: {
      custom_mode: true, instrumental: false, model: 'V6', lyrics: prompt, style,
      title: String(title).substring(0, 80), persona_id: voiceId, persona_model: 'voice_persona',
      style_weight: 0.85, weirdness_constraint: 0.20,
    },
  };
}

export function readKieSongTracks(job) {
  const result = job.result;
  if (Array.isArray(result)) return result;
  const tracks = result?.data || result?.response?.data || result?.tracks || result?.sunoData || result?.resultUrls;
  return Array.isArray(tracks) ? tracks : [];
}
