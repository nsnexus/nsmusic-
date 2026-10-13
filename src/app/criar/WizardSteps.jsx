'use client';

import React from 'react';
import Link from 'next/link';
import { Mic, Users, Check, Camera, Trash2, Heart, Music, Sparkles } from 'lucide-react';
import { styles } from './wizardStyles';
import { occasions, stylesList, moods } from './wizardOptions';

export default function WizardSteps({
  step,
  formData,
  updateField,
  isListening,
  toggleVoiceDictation,
  appendStoryPrompt,
  isUploadingCover,
  handleImageUpload,
  handlePhoneChange,
  phoneVerifyStatus,
  phoneVerifyMessage,
  recognizedVoice = null,
  checkingVoice = false,
  isSelfTribute = false,
  setIsSelfTribute,
}) {
  switch (step) {
    // --------------------------------------------------------------------------
    // ETAPA 1: Ocasião, Nome de quem está dedicando & Nome do Homenageado
    // --------------------------------------------------------------------------
    case 1:
      return (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h1 style={styles.stepTitle}>Quem vai ser homenageado? ✨</h1>
          <p style={styles.stepSubtitle}>
            Escolha a ocasião e os nomes de quem está dedicando e recebendo a música.
          </p>

          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px 24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            {/* 1. Ocasião Especial (Lista Suspensa / Dropdown) */}
            <div style={{ marginBottom: '22px' }}>
              <label style={styles.wizardLabel}>Qual é a ocasião especial? *</label>
              <select
                value={formData.occasion || ''}
                onChange={(e) => updateField('occasion', e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: formData.occasion ? '#0f172a' : '#64748b',
                  fontSize: '1rem',
                  fontWeight: '600',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Selecione a ocasião (ex: Aniversário, Declaração de Amor...)</option>
                {occasions.map((occ) => (
                  <option key={occ.id} value={occ.id}>
                    {occ.icon} {occ.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Seu Primeiro Nome (Quem está dedicando) */}
            <div style={{ marginBottom: '22px' }}>
              <label style={styles.wizardLabel}>Seu primeiro nome (quem está dedicando) *</label>
              <input
                type="text"
                value={formData.customerName || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateField('customerName', val);
                  if (isSelfTribute) {
                    updateField('honoreeName', val);
                  }
                }}
                placeholder="Ex: Carlos, Mariana, Rodrigo..."
                style={{
                  ...styles.wizardInput,
                  marginTop: '4px',
                  textAlign: 'left',
                  fontSize: '1rem',
                  padding: '14px 16px',
                }}
              />
            </div>

            {/* 3. Nome da Pessoa Homenageada (com Botão/Flag 'Eu mesmo') */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                <label style={{ ...styles.wizardLabel, marginBottom: 0 }}>
                  Nome de quem vai receber a música *
                </label>
                
                {/* Botão Discreto tipo Flag / Toggle para 'Eu mesmo' */}
                <button
                  type="button"
                  onClick={() => {
                    const nextSelf = !isSelfTribute;
                    if (setIsSelfTribute) setIsSelfTribute(nextSelf);
                    if (nextSelf) {
                      updateField('honoreeName', formData.customerName || '');
                      updateField('recipientType', 'Eu mesmo');
                    } else {
                      updateField('honoreeName', '');
                      updateField('recipientType', 'Outro');
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    borderRadius: '999px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    border: isSelfTribute ? '1.5px solid var(--primary)' : '1px solid #cbd5e1',
                    backgroundColor: isSelfTribute ? 'var(--primary-light)' : '#f8fafc',
                    color: isSelfTribute ? 'var(--primary)' : '#64748b',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{isSelfTribute ? '✓' : '○'}</span>
                  <span>Dedicar para mim mesmo(a)</span>
                </button>
              </div>

              <input
                type="text"
                value={formData.honoreeName || ''}
                readOnly={isSelfTribute}
                onChange={(e) => updateField('honoreeName', e.target.value)}
                placeholder={isSelfTribute ? (formData.customerName || 'Seu próprio nome') : 'Ex: Camila, Minha Mãe, Meu Amor...'}
                style={{
                  ...styles.wizardInput,
                  marginTop: '4px',
                  textAlign: 'left',
                  fontSize: '1rem',
                  padding: '14px 16px',
                  backgroundColor: isSelfTribute ? '#f8fafc' : '#ffffff',
                  borderColor: isSelfTribute ? 'var(--primary)' : '#cbd5e1',
                  color: isSelfTribute ? 'var(--primary)' : '#0f172a',
                  fontWeight: isSelfTribute ? '700' : '500',
                }}
              />
              {isSelfTribute && (
                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--primary)', marginTop: '6px', fontWeight: '600' }}>
                  ⭐ Homenagem própria: a música será cantada para você mesmo(a)!
                </span>
              )}
            </div>
          </div>
        </div>
      );

    // --------------------------------------------------------------------------
    // ETAPA 2: A História (sem momentos especiais redundantes)
    // --------------------------------------------------------------------------
    case 2:
      return (
        <div style={{ maxWidth: '750px', margin: '0 auto' }}>
          <h1 style={styles.stepTitle}>Conte sua história 📜</h1>
          <p style={styles.stepSubtitle}>
            Digite ou use o microfone para contar os detalhes. Faremos uma composição inesquecível!
          </p>

          {/* Barra de Ferramentas de Voz e Sugestões Rápidas */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={toggleVoiceDictation}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: isListening ? '2px solid #ef4444' : '1px solid var(--primary)',
                background: isListening ? 'rgba(239, 68, 68, 0.12)' : 'var(--primary-light)',
                color: isListening ? '#dc2626' : 'var(--primary)',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isListening ? '⏹ Gravando... (Fale Agora)' : '🎙️ Ditar por Voz (Gravar Fala)'}
            </button>

            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sugestões rápidas:</span>

            <button
              type="button"
              onClick={() => appendStoryPrompt("Nos conhecemos em um momento marcante de nossas vidas e desde então não nos separamos mais.")}
              style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', background: '#ffffff', color: '#475569', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              💡 Como nos conhecemos
            </button>

            <button
              type="button"
              onClick={() => appendStoryPrompt("As maiores virtudes dessa pessoa são a bondade, o sorriso contagiante e a dedicação à família.")}
              style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', background: '#ffffff', color: '#475569', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              💡 Qualidades e virtudes
            </button>

            <button
              type="button"
              onClick={() => appendStoryPrompt("Quero expressar minha gratidão por cada segundo ao lado dela e reafirmar meu amor eterno.")}
              style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', background: '#ffffff', color: '#475569', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              💡 Declaração de Amor
            </button>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={styles.wizardLabel}>Sua história de vida, momentos e sentimentos *</label>
            <textarea
              value={formData.story || ''}
              onChange={(e) => updateField('story', e.target.value)}
              placeholder="Como vocês se conheceram? Qual o momento mais especial? O que essa pessoa significa pra você? (Ou clique no microfone acima para falar)"
              style={{ ...styles.wizardTextarea, height: '180px', backgroundColor: '#ffffff', color: '#0f172a' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: (formData.story || '').trim().length >= 50 ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                {(formData.story || '').trim().length < 50
                  ? `Mínimo de 50 caracteres (faltam ${Math.max(0, 50 - (formData.story || '').trim().length)})`
                  : 'Tamanho ideal atingido ✓'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {(formData.story || '').trim().length}/2000
              </span>
            </div>
          </div>
        </div>
      );

    // --------------------------------------------------------------------------
    // ETAPA 3: Ritmo da Música (Caixa Suspensa), Clima e Tipo da Voz
    // --------------------------------------------------------------------------
    case 3:
      return (
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <h1 style={styles.stepTitle}>Ritmo, Clima & Voz 🎵</h1>
          <p style={styles.stepSubtitle}>
            Defina o estilo musical, o sentimento da letra e quem vai interpretar a canção.
          </p>

          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px 24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* 1. Ritmo Musical (Caixa Suspensa) */}
            <div>
              <label style={styles.wizardLabel}>Ritmo da música (Gênero) *</label>
              <select
                value={formData.musicStyle || ''}
                onChange={(e) => updateField('musicStyle', e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: formData.musicStyle ? '#0f172a' : '#64748b',
                  fontSize: '1rem',
                  fontWeight: '600',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Selecione o ritmo (ex: Romântica, Sertanejo, Pop, MPB...)</option>
                {stylesList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.icon} {st.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Clima da Canção (Caixa Suspensa) */}
            <div>
              <label style={styles.wizardLabel}>Clima da música (Sentimento) *</label>
              <select
                value={formData.musicMood || ''}
                onChange={(e) => updateField('musicMood', e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: formData.musicMood ? '#0f172a' : '#64748b',
                  fontSize: '1rem',
                  fontWeight: '600',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Selecione o clima (ex: Emocionante, Romântica, Alegre...)</option>
                {moods.map((md) => (
                  <option key={md.id} value={md.id}>
                    {md.icon} {md.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Tipo de Voz (Botões Visuais) */}
            <div>
              <label style={styles.wizardLabel}>Tipo de voz da música (quem vai cantar) *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginTop: '8px' }}>
                {[
                  { id: 'masculina', label: 'Masculina', desc: 'Voz grave', Icon: Mic },
                  { id: 'feminina', label: 'Feminina', desc: 'Voz suave / aguda', Icon: Mic },
                  { id: 'dueto', label: 'Dueto', desc: 'Masc. + Feminina', Icon: Users },
                  ...(recognizedVoice ? [{ id: 'minha_voz', label: 'Minha Própria Voz', desc: 'Timbre gravado', Icon: Mic, isCustom: true }] : []),
                ].map(({ id, label, desc, Icon, isCustom }) => {
                  const selected = formData.voiceType === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateField('voiceType', id)}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '16px 12px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        border: selected
                          ? (isCustom ? '2px solid #f59e0b' : '2px solid var(--primary)')
                          : '1.5px solid #e2e8f0',
                        backgroundColor: selected
                          ? (isCustom ? 'rgba(245, 158, 11, 0.12)' : 'var(--primary-light)')
                          : '#ffffff',
                        color: selected
                          ? (isCustom ? '#d97706' : 'var(--primary)')
                          : '#334155',
                        boxShadow: selected ? '0 4px 12px rgba(124, 58, 237, 0.15)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {selected && (
                        <span style={{ position: 'absolute', top: '8px', right: '8px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: isCustom ? '#f59e0b' : 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={11} strokeWidth={3} />
                        </span>
                      )}
                      <Icon size={24} />
                      <strong style={{ fontSize: '0.95rem' }}>{label}</strong>
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );

    // --------------------------------------------------------------------------
    // ETAPA 4: Resumo Completo, Capa com Prévia em Tempo Real & WhatsApp
    // --------------------------------------------------------------------------
    case 4:
      return (
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <h1 style={styles.stepTitle}>Resumo da Composição & Envio 🎶</h1>
          <p style={styles.stepSubtitle}>
            Confira como ficou seu pedido, adicione a foto de capa e informe seu WhatsApp para receber o link.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Coluna 1: Resumo + Prévia Visual da Capa */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--primary)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💿</span>
                <span>Capa do Álbum & Resumo</span>
              </h3>

              {/* Mockup da Capa de Álbum (com foto enviada ou capa padrão) */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1',
                  maxHeight: '260px',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  margin: '0 auto 16px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  border: '2px solid rgba(0,0,0,0.06)',
                  background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                }}
              >
                {formData.coverUrl ? (
                  <img
                    src={formData.coverUrl}
                    alt="Capa personalizada"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ffffff', padding: '16px 20px 75px', textAlign: 'center' }}>
                    <span style={{ fontSize: '2.5rem', marginBottom: '6px' }}>🎵</span>
                    <strong style={{ fontSize: '1.05rem', letterSpacing: '0.04em', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>NS MUSIC STUDIO</strong>
                  </div>
                )}

                {/* Overlay com título na parte inferior da capa */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 2,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                    padding: '16px 14px 12px',
                    color: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#cbd5e1', fontWeight: '700' }}>
                        {formData.occasion || 'Homenagem Especial'}
                      </span>
                      <strong style={{ display: 'block', fontSize: '1.05rem', color: '#ffffff', fontWeight: '800', lineHeight: 1.2 }}>
                        Para {formData.honoreeName || 'Alguém Especial'}
                      </strong>
                      <span style={{ fontSize: '0.76rem', color: '#f1f5f9', opacity: 0.9 }}>
                        Por {formData.customerName || 'Quem ama'} • {formData.musicStyle || 'Música Personalizada'}
                      </span>
                    </div>

                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: formData.coverUrl ? '#059669' : 'rgba(255,255,255,0.2)', color: '#ffffff', fontWeight: '700' }}>
                      {formData.coverUrl ? '✓ Sua Foto' : 'Capa Padrão'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão de Enviar Foto de Capa */}
              <div style={{ marginBottom: '16px' }}>
                {formData.coverUrl ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: '700' }}>
                      ✓ Foto de capa enviada!
                    </span>
                    <button
                      type="button"
                      onClick={() => updateField('coverUrl', '')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Trash2 size={13} /> Remover foto
                    </button>
                  </div>
                ) : isUploadingCover ? (
                  <div style={{ textAlign: 'center', padding: '8px', fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '700' }}>
                    ⏳ Enviando foto...
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1.5px dashed var(--primary)',
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <Camera size={16} />
                    <span>Clique para enviar foto na capa (Opcional)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>

              {/* Lista Resumo dos Itens */}
              <div style={{ fontSize: '0.86rem', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Homenageado(a):</span>
                  <strong style={{ color: '#0f172a' }}>{formData.honoreeName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Dedicado por:</span>
                  <strong style={{ color: '#0f172a' }}>{formData.customerName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Ritmo & Clima:</span>
                  <strong style={{ color: '#0f172a' }}>{formData.musicStyle} • {formData.musicMood}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Tipo da Voz:</span>
                  <strong style={{ color: '#0f172a' }}>{formData.voiceType}</strong>
                </div>
              </div>
            </div>

            {/* Coluna 2: Dados de Contato e WhatsApp */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📲</span>
                  <span>Onde enviar o seu pedido?</span>
                </h3>

                {/* Nome de quem está pedindo (já pré-preenchido da etapa 1) */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={styles.wizardLabel}>Seu nome completo ou apelido *</label>
                  <input
                    type="text"
                    value={formData.customerName || ''}
                    onChange={(e) => updateField('customerName', e.target.value)}
                    placeholder="Ex: Maria Silva"
                    style={{
                      ...styles.wizardInput,
                      marginTop: '4px',
                      textAlign: 'left',
                      fontSize: '0.95rem',
                      padding: '12px 14px',
                    }}
                  />
                  <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    ✓ Preenchido da 1ª etapa (você pode ajustar se quiser).
                  </span>
                </div>

                {/* WhatsApp do cliente */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={styles.wizardLabel}>Seu WhatsApp (com DDD) *</label>
                  <input
                    type="tel"
                    value={formData.customerPhone || ''}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="(99) 99999-9999"
                    style={{
                      ...styles.wizardInput,
                      marginTop: '4px',
                      textAlign: 'left',
                      fontSize: '1rem',
                      fontWeight: '700',
                      padding: '12px 14px',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: phoneVerifyStatus === 'valid' ? 'var(--success)' : phoneVerifyStatus === 'invalid' ? '#ef4444' : 'var(--text-muted)',
                      marginTop: '4px',
                      display: 'block',
                      fontWeight: phoneVerifyStatus === 'invalid' ? 'bold' : 'normal',
                    }}
                  >
                    {phoneVerifyMessage || 'Digite seu DDD + 9 dígitos do celular'}
                  </span>
                </div>

                {/* AVISO IMPORTANTE: A música é ouvida no estúdio e o link é enviado pelo WhatsApp */}
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: '1px' }}>ℹ️</span>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#166534', lineHeight: '1.45' }}>
                    <strong>Como funciona o envio:</strong> Nós enviaremos o <strong>link de acompanhamento e confirmação</strong> do seu pedido pelo WhatsApp.
                  </p>
                </div>

                {/* Reconhecimento de Voz */}
                {checkingVoice && (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>
                    ⏳ Verificando se este WhatsApp tem voz clonada cadastrada...
                  </span>
                )}
                {recognizedVoice && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      marginBottom: '16px',
                      fontSize: '0.82rem',
                      color: '#b45309',
                    }}
                  >
                    🎤 <strong>Timbre Cadastrado:</strong> Olá, {recognizedVoice.customerName || 'Cliente'}! Identificamos o seu timbre de voz.
                  </div>
                )}
              </div>

              {/* Termos de Uso */}
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="termsAccepted"
                    checked={formData.termsAccepted || false}
                    onChange={(e) => updateField('termsAccepted', e.target.checked)}
                    style={{ marginTop: '3px', width: '18px', height: '18px', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor="termsAccepted" style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: '1.4', cursor: 'pointer' }}>
                    Li e aceito os{' '}
                    <Link href="/termos-de-uso" target="_blank" style={{ color: 'var(--primary)', fontWeight: '600' }}>
                      Termos de Uso
                    </Link>
                    {' '}e a{' '}
                    <Link href="/politica-de-privacidade" target="_blank" style={{ color: 'var(--primary)', fontWeight: '600' }}>
                      Política de Privacidade
                    </Link>
                    . *
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
