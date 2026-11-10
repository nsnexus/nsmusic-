'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { buildSunoPayload } from '@/lib/sunoPayload';
import { stylesList, moods } from '@/app/criar/wizardOptions';
import { getAdminAuthToken } from '@/lib/authClient';
import { buildAudioProxySrc } from '@/lib/audioProxy';

export default function BonusOrderManager({
  parentOrder,
  secondGen,
  onRefresh,
  handleDownload,
}) {
  const [isEditingLyrics, setIsEditingLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState('');
  
  const [isEditingStyle, setIsEditingStyle] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedVoiceType, setSelectedVoiceType] = useState('feminina');
  const [stylePrompt, setStylePrompt] = useState('');

  const [isEditingTracks, setIsEditingTracks] = useState(false);
  const [track1Url, setTrack1Url] = useState('');
  const [track2Url, setTrack2Url] = useState('');

  const [selectedStatus, setSelectedStatus] = useState('');
  
  const [savingAction, setSavingAction] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);

  // Geração direta pelo Suno / Kie.ai
  const [isGeneratingSuno, setIsGeneratingSuno] = useState(false);
  const [sunoPollingMsg, setSunoPollingMsg] = useState('');
  const [useCustomVoice, setUseCustomVoice] = useState(false);

  // Criação manual de 2ª geração
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Sincroniza estados locais sempre que secondGen mudar
  useEffect(() => {
    if (secondGen) {
      setLyricsText(secondGen.lyrics || '');
      const initialStyle = secondGen.musicStyle || parentOrder?.musicStyle || 'Pop';
      const initialMood = secondGen.musicMood || parentOrder?.musicMood || 'Emocionante';
      const rawVoice = (secondGen.voiceType || parentOrder?.voiceType || 'feminina').toLowerCase();
      const initialVoice = (rawVoice === 'minha_voz' || rawVoice === 'solo') ? 'feminina' : rawVoice;

      setSelectedStyle(initialStyle);
      setSelectedMood(initialMood);
      setSelectedVoiceType(initialVoice);

      setStylePrompt(secondGen.sunoPrompt || buildSunoPayload({
        musicStyle: initialStyle,
        musicMood: initialMood,
        voiceType: initialVoice,
      }).tags);

      const files = Array.isArray(secondGen.audioFiles) && secondGen.audioFiles.length > 0
        ? secondGen.audioFiles
        : (secondGen.audioUrl ? [secondGen.audioUrl] : []);
      setTrack1Url(files[0] || '');
      setTrack2Url(files[1] || '');

      setSelectedStatus(secondGen.productionStatus || 'EM_PRODUCAO');
      setUseCustomVoice(Boolean(secondGen.isCustomVoice || secondGen.customVoiceId));
    }
  }, [secondGen, parentOrder]);

  const showFeedback = (text, type = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  };

  // Helper para atualizar campos no pedido bônus
  const updateBonusOrder = async (fields, actionKey) => {
    if (!secondGen?.id) return false;
    setSavingAction(actionKey);
    try {
      let token = null;
      try {
        token = await getAdminAuthToken();
      } catch (e) {}

      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          orderId: secondGen.id,
          ...fields,
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Erro ao atualizar pedido bônus.');
      }

      showFeedback('Alterações da música bônus salvas com sucesso!', 'success');
      if (typeof onRefresh === 'function') {
        await onRefresh();
      }
      return true;
    } catch (err) {
      console.error('[BonusOrderManager] Erro ao salvar:', err);
      showFeedback(`Falha ao salvar: ${err.message}`, 'error');
      return false;
    } finally {
      setSavingAction('');
    }
  };

  // 1. Salvar Letra
  const handleSaveLyrics = async () => {
    if (!lyricsText.trim()) {
      alert('A letra não pode ficar vazia.');
      return;
    }
    const ok = await updateBonusOrder({ lyrics: lyricsText.trim() }, 'lyrics');
    if (ok) setIsEditingLyrics(false);
  };

  // 2. Salvar Ritmo / Estilo
  const handleSaveStyle = async () => {
    const computedTags = stylePrompt.trim() || buildSunoPayload({
      musicStyle: selectedStyle,
      musicMood: selectedMood,
      voiceType: selectedVoiceType,
    }).tags;

    const ok = await updateBonusOrder({
      musicStyle: selectedStyle,
      musicMood: selectedMood,
      voiceType: selectedVoiceType,
      sunoPrompt: computedTags,
    }, 'style');
    if (ok) setIsEditingStyle(false);
  };

  // Desvincular voz clonada da 2ª geração
  const handleDetachBonusVoice = async () => {
    if (!secondGen?.id) return;
    if (!confirm('Deseja desvincular a voz clonada da 2ª geração? As próximas gerações usarão a voz de estúdio selecionada.')) return;
    const ok = await updateBonusOrder({
      isCustomVoice: false,
      customVoiceId: null,
      voiceType: selectedVoiceType || 'feminina',
      extras: {
        ...(secondGen.extras || {}),
        isCustomVoice: false,
        customVoiceId: null,
      }
    }, 'detach_bonus_voice');
    if (ok) {
      setUseCustomVoice(false);
    }
  };

  // 3. Salvar Áudios Manuais (Faixas 3 e 4)
  const handleSaveTracks = async () => {
    const cleanFiles = [track1Url.trim(), track2Url.trim()].filter(Boolean);
    const ok = await updateBonusOrder({
      audioFiles: cleanFiles,
      audioUrl: cleanFiles[0] || null,
      productionStatus: cleanFiles.length > 0 ? 'AUDIO_GERADO' : selectedStatus,
    }, 'tracks');
    if (ok) setIsEditingTracks(false);
  };

  // 4. Salvar Status de Produção
  const handleSaveStatus = async (newStatus) => {
    setSelectedStatus(newStatus);
    await updateBonusOrder({ productionStatus: newStatus }, 'status');
  };

  // 5. Regerar no Estúdio Suno AI / Kie.ai
  const handleGenerateSunoBonus = async () => {
    const currentLyrics = (lyricsText || secondGen?.lyrics || '').trim();
    if (!currentLyrics) {
      alert('Por favor, informe ou salve a letra da música bônus antes de gerar no Suno AI.');
      return;
    }

    if (!confirm('Deseja iniciar a geração das faixas no estúdio (Suno AI) para este pedido bônus?')) {
      return;
    }

    setIsGeneratingSuno(true);
    setSunoPollingMsg('Enviando solicitação ao estúdio Suno AI...');

    const tagsFinal = (stylePrompt || secondGen?.sunoPrompt || buildSunoPayload({
      musicStyle: selectedStyle,
      musicMood: selectedMood,
      voiceType: selectedVoiceType || secondGen?.voiceType || 'feminina',
    }).tags).trim();

    try {
      // Salva prompt e altera status preliminar
      await updateBonusOrder({
        sunoPrompt: tagsFinal,
        productionStatus: 'GERANDO_AUDIO',
      }, 'generate_prep');

      const response = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentLyrics,
          tags: tagsFinal,
          orderId: secondGen.id,
          useCustomVoice,
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.taskId) {
        throw new Error(data.error || 'Falha ao iniciar geração no Suno AI.');
      }

      pollSunoBonusStatus(data.taskId);
    } catch (err) {
      console.error('[BonusOrderManager] Erro ao disparar Suno:', err);
      showFeedback(`Erro ao gerar: ${err.message}`, 'error');
      setIsGeneratingSuno(false);
    }
  };

  const pollSunoBonusStatus = (taskId) => {
    let attempts = 0;
    const maxAttempts = 75;
    setSunoPollingMsg('Compondo e renderizando as 2 novas faixas no estúdio (2 a 4 min)...');

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/suno/status?taskId=${taskId}`);
        if (res.ok) {
          const statusData = await res.json();
          if (statusData.status === 'COMPLETED' && Array.isArray(statusData.tracks) && statusData.tracks.length > 0) {
            clearInterval(interval);
            setIsGeneratingSuno(false);
            showFeedback('✅ Músicas bônus geradas com sucesso pelo estúdio!', 'success');
            if (typeof onRefresh === 'function') {
              await onRefresh();
            }
            return;
          }

          if (statusData.status === 'FAILED' || statusData.status === 'ERROR') {
            clearInterval(interval);
            setIsGeneratingSuno(false);
            showFeedback(`Erro na geração: ${statusData.error || 'Falha no estúdio'}`, 'error');
            return;
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setIsGeneratingSuno(false);
          showFeedback('Tempo limite atingido. As faixas devem ser entregues via webhook em instantes.', 'error');
        }
      } catch (pollErr) {
        console.warn('[BonusOrderManager] Polling retry:', pollErr?.message);
      }
    }, 4000);
  };

  // 6. Criar Pedido Bônus Manualmente (se o cliente ainda não tiver gerado)
  const handleCreateBonusOrder = async () => {
    if (!parentOrder?.id) return;
    if (!confirm('Deseja criar a 2ª geração para este cliente agora?')) return;

    setIsCreatingOrder(true);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: parentOrder.customerName || 'Cliente',
          customerPhone: parentOrder.customerPhone || '',
          customerEmail: parentOrder.customerEmail || '',
          honoreeName: parentOrder.honoreeName || 'Homenageado',
          relationship: parentOrder.relationship || '',
          occasion: parentOrder.occasion || 'Especial',
          musicStyle: parentOrder.musicStyle || 'Pop',
          musicMood: parentOrder.musicMood || 'Emocionante',
          voiceType: parentOrder.voiceType || '',
          story: parentOrder.story || '',
          origem: 'segunda_geracao',
          orderRef: parentOrder.id,
          parentOrderId: parentOrder.id,
          isSecondGeneration: true,
          paidSku: 'segunda_geracao_bonus',
          productionStatus: 'LETRA_APROVADA',
          paymentStatus: 'PAGAMENTO_APROVADO',
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Erro ao criar pedido bônus.');
      }

      showFeedback('🎉 2ª Geração criada com sucesso! Você já pode editar e gerar as faixas.', 'success');
      if (typeof onRefresh === 'function') {
        await onRefresh();
      }
    } catch (err) {
      console.error('[BonusOrderManager] Erro ao criar:', err);
      showFeedback(`Erro ao criar: ${err.message}`, 'error');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const tracks = Array.isArray(secondGen?.audioFiles) && secondGen.audioFiles.length > 0
    ? secondGen.audioFiles
    : (secondGen?.audioUrl ? [secondGen.audioUrl] : []);

  return (
    <div
      className="admin-card-responsive"
      style={{
        padding: '28px',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
        marginBottom: '24px',
        position: 'relative',
      }}
    >
      {/* Toast Feedback */}
      {statusMessage && (
        <div
          style={{
            position: 'absolute',
            top: '14px',
            right: '18px',
            zIndex: 10,
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: '700',
            backgroundColor: statusMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: statusMessage.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${statusMessage.type === 'success' ? '#86efac' : '#fca5a5'}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Header do Card */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '12px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            🎵 2ª Geração de Músicas (Músicas Bônus do Pacote)
          </h3>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: '800',
              padding: '2px 8px',
              borderRadius: '12px',
              background: tracks.length > 0 ? '#dcfce7' : secondGen ? '#fef3c7' : '#f1f5f9',
              color: tracks.length > 0 ? '#166534' : secondGen ? '#92400e' : '#64748b',
              border: `1px solid ${tracks.length > 0 ? '#bbf7d0' : secondGen ? '#fde68a' : '#cbd5e1'}`,
            }}
          >
            {tracks.length > 0
              ? '✓ 2ª Geração Concluída (Faixas Prontas)'
              : secondGen?.isGenerating
              ? '⏳ 2ª Geração em Produção'
              : secondGen
              ? '📝 2ª Geração Iniciada'
              : '⏳ Não Iniciada pelo Cliente'}
          </span>
        </div>

        {secondGen?.id && (
          <Link
            href={`/admin/pedidos/${secondGen.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              backgroundColor: '#f8fafc',
              color: '#1e293b',
              border: '1px solid #cbd5e1',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '700',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            🔗 Abrir Página do Pedido Bônus (#{secondGen.orderNumber || secondGen.id.slice(0, 8)})
          </Link>
        )}
      </div>

      <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '16px', lineHeight: '1.4' }}>
        O pacote completo inclui 4 músicas (2 faixas da 1ª versão + 2 faixas da 2ª versão bônus).
        Aqui você pode gerenciar, alterar o estilo, editar a letra e regerar as músicas bônus diretamente.
      </p>

      {/* CASO 1: SEGUNDA GERAÇÃO AINDA NÃO EXISTE */}
      {!secondGen && (
        <div
          style={{
            textAlign: 'center',
            padding: '28px 20px',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1.5px dashed #cbd5e1',
          }}
        >
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>⏳</span>
          <p style={{ fontSize: '0.92rem', fontWeight: '800', color: '#334155', margin: '0 0 6px' }}>
            O cliente ainda não utilizou a 2ª geração gratuita.
          </p>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 16px', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}>
            O cliente pode gerar sozinho pelo painel /entrega, ou você pode criar o pedido bônus agora mesmo para adiantar o processo.
          </p>
          <button
            type="button"
            onClick={handleCreateBonusOrder}
            disabled={isCreatingOrder}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '700',
              cursor: isCreatingOrder ? 'not-allowed' : 'pointer',
              opacity: isCreatingOrder ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isCreatingOrder ? '⏳ Criando Pedido Bônus...' : '✨ Criar 2ª Geração para este Cliente'}
          </button>
        </div>
      )}

      {/* CASO 2: SEGUNDA GERAÇÃO EXISTE */}
      {secondGen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Grid de Informações Básicas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
              background: '#f8fafc',
              padding: '14px 16px',
              borderRadius: '12px',
              fontSize: '0.82rem',
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>ID do Pedido Bônus:</span>
              <strong style={{ color: '#0f172a' }}>#{secondGen.orderNumber || secondGen.id?.slice(0, 8)}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>Ritmo & Clima:</span>
              <strong style={{ color: '#7c3aed' }}>
                🎵 {secondGen.musicStyle || 'Pop'} {secondGen.musicMood ? `(${secondGen.musicMood})` : ''}
              </strong>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>Status da Produção:</span>
              <select
                value={selectedStatus}
                onChange={(e) => handleSaveStatus(e.target.value)}
                disabled={savingAction === 'status'}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  color: selectedStatus === 'AUDIO_GERADO' ? '#166534' : selectedStatus === 'GERANDO_AUDIO' ? '#7e22ce' : '#0369a1',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="RASCUNHO">RASCUNHO</option>
                <option value="LETRA_GERADA">LETRA_GERADA</option>
                <option value="LETRA_APROVADA">LETRA_APROVADA</option>
                <option value="GERANDO_AUDIO">GERANDO_AUDIO</option>
                <option value="EM_PRODUCAO">EM_PRODUCAO</option>
                <option value="AUDIO_GERADO">AUDIO_GERADO</option>
                <option value="FINALIZADO">FINALIZADO</option>
              </select>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>Criado em:</span>
              <strong style={{ color: '#0f172a' }}>
                {secondGen.createdAt ? new Date(secondGen.createdAt).toLocaleString('pt-BR') : 'Data n/d'}
              </strong>
            </div>
          </div>

          {/* Seção 1: Estilo Musical & Prompt */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                  🎼 Estilo & Tags do Estúdio (Suno AI)
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Ritmo: <strong>{secondGen.musicStyle || 'Pop'}</strong> · Clima: <strong>{secondGen.musicMood || 'Emocionante'}</strong> · Voz: <strong>{selectedVoiceType === 'masculina' ? '👨 Masculina' : selectedVoiceType === 'dueto' ? '👥 Dueto' : '👩 Feminina'}</strong>
                  {Boolean(secondGen.isCustomVoice || secondGen.customVoiceId) && (
                    <span style={{ marginLeft: '6px', color: '#9333ea', fontWeight: '700' }}>(🎙️ Voz Clonada Ativa)</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingStyle(!isEditingStyle)}
                style={{
                  background: isEditingStyle ? '#f1f5f9' : '#e0f2fe',
                  color: isEditingStyle ? '#475569' : '#0369a1',
                  border: '1px solid #bae6fd',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {isEditingStyle ? '✖️ Cancelar' : '✏️ Editar Estilo'}
              </button>
            </div>

            {isEditingStyle && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                      Gênero Musical:
                    </label>
                    <select
                      value={selectedStyle}
                      onChange={(e) => {
                        setSelectedStyle(e.target.value);
                        setStylePrompt(buildSunoPayload({ musicStyle: e.target.value, musicMood: selectedMood, voiceType: selectedVoiceType }).tags);
                      }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                    >
                      {stylesList.map((st) => (
                        <option key={st.id} value={st.id}>{st.icon} {st.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                      Clima / Emoção:
                    </label>
                    <select
                      value={selectedMood}
                      onChange={(e) => {
                        setSelectedMood(e.target.value);
                        setStylePrompt(buildSunoPayload({ musicStyle: selectedStyle, musicMood: e.target.value, voiceType: selectedVoiceType }).tags);
                      }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                    >
                      {moods.map((m) => (
                        <option key={m.id} value={m.id}>{m.icon} {m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                      Tipo de Voz (Estúdio):
                    </label>
                    <select
                      value={selectedVoiceType}
                      onChange={(e) => {
                        setSelectedVoiceType(e.target.value);
                        setStylePrompt(buildSunoPayload({ musicStyle: selectedStyle, musicMood: selectedMood, voiceType: e.target.value }).tags);
                      }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                    >
                      <option value="feminina">👩 Voz Feminina</option>
                      <option value="masculina">👨 Voz Masculina</option>
                      <option value="dueto">👥 Dueto (Feminina + Masculina)</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                    Tags de Estilo para a Suno AI:
                  </label>
                  <input
                    type="text"
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                    placeholder="Ex: acoustic guitar, emotional male vocal, 120 bpm"
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setIsEditingStyle(false)}
                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStyle}
                    disabled={savingAction === 'style'}
                    style={{ background: '#166534', color: '#ffffff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer' }}
                  >
                    {savingAction === 'style' ? 'Salvando...' : '💾 Salvar Estilo'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Seção 2: Letra da 2ª Geração */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                  📜 Letra da 2ª Música
                </strong>
                <span style={{ fontSize: '0.76rem', color: '#64748b', marginLeft: '6px' }}>
                  ({(lyricsText || secondGen.lyrics || '').split('\n').filter(Boolean).length} versos)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingLyrics(!isEditingLyrics)}
                style={{
                  background: isEditingLyrics ? '#f1f5f9' : '#f0fdf4',
                  color: isEditingLyrics ? '#475569' : '#166534',
                  border: '1px solid #bbf7d0',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {isEditingLyrics ? '✖️ Fechar Edição' : '✏️ Editar Letra'}
              </button>
            </div>

            {isEditingLyrics ? (
              <div style={{ marginTop: '10px' }}>
                <textarea
                  value={lyricsText}
                  onChange={(e) => setLyricsText(e.target.value)}
                  rows={10}
                  placeholder="Cole ou digite a letra da 2ª geração aqui..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #94a3b8',
                    fontSize: '0.85rem',
                    lineHeight: '1.5',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setLyricsText(secondGen.lyrics || '');
                      setIsEditingLyrics(false);
                    }}
                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLyrics}
                    disabled={savingAction === 'lyrics'}
                    style={{ background: '#166534', color: '#ffffff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer' }}
                  >
                    {savingAction === 'lyrics' ? 'Salvando...' : '💾 Salvar Letra'}
                  </button>
                </div>
              </div>
            ) : (
              <details style={{ marginTop: '6px' }}>
                <summary style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', cursor: 'pointer' }}>
                  Visualizar letra cadastrada
                </summary>
                <div
                  style={{
                    marginTop: '8px',
                    whiteSpace: 'pre-line',
                    color: '#1e293b',
                    fontSize: '0.82rem',
                    lineHeight: '1.5',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    background: '#ffffff',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {secondGen.lyrics || <em style={{ color: '#94a3b8' }}>Nenhuma letra salva ainda.</em>}
                </div>
              </details>
            )}
          </div>

          {/* Seção 3: Disparo de Geração no Estúdio (Suno / Kie.ai) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
              border: '1.5px solid #ddd6fe',
              borderRadius: '12px',
              padding: '16px 18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#5b21b6', display: 'block' }}>
                  ⚡ Geração no Estúdio Suno AI / Kie.ai
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#6d28d9' }}>
                  Gera automaticamente as 2 faixas (Arranjo 1 e Arranjo 2) correspondentes às faixas 3 e 4 do pacote.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {Boolean(parentOrder?.isCustomVoice || parentOrder?.customVoiceId || secondGen?.isCustomVoice || secondGen?.customVoiceId) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', color: '#5b21b6', fontWeight: '700', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={useCustomVoice}
                        onChange={(e) => setUseCustomVoice(e.target.checked)}
                        disabled={isGeneratingSuno}
                      />
                      🎙️ Usar Voz Clonada
                    </label>
                    {Boolean(secondGen?.isCustomVoice || secondGen?.customVoiceId) && (
                      <button
                        type="button"
                        onClick={handleDetachBonusVoice}
                        disabled={savingAction === 'detach_bonus_voice' || isGeneratingSuno}
                        style={{
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fca5a5',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                        title="Desvincula a voz clonada do pedido bônus para que ele cante apenas com vozes de estúdio"
                      >
                        {savingAction === 'detach_bonus_voice' ? 'Desvinculando...' : '✖️ Desvincular do Bônus'}
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGenerateSunoBonus}
                  disabled={isGeneratingSuno}
                  style={{
                    background: isGeneratingSuno ? '#9333ea' : '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: '800',
                    cursor: isGeneratingSuno ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isGeneratingSuno ? '⏳ Gerando...' : '⚡ Gerar Faixas da 2ª Música'}
                </button>
              </div>
            </div>

            {isGeneratingSuno && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  background: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #c4b5fd',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span className="spinner-border spinner-border-sm" style={{ width: '16px', height: '16px', border: '2px solid #7c3aed', borderRightColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.75s linear infinite' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#6d28d9' }}>
                  {sunoPollingMsg || 'Aguardando o estúdio compor e masterizar os áudios...'}
                </span>
              </div>
            )}
          </div>

          {/* Seção 4: Faixas de Áudio Disponíveis (Faixas 3 e 4) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                🎧 Faixas de Áudio (Faixas 3 e 4 do Pacote)
              </strong>
              <button
                type="button"
                onClick={() => setIsEditingTracks(!isEditingTracks)}
                style={{
                  background: isEditingTracks ? '#f1f5f9' : '#f8fafc',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {isEditingTracks ? '✖️ Fechar Edição Manual' : '✏️ Editar URLs Manualmente'}
              </button>
            </div>

            {/* Edição manual de URLs */}
            {isEditingTracks && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: '10px',
                  padding: '14px',
                }}
              >
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '3px' }}>
                    URL do Áudio 1 (Faixa 3 do Pacote):
                  </label>
                  <input
                    type="text"
                    value={track1Url}
                    onChange={(e) => setTrack1Url(e.target.value)}
                    placeholder="https://...faixa1.mp3"
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '3px' }}>
                    URL do Áudio 2 (Faixa 4 do Pacote):
                  </label>
                  <input
                    type="text"
                    value={track2Url}
                    onChange={(e) => setTrack2Url(e.target.value)}
                    placeholder="https://...faixa2.mp3"
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setIsEditingTracks(false)}
                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTracks}
                    disabled={savingAction === 'tracks'}
                    style={{ background: '#166534', color: '#ffffff', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '700', cursor: 'pointer' }}
                  >
                    {savingAction === 'tracks' ? 'Salvando...' : '💾 Salvar URLs'}
                  </button>
                </div>
              </div>
            )}

            {/* Players das Faixas */}
            {tracks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tracks.map((trkUrl, sIdx) => {
                  const trackNum = sIdx + 3;
                  const proxyUrl = buildAudioProxySrc(trkUrl);
                  return (
                    <div
                      key={sIdx}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <span style={{ fontSize: '0.86rem', fontWeight: '800', color: '#1e293b' }}>
                          🎵 Faixa {trackNum} do Pacote (2ª Geração · Arranjo {sIdx + 1})
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() =>
                              handleDownload
                                ? handleDownload(trkUrl, `${parentOrder.orderNumber || secondGen.id}-segunda-geracao-faixa${sIdx + 1}.mp3`)
                                : window.open(trkUrl, '_blank')
                            }
                            style={{
                              background: '#166534',
                              color: '#ffffff',
                              border: 'none',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            ⬇️ Baixar MP3
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(trkUrl);
                              alert('Link da faixa copiado!');
                            }}
                            style={{
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #cbd5e1',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                            }}
                          >
                            📋 Copiar Link
                          </button>
                        </div>
                      </div>

                      <audio
                        src={proxyUrl}
                        controls
                        style={{ width: '100%', height: '34px', outline: 'none' }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed #cbd5e1',
                  textAlign: 'center',
                  fontSize: '0.82rem',
                  color: '#64748b',
                }}
              >
                {secondGen.isGenerating
                  ? '⏳ As faixas da 2ª geração estão sendo processadas pelo estúdio...'
                  : 'Nenhuma faixa gerada ainda para a 2ª música. Clique no botão roxo acima para gerar no estúdio.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

