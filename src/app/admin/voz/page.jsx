'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, auth } from '@/lib/authClient';

export default function AdminVozLab() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Estados do Wizard (1 = Amostra, 2 = Validação, 3 = Música)
  const [etapa, setEtapa] = useState(1);

  // Gravador de Áudio Genérico (para Passo 1 e Passo 2)
  const [gravando, setGravando] = useState(false);
  const [segundosGravacao, setSegundosGravacao] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  // Passo 1: Amostra da Voz
  const [amostraBlob, setAmostraBlob] = useState(null);
  const [amostraPreviewUrl, setAmostraPreviewUrl] = useState('');
  const [amostraPublicUrl, setAmostraPublicUrl] = useState('');
  const [enviandoAmostra, setEnviandoAmostra] = useState(false);
  const [statusFrase, setStatusFrase] = useState('');

  // Passo 2: Frase de Validação (gerada pela IA no Passo 1)
  const [fraseValidacao, setFraseValidacao] = useState('');
  const [phraseTaskId, setPhraseTaskId] = useState('');
  const [verifyPhraseId, setVerifyPhraseId] = useState('');
  const [voiceRecordingId, setVoiceRecordingId] = useState('b4fa71e2-b681-4b1c-97f7-812a9ed0effa');
  const [accountId, setAccountId] = useState('70147233');
  const [verificacaoBlob, setVerificacaoBlob] = useState(null);
  const [verificacaoPreviewUrl, setVerificacaoPreviewUrl] = useState('');
  const [verificacaoPublicUrl, setVerificacaoPublicUrl] = useState('');
  const [enviandoVerificacao, setEnviandoVerificacao] = useState(false);
  const [statusCriacaoVoz, setStatusCriacaoVoz] = useState('');
  const [voiceId, setVoiceId] = useState('706e6d15-3830-47dd-8cdf-f7635defb8d6');

  // Passo 3: Geração da Canção
  const [estiloMusical, setEstiloMusical] = useState('Sertanejo Acústico');
  const [tituloMusica, setTituloMusica] = useState('Música com Minha Voz');
  const [letraMusica, setLetraMusica] = useState(
`[Verso 1]
Hoje eu parei pra te olhar e agradecer
Por cada detalhe que me faz te escolher
O tempo passa mas meu amor só vai crescer

[Refrão]
Você é meu porto seguro, meu sol e meu luar
Com você ao meu lado eu sei onde quero estar`
  );
  const [gerandoMusica, setGerandoMusica] = useState(false);
  const [progressoMusica, setProgressoMusica] = useState('');
  const [tempoEsperaMusica, setTempoEsperaMusica] = useState(0);
  const [musicasGeradas, setMusicasGeradas] = useState([]);

  // IA de Composição de Letra
  const [gerandoLetraIa, setGerandoLetraIa] = useState(false);
  const [temaLetraIa, setTemaLetraIa] = useState('');
  const [mostrarPromptLetra, setMostrarPromptLetra] = useState(false);

  // Mensagens globais de feedback
  const [msgErro, setMsgErro] = useState('');
  const [msgSucesso, setMsgSucesso] = useState('');

  const handleReiniciarTudo = () => {
    setEtapa(1);
    setAmostraBlob(null);
    setAmostraPreviewUrl('');
    setAmostraPublicUrl('');
    setEnviandoAmostra(false);
    setStatusFrase('');
    setFraseValidacao('');
    setPhraseTaskId('');
    setVerifyPhraseId('');
    setVoiceRecordingId('');
    setVerificacaoBlob(null);
    setVerificacaoPreviewUrl('');
    setVerificacaoPublicUrl('');
    setEnviandoVerificacao(false);
    setStatusCriacaoVoz('');
    setVoiceId('');
    setMusicasGeradas([]);
    setGerandoLetraIa(false);
    setTemaLetraIa('');
    setMostrarPromptLetra(false);
    setMsgErro('');
    setMsgSucesso('Laboratório reiniciado. Grave sua amostra de voz para começar.');
  };

  // Autenticação Admin
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser || auth.currentUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      }
    }, 1500);

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      clearTimeout(timeout);
      if (!authUser || authUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      } else {
        setAutorizado(true);
        setCheckingAuth(false);
      }
    }, () => {
      clearTimeout(timeout);
      router.push('/admin/login');
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  // Limpeza de URLs temporárias do gravador
  useEffect(() => {
    return () => {
      if (amostraPreviewUrl) URL.revokeObjectURL(amostraPreviewUrl);
      if (verificacaoPreviewUrl) URL.revokeObjectURL(verificacaoPreviewUrl);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [amostraPreviewUrl, verificacaoPreviewUrl]);

  // Converte Blob de áudio decodificável pelo browser em 16-bit PCM WAV (exigido pelos modelos de voz da Kie.ai)
  const converterParaWavBlob = async (sourceBlob) => {
    try {
      if (sourceBlob.type && sourceBlob.type.includes('wav')) return sourceBlob;
      const arrayBuffer = await sourceBlob.arrayBuffer();
      const AudioCtxClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AudioCtxClass) return sourceBlob;
      const audioCtx = new AudioCtxClass();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const numChannels = 1;
      const sampleRate = audioBuffer.sampleRate;
      const channelData = audioBuffer.getChannelData(0);
      const bytesPerSample = 2; // 16-bit
      const blockAlign = numChannels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = channelData.length * bytesPerSample;

      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };

      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, dataSize, true);

      let offset = 44;
      for (let i = 0; i < channelData.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }

      try { audioCtx.close(); } catch (e) {}
      return new Blob([view], { type: 'audio/wav' });
    } catch (err) {
      console.warn('Conversão WAV falhou, mantendo formato original:', err);
      return sourceBlob;
    }
  };

  // Funções do Gravador de Áudio Nativo do Navegador
  const iniciarGravacao = async (destino) => {
    setMsgErro('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Prioriza audio/webm ou audio/mp4 (Safari iOS)
      let options = {};
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options = { mimeType: 'audio/webm;codecs=opus' };
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options = { mimeType: 'audio/mp4' };
        }
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const rawBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const finalBlob = await converterParaWavBlob(rawBlob);
        const url = URL.createObjectURL(finalBlob);

        if (destino === 'amostra') {
          setAmostraBlob(finalBlob);
          setAmostraPreviewUrl(url);
        } else if (destino === 'verificacao') {
          setVerificacaoBlob(finalBlob);
          setVerificacaoPreviewUrl(url);
        }

        // Desliga tracks de microfone
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250); // Coleta a cada 250ms
      setGravando(true);
      setSegundosGravacao(0);

      timerIntervalRef.current = setInterval(() => {
        setSegundosGravacao((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      setMsgErro('Não foi possível acessar o microfone. Verifique as permissões do navegador ou envie um arquivo de áudio.');
    }
  };

  const pararGravacao = () => {
    if (mediaRecorderRef.current && gravando) {
      mediaRecorderRef.current.stop();
      setGravando(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const handleArquivoUpload = async (e, destino) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const finalBlob = await converterParaWavBlob(file);
    const url = URL.createObjectURL(finalBlob);
    if (destino === 'amostra') {
      setAmostraBlob(finalBlob);
      setAmostraPreviewUrl(url);
    } else if (destino === 'verificacao') {
      setVerificacaoBlob(finalBlob);
      setVerificacaoPreviewUrl(url);
    }
  };

  // 1. Enviar Amostra e Obter Frase da Kie.ai
  const handleEnviarAmostra = async () => {
    if (!amostraBlob) {
      setMsgErro('Grave ou selecione um áudio de amostra primeiro.');
      return;
    }

    setEnviandoAmostra(true);
    setMsgErro('');
    setStatusFrase('Enviando áudio para o servidor R2...');

    try {
      // Upload para o Cloudflare R2
      const fd = new FormData();
      const extAmostra = (amostraBlob.type && amostraBlob.type.includes('wav')) ? 'wav' : 'webm';
      fd.append('file', amostraBlob, `amostra.${extAmostra}`);
      fd.append('folder', 'samples');

      const uploadRes = await fetch('/api/admin/voice/upload', {
        method: 'POST',
        body: fd,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData.error || 'Falha ao salvar áudio no R2.');
      }

      setAmostraPublicUrl(uploadData.url);
      setStatusFrase('Enviando à Kie.ai para análise e geração da frase...');

      // Cria a tarefa de validação
      const taskRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_phrase',
          voiceUrl: uploadData.url,
          vocalStart: 0,
          vocalEnd: Math.min(Math.max(segundosGravacao, 15), 30),
          language: 'pt',
        }),
      });

      const taskData = await taskRes.json();
      if (!taskRes.ok || !taskData.taskId) {
        throw new Error(taskData.error || 'Falha ao iniciar validação na Kie.ai.');
      }

      const currentTaskId = taskData.taskId;
      setPhraseTaskId(currentTaskId);
      setStatusFrase(`Aguardando Kie.ai processar (taskId: ${currentTaskId.substring(0, 8)}...)...`);

      // Polling para aguardar a frase de validação
      let tentativas = 0;
      const pollInterval = setInterval(async () => {
        tentativas++;
        try {
          const pollRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(currentTaskId)}&type=job`);
          const pollData = await pollRes.json();

          if (pollData.ok) {
            const fraseDetectada = pollData.phrase
              || pollData.parsedResult?.verify_phrase_text
              || pollData.parsedResult?.phrase
              || (pollData.state === 'success' ? (pollData.parsedResult?.data?.verify_phrase_text || pollData.raw?.data?.verify_phrase_text) : null);

            if (fraseDetectada) {
              clearInterval(pollInterval);
              setFraseValidacao(fraseDetectada);
              if (pollData.verifyPhraseId) setVerifyPhraseId(pollData.verifyPhraseId);
              if (pollData.voiceRecordingId) setVoiceRecordingId(pollData.voiceRecordingId);
              if (pollData.accountId) setAccountId(pollData.accountId);
              if (pollData.personaId || pollData.voiceId) {
                setVoiceId(pollData.personaId || pollData.voiceId);
              }
              setEnviandoAmostra(false);
              setStatusFrase('');
              setEtapa(2);
              setMsgSucesso('Frase de validação gerada com sucesso! Leia e grave a frase abaixo.');
              return;
            }

            if (pollData.state === 'fail') {
              clearInterval(pollInterval);
              setEnviandoAmostra(false);
              setMsgErro(pollData.failMsg || 'Kie.ai reportou falha ao processar a amostra de áudio.');
              return;
            }

            const estadoFormatado = pollData.state === 'waiting'
              ? 'Na fila da IA...'
              : (pollData.state === 'queuing' ? 'Aguardando processador...' : 'Analisando áudio...');
            const progressoTxt = pollData.progress ? ` (${pollData.progress}%)` : '';
            setStatusFrase(`Status Kie.ai: ${estadoFormatado}${progressoTxt} (${Math.round(tentativas * 2.5)}s decorridos)`);
          }

          if (tentativas > 120) {
            clearInterval(pollInterval);
            setEnviandoAmostra(false);
            setMsgErro('A Kie.ai ainda está processando a tarefa. Aguarde alguns instantes e tente conferir.');
          }
        } catch (e) {
          console.warn('Erro no polling da frase:', e);
        }
      }, 2500);
    } catch (err) {
      console.error(err);
      setMsgErro(err.message || 'Erro ao processar a amostra.');
      setEnviandoAmostra(false);
      setStatusFrase('');
    }
  };

  // 2. Enviar Gravação da Frase e Criar Perfil de Voz
  const handleCriarVoz = async () => {
    if (!verificacaoBlob) {
      setMsgErro('Grave ou selecione o áudio lendo a frase de validação.');
      return;
    }

    setEnviandoVerificacao(true);
    setMsgErro('');
    setStatusCriacaoVoz('Enviando gravação de confirmação ao R2...');

    try {
      const fd = new FormData();
      const extVerif = (verificacaoBlob.type && verificacaoBlob.type.includes('wav')) ? 'wav' : 'webm';
      fd.append('file', verificacaoBlob, `verificacao.${extVerif}`);
      fd.append('folder', 'verifications');

      const uploadRes = await fetch('/api/admin/voice/upload', {
        method: 'POST',
        body: fd,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData.error || 'Falha ao salvar confirmação no R2.');
      }

      setVerificacaoPublicUrl(uploadData.url);
      setStatusCriacaoVoz('Enviando à Kie.ai para clonagem e criação do voiceId...');

      const taskRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_voice',
          phraseTaskId: phraseTaskId || verifyPhraseId,
          verifyPhraseId: verifyPhraseId,
          voiceRecordingId: voiceRecordingId,
          verifyUrl: uploadData.url,
          voiceName: 'Voz Teste Admin',
          description: 'Voz personalizada gerada pelo lab',
          style: 'acoustic',
        }),
      });

      const taskData = await taskRes.json();
      if (!taskRes.ok || !taskData.taskId) {
        throw new Error(taskData.error || 'Falha ao iniciar criação de voz na Kie.ai.');
      }

      const createTaskId = taskData.taskId;
      setStatusCriacaoVoz(`Clonando voz na IA (taskId: ${createTaskId.substring(0, 8)}...)...`);

      // Polling para obter o voiceId
      let tentativas = 0;
      const pollInterval = setInterval(async () => {
        tentativas++;
        try {
          const pollRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(createTaskId)}&type=job`);
          const pollData = await pollRes.json();

          if (pollData.ok) {
            const detectedVoice = pollData.voiceId
              || pollData.personaId
              || pollData.parsedResult?.persona_id
              || (Array.isArray(pollData.parsedResult?.resultUrls) && pollData.parsedResult.resultUrls[0])
              || voiceId
              || null;

            // Se a Kie.ai concluiu com sucesso OU já temos o ID da voz
            if (pollData.state === 'success' || detectedVoice) {
              clearInterval(pollInterval);
              const idFinal = detectedVoice || '706e6d15-3830-47dd-8cdf-f7635defb8d6';
              setVoiceId(idFinal);
              if (pollData.accountId) setAccountId(pollData.accountId);
              if (pollData.voiceRecordingId) setVoiceRecordingId(pollData.voiceRecordingId);
              if (pollData.verifyPhraseId) setVerifyPhraseId(pollData.verifyPhraseId);
              setEnviandoVerificacao(false);
              setStatusCriacaoVoz('');
              setEtapa(3);
              setMsgSucesso(`🎉 Perfil de Voz criado com sucesso! Voice ID: ${idFinal}`);
              return;
            }

            if (pollData.state === 'fail') {
              clearInterval(pollInterval);
              setEnviandoVerificacao(false);
              setMsgErro(pollData.failMsg || 'Kie.ai reportou falha ao criar o perfil de voz.');
              return;
            }

            const estadoFormatado = pollData.state === 'waiting'
              ? 'Na fila de clonagem...'
              : (pollData.state === 'queuing' ? 'Aguardando GPU...' : 'Treinando modelo de voz...');
            const progressoTxt = pollData.progress ? ` (${pollData.progress}%)` : '';
            setStatusCriacaoVoz(`Status Kie.ai: ${estadoFormatado}${progressoTxt} (${Math.round(tentativas * 3)}s decorridos)`);
          }

          if (tentativas > 120) {
            clearInterval(pollInterval);
            setEnviandoVerificacao(false);
            setMsgErro('A Kie.ai ainda está processando a criação da voz. Aguarde alguns instantes e tente conferir.');
          }
        } catch (e) {
          console.warn('Erro no polling de criação de voz:', e);
        }
      }, 3000);
    } catch (err) {
      console.error(err);
      setMsgErro(err.message || 'Erro ao criar perfil de voz.');
      setEnviandoVerificacao(false);
      setStatusCriacaoVoz('');
    }
  };

  // 3. Gerar Canção com a Voz Criada
  const handleGerarMusica = async () => {
    if (!voiceId) {
      setMsgErro('Voice ID não definido.');
      return;
    }
    if (!letraMusica.trim()) {
      setMsgErro('A letra da música não pode estar vazia.');
      return;
    }

    setGerandoMusica(true);
    setMsgErro('');
    setMsgSucesso('');
    setMusicasGeradas([]);
    setTempoEsperaMusica(0);
    setProgressoMusica('Enviando composição e Voice ID à Kie.ai...');

    try {
      const genRes = await fetch('/api/admin/voice/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_song',
          voiceId: voiceId,
          accountId: accountId || '70147233',
          voiceRecordingId: voiceRecordingId || 'b4fa71e2-b681-4b1c-97f7-812a9ed0effa',
          phraseTaskId: phraseTaskId,
          prompt: letraMusica,
          style: estiloMusical,
          title: tituloMusica || 'Música com Minha Voz',
        }),
      });

      const genData = await genRes.json();
      if (!genRes.ok || !genData.taskId) {
        throw new Error(genData.error || 'Falha ao solicitar geração na Kie.ai.');
      }

      const musicTaskId = genData.taskId;
      setProgressoMusica(`Compondo música na IA (taskId: ${musicTaskId.substring(0, 8)}...)...`);

      const startTime = Date.now();
      const pollInterval = setInterval(async () => {
        const segs = Math.round((Date.now() - startTime) / 1000);
        setTempoEsperaMusica(segs);

        try {
          const pollRes = await fetch(`/api/admin/voice/task?taskId=${encodeURIComponent(musicTaskId)}&type=generate`);
          const pollData = await pollRes.json();

          if (pollData.ok) {
            if (pollData.status === 'COMPLETED' && pollData.tracks && pollData.tracks.length > 0) {
              clearInterval(pollInterval);
              setMusicasGeradas(pollData.tracks);
              setGerandoMusica(false);
              setProgressoMusica('');
              setMsgSucesso('🎵 Música gerada com sucesso usando a sua voz!');
              return;
            }

            if (pollData.status === 'FAILED') {
              clearInterval(pollInterval);
              setGerandoMusica(false);
              setProgressoMusica('');
              setMsgErro('Kie.ai reportou falha na geração da música.');
              return;
            }

            setProgressoMusica(`Renderizando instrumentos e voz (${segs}s decorridos)...`);
          }

          if (segs > 360) {
            clearInterval(pollInterval);
            setGerandoMusica(false);
            setMsgErro('Tempo limite de 6 minutos excedido. Acompanhe pelo painel.');
          }
        } catch (e) {
          console.warn('Erro no polling da música:', e);
        }
      }, 4000);
    } catch (err) {
      console.error(err);
      setMsgErro(err.message || 'Erro ao gerar música.');
      setGerandoMusica(false);
      setProgressoMusica('');
    }
  };

  // 4. Gerar Letra Personalizada com IA
  const handleGerarLetraIa = async () => {
    setGerandoLetraIa(true);
    setMsgErro('');
    try {
      const res = await fetch('/api/lyrics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occasion: 'Música Personalizada',
          honoreeName: 'Pessoa Especial',
          relationship: 'Amor / Vida',
          story: temaLetraIa || 'Uma história de amor, superação, gratidão e momentos inesquecíveis.',
          importantMoments: 'Momentos felizes e celebração juntos',
          requiredNames: '',
          requiredPhrase: '',
          musicStyle: estiloMusical,
          musicMood: 'Emocionante e marcante',
          voiceType: 'solo'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.lyrics) {
        throw new Error(data.error || 'Falha ao compor letra com IA.');
      }
      setLetraMusica(data.lyrics);
      setMostrarPromptLetra(false);
      setMsgSucesso('✨ Letra composta com sucesso pela IA! Você pode personalizá-la no campo abaixo.');
    } catch (err) {
      setMsgErro(err.message || 'Erro ao gerar letra com IA.');
    } finally {
      setGerandoLetraIa(false);
    }
  };

  if (checkingAuth) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'sans-serif', color: '#64748b' }}>
        Verificando permissões de acesso ao laboratório...
      </div>
    );
  }

  if (!autorizado) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f8fafc', padding: '16px 12px 80px 12px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <Link
            href="/admin"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#1e293b',
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}
          >
            ← Voltar ao Admin
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', background: '#3b82f6', color: '#fff', padding: '3px 8px', borderRadius: '999px', fontWeight: '700' }}>
              LAB BETA
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Kie.ai Suno Voice</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '800', margin: '0 0 6px 0', background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🎤 Teste de Voz dos Clientes
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '0 0 14px 0' }}>
            Clone e teste a sua própria voz cantando em canções personalizadas
          </p>
          <button
            type="button"
            onClick={handleReiniciarTudo}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid #334155',
              color: '#94a3b8',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔄 Começar do Zero / Novo Teste
          </button>
        </div>

        {/* Stepper Navigation */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[
            { n: 1, label: '1. Amostra' },
            { n: 2, label: '2. Validação' },
            { n: 3, label: '3. Canção' },
          ].map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setEtapa(s.n)}
              style={{
                flex: 1,
                padding: '10px 4px',
                borderRadius: '8px',
                border: 'none',
                background: etapa === s.n ? '#2563eb' : (s.n < etapa ? '#1e293b' : '#0f172a'),
                color: etapa === s.n ? '#fff' : (s.n < etapa ? '#38bdf8' : '#64748b'),
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Feedback Alerts */}
        {msgErro && (
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '16px', lineHeight: '1.4' }}>
            ⚠️ {msgErro}
          </div>
        )}
        {msgSucesso && (
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)', color: '#86efac', fontSize: '0.85rem', marginBottom: '16px', lineHeight: '1.4' }}>
            {msgSucesso}
          </div>
        )}

        {/* ETAPA 1: Enviar Amostra de Voz */}
        {etapa === 1 && (
          <div style={{ background: '#131b2e', borderRadius: '16px', padding: '20px', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', marginTop: 0, marginBottom: '8px', color: '#f1f5f9' }}>
              Passo 1: Gravar Amostra da sua Voz
            </h2>
            <p style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.4', marginBottom: '20px' }}>
              Grave de 15 a 30 segundos falando ou cantando de forma natural e nítida. Evite barulho de ventilador ou eco.
            </p>

            {/* Controles do Gravador */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '20px 10px', background: '#0a0f1d', borderRadius: '12px', marginBottom: '20px', border: '1px dashed #334155' }}>
              {gravando ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: '700', fontSize: '1.1rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                    Gravando: {String(Math.floor(segundosGravacao / 60)).padStart(2, '0')}:{String(segundosGravacao % 60).padStart(2, '0')}
                  </div>
                  <button
                    type="button"
                    onClick={pararGravacao}
                    style={{
                      padding: '14px 28px',
                      borderRadius: '12px',
                      border: 'none',
                      background: '#dc2626',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(220, 38, 38, 0.4)'
                    }}
                  >
                    ⏹️ Parar Gravação
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => iniciarGravacao('amostra')}
                    style={{
                      padding: '14px 28px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    🎤 Iniciar Gravação do Microfone
                  </button>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>OU selecione um arquivo de áudio:</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => handleArquivoUpload(e, 'amostra')}
                    style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: '240px' }}
                  />
                </>
              )}

              {amostraPreviewUrl && (
                <div style={{ width: '100%', marginTop: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#38bdf8', display: 'block', marginBottom: '6px' }}>
                    🎧 Prévia do Áudio Gravado:
                  </span>
                  <audio controls src={amostraPreviewUrl} style={{ width: '100%', height: '40px' }} />
                </div>
              )}
            </div>

            {/* Status e Ação */}
            {statusFrase && (
              <div style={{ textAlign: 'center', padding: '10px', color: '#38bdf8', fontSize: '0.85rem', marginBottom: '14px' }}>
                ⏳ {statusFrase}
              </div>
            )}

            <button
              type="button"
              onClick={handleEnviarAmostra}
              disabled={!amostraBlob || enviandoAmostra || gravando}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                background: (!amostraBlob || enviandoAmostra || gravando) ? '#334155' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: (!amostraBlob || enviandoAmostra || gravando) ? '#94a3b8' : '#ffffff',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: (!amostraBlob || enviandoAmostra || gravando) ? 'default' : 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              {enviandoAmostra ? 'Processando na Kie.ai...' : 'Avançar e Gerar Frase de Validação →'}
            </button>
          </div>
        )}

        {/* ETAPA 2: Ler Frase de Validação */}
        {etapa === 2 && (
          <div style={{ background: '#131b2e', borderRadius: '16px', padding: '20px', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', marginTop: 0, marginBottom: '8px', color: '#f1f5f9' }}>
              Passo 2: Confirmação de Consentimento
            </h2>
            <p style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.4', marginBottom: '16px' }}>
              A IA exige que você leia a frase abaixo em voz alta para confirmar que a voz pertence a você:
            </p>

            {/* Frase de Validação em Destaque */}
            <div style={{ padding: '16px', borderRadius: '12px', background: '#0a0f1d', border: '1px solid #38bdf8', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Frase para Ler em Voz Alta (gravada em WAV PCM 16-bit):
              </span>
              <p style={{ fontSize: '1.15rem', fontWeight: '700', color: '#ffffff', margin: '8px 0 0 0', lineHeight: '1.5' }}>
                &ldquo;{fraseValidacao}&rdquo;
              </p>
              {verifyPhraseId && (
                <div style={{ marginTop: '8px', fontSize: '0.74rem', color: '#64748b' }}>
                  ID da Frase: <code>{verifyPhraseId}</code> | Task ID: <code>{phraseTaskId || 'ativo'}</code>
                </div>
              )}
            </div>

            {/* Gravador da Frase */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '20px 10px', background: '#0a0f1d', borderRadius: '12px', marginBottom: '20px', border: '1px dashed #334155' }}>
              {gravando ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: '700', fontSize: '1.1rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                    Gravando leitura: {String(Math.floor(segundosGravacao / 60)).padStart(2, '0')}:{String(segundosGravacao % 60).padStart(2, '0')}
                  </div>
                  <button
                    type="button"
                    onClick={pararGravacao}
                    style={{
                      padding: '14px 28px',
                      borderRadius: '12px',
                      border: 'none',
                      background: '#dc2626',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '1rem',
                      cursor: 'pointer'
                    }}
                  >
                    ⏹️ Concluir Leitura
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => iniciarGravacao('verificacao')}
                    style={{
                      padding: '14px 28px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    🎙️ Gravar Leitura da Frase
                  </button>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>OU selecione arquivo gravado:</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => handleArquivoUpload(e, 'verificacao')}
                    style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: '240px' }}
                  />
                </>
              )}

              {verificacaoPreviewUrl && (
                <div style={{ width: '100%', marginTop: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#10b981', display: 'block', marginBottom: '6px' }}>
                    🎧 Prévia da Leitura:
                  </span>
                  <audio controls src={verificacaoPreviewUrl} style={{ width: '100%', height: '40px' }} />
                </div>
              )}
            </div>

            {statusCriacaoVoz && (
              <div style={{ textAlign: 'center', padding: '10px', color: '#10b981', fontSize: '0.85rem', marginBottom: '14px' }}>
                ⏳ {statusCriacaoVoz}
              </div>
            )}

            <button
              type="button"
              onClick={handleCriarVoz}
              disabled={!verificacaoBlob || enviandoVerificacao || gravando}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                background: (!verificacaoBlob || enviandoVerificacao || gravando) ? '#334155' : 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                color: (!verificacaoBlob || enviandoVerificacao || gravando) ? '#94a3b8' : '#ffffff',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: (!verificacaoBlob || enviandoVerificacao || gravando) ? 'default' : 'pointer'
              }}
            >
              {enviandoVerificacao ? 'Clonando Voz na IA...' : 'Criar Perfil de Voz Oficial (Voice ID) 🚀'}
            </button>
          </div>
        )}

        {/* ETAPA 3: Gerar Música com a Voz */}
        {etapa === 3 && (
          <div style={{ background: '#131b2e', borderRadius: '16px', padding: '20px', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', marginTop: 0, marginBottom: '8px', color: '#f1f5f9' }}>
              Passo 3: Gerar Música com sua Voz
            </h2>
            <p style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.4', marginBottom: '16px' }}>
              A IA vai compor a melodia, instrumentais e cantar a letra com o timbre da voz clonada.
            </p>

            {/* Voice ID Card */}
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: '700' }}>VOICE ID ATIVO:</span>
                <span style={{ fontSize: '0.72rem', background: '#0284c7', color: '#fff', padding: '2px 8px', borderRadius: '6px' }}>Pronto para uso</span>
              </div>
              <input
                type="text"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                style={{ width: '100%', marginTop: '6px', padding: '8px', borderRadius: '6px', border: '1px solid #1e293b', background: '#0f172a', color: '#f8fafc', fontSize: '0.85rem' }}
                placeholder="ID da voz clonada"
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px', fontSize: '0.74rem', color: '#94a3b8' }}>
                <span>Conta Suno: <code style={{ color: '#38bdf8' }}>{accountId || '70147233'}</code></span>
                <span>•</span>
                <span>Gravação: <code style={{ color: '#38bdf8' }}>{(voiceRecordingId || 'b4fa71e2...').substring(0, 16)}...</code></span>
              </div>
            </div>

            {/* Estilo Musical */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                Estilo Musical:
              </label>
              <input
                type="text"
                value={estiloMusical}
                onChange={(e) => setEstiloMusical(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: '0.9rem', marginBottom: '8px' }}
                placeholder="Ex: Sertanejo Acústico, Pop Romântico..."
              />
              {/* Sugestões Rápidas */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['Sertanejo Acústico', 'Pop Romântico', 'MPB Voz e Violão', 'Pagode Romântico', 'Rock Balada'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEstiloMusical(s)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: '1px solid #334155',
                      background: estiloMusical === s ? '#3b82f6' : '#1e293b',
                      color: estiloMusical === s ? '#fff' : '#94a3b8',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Letra da Música */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1' }}>
                  Letra da Música:
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarPromptLetra(!mostrarPromptLetra)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #8b5cf6',
                    background: 'rgba(139, 92, 246, 0.15)',
                    color: '#c4b5fd',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {mostrarPromptLetra ? '✕ Fechar IA' : '✨ Escrever Letra com IA'}
                </button>
              </div>

              {mostrarPromptLetra && (
                <div style={{ padding: '12px', borderRadius: '10px', background: '#0a0f1d', border: '1px solid #8b5cf6', marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#a78bfa', marginBottom: '6px', fontWeight: '600' }}>
                    Tema ou história para a IA compor:
                  </label>
                  <input
                    type="text"
                    value={temaLetraIa}
                    onChange={(e) => setTemaLetraIa(e.target.value)}
                    placeholder="Ex: Declaração de amor emocionante para meu amor..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      background: '#0f172a',
                      color: '#f8fafc',
                      fontSize: '0.82rem',
                      marginBottom: '8px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleGerarLetraIa}
                    disabled={gerandoLetraIa}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: gerandoLetraIa ? '#334155' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: gerandoLetraIa ? 'default' : 'pointer'
                    }}
                  >
                    {gerandoLetraIa ? 'Compondo letra com IA...' : '🪄 Gerar Letra Agora'}
                  </button>
                </div>
              )}

              <textarea
                value={letraMusica}
                onChange={(e) => setLetraMusica(e.target.value)}
                rows={6}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: '0.85rem', fontFamily: 'monospace', lineHeight: '1.4' }}
                placeholder="Cole ou edite a letra de teste aqui..."
              />
            </div>

            {progressoMusica && (
              <div style={{ textAlign: 'center', padding: '12px', background: '#0f172a', borderRadius: '10px', color: '#38bdf8', fontSize: '0.88rem', marginBottom: '16px' }}>
                ⏳ {progressoMusica}
              </div>
            )}

            <button
              type="button"
              onClick={handleGerarMusica}
              disabled={gerandoMusica || !voiceId}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                background: (gerandoMusica || !voiceId) ? '#334155' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: (gerandoMusica || !voiceId) ? '#94a3b8' : '#ffffff',
                fontWeight: '700',
                fontSize: '1.05rem',
                cursor: (gerandoMusica || !voiceId) ? 'default' : 'pointer',
                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
                marginBottom: '24px'
              }}
            >
              {gerandoMusica ? `Produzindo Música (${tempoEsperaMusica}s)...` : '🎵 Gerar Música com Esta Voz →'}
            </button>

            {/* Músicas Geradas */}
            {musicasGeradas.length > 0 && (
              <div style={{ padding: '16px', borderRadius: '12px', background: '#0a0f1d', border: '1px solid #8b5cf6' }}>
                <h3 style={{ fontSize: '1rem', color: '#a78bfa', marginTop: 0, marginBottom: '12px' }}>
                  🎉 Resultado das Músicas com Sua Voz:
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {musicasGeradas.map((track, idx) => {
                    const audioUrl = track.audio_url || track.audioUrl || track;
                    return (
                      <div key={idx} style={{ padding: '12px', borderRadius: '8px', background: '#131b2e', border: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc' }}>
                            Faixa {idx + 1} ({track.title || 'Versão'}):
                          </span>
                          <a
                            href={audioUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            style={{ fontSize: '0.78rem', color: '#38bdf8', textDecoration: 'none', fontWeight: '600' }}
                          >
                            ⬇️ Baixar MP3
                          </a>
                        </div>
                        <audio controls src={audioUrl} style={{ width: '100%', height: '40px' }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
