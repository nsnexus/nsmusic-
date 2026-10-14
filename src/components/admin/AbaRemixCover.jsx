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

  const timerRef = useRef(null);
  const pollingRef = useRef(null);

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
                    <audio src={url} controls style={{ width: '100%', height: '38px', outline: 'none' }} />
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

                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={`${titulo}_versao_${idx + 1}.mp3`}
                      style={{
                        background: '#166534',
                        color: '#ffffff',
                        textDecoration: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      ⬇️ Baixar MP3
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico Recente de Remixes */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            📋 Histórico Recente de Remixes ({historico.length})
          </h3>
          <button
            type="button"
            onClick={carregarHistorico}
            disabled={carregandoHistorico}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#475569',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            {carregandoHistorico ? 'Carregando...' : '🔄 Atualizar'}
          </button>
        </div>

        {carregandoHistorico ? (
          <div style={{ textAlign: 'center', padding: '30px', background: '#ffffff', borderRadius: '12px', color: '#64748b' }}>
            Carregando histórico...
          </div>
        ) : historico.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 20px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '2px dashed #cbd5e1',
            color: '#64748b'
          }}>
            Nenhum remix gerado ainda. As músicas criadas com a IA aparecerão aqui com os players e links de download.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {historico.map((item, idx) => {
              const tracks = Array.isArray(item.tracks) ? item.tracks : [];
              const isSucesso = item.status === 'SUCCESS' || tracks.length > 0;

              return (
                <div
                  key={item.taskId || idx}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px 18px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>
                          {item.title || 'Remix Suno'}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          background: isSucesso ? '#ecfdf5' : '#fefce8',
                          color: isSucesso ? '#065f46' : '#854d0e',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: '700'
                        }}>
                          {isSucesso ? '🟢 Concluído' : '🟡 Processando'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                        <strong>Estilo:</strong> {item.style} • <strong>Motor:</strong> {item.model || 'V5.5'} • {new Date(item.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Task ID: <code>{item.taskId}</code>
                    </div>
                  </div>

                  {/* Faixas geradas */}
                  {tracks.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginTop: '10px' }}>
                      {tracks.map((t, tIdx) => {
                        const trackUrl = t.audioUrl || t.audio_url || '';
                        return (
                          <div
                            key={t.id || tIdx}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              padding: '10px',
                              borderRadius: '8px'
                            }}
                          >
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                              Versão {tIdx + 1}
                            </div>
                            <audio src={trackUrl} controls style={{ width: '100%', height: '32px', marginBottom: '6px' }} />
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleCopiar(trackUrl, `hist_${item.taskId}_${tIdx}`)}
                                style={{
                                  background: copiadoId === `hist_${item.taskId}_${tIdx}` ? '#10b981' : '#ffffff',
                                  color: copiadoId === `hist_${item.taskId}_${tIdx}` ? '#ffffff' : '#334155',
                                  border: '1px solid #cbd5e1',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                              >
                                {copiadoId === `hist_${item.taskId}_${tIdx}` ? '✓ Copiado' : 'Copiar MP3'}
                              </button>
                              <a
                                href={trackUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                style={{
                                  background: '#ffffff',
                                  color: '#166534',
                                  border: '1px solid #86efac',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  textDecoration: 'none'
                                }}
                              >
                                ⬇️ Download
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                      Aguardando processamento do Suno...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
