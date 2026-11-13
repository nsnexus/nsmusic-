import { readKieJob, readKieSongTracks } from './kieVoice.js';

function extractNumberedAudioTracks(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const tracks = [];
  // Procura por chaves como audio_url1, audio_url2, audioUrl1, audioUrl2, etc. (padrão Unifically)
  for (let i = 1; i <= 10; i++) {
    const url = obj[`audio_url${i}`] || obj[`audioUrl${i}`] || obj[`audio_${i}`];
    if (typeof url === 'string' && url.trim()) {
      const u = url.trim();
      const uuidMatch = u.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      tracks.push({
        id: (uuidMatch && uuidMatch[1]) ? uuidMatch[1] : `${obj.task_id || obj.taskId || 'track'}-${i}`,
        audio_url: u,
        audioUrl: u,
        trackId: (uuidMatch && uuidMatch[1]) ? uuidMatch[1] : `${obj.task_id || obj.taskId || ''}-${i}`,
        imageUrl: obj.image_url || obj.imageUrl || '',
      });
    }
  }
  return tracks.length > 0 ? tracks : null;
}

export const extractAudioTracks = (result) => {
  if (!result) return [];
  if (result?.data?.resultJson || result?.resultJson) {
    const jobTracks = readKieSongTracks(readKieJob(result));
    if (jobTracks.length) return extractAudioTracks({ data: jobTracks });
  }
  
  let rawTracks = [];
  if (Array.isArray(result)) {
    rawTracks = result;
  } else if (Array.isArray(result.data)) {
    rawTracks = result.data;
  } else if (result.data && typeof result.data === 'object') {
    const d = result.data;
    rawTracks = extractNumberedAudioTracks(d)
      || extractNumberedAudioTracks(d.output)
      || d.response?.sunoData
      || d.response?.tracks
      || d.sunoData
      || d.tracks
      || d.output?.audio_urls
      || d.output?.audios
      || (d.output?.audio_url ? [d.output] : null)
      || d.audio_urls
      || (d.audio_url ? [d] : null)
      || [d];
  } else if (result.response && (result.response.sunoData || result.response.tracks)) {
    rawTracks = result.response.sunoData || result.response.tracks;
  } else if (result.output && typeof result.output === 'object') {
    rawTracks = extractNumberedAudioTracks(result.output)
      || result.output.audio_urls
      || result.output.audios
      || (result.output.audio_url ? [result.output] : null)
      || [result.output];
  } else if (result.tracks) {
    rawTracks = result.tracks;
  } else if (result.audio_urls && Array.isArray(result.audio_urls)) {
    rawTracks = result.audio_urls;
  } else if (extractNumberedAudioTracks(result)) {
    rawTracks = extractNumberedAudioTracks(result);
  } else if (result.audio_url) {
    rawTracks = [result];
  }

  const tracks = Array.isArray(rawTracks) ? rawTracks : (rawTracks ? [rawTracks] : []);

  return tracks.map(t => {
    if (!t) return null;
    if (typeof t === 'string') {
      return { audio_url: t, audioUrl: t };
    }

    const rawCandidates = [
      t.audio_url, t.audioUrl,
      t.audio_url1, t.audioUrl1,
      t.audio_url2, t.audioUrl2,
      t.source_audio_url, t.sourceAudioUrl,
      t.stream_audio_url, t.streamAudioUrl,
      t.sourceStreamAudioUrl, t.source_stream_audio_url
    ].filter((u) => typeof u === 'string' && u.trim());

    const uuidMatch = rawCandidates.join(' ').match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const trackId = (t.trackId && /^[a-f0-9-]{36}$/i.test(t.trackId))
      ? t.trackId
      : (t.id && /^[a-f0-9-]{36}$/i.test(t.id))
        ? t.id
        : (uuidMatch ? uuidMatch[1] : (t.id || t.trackId || ''));

    const isUnifically = rawCandidates.some(u => u.includes('unifically.com'));

    const hasStream = rawCandidates.some(u => u.includes('audiostream.kie.ai') || u.includes('stream'));
    const streamCandidate = (!isUnifically && trackId && (hasStream || rawCandidates.length > 0) && /^[a-f0-9-]{36}$/i.test(trackId))
      ? `https://audiostream.kie.ai/stream/${trackId}.mp3`
      : '';

    const urlCandidates = [
      t.stream_audio_url, t.streamAudioUrl,
      streamCandidate,
      t.audio_url, t.audioUrl,
      t.audio_url1, t.audioUrl1,
      t.audio_url2, t.audioUrl2,
      t.source_audio_url, t.sourceAudioUrl,
    ].filter((u) => typeof u === 'string' && u.trim());

    let url = '';
    if (isUnifically) {
      url = urlCandidates.find(u => u.includes('unifically.com')) || urlCandidates[0] || '';
    } else {
      url = urlCandidates.find((u) => u.includes('tempfile.aiquickdraw.com') || u.includes('file.aiquickdraw.com'))
        || urlCandidates.find((u) => u.includes('cdn1.suno.ai') || u.includes('cdn2.suno.ai'))
        || urlCandidates.find((u) => u.includes('audiostream.kie.ai'))
        || urlCandidates.find((u) => !u.includes('musicfile.kie.ai'))
        || urlCandidates[0] || '';

      if (!url && trackId) {
        url = `https://cdn1.suno.ai/${trackId}.mp3`;
      }
    }

    const imageUrl = t.image_url || t.imageUrl || t.cover_image_url || t.coverImageUrl || '';
    const duration = (typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration > 0)
      ? t.duration
      : null;

    return {
      ...t,
      audio_url: url,
      audioUrl: url,
      trackId: trackId || '',
      imageUrl,
      ...(duration ? { duration } : {}),
    };
  }).filter(t => t && t.audio_url);
};

