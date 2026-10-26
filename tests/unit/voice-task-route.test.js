import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ saveTask: vi.fn(), getTask: vi.fn(), updateTaskResult: vi.fn(), updateOrder: vi.fn() }));
vi.mock('@cloudflare/next-on-pages', () => ({ getRequestContext: () => ({ env: { KIE_API_KEY: 'test-key' } }) }));
vi.mock('@/lib/db', async (importOriginal) => ({ ...(await importOriginal()), ...mocks }));
vi.mock('@/lib/supabaseDb', () => ({ updateOrder: mocks.updateOrder }));
import { POST, GET } from '@/app/api/admin/voice/task/route';

const voiceId = 'abcdef0123456789abcdef0123456789';
const response = data => new Response(JSON.stringify(data), { status: 200 });
const job = (state, result = {}, model = 'ai-music-api/validation-phrase') => response({ code: 200, data: { state, model, resultJson: JSON.stringify(result) } });
const post = body => POST(new Request('http://localhost/api/admin/voice/task', { method: 'POST', body: JSON.stringify(body) }));
const get = (task = voiceId, type = 'job') => GET(new Request(`http://localhost/api/admin/voice/task?taskId=${task}&type=${type}`));

describe('Kie voice workflow', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); });

  it('polls the original validation task after create-voice acceptance', async () => {
    fetch.mockResolvedValueOnce(response({ code: 200, data: { taskId: 'acknowledgement' } }));
    const res = await post({ action: 'create_voice', phraseTaskId: voiceId, verifyUrl: 'https://example.com/verify.wav' });
    expect(await res.json()).toEqual({ ok: true, taskId: voiceId, submissionTaskId: 'acknowledgement' });
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.input.task_id).toBe(voiceId);
    expect(payload.input).not.toHaveProperty('voice_recording_id');
  });

  it('does not treat acknowledgement success as a validated voice', async () => {
    fetch.mockResolvedValueOnce(job('success', { resultUrls: [voiceId] }, 'ai-music-api/create-voice'));
    fetch.mockResolvedValueOnce(job('generating', { persona_id: 'internal-persona', verify_phrase_text: 'Frase real' }));
    const data = await (await get('ack')).json();
    expect(data.state).toBe('generating');
    expect(data.voiceId).toBeNull();
    expect(fetch.mock.calls[1][0]).toContain(voiceId);
  });

  it('returns rejection from the original validation task', async () => {
    fetch.mockResolvedValueOnce(job('success', { resultUrls: [voiceId] }, 'ai-music-api/create-voice'));
    fetch.mockResolvedValueOnce(response({ code: 200, data: { state: 'fail', failMsg: 'Verification rejected' } }));
    const data = await (await get('ack')).json();
    expect(data.state).toBe('fail');
    expect(data.voiceId).toBeNull();
    expect(data.failMsg).toBe('Verification rejected');
  });

  it('keeps the validated task ID instead of substituting an internal persona UUID', async () => {
    fetch.mockResolvedValueOnce(job('success', { persona_id: 'internal-persona' }));
    expect((await (await get()).json()).voiceId).toBe(voiceId);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads the actual phrase from a resultObject', async () => {
    fetch.mockResolvedValueOnce(job('generating', { resultObject: { verify_phrase_text: 'Minha frase única' } }));
    const data = await (await get(voiceId, 'phrase')).json();
    expect(data.phrase).toBe('Minha frase única');
    expect(data.voiceId).toBeNull();
  });

  it('treats HTTP 200 with provider error code as failure', async () => {
    fetch.mockResolvedValueOnce(response({ code: 422, msg: 'Task not found' }));
    const res = await get();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Task not found');
  });

  it('does not accept a task creation without task ID', async () => {
    fetch.mockResolvedValueOnce(response({ code: 200, data: {} }));
    expect((await post({ action: 'request_phrase', voiceUrl: 'https://example.com/voice.wav' })).status).toBe(502);
  });

  it('rejects a pending voice before paid song generation', async () => {
    fetch.mockResolvedValueOnce(job('generating'));
    const res = await post({ action: 'generate_song', voiceId, prompt: 'Letra' });
    expect(res.status).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.saveTask).not.toHaveBeenCalled();
  });

  it('generates via current jobs API with Voice ID and without fixed foreign account/recording IDs', async () => {
    fetch.mockResolvedValueOnce(job('success'));
    fetch.mockResolvedValueOnce(response({ code: 200, data: { taskId: 'song-task' } }));
    const res = await post({ action: 'generate_song', voiceId, prompt: 'Letra', orderId: 'own-test-order', accountId: 'wrong-account', voiceRecordingId: 'wrong-recording' });
    expect(res.status).toBe(200);
    const [url, options] = fetch.mock.calls[1];
    expect(url).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    const payload = JSON.parse(options.body);
    expect(payload.model).toBe('ai-music-api/generate');
    expect(payload.input).toMatchObject({ persona_id: voiceId, persona_model: 'voice_persona', lyrics: 'Letra', custom_mode: true });
    expect(JSON.stringify(payload)).not.toContain('wrong-account');
    expect(JSON.stringify(payload)).not.toContain('wrong-recording');
    expect(mocks.saveTask).toHaveBeenCalledWith('song-task', 'PROCESSING', { kieTaskApi: 'jobs' }, 'own-test-order', expect.any(Object), expect.any(Object));
  });

  it('persists a completed jobs song for the linked order', async () => {
    fetch.mockResolvedValueOnce(job('success', { data: [{ id: 'track', audio_url: 'https://cdn1.suno.ai/track.mp3' }] }, 'ai-music-api/generate'));
    mocks.getTask.mockResolvedValueOnce({ orderId: 'own-test-order' });
    const data = await (await get('song-task', 'generate')).json();
    expect(data.status).toBe('COMPLETED');
    expect(data.tracks[0].audioUrl).toBe('https://cdn1.suno.ai/track.mp3');
    expect(mocks.updateTaskResult).toHaveBeenCalledWith('song-task', expect.any(Object), 'own-test-order', expect.any(Object));
  });

  it('does not return tracks from an unfinished song as completed', async () => {
    fetch.mockResolvedValueOnce(job('generating', { data: [{ audio_url: 'https://cdn1.suno.ai/preview.mp3' }] }, 'ai-music-api/generate'));
    const data = await (await get('song-task', 'generate')).json();
    expect(data.status).toBe('PROCESSING');
    expect(data.tracks).toEqual([]);
  });

  it('still polls old songs when the jobs API reports task not found', async () => {
    fetch.mockResolvedValueOnce(response({ code: 422, msg: 'Task not found' }));
    fetch.mockResolvedValueOnce(response({ code: 200, data: { status: 'SUCCESS', response: { sunoData: [{ audioUrl: 'https://cdn1.suno.ai/old.mp3' }] } } }));
    const data = await (await get('legacy-task', 'generate')).json();
    expect(data.status).toBe('COMPLETED');
    expect(fetch.mock.calls[1][0]).toContain('generate/record-info');
  });
});
