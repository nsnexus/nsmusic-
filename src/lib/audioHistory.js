import { extractAudioTracks } from './db.js';

/**
 * Normaliza e consolida o histórico de versões de áudio de um pedido.
 * Combina o histórico explícito salvo em order.audioHistory (ou order.extras.audioHistory)
 * com tarefas concluídas da tabela suno_tasks.
 *
 * @param {Object} order Objeto do pedido (com audioUrl, audioFiles, sunoTaskId, etc.)
 * @param {Array} sunoTasks Lista de tarefas do Supabase (suno_tasks)
 * @returns {Array} Lista de versões ordenadas da mais recente para a mais antiga
 */
export function buildOrderAudioHistory(order = {}, sunoTasks = []) {
  const historyMap = new Map();

  // 1. Carrega histórico já gravado no pedido (se houver)
  const existingHistory = Array.isArray(order?.audioHistory)
    ? order.audioHistory
    : (Array.isArray(order?.extras?.audioHistory) ? order.extras.audioHistory : []);

  for (const item of existingHistory) {
    if (!item) continue;
    const key = item.id || item.taskId || (Array.isArray(item.audioFiles) && item.audioFiles[0]) || item.audioUrl;
    if (key) {
      historyMap.set(String(key), {
        id: item.id || `hist_${item.version || Math.random()}`,
        version: item.version || 1,
        taskId: item.taskId || null,
        provider: item.provider || null,
        createdAt: item.createdAt || order.createdAt || new Date().toISOString(),
        audioUrl: item.audioUrl || (Array.isArray(item.audioFiles) ? item.audioFiles[0] : ''),
        audioFiles: Array.isArray(item.audioFiles) && item.audioFiles.length > 0
          ? item.audioFiles
          : (item.audioUrl ? [item.audioUrl] : []),
        lyrics: item.lyrics || '',
        sunoPrompt: item.sunoPrompt || item.tags || '',
        tags: item.tags || item.sunoPrompt || '',
        active: false,
        source: item.source || 'suno'
      });
    }
  }

  // 2. Mescla tarefas do suno_tasks deste pedido
  if (Array.isArray(sunoTasks)) {
    for (const task of sunoTasks) {
      if (!task || task.status !== 'COMPLETED' || !task.result) continue;
      const tracks = extractAudioTracks(task.result);
      if (!tracks || tracks.length === 0) continue;

      const validFiles = tracks.map(t => t.audio_url).filter(Boolean);
      if (validFiles.length === 0) continue;

      const key = task.id || validFiles[0];
      const existing = historyMap.get(String(key));

      if (!existing) {
        historyMap.set(String(key), {
          id: task.id || `task_${Math.random()}`,
          version: 1, // recalculado abaixo
          taskId: task.id,
          provider: task.provider || null,
          createdAt: task.created_at || new Date().toISOString(),
          audioUrl: validFiles[0],
          audioFiles: validFiles,
          lyrics: tracks[0]?.prompt || '',
          sunoPrompt: tracks[0]?.tags || '',
          tags: tracks[0]?.tags || '',
          active: false,
          source: 'suno_tasks'
        });
      } else {
        if (!existing.lyrics && tracks[0]?.prompt) existing.lyrics = tracks[0].prompt;
        if (!existing.tags && tracks[0]?.tags) existing.tags = tracks[0].tags;
        if (!existing.provider && task.provider) existing.provider = task.provider;
        if (!existing.taskId && task.id) existing.taskId = task.id;
      }
    }
  }

  // 3. Se o pedido tem áudio atual mas nenhuma entrada no mapa bate com o áudio atual,
  // garante que a versão atual do pedido esteja no histórico!
  const currentAudioUrl = order?.audioFiles?.[0] || order?.audioUrl;
  if (currentAudioUrl) {
    let matchesCurrent = false;
    for (const item of historyMap.values()) {
      if (item.audioUrl === currentAudioUrl || (item.audioFiles && item.audioFiles.includes(currentAudioUrl))) {
        matchesCurrent = true;
        break;
      }
    }

    if (!matchesCurrent) {
      const fallbackKey = order.sunoTaskId || `current_${currentAudioUrl}`;
      historyMap.set(String(fallbackKey), {
        id: fallbackKey,
        version: 1,
        taskId: order.sunoTaskId || null,
        provider: order.sunoProvider || null,
        createdAt: order.audioArchivedAt || order.updatedAt || order.createdAt || new Date().toISOString(),
        audioUrl: currentAudioUrl,
        audioFiles: Array.isArray(order.audioFiles) && order.audioFiles.length > 0 ? order.audioFiles : [currentAudioUrl],
        lyrics: order.lyrics || '',
        sunoPrompt: order.sunoPrompt || '',
        tags: order.sunoPrompt || '',
        active: true,
        source: 'order_current'
      });
    }
  }

  // Ordena por data de criação crescente para atribuir numeração sequencial estável
  const list = Array.from(historyMap.values()).sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return da - db;
  });

  // Atribui números de versão sequenciais e determina qual é a versão ativa
  list.forEach((item, index) => {
    item.version = index + 1;
    const isActive = Boolean(
      currentAudioUrl && (
        item.audioUrl === currentAudioUrl ||
        (Array.isArray(item.audioFiles) && item.audioFiles.includes(currentAudioUrl)) ||
        (item.taskId && order.sunoTaskId && item.taskId === order.sunoTaskId)
      )
    );
    item.active = isActive;
  });

  // Se nenhuma foi marcada como ativa mas há itens e há áudio atual, a mais recente é ativa
  if (list.length > 0 && !list.some(item => item.active) && currentAudioUrl) {
    list[list.length - 1].active = true;
  }

  // Retorna em ordem decrescente (mais recente primeiro) para exibição na interface
  return list.sort((a, b) => b.version - a.version);
}

/**
 * Adiciona uma nova versão de geração ao histórico de áudio do pedido.
 *
 * @param {Object} orderData Objeto atual do pedido
 * @param {Array} newTracks Faixas extraídas de extractAudioTracks
 * @param {string|null} taskId ID da tarefa Suno
 * @param {string|null} provider Provedor utilizado ('kie', 'unifically', 'suno_local')
 * @returns {Array} Histórico atualizado com a nova versão ativa
 */
export function appendAudioHistory(orderData = {}, newTracks = [], taskId = null, provider = null) {
  const currentHistory = buildOrderAudioHistory(orderData, []);
  const validFiles = (newTracks || []).map(t => t.audio_url).filter(Boolean);
  if (validFiles.length === 0) return currentHistory;

  const newEntry = {
    id: taskId || `gen_${Date.now()}`,
    version: currentHistory.length + 1,
    taskId: taskId || null,
    provider: provider || orderData.sunoProvider || null,
    createdAt: new Date().toISOString(),
    audioUrl: validFiles[0],
    audioFiles: validFiles,
    lyrics: newTracks[0]?.prompt || orderData.lyrics || '',
    sunoPrompt: newTracks[0]?.tags || orderData.sunoPrompt || '',
    tags: newTracks[0]?.tags || orderData.sunoPrompt || '',
    active: true,
    source: 'generation'
  };

  const updated = [
    newEntry,
    ...currentHistory.filter(h => h.id !== newEntry.id && h.taskId !== taskId).map(h => ({ ...h, active: false }))
  ];

  return updated;
}
