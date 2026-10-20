'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { converterParaWavBlob } from '@/lib/audioWav';

export default function GravarVozView({ token }) {
  const [carregandoInvite, setCarregandoInvite] = useState(true);
  const [invite, setInvite] = useState(null);
  const [erroInvite, setErroInvite] = useState('');
  const [linkDesativado, setLinkDesativado] = useState(false);

  // Etapa do processo: 1 = Gravar Amostra, 2 = Ler Frase de Validação, 3 = Sucesso
  const [etapa, setEtapa] = useState(1);

  // Estados do Gravador
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  // Passo 1: Amostra da Voz
  const [amostraBlob, setAmostraBlob] = useState(null);
  const [amostraPreviewUrl, setAmostraPreviewUrl] = useState('');
  const [amostraPublicUrl, setAmostraPublicUrl] = useState('');

  // Passo 2: Frase de Validação
  const [phraseTaskId, setPhraseTaskId] = useState('');
  const [fraseValidacao, setFraseValidacao] = useState('');
  const [verificacaoBlob, setVerificacaoBlob] = useState(null);
  const [verificacaoPreviewUrl, setVerificacaoPreviewUrl] = useState('');
  const [verificacaoPublicUrl, setVerificacaoPublicUrl] = useState('');

  // Estados de Processamento e Feedback
  const [processando, setProcessando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erroAcao, setErroAcao] = useState('');

  // 1. Carrega dados do convite
  useEffect(() => {
    if (!token) {
      setErroInvite('Link inválido: nenhum código de convite fornecido.');
      setCarregandoInvite(false);
      return;
    }

    fetch(`/api/voice/invite/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.deactivated) {
            setLinkDesativado(true);
          }
          throw new Error(data.error || 'Link não encontrado ou expirado.');
        }
        setInvite(data.invite);
        if (data.invite?.status === 'concluido' && data.invite?.voiceId) {
          setEtapa(3);
        }
      })
      .catch((err) => {
        setErroInvite(err.message || 'Erro ao carregar link.');
      })
      .finally(() => {
        setCarregandoInvite(false);
      });
  }, [token]);

  // Controle de gravação
  const iniciarGravacao = async (tipo = 'amostra') => {
    setErroAcao('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      audioChunksRef.current = [];
      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const type = selectedMime || 'audio/webm';
        const rawBlob = new Blob(audioChunksRef.current, { type });
        const blob = await converterParaWavBlob(rawBlob);
        const url = URL.createObjectURL(blob);

        if (tipo === 'amostra') {
          setAmostraBlob(blob);
          setAmostraPreviewUrl(url);
        } else {
          setVerificacaoBlob(blob);
          setVerificacaoPreviewUrl(url);
        }

        // Para as faixas do microfone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setGravando(true);
      setSegundos(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setSegundos((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      setErroAcao('Não foi possível acessar seu microfone. Verifique se deu permissão no seu navegador.');
    }
  };

  const pararGravacao = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && gravando) {
      mediaRecorderRef.current.stop();
    }
    setGravando(false);
  };

  // Upload e solicitação da frase de validação (Passo 1 -> 2)
  const handleAvancarParaValidacao = async () => {
    if (!amostraBlob) {
      setErroAcao('Por favor, grave uma amostra da sua voz antes de continuar.');
      return;
    }

    if (segundos < 8 && !amostraPreviewUrl) {
      setErroAcao('Grave ao menos 10 a 15 segundos para que a IA consiga capturar o seu timbre com clareza.');
      return;
    }

    setProcessando(true);
    setErroAcao('');
    setStatusMsg('Enviando amostra da sua voz com segurança...');

    try {
      // 1. Upload da amostra no R2
      const fd = new FormData();
      fd.append('file', amostraBlob, 'amostra.webm');
      fd.append('folder', 'invites');

      const upRes = await fetch('/api/admin/voice/upload', {
        method: 'POST',
        body: fd
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok || !upData.url) {
        throw new Error(upData.error || 'Falha no upload do áudio.');
      }
      setAmostraPublicUrl(upData.url);

      // 2. Solicita geração da frase de segurança na Kie.ai
      setStatusMsg('Gerando frase de segurança personalizada com Inteligência Artificial...');
      const phraseRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_phrase',
          voiceUrl: upData.url,
          vocalStart: 0,
          vocalEnd: Math.min(Math.max(segundos, 10), 20),
          language: 'pt'
        })
      });
      const pData = await phraseRes.json().catch(() => ({}));
      if (!phraseRes.ok || !pData.taskId) {
        throw new Error(pData.error || 'Não foi possível solicitar a frase de segurança.');
      }

      setPhraseTaskId(pData.taskId);

      // 3. Polling da frase
      setStatusMsg('Obtendo frase de validação vocal...');
      let fraseObtida = '';
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const checkRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(pData.taskId)}&type=phrase`);
        if (checkRes.ok) {
          const cData = await checkRes.json().catch(() => ({}));
          if (cData.phrase) {
            fraseObtida = cData.phrase;
            break;
          }
        }
      }

      const nomeCliente = invite?.customerName || 'eu';
      const fraseFinal = fraseObtida || `Eu, ${nomeCliente}, autorizo o uso do meu timbre de voz para a criação de músicas personalizadas.`;
      setFraseValidacao(fraseFinal);
      setEtapa(2);
    } catch (err) {
      console.error('Erro no Passo 1:', err);
      setErroAcao(err.message || 'Erro ao processar amostra. Tente novamente.');
    } finally {
      setProcessando(false);
      setStatusMsg('');
    }
  };

  // Upload da validação e criação definitiva da voz (Passo 2 -> 3)
  const handleFinalizarClonagem = async () => {
    if (!verificacaoBlob || !phraseTaskId) {
      setErroAcao('Por favor, grave a leitura da frase de segurança.');
      return;
    }

    setProcessando(true);
    setErroAcao('');
    setStatusMsg('Enviando gravação de confirmação...');

    try {
      // 1. Upload do áudio de validação
      const fd = new FormData();
      fd.append('file', verificacaoBlob, 'validacao.webm');
      fd.append('folder', 'invites-verify');

      const upRes = await fetch('/api/admin/voice/upload', {
        method: 'POST',
        body: fd
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok || !upData.url) {
        throw new Error(upData.error || 'Falha no envio da validação.');
      }
      setVerificacaoPublicUrl(upData.url);

      // 2. Criação do perfil de voz na Kie.ai
      setStatusMsg('Sintetizando e calibrando seu timbre de voz...');
      const createRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_voice',
          phraseTaskId,
          voiceUrl: amostraPublicUrl,
          verifyUrl: upData.url,
          voiceName: invite?.customerName || 'Convidado'
        })
      });
      const cData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !cData.taskId) {
        throw new Error(cData.error || 'Falha ao iniciar síntese vocal.');
      }

      // 3. Polling da criação do Voice ID
      setStatusMsg('Finalizando seu modelo de voz com a Inteligência Artificial...');
      let createdVoiceId = '';
      let createdRecordId = '';
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const pRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(cData.taskId)}&type=job`);
        if (pRes.ok) {
          const poll = await pRes.json().catch(() => ({}));
          if (poll.voiceId || poll.personaId) {
            createdVoiceId = poll.voiceId || poll.personaId;
            createdRecordId = poll.voiceRecordingId || poll.voice_recording_id || '';
            break;
          }
        }
      }

      const finalVoiceId = createdVoiceId || cData.taskId;

      // 4. Salva a conclusão no convite e vincula ao contato
      setStatusMsg('Vinculando seu timbre ao seu cadastro...');
      const postInviteRes = await fetch(`/api/voice/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: finalVoiceId,
          voiceRecordingId: createdRecordId,
          sampleAudioUrl: amostraPublicUrl,
          verifyAudioUrl: upData.url,
          phone: invite?.phone || '',
          customerName: invite?.customerName || ''
        })
      });

      const invData = await postInviteRes.json().catch(() => ({}));
      if (!postInviteRes.ok) {
        console.warn('Aviso ao sincronizar invite:', invData?.error);
      }

      setEtapa(3);
    } catch (err) {
      console.error('Erro no Passo 2:', err);
      setErroAcao(err.message || 'Erro ao finalizar modelo de voz. Tente novamente.');
    } finally {
      setProcessando(false);
      setStatusMsg('');
    }
  };

  const formatarTempo = (totalSeg) => {
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  };

  // Tela de Carregando
  if (carregandoInvite) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#090d16',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          border: '4px solid #7c3aed',
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }} />
        <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Carregando seu convite de voz...</p>
      </div>
    );
  }

  // Tela de Link Desativado ou Inválido
  if (linkDesativado || erroInvite) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#090d16',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        <div style={{
          maxWidth: '460px',
          width: '100%',
          backgroundColor: '#111827',
          border: '1.5px solid #374151',
          borderRadius: '20px',
          padding: '36px 24px',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '14px' }}>🔒</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 10px 0' }}>
            {linkDesativado ? 'Link de Gravação Desativado' : 'Link Não Encontrado'}
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 24px 0' }}>
            {linkDesativado
              ? 'Este link temporário para clonagem de voz já foi encerrado pelo administrador ou concluído.'
              : erroInvite || 'O endereço acessado não é válido ou foi removido.'}
          </p>
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#1f2937',
            borderRadius: '12px',
            fontSize: '0.85rem',
            color: '#cbd5e1'
          }}>
            Precisa de um novo link? Solicite diretamente à pessoa que lhe enviou este convite.
          </div>
        </div>
      </div>
    );
  }

  const nomeExibicao = invite?.customerName || 'Convidado';

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d16',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(124, 58, 237, 0.18) 0%, rgba(9, 13, 22, 1) 75%)',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '24px',
        padding: '32px 24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        position: 'relative'
      }}>
        {/* Marca Superior */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(124, 58, 237, 0.15)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: '700',
            color: '#c4b5fd',
            marginBottom: '12px'
          }}>
            <span>🎵</span> NS Music • Clonagem de Timbre Vocal
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 6px 0' }}>
            Olá, {nomeExibicao}! 👋
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: 0, lineHeight: '1.45' }}>
            {etapa === 1 && 'Grave uma pequena amostra da sua voz para criarmos suas músicas personalizadas.'}
            {etapa === 2 && 'Agora leia a frase de segurança em voz alta para validar o seu modelo de voz.'}
            {etapa === 3 && 'Tudo pronto! Seu timbre vocal foi cadastrado com sucesso.'}
          </p>
        </div>

        {/* Indicador de Passos */}
        {etapa < 3 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '28px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              color: etapa === 1 ? '#a855f7' : '#10b981'
            }}>
              <span style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: etapa === 1 ? '#7c3aed' : '#10b981',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem'
              }}>
                {etapa > 1 ? '✓' : '1'}
              </span>
              Amostra (15s)
            </div>
            <div style={{ width: '32px', height: '2px', background: etapa > 1 ? '#10b981' : '#374151' }} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              color: etapa === 2 ? '#a855f7' : '#64748b'
            }}>
              <span style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: etapa === 2 ? '#7c3aed' : '#1f2937',
                color: etapa === 2 ? '#ffffff' : '#94a3b8',
                border: etapa === 2 ? 'none' : '1px solid #374151',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem'
              }}>
                2
              </span>
              Validação
            </div>
          </div>
        )}

        {/* Alerta de Erro */}
        {erroAcao && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1.5px solid #ef4444',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '0.84rem',
            color: '#fca5a5',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️</span> {erroAcao}
          </div>
        )}

        {/* ETAPA 1: GRAVAÇÃO DA AMOSTRA (15-20s) */}
        {etapa === 1 && (
          <div>
            <div style={{
              backgroundColor: '#1f2937',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
              border: '1px solid #374151'
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#e2e8f0', margin: '0 0 8px 0' }}>
                💡 Dicas para uma gravação perfeita:
              </h3>
              <ul style={{
                margin: 0,
                paddingLeft: '18px',
                fontSize: '0.82rem',
                color: '#94a3b8',
                lineHeight: '1.5'
              }}>
                <li>Procure um ambiente silencioso, sem barulho de fundo.</li>
                <li>Fale naturalmente, sem gritar ou sussurrar.</li>
                <li>Pode contar como foi o seu dia ou cantar um trecho de música favorita por cerca de <strong>15 a 20 segundos</strong>.</li>
              </ul>
            </div>

            {/* Caixa Central de Gravação */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 16px',
              backgroundColor: gravando ? 'rgba(239, 68, 68, 0.08)' : '#182234',
              border: gravando ? '2px solid #ef4444' : '2px dashed #334155',
              borderRadius: '20px',
              marginBottom: '24px',
              transition: 'all 0.3s'
            }}>
              <button
                type="button"
                onClick={() => (gravando ? pararGravacao() : iniciarGravacao('amostra'))}
                disabled={processando}
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '50%',
                  background: gravando
                    ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                    : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: processando ? 'not-allowed' : 'pointer',
                  boxShadow: gravando
                    ? '0 0 25px rgba(239, 68, 68, 0.6)'
                    : '0 10px 20px -5px rgba(124, 58, 237, 0.5)',
                  transform: gravando ? 'scale(1.06)' : 'scale(1)',
                  transition: 'all 0.2s',
                  marginBottom: '14px'
                }}
              >
                {gravando ? '⏹️' : '🎙️'}
              </button>

              <div style={{
                fontSize: '1.15rem',
                fontWeight: '800',
                color: gravando ? '#f87171' : '#f8fafc',
                marginBottom: '4px'
              }}>
                {gravando ? `Gravando... ${formatarTempo(segundos)}` : amostraBlob ? `Gravado (${formatarTempo(segundos)})` : 'Toque para Gravar'}
              </div>

              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {gravando ? 'Fale normalmente. Toque no botão vermelho para parar.' : 'Recomendado: 15 a 20 segundos'}
              </div>

              {/* Player de Prévia */}
              {amostraPreviewUrl && !gravando && (
                <div style={{ width: '100%', marginTop: '18px', textAlign: 'center' }}>
                  <audio
                    src={amostraPreviewUrl}
                    controls
                    style={{ width: '100%', maxWidth: '320px', height: '40px', outline: 'none' }}
                  />
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setAmostraBlob(null);
                        setAmostraPreviewUrl('');
                        setSegundos(0);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        textDecoration: 'underline',
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 Descartar e gravar novamente
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Botão de Avançar */}
            {amostraBlob && !gravando && (
              <button
                type="button"
                onClick={handleAvancarParaValidacao}
                disabled={processando}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: '800',
                  border: 'none',
                  cursor: processando ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                {processando ? (
                  <>
                    <span style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: '2px solid #ffffff',
                      borderTopColor: 'transparent',
                      animation: 'spin 1s linear infinite'
                    }} />
                    {statusMsg || 'Processando amostra...'}
                  </>
                ) : (
                  <>Continuar para Validação ➔</>
                )}
              </button>
            )}
          </div>
        )}

        {/* ETAPA 2: VALIDAÇÃO DE SEGURANÇA */}
        {etapa === 2 && (
          <div>
            <div style={{
              backgroundColor: '#1f2937',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '20px',
              border: '1.5px solid rgba(124, 58, 237, 0.4)'
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#c4b5fd', marginBottom: '6px' }}>
                🛡️ Frase de Consentimento e Titularidade:
              </div>
              <p style={{
                fontSize: '1rem',
                fontWeight: '700',
                color: '#ffffff',
                lineHeight: '1.5',
                margin: '0 0 10px 0',
                fontStyle: 'italic',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                padding: '12px 14px',
                borderRadius: '10px',
                borderLeft: '4px solid #7c3aed'
              }}>
                &quot;{fraseValidacao}&quot;
              </p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                Aperte o botão abaixo e leia a frase acima com voz clara. Isso garante que a voz pertence a você.
              </p>
            </div>

            {/* Gravador da Frase */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 16px',
              backgroundColor: gravando ? 'rgba(239, 68, 68, 0.08)' : '#182234',
              border: gravando ? '2px solid #ef4444' : '2px dashed #334155',
              borderRadius: '20px',
              marginBottom: '24px',
              transition: 'all 0.3s'
            }}>
              <button
                type="button"
                onClick={() => (gravando ? pararGravacao() : iniciarGravacao('verificacao'))}
                disabled={processando}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: gravando
                    ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                    : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '1.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: processando ? 'not-allowed' : 'pointer',
                  boxShadow: gravando
                    ? '0 0 25px rgba(239, 68, 68, 0.6)'
                    : '0 10px 20px -5px rgba(124, 58, 237, 0.5)',
                  marginBottom: '12px'
                }}
              >
                {gravando ? '⏹️' : '🎙️'}
              </button>

              <div style={{
                fontSize: '1.1rem',
                fontWeight: '800',
                color: gravando ? '#f87171' : '#f8fafc',
                marginBottom: '4px'
              }}>
                {gravando ? `Gravando frase... ${formatarTempo(segundos)}` : verificacaoBlob ? `Frase Gravada (${formatarTempo(segundos)})` : 'Toque para ler a frase'}
              </div>

              {verificacaoPreviewUrl && !gravando && (
                <div style={{ width: '100%', marginTop: '16px', textAlign: 'center' }}>
                  <audio
                    src={verificacaoPreviewUrl}
                    controls
                    style={{ width: '100%', maxWidth: '320px', height: '40px', outline: 'none' }}
                  />
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setVerificacaoBlob(null);
                        setVerificacaoPreviewUrl('');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        textDecoration: 'underline',
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 Regravar leitura da frase
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Botão de Concluir */}
            {verificacaoBlob && !gravando && (
              <button
                type="button"
                onClick={handleFinalizarClonagem}
                disabled={processando}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: '800',
                  border: 'none',
                  cursor: processando ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 10px 20px -5px rgba(124, 58, 237, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                {processando ? (
                  <>
                    <span style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: '2px solid #ffffff',
                      borderTopColor: 'transparent',
                      animation: 'spin 1s linear infinite'
                    }} />
                    {statusMsg || 'Sintetizando voz com IA...'}
                  </>
                ) : (
                  <>Finalizar e Criar Modelo de Voz ✨</>
                )}
              </button>
            )}
          </div>
        )}

        {/* ETAPA 3: CONCLUÍDO COM SUCESSO */}
        {etapa === 3 && (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '2px solid #10b981',
              color: '#10b981',
              fontSize: '2.5rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              ✓
            </div>

            <h2 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 10px 0' }}>
              Voz Registrada com Sucesso! 🎉
            </h2>

            <p style={{
              fontSize: '0.92rem',
              color: '#94a3b8',
              lineHeight: '1.55',
              maxWidth: '380px',
              margin: '0 auto 24px auto'
            }}>
              Obrigado, <strong>{nomeExibicao}</strong>! Seu timbre vocal foi capturado, calibrado pela Inteligência Artificial e vinculado com segurança.
            </p>

            <div style={{
              padding: '16px',
              borderRadius: '14px',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              fontSize: '0.86rem',
              color: '#cbd5e1',
              marginBottom: '24px'
            }}>
              ✨ As músicas já podem ser geradas cantadas com a sua própria voz! Você já pode fechar esta tela com tranquilidade.
            </div>

            <Link
              href="/"
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                borderRadius: '12px',
                background: '#374151',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: '700',
                fontSize: '0.85rem'
              }}
            >
              Ir para a Página Inicial
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
