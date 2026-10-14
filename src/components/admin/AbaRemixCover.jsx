'use client';

import React, { useState, useEffect, useRef } from 'react';

const ESTILOS_SUGERIDOS = [
  { label: '🎸 Sertanejo Acústico', value: 'Sertanejo acústico com violão de aço marcante, voz aveludada e arranjo limpo de estúdio' },
  { label: '🎹 Pop Balada Emocionante', value: 'Emotional acoustic pop piano ballad, cinematic warm vocals, touching melody' },
  { label: '☕ MPB & Violão de Nylon', value: 'MPB acústico intimista, violão de nylon com arranjo elegante e voz suave' },
  { label: '🥁 Pagode Moderno', value: 'Pagode romântico acústico com cavaquinho, percussão suave e voz marcante' },
  { label: '⚡ Rock Alternativo', value: 'Alternative rock ballad, dynamic drums, driving guitars and passionate vocals' },
  { label: '🎧 Lo-Fi Chill', value: 'Lo-Fi chillhop acoustic remix, warm vinyl beats, mellow soothing vocals' },
  { label: '🎷 Gospel / Worship', value: 'Contemporary worship acoustic, emotional ambient piano, deep heartfelt vocal' },
  { label: '💃 Forró & Piseiro', value: 'Piseiro e forró acústico moderno, sanfona marcante e ritmo envolvente' },
  { label: '🎻 Orquestral Cinematográfico', value: 'Cinematic orchestral soundtrack, lush strings and powerful emotional vocal' },
  { label: '🌴 Reggae Suave', value: 'Smooth acoustic roots reggae, gentle guitar skanks and sunny warm vocals' }
];

export default function AbaRemixCover() {
  // Configurações do Remix
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [titulo, setTitulo] = useState('Minha Música (Versão Estúdio)');
  const [estilo, setEstilo] = useState('Sertanejo acústico com violão de aço marcante, voz aveludada e arranjo limpo de estúdio');
  const [model, setModel] = useState('V5_5');
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState('');
  const [prompt, setPrompt] = useState('');
  const [identificandoLetra, setIdentificandoLetra] = useState(false);

  // Processo de Geração
  const [gerando, setGerando] = useState(false);
  const [taskIdAtual, setTaskIdAtual] = useState('');
  const [progressoMsg, setProgressoMsg] = useState('');
  const [tempoEspera, setTempoEspera] = useState(0);
  const [resultadoFaixas, setResultadoFaixas] = useState([]);

  // Histórico
  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  // Mensagens globais e cópia
  const [msgErro, setMsgErro] = useState('');
  const [msgSucesso, setMsgSucesso] = useState('');
  const [copiadoId, setCopiadoId] = useState('');

  // Estados de gestão estilo Pedidos
  const [salvandoR2Id, setSalvandoR2Id] = useState('');
  const [baixandoId, setBaixandoId] = useState('');
  const [excluindoId, setExcluindoId] = useState('');
  const [atualizandoStatusId, setAtualizandoStatusId] = useState('');
  const [buscaRemix, setBuscaRemix] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [letrasAbertas, setLetrasAbertas] = useState(new Set());

  const timerRef = useRef(null);
  const pollingRef = useRef(null);

  // Alterna exibição da letra no card
  const toggleLetra = (id) => {
    setLetrasAbertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Garante que a URL do áudio toque perfeitamente sem CORS ou stream bloqueado
  const resolvePlayableAudioUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (trimmed.includes('.r2.dev') || trimmed.includes('/remix/') || trimmed.includes('/audios/')) {
      return trimmed;
    }
    return `/api/audio/proxy?url=${encodeURIComponent(trimmed)}`;
  };

  // Download direto do arquivo MP3 garantindo que o arquivo seja salvo no disco (nunca abrindo tocador)
  const handleDownloadDireto = async (url, nomeArquivo, idParaStatus = '') => {
    if (!url) return;
    const safeName = (nomeArquivo || 'remix.mp3').replace(/[^\w.\- ]/g, '_');
    if (idParaStatus) setBaixandoId(idParaStatus);

    const downloadUrl = `/api/audio/proxy?url=${encodeURIComponent(url)}&download=${encodeURIComponent(safeName)}`;

    try {
      // 1. Tenta baixar via fetch + Blob: cria URL local blob: que o navegador obrigatoriamente
      // salva como arquivo para download no disco, sem jamais abrir o tocador de áudio
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15000);
    } catch (err) {
      console.warn('Fallback download direto via proxy:', err);
      // 2. Fallback caso fetch falhe: dispara download direto pelo proxy com Content-Disposition
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      if (idParaStatus) setBaixandoId('');
    }
  };

  // Salva manualmente as faixas no Cloudflare R2
  const handleSalvarR2 = async (taskId) => {
    if (!taskId) return;
    setSalvandoR2Id(taskId);
    setMsgErro('');
    setMsgSucesso('');

    try {
      const res = await fetch('/api/admin/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', taskId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao salvar áudios no R2.');
      }

      setHistorico((prev) =>
        prev.map((item) => (item.taskId === taskId ? { ...item, ...data.item, tracks: data.tracks } : item))
      );
      setMsgSucesso('☁️ Faixas do remix salvas permanentemente no Cloudflare R2!');
    } catch (err) {
      setMsgErro(err.message || 'Erro ao arquivar faixas no Cloudflare R2.');
    } finally {
      setSalvandoR2Id('');
    }
  };

  // Exclui remix do histórico
  const handleExcluirRemix = async (taskId, tituloRemix) => {
    if (!confirm(`Deseja realmente remover o remix "${tituloRemix || taskId}" do histórico?`)) return;

    setExcluindoId(taskId);
    setMsgErro('');

    try {
      const res = await fetch('/api/admin/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', taskId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao remover remix.');
      }

      setHistorico((prev) => prev.filter((item) => item.taskId !== taskId));
      setMsgSucesso('Remix removido do histórico com sucesso!');
    } catch (err) {
      setMsgErro(err.message || 'Erro ao excluir remix.');
    } finally {
      setExcluindoId('');
    }
  };

  // Atualiza status de um remix específico
  const handleAtualizarStatusIndividual = async (taskId) => {
    setAtualizandoStatusId(taskId);
    try {
      const res = await fetch('/api/admin/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', taskId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setHistorico((prev) =>
          prev.map((it) => (it.taskId === taskId ? { ...it, status: data.status, tracks: data.tracks } : it))
        );
        if (data.status === 'SUCCESS') {
          setMsgSucesso('Remix atualizado e concluído!');
        }
      }
    } catch (e) {
      console.warn('Erro ao atualizar status do remix:', e);
    } finally {
      setAtualizandoStatusId('');
    }
  };

  // Copia mensagem personalizada pro WhatsApp do cliente
  const handleCopiarMensagemWhatsApp = (item, trackUrl, versaoNum) => {
    const link = resolvePlayableAudioUrl(trackUrl);
    const texto = `Olá! 🎶 O remix da sua música "${item.title || 'Música'}" ficou pronto!\n\nVocê pode ouvir a Versão ${versaoNum} no link abaixo:\n${link}\n\nEspero que goste do resultado! 🎧✨`;
    handleCopiar(texto, `wpp_${item.taskId}_${versaoNum}`);
  };

  // Carrega histórico recente ao montar
  const carregarHistorico = async () => {
    setCarregandoHistorico(true);
    try {
      const res = await fetch('/api/admin/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'history' })
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.history)) {
        setHistorico(data.history);
      }
    } catch (e) {
      console.warn('Falha ao carregar histórico de remixes:', e);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  useEffect(() => {
    carregarHistorico();
  }, []);

  const handleCopiar = (texto, id = '') => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    setCopiadoId(id || texto);
    setTimeout(() => setCopiadoId(''), 2500);
  };

  // Identifica e transcreve a letra do áudio com IA (Whisper + Gemini)
  const handleIdentificarLetra = async (urlCustom) => {
    const urlAlvo = (typeof urlCustom === 'string' && urlCustom.trim()) ? urlCustom.trim() : audioUrl.trim();
    if (!urlAlvo) {
      setMsgErro('Por favor, envie um áudio ou informe a URL do áudio antes de identificar a letra.');
      return;
    }

    setIdentificandoLetra(true);
    setMsgErro('');
    setMsgSucesso('');

    try {
      const res = await fetch('/api/admin/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transcribe',
          audioUrl: urlAlvo
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao transcrever o áudio.');
      }

      if (data.ok && data.lyrics) {
        setPrompt(data.lyrics);
        setMsgSucesso('✨ Letra da música identificada e preenchida com sucesso pela Inteligência Artificial!');
      } else {
        setMsgErro(data.message || 'Nenhuma voz cantada clara foi identificada no áudio. Você pode digitar a letra manualmente.');
      }
    } catch (err) {
      setMsgErro(err.message || 'Erro ao identificar a letra da música.');
    } finally {
      setIdentificandoLetra(false);
    }
  };

  // Upload do áudio original no Cloudflare R2
  const handleUploadAudio = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioFile(file);
    setUploadingAudio(true);
    setMsgErro('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'remix-source');

      const res = await fetch('/api/admin/voice/upload', {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Falha no upload do áudio.');
      }

      setAudioUrl(data.url);
      setMsgSucesso('Áudio original enviado para o Cloudflare R2 com sucesso!');

      // Se for cover com voz e a letra ainda não foi preenchida, transcreve automaticamente
      if (!instrumental && !prompt.trim()) {
        handleIdentificarLetra(data.url);
      }
    } catch (err) {
      setMsgErro(err.message || 'Erro ao fazer upload do arquivo de áudio.');
    } finally {
      setUploadingAudio(false);
    }
  };

  // Submeter Remix / Cover para a Kie.ai
  const handleCriarRemix = async (e) => {
    e.preventDefault();
    if (!audioUrl.trim()) {
      setMsgErro('Por favor, faça o upload de um áudio ou cole a URL pública do áudio original.');
      return;
    }
    if (!estilo.trim()) {
      setMsgErro('Por favor, preencha o estilo musical desejado para o remix.');
      return;
    }

    setGerando(true);
    setMsgErro('');
    setMsgSucesso('');
    setResultadoFaixas([]);
    setTempoEspera(0);
    setProgressoMsg('Enviando solicitação de remix para a Kie.ai...');

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTempoEspera((prev) => prev + 1);
    }, 1000);

    try {
      const res = await fetch('/api/admin/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          uploadUrl: audioUrl.trim(),
          style: estilo.trim(),
          title: titulo.trim() || 'Minha Canção (Remix)',
          model,
          instrumental,
          vocalGender: instrumental ? '' : vocalGender,
          prompt: instrumental ? '' : prompt.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok || !data.taskId) {
        throw new Error(data.error || 'Não foi possível iniciar o remix na Kie.ai.');
      }

      const tId = data.taskId;
      setTaskIdAtual(tId);
      setProgressoMsg('Música recebida pelo Suno! Gerando o novo arranjo e voz...');

      // Inicia polling de status
      iniciarPollingStatus(tId);
    } catch (err) {
      setMsgErro(err.message || 'Erro ao criar remix.');
      setGerando(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const iniciarPollingStatus = (tId) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    let tentativas = 0;
    pollingRef.current = setInterval(async () => {
      tentativas += 1;
      try {
        const res = await fetch('/api/admin/remix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status', taskId: tId })
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          if (Array.isArray(data.tracks) && data.tracks.length > 0) {
            clearInterval(pollingRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            setResultadoFaixas(data.tracks);
            setGerando(false);
            setMsgSucesso('🎉 Remix concluído com sucesso! Duas variações de estúdio geradas pelo Suno.');
            await carregarHistorico();
            return;
          }

          if (data.status === 'FAILED') {
            clearInterval(pollingRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            setGerando(false);
            setMsgErro('A geração do remix falhou na Kie.ai. Verifique a URL do áudio ou créditos.');
            return;
          }

          // Mensagens de progresso dinâmicas
          if (tentativas > 10) {
            setProgressoMsg('Sintetizando instrumentos e mixando canais de estúdio...');
          } else if (tentativas > 5) {
            setProgressoMsg('A IA está compondo a linha melódica e arranjo vocal...');
          }
        }
      } catch (pollErr) {
        console.warn('Erro transitório no polling:', pollErr);
      }

      // Timeout após ~4 minutos (60 tentativas * 4s)
      if (tentativas >= 60) {
        clearInterval(pollingRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setGerando(false);
        setMsgErro('O processamento demorou mais do que o esperado. Você pode conferir os resultados no histórico em instantes.');
        await carregarHistorico();
      }
    }, 4000);
  };

  const formatarTempo = (totalSeg) => {
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '1060px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            🎛️ Remix & Cover de Músicas (Suno IA via Kie.ai)
          </h2>
          <span style={{
            background: '#e0e7ff',
            color: '#3730a3',
            fontSize: '0.74rem',
            fontWeight: '800',
            padding: '4px 10px',
            borderRadius: '999px',
            border: '1px solid #c7d2fe'
          }}>
            Upload & Cover
          </span>
        </div>
        <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '6px 0 0 0' }}>
          Envie o áudio original de uma pessoa cantando ou tocando, selecione o estilo desejado e a IA do Suno recria o arranjo, instrumentos e qualidade vocal de estúdio mantendo a melodia da música.
        </p>
      </div>

      {/* Alertas */}
      {msgSucesso && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          fontSize: '0.86rem',
          fontWeight: '600',
          marginBottom: '16px'
        }}>
          ✅ {msgSucesso}
        </div>
      )}

      {msgErro && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: '0.86rem',
          fontWeight: '600',
          marginBottom: '16px'
        }}>
          ⚠️ {msgErro}
        </div>
      )}

      {/* Formulário Principal */}
      <div style={{
        background: '#ffffff',
        border: '1.5px solid #e2e8f0',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
        marginBottom: '28px'
      }}>
        <form onSubmit={handleCriarRemix}>
          {/* Seção 1: Áudio Original */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '800', color: '#1e293b', marginBottom: '6px' }}>
              1. Áudio Original da Pessoa (Fonte do Remix) *
            </label>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 10px 0' }}>
              Faça upload do arquivo (MP3, WAV, M4A, OGG, WEBM até 8 min) ou informe a URL direta de um áudio já hospedado.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {/* Upload direto */}
              <div style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'center',
                backgroundColor: '#f8fafc',
                cursor: 'pointer'
              }}>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.webm,video/webm"
                  onChange={handleUploadAudio}
                  disabled={uploadingAudio || gerando}
                  id="remix-file-input"
                  style={{ display: 'none' }}
                />
                <label htmlFor="remix-file-input" style={{ cursor: 'pointer', display: 'block' }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>
                    {uploadingAudio ? '⏳' : '📁'}
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: '700', color: '#334155' }}>
                    {uploadingAudio ? 'Enviando áudio para o R2...' : audioFile ? audioFile.name : 'Clique para selecionar o áudio'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' }}>
                    MP3, WAV, M4A, AAC, OGG, OPUS (WhatsApp) ou gravador
                  </div>
                </label>
              </div>

              {/* URL Manual */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  Ou informe a URL do Áudio:
                </label>
                <input
                  type="url"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://pub-xxx.r2.dev/audio.mp3"
                  disabled={gerando}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.86rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {audioUrl && (
                  <div style={{ marginTop: '10px' }}>
                    <audio
                      src={audioUrl}
                      controls
                      style={{ width: '100%', height: '36px', outline: 'none' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ height: '1px', background: '#e2e8f0', margin: '20px 0' }} />

          {/* Seção 2: Estilo Musical & Sugestões Rápidas */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>
              2. Estilo Musical Desejado (Style / Prompt Musical) *
            </label>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 10px 0' }}>
              Descreva os instrumentos, ritmo, clima e tom vocal que o Suno deve aplicar na nova versão.
            </p>

            <textarea
              rows={2}
              value={estilo}
              onChange={(e) => setEstilo(e.target.value)}
              placeholder="Ex: Sertanejo acústico com violão de aço marcante, voz aveludada e arranjo limpo de estúdio..."
              required
              disabled={gerando}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.88rem',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />

            {/* Chips Rápidos de Estilos */}
            <div style={{ marginTop: '10px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                Sugestões Prontas (Clique para aplicar):
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {ESTILOS_SUGERIDOS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setEstilo(item.value)}
                    disabled={gerando}
                    style={{
                      background: estilo === item.value ? '#ede9fe' : '#f1f5f9',
                      color: estilo === item.value ? '#7c3aed' : '#334155',
                      border: '1px solid',
                      borderColor: estilo === item.value ? '#c4b5fd' : '#e2e8f0',
                      padding: '5px 10px',
                      borderRadius: '999px',
                      fontSize: '0.76rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ height: '1px', background: '#e2e8f0', margin: '20px 0' }} />

          {/* Seção 3: Parâmetros Adicionais (Título, Motor Suno, Vocais, Letra) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                Título da Música
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Minha Canção (Remix)"
                disabled={gerando}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.86rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                Motor Suno
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={gerando}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.86rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: '#ffffff'
                }}
              >
                <option value="V5_5">Suno V5.5 (Recomendado - Voz mais limpa)</option>
                <option value="V6">Suno V6 (Última geração)</option>
                <option value="V4_5ALL">Suno V4.5 (Estável)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                Tipo de Produção
              </label>
              <select
                value={instrumental ? 'sim' : 'nao'}
                onChange={(e) => setInstrumental(e.target.value === 'sim')}
                disabled={gerando}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.86rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: '#ffffff'
                }}
              >
                <option value="nao">Com Voz (Cover Cantado)</option>
                <option value="sim">Apenas Instrumental (Sem Voz)</option>
              </select>
            </div>

            {!instrumental && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  Preferência Vocal
                </label>
                <select
                  value={vocalGender}
                  onChange={(e) => setVocalGender(e.target.value)}
                  disabled={gerando}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.86rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: '#ffffff'
                  }}
                >
                  <option value="">Automático (Mesmo gênero do áudio)</option>
                  <option value="m">Voz Masculina</option>
                  <option value="f">Voz Feminina</option>
                </select>
              </div>
            )}
          </div>

          {!instrumental && (
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.86rem', fontWeight: '800', color: '#1e293b' }}>
                    3. Letra da Música (Identificada ou Adaptada)
                  </label>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
                    O Suno precisa da letra para cantar cada palavra com perfeição.
                  </span>
                </div>
                {audioUrl && (
                  <button
                    type="button"
                    onClick={() => handleIdentificarLetra()}
                    disabled={identificandoLetra || gerando}
                    style={{
                      background: identificandoLetra ? '#ede9fe' : '#f5f3ff',
                      color: '#7c3aed',
                      border: '1.5px solid #c4b5fd',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: '800',
                      cursor: identificandoLetra ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 1px 3px rgba(124, 58, 237, 0.1)',
                      transition: 'all 0.15s'
                    }}
                  >
                    {identificandoLetra ? (
                      <>
                        <span style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          border: '2px solid #7c3aed',
                          borderTopColor: 'transparent',
                          animation: 'spin 1s linear infinite',
                          display: 'inline-block'
                        }} />
                        Ouvindo áudio e extraindo letra...
                      </>
                    ) : (
                      <>✨ Identificar Letra com IA (Whisper)</>
                    )}
                  </button>
                )}
              </div>

              <textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A letra cantada da música aparecerá aqui automaticamente após o upload. Você também pode digitar ou editar os versos..."
                disabled={gerando || identificandoLetra}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.86rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  lineHeight: '1.5',
                  background: identificandoLetra ? '#f8fafc' : '#ffffff'
                }}
              />
            </div>
          )}

          {/* Botão de Envio */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '14px' }}>
            {gerando && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', color: '#7c3aed', fontWeight: '700' }}>
                <span style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: '2px solid #7c3aed',
                  borderTopColor: 'transparent',
                  animation: 'spin 1s linear infinite'
                }} />
                <span>{progressoMsg} ({formatarTempo(tempoEspera)})</span>
              </div>
            )}

            <button
              type="submit"
              disabled={gerando || uploadingAudio}
              style={{
                background: gerando ? '#94a3b8' : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '10px',
                fontSize: '0.94rem',
                fontWeight: '800',
                border: 'none',
                cursor: gerando ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: gerando ? 'none' : '0 6px 16px rgba(124, 58, 237, 0.3)'
              }}
            >
              {gerando ? '⏳ Gerando Remix com Suno...' : '🚀 Gerar Remix / Cover com Suno IA'}
            </button>
          </div>
        </form>
      </div>

      {/* Resultados Gerados Nesta Sessão */}
      {resultadoFaixas.length > 0 && (
        <div style={{
          background: '#f0fdf4',
          border: '2px solid #86efac',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '32px',
          boxShadow: '0 10px 25px -5px rgba(22, 101, 52, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#166534', margin: 0 }}>
                🎉 Músicas Geradas com Sucesso! ({resultadoFaixas.length} Variações)
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#15803d', margin: '3px 0 0 0' }}>
                O Suno recriou o arranjo e produziu duas versões de estúdio a partir do áudio enviado.
              </p>
            </div>
            <span style={{ fontSize: '1.8rem' }}>🎵</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {resultadoFaixas.map((track, idx) => {
              const url = track.audioUrl || track.audio_url || track.stream_audio_url || '';
              const trackTitle = track.title || `${titulo} - Variação ${idx + 1}`;
              const playableUrl = resolvePlayableAudioUrl(url);

              return (
                <div
                  key={track.id || idx}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #bbf7d0',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
                      {trackTitle}
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      Versão {idx + 1}
                    </span>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <audio src={playableUrl} controls style={{ width: '100%', height: '38px', outline: 'none' }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleCopiar(url, `track_${idx}`)}
                      style={{
                        background: copiadoId === `track_${idx}` ? '#10b981' : '#f1f5f9',
                        color: copiadoId === `track_${idx}` ? '#ffffff' : '#334155',
                        border: '1px solid #cbd5e1',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {copiadoId === `track_${idx}` ? '✓ Copiado!' : '📋 Copiar Link MP3'}
                    </button>

                    <button
                      type="button"
                      disabled={baixandoId === `res_${idx}`}
                      onClick={() => handleDownloadDireto(url, `${titulo}_versao_${idx + 1}.mp3`, `res_${idx}`)}
                      style={{
                        background: baixandoId === `res_${idx}` ? '#15803d' : '#166534',
                        color: '#ffffff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: baixandoId === `res_${idx}` ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: baixandoId === `res_${idx}` ? 0.8 : 1
                      }}
                    >
                      {baixandoId === `res_${idx}` ? '⏳ Baixando...' : '⬇️ Baixar MP3'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico de Remixes Estilo Pedidos */}
      <div style={{ marginTop: '24px' }}>
        {/* Cabeçalho do Histórico com Estatísticas e Ações */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
          background: '#ffffff',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                📋 Painel de Solicitações de Remix & Cover
              </h3>
              <span style={{
                background: '#ede9fe',
                color: '#6d28d9',
                padding: '2px 10px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: '800'
              }}>
                {historico.length} total
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
              Gerencie cada remix com áudios salvos no Cloudflare R2, comparação antes/depois e download direto.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={carregarHistorico}
              disabled={carregandoHistorico}
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                color: '#334155',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: carregandoHistorico ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {carregandoHistorico ? '🔄 Carregando...' : '🔄 Atualizar Tudo'}
            </button>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '18px',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ flex: '1 1 280px', maxWidth: '420px' }}>
            <input
              type="text"
              value={buscaRemix}
              onChange={(e) => setBuscaRemix(e.target.value)}
              placeholder="🔍 Buscar por título da música, estilo ou ID..."
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.86rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'concluidos', label: 'Concluídos' },
              { id: 'processando', label: 'Processando' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroStatus(f.id)}
                style={{
                  background: filtroStatus === f.id ? '#7c3aed' : '#ffffff',
                  color: filtroStatus === f.id ? '#ffffff' : '#475569',
                  border: '1px solid',
                  borderColor: filtroStatus === f.id ? '#7c3aed' : '#cbd5e1',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Cards Estilo Pedidos */}
        {carregandoHistorico ? (
          <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '14px', color: '#64748b', border: '1px solid #e2e8f0' }}>
            Carregando lista de remixes...
          </div>
        ) : historico.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 20px',
            background: '#ffffff',
            borderRadius: '14px',
            border: '2px dashed #cbd5e1',
            color: '#64748b'
          }}>
            Nenhum remix gerado ainda. Use o formulário acima para criar o primeiro cover/remix com a Suno!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {historico
              .filter((item) => {
                const tracks = Array.isArray(item.tracks) ? item.tracks : [];
                const isConcluido = item.status === 'SUCCESS' || tracks.length > 0;
                if (filtroStatus === 'concluidos' && !isConcluido) return false;
                if (filtroStatus === 'processando' && isConcluido) return false;

                if (!buscaRemix.trim()) return true;
                const termo = buscaRemix.toLowerCase().trim();
                const tituloMatch = String(item.title || '').toLowerCase().includes(termo);
                const estiloMatch = String(item.style || '').toLowerCase().includes(termo);
                const idMatch = String(item.taskId || '').toLowerCase().includes(termo);
                return tituloMatch || estiloMatch || idMatch;
              })
              .map((item, idx) => {
                const tracks = Array.isArray(item.tracks) ? item.tracks : [];
                const isConcluido = item.status === 'SUCCESS' || tracks.length > 0;
                const isFalha = item.status === 'FAILED';
                const letraAberta = letrasAbertas.has(item.taskId);
                const shortId = (item.taskId || '').slice(0, 8).toUpperCase();
                const todasSalvasR2 = tracks.length > 0 && tracks.every((t) => t.savedToR2 || (t.audio_url && t.audio_url.includes('.r2.dev')));

                return (
                  <div
                    key={item.taskId || idx}
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '20px',
                      boxShadow: '0 3px 8px rgba(0,0,0,0.03)',
                      transition: 'border-color 0.2s'
                    }}
                  >
                    {/* Header do Pedido de Remix */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '12px',
                      borderBottom: '1px solid #f1f5f9',
                      paddingBottom: '14px',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            letterSpacing: '0.5px'
                          }}>
                            #RMX-{shortId}
                          </span>
                          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                            {item.title || 'Remix Suno IA'}
                          </span>
                          <span style={{
                            fontSize: '0.74rem',
                            fontWeight: '800',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            background: isConcluido ? '#dcfce7' : isFalha ? '#fee2e2' : '#fef3c7',
                            color: isConcluido ? '#15803d' : isFalha ? '#b91c1c' : '#b45309',
                            border: `1px solid ${isConcluido ? '#bbf7d0' : isFalha ? '#fca5a5' : '#fde68a'}`
                          }}>
                            {isConcluido ? '🟢 Concluído' : isFalha ? '🔴 Falha' : '⏳ Em Processamento'}
                          </span>
                        </div>

                        {/* Metadados rápidos */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.78rem', color: '#64748b' }}>
                          <span>🕒 {new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                          <span>•</span>
                          <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontWeight: '700', color: '#334155' }}>
                            Motor: {item.model || 'V5.5'}
                          </span>
                          <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontWeight: '700', color: '#334155' }}>
                            {item.instrumental ? '🎸 Instrumental' : '🎤 Com Vocal'}
                          </span>
                          {item.vocalGender && (
                            <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontWeight: '700', color: '#334155' }}>
                              {item.vocalGender === 'm' ? 'Voz Masculina' : item.vocalGender === 'f' ? 'Voz Feminina' : 'Voz Auto'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botões do Topo do Card */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!isConcluido && (
                          <button
                            type="button"
                            onClick={() => handleAtualizarStatusIndividual(item.taskId)}
                            disabled={atualizandoStatusId === item.taskId}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {atualizandoStatusId === item.taskId ? 'Checando...' : '🔄 Atualizar'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleExcluirRemix(item.taskId, item.title)}
                          disabled={excluindoId === item.taskId}
                          title="Excluir do histórico"
                          style={{
                            background: '#fff1f2',
                            border: '1px solid #fecdd3',
                            color: '#e11d48',
                            padding: '5px 9px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {excluindoId === item.taskId ? '...' : '🗑️'}
                        </button>
                      </div>
                    </div>

                    {/* Conteúdo Principal do Card em Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                      {/* Lado Esquerdo: Áudio Original do Cliente & Estilo */}
                      <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '14px'
                      }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🎧 Áudio Original do Cliente</span>
                        </div>

                        {item.uploadUrl ? (
                          <div style={{ marginBottom: '10px' }}>
                            <audio
                              src={resolvePlayableAudioUrl(item.uploadUrl)}
                              controls
                              style={{ width: '100%', height: '34px', outline: 'none' }}
                            />
                            <a
                              href={item.uploadUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: '0.72rem', color: '#2563eb', textDecoration: 'underline', display: 'inline-block', marginTop: '4px' }}
                            >
                              Arquivo original no Cloudflare R2 ↗
                            </a>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>URL original não disponível</span>
                        )}

                        <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#334155' }}>
                          <strong style={{ color: '#0f172a' }}>🎵 Estilo Solicitado:</strong>
                          <div style={{ marginTop: '2px', background: '#ffffff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            {item.style}
                          </div>
                        </div>

                        {item.lyrics && (
                          <div style={{ marginTop: '10px' }}>
                            <button
                              type="button"
                              onClick={() => toggleLetra(item.taskId)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: '#7c3aed',
                                fontSize: '0.76rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {letraAberta ? '▲ Ocultar Letra Utilizada' : '▼ 📜 Ver Letra Utilizada'}
                            </button>
                            {letraAberta && (
                              <div style={{
                                marginTop: '6px',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '8px 10px',
                                fontSize: '0.75rem',
                                color: '#334155',
                                whiteSpace: 'pre-line',
                                maxHeight: '180px',
                                overflowY: 'auto'
                              }}>
                                {item.lyrics}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Lado Direito: Versões Geradas (Arranjo 1 e 2) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0f172a' }}>
                            🎵 Versões Produzidas pelo Suno ({tracks.length})
                          </span>
                          {tracks.length > 0 && !todasSalvasR2 && (
                            <button
                              type="button"
                              onClick={() => handleSalvarR2(item.taskId)}
                              disabled={salvandoR2Id === item.taskId}
                              style={{
                                background: '#f5f3ff',
                                color: '#7c3aed',
                                border: '1px solid #c4b5fd',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                cursor: salvandoR2Id === item.taskId ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {salvandoR2Id === item.taskId ? 'Salvando no R2...' : '☁️ Salvar no R2'}
                            </button>
                          )}
                        </div>

                        {tracks.length > 0 ? (
                          tracks.map((t, tIdx) => {
                            const rawTrackUrl = t.audioUrl || t.audio_url || '';
                            const playableUrl = resolvePlayableAudioUrl(rawTrackUrl);
                            const estaNoR2 = Boolean(t.savedToR2 || rawTrackUrl.includes('.r2.dev') || rawTrackUrl.includes('/remix/'));
                            const trackTitle = t.title || `${item.title || 'Música'} (Versão ${tIdx + 1})`;

                            return (
                              <div
                                key={t.id || tIdx}
                                style={{
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '10px',
                                  padding: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '0.86rem', fontWeight: '800', color: '#1e293b' }}>
                                    Versão {tIdx + 1}
                                  </span>

                                  {estaNoR2 ? (
                                    <span style={{
                                      fontSize: '0.68rem',
                                      fontWeight: '800',
                                      background: '#dcfce7',
                                      color: '#15803d',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid #bbf7d0'
                                    }}>
                                      ☁️ Salvo no R2
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleSalvarR2(item.taskId)}
                                      disabled={salvandoR2Id === item.taskId}
                                      style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '700',
                                        background: '#fffbeb',
                                        color: '#b45309',
                                        border: '1px solid #fde68a',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      {salvandoR2Id === item.taskId ? 'Salvando...' : '⚠️ Salvar no R2'}
                                    </button>
                                  )}
                                </div>

                                <audio
                                  src={playableUrl}
                                  controls
                                  style={{ width: '100%', height: '34px', marginBottom: '8px', outline: 'none' }}
                                />

                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    disabled={baixandoId === `hist_${item.taskId}_${tIdx}`}
                                    onClick={() => handleDownloadDireto(rawTrackUrl, `${item.title || 'Remix'}_Versao_${tIdx + 1}.mp3`, `hist_${item.taskId}_${tIdx}`)}
                                    style={{
                                      background: baixandoId === `hist_${item.taskId}_${tIdx}` ? '#15803d' : '#166534',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      fontSize: '0.74rem',
                                      fontWeight: '800',
                                      cursor: baixandoId === `hist_${item.taskId}_${tIdx}` ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      opacity: baixandoId === `hist_${item.taskId}_${tIdx}` ? 0.8 : 1
                                    }}
                                  >
                                    {baixandoId === `hist_${item.taskId}_${tIdx}` ? '⏳ Baixando...' : '⬇️ Baixar MP3'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleCopiar(rawTrackUrl, `hist_${item.taskId}_${tIdx}`)}
                                    style={{
                                      background: copiadoId === `hist_${item.taskId}_${tIdx}` ? '#10b981' : '#ffffff',
                                      color: copiadoId === `hist_${item.taskId}_${tIdx}` ? '#ffffff' : '#334155',
                                      border: '1px solid #cbd5e1',
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      fontSize: '0.74rem',
                                      fontWeight: '700',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {copiadoId === `hist_${item.taskId}_${tIdx}` ? '✓ Copiado' : '📋 Copiar MP3'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleCopiarMensagemWhatsApp(item, rawTrackUrl, tIdx + 1)}
                                    style={{
                                      background: copiadoId === `wpp_${item.taskId}_${tIdx + 1}` ? '#10b981' : '#25d366',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      fontSize: '0.74rem',
                                      fontWeight: '800',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    {copiadoId === `wpp_${item.taskId}_${tIdx + 1}` ? '✓ Copiado p/ Zap' : '💬 WhatsApp'}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{
                            padding: '16px',
                            background: '#f8fafc',
                            borderRadius: '10px',
                            border: '1px dashed #cbd5e1',
                            fontSize: '0.8rem',
                            color: '#64748b',
                            textAlign: 'center'
                          }}>
                            {isFalha
                              ? 'A geração do remix falhou na Suno. Tente novamente ou verifique os créditos.'
                              : '⏳ As músicas estão sendo mixadas pela Suno IA. Clique em "Atualizar" em instantes.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
