'use client';

import React from 'react';
import Link from 'next/link';
import { Mic, Users, Check, Camera, Trash2, Heart, Music, Sparkles } from 'lucide-react';
import { styles } from './wizardStyles';
import { occasions, stylesList, moods, recipients } from './wizardOptions';

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

          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px 28px',
              border: '1px solid #eef2f6',
              boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
            }}
          >
            {/* 1. Ocasião Especial */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '22px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                📅
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px', display: 'block' }}>
                  Qual é a ocasião especial? <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.occasion || ''}
                  onChange={(e) => updateField('occasion', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: formData.occasion ? '#0f172a' : '#64748b',
                    fontSize: '0.98rem',
                    fontWeight: '600',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
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
            </div>

            {/* 2. Seu Primeiro Nome */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '22px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#fff7ed',
                  border: '1px solid #fed7aa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                👤
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px', display: 'block' }}>
                  Seu primeiro nome (quem está dedicando) <span style={{ color: '#ef4444' }}>*</span>
                </label>
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
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontSize: '0.98rem',
                    fontWeight: '500',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* 3. Nome da Pessoa Homenageada + Toggle 'Dedicar para mim mesmo(a)' */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '22px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#fff1f2',
                  border: '1px solid #fecdd3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                🎁
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                    Nome de quem vai receber a música <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  
                  {/* Botão Pill Toggle 'Dedicar para mim mesmo(a)' */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextSelf = !isSelfTribute;
                      if (setIsSelfTribute) setIsSelfTribute(nextSelf);
                      if (nextSelf) {
                        updateField('honoreeName', formData.customerName || '');
                        updateField('recipientType', 'Eu mesmo');
                        updateField('relationship', 'Eu mesmo');
                      } else {
                        updateField('honoreeName', '');
                        updateField('recipientType', '');
                        updateField('relationship', '');
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
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '12px',
                    border: isSelfTribute ? '1.5px solid var(--primary)' : '1.5px solid #cbd5e1',
                    backgroundColor: isSelfTribute ? '#f8fafc' : '#ffffff',
                    color: isSelfTribute ? 'var(--primary)' : '#0f172a',
                    fontSize: '0.98rem',
                    fontWeight: isSelfTribute ? '700' : '500',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {isSelfTribute && (
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--primary)', marginTop: '6px', fontWeight: '600' }}>
                    ⭐ Homenagem própria: a música será cantada para você mesmo(a)!
                  </span>
                )}
              </div>
            </div>

            {/* 4. Grau de Parentesco / Relação */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                ❤️
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px', display: 'block' }}>
                  O que essa pessoa é sua? (Grau de parentesco ou relação) <span style={{ color: '#ef4444' }}>*</span>
                </label>

                {isSelfTribute ? (
                  <div
                    style={{
                      padding: '13px 16px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--primary-light)',
                      border: '1.5px solid var(--primary)',
                      color: 'var(--primary)',
                      fontWeight: '700',
                      fontSize: '0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>🎤</span>
                    <span>Homenagem para mim mesmo(a)</span>
                  </div>
                ) : (
                  <>
                    <select
                      value={formData.relationship || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateField('relationship', val);
                        updateField('recipientType', val);
                      }}
                      style={{
                        width: '100%',
                        padding: '13px 16px',
                        borderRadius: '12px',
                        border: '1.5px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: formData.relationship ? '#0f172a' : '#64748b',
                        fontSize: '0.98rem',
                        fontWeight: '600',
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Selecione o parentesco ou vínculo (ex: Mãe, Pai, Esposa...)</option>
                      {recipients.filter((r) => r.id !== 'Eu mesmo').map((rec) => (
                        <option key={rec.id} value={rec.id}>
                          {rec.icon} {rec.label}
                        </option>
                      ))}
                    </select>

                    {formData.relationship === 'Outro' && (
                      <div style={{ marginTop: '10px' }}>
                        <input
                          type="text"
                          value={formData.customRelationship || ''}
                          onChange={(e) => updateField('customRelationship', e.target.value)}
                          placeholder="Especifique a relação (ex: Sogra, Padrasto, Afilhado(a)...)"
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1.5px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#0f172a',
                            fontSize: '0.95rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Tip Box Dica Essencial */}
            <div
              style={{
                marginTop: '24px',
                padding: '14px 18px',
                borderRadius: '14px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💡</span>
              <span style={{ fontSize: '0.84rem', color: '#92400e', lineHeight: 1.45 }}>
                Essencial para a IA definir o tom perfeito da letra (amor familiar, romântico ou amizade).
              </span>
            </div>
          </div>
        </div>
      );

    // --------------------------------------------------------------------------
    // ETAPA 2: A História (sem momentos especiais redundantes)
    // --------------------------------------------------------------------------
    case 2:
      return (
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <h1 style={styles.stepTitle}>Conte sua história 📜</h1>
          <p style={styles.stepSubtitle}>
            Digite ou use o microfone para contar os detalhes. Faremos uma composição inesquecível!
          </p>

          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px 28px',
              border: '1px solid #eef2f6',
              boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                ✍️
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                    Sua história de vida, momentos e sentimentos <span style={{ color: '#ef4444' }}>*</span>
                  </label>

                  {/* Botão Ditar por Voz */}
                  <button
                    type="button"
                    onClick={toggleVoiceDictation}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '999px',
                      border: isListening ? '2px solid #ef4444' : '1.5px solid var(--primary)',
                      background: isListening ? '#fef2f2' : 'var(--primary-light)',
                      color: isListening ? '#dc2626' : 'var(--primary)',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span>{isListening ? '⏹' : '🎙️'}</span>
                    <span>{isListening ? 'Gravando... (Fale Agora)' : 'Ditar por Voz'}</span>
                  </button>
                </div>

                {/* Sugestões rápidas de inspiração */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>Ideias para inspirar:</span>
                  <button
                    type="button"
                    onClick={() => appendStoryPrompt("Nos conhecemos em um momento marcante de nossas vidas e desde então não nos separamos mais.")}
                    style={{ padding: '4px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: '0.76rem', cursor: 'pointer', fontWeight: '500' }}
                  >
                    💡 Como nos conhecemos
                  </button>
                  <button
                    type="button"
                    onClick={() => appendStoryPrompt("As maiores virtudes dessa pessoa são a bondade, o sorriso contagiante e a dedicação à família.")}
                    style={{ padding: '4px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: '0.76rem', cursor: 'pointer', fontWeight: '500' }}
                  >
                    💡 Qualidades marcantes
                  </button>
                  <button
                    type="button"
                    onClick={() => appendStoryPrompt("Quero expressar minha gratidão por cada segundo ao lado dela e reafirmar meu amor eterno.")}
                    style={{ padding: '4px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: '0.76rem', cursor: 'pointer', fontWeight: '500' }}
                  >
                    💡 Declaração de amor
                  </button>
                </div>

                <textarea
                  value={formData.story || ''}
                  onChange={(e) => updateField('story', e.target.value)}
                  placeholder="Como vocês se conheceram? Qual o momento mais especial? O que essa pessoa significa pra você? (Ou clique no botão Ditar por Voz acima para falar)"
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '14px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.98rem',
                    lineHeight: '1.6',
                    minHeight: '190px',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: (formData.story || '').trim().length >= 50 ? '#059669' : '#dc2626', fontWeight: '700' }}>
                    {(formData.story || '').trim().length < 50
                      ? `Mínimo de 50 caracteres (faltam ${Math.max(0, 50 - (formData.story || '').trim().length)})`
                      : '✓ Tamanho ideal atingido'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                    {(formData.story || '').trim().length} / 2000
                  </span>
                </div>
              </div>
            </div>

            {/* Tip Box */}
            <div
              style={{
                marginTop: '16px',
                padding: '14px 18px',
                borderRadius: '14px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💡</span>
              <span style={{ fontSize: '0.84rem', color: '#92400e', lineHeight: 1.45 }}>
                Quanto mais detalhes você contar (apelidos carinhosos, piadas internas, datas e viagens marcantes), mais emocionante e exclusiva será a letra!
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

          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px 28px',
              border: '1px solid #eef2f6',
              boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {/* 1. Ritmo da Música */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                🎸
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px', display: 'block' }}>
                  Ritmo da música (Gênero) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.musicStyle || ''}
                  onChange={(e) => updateField('musicStyle', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: formData.musicStyle ? '#0f172a' : '#64748b',
                    fontSize: '0.98rem',
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
            </div>

            {/* 2. Clima da Canção */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                ✨
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px', display: 'block' }}>
                  Clima da música (Sentimento) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.musicMood || ''}
                  onChange={(e) => updateField('musicMood', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: formData.musicMood ? '#0f172a' : '#64748b',
                    fontSize: '0.98rem',
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
            </div>

            {/* 3. Tipo de Voz */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#e0f2fe',
                  border: '1px solid #bae6fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                🎤
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: '0.94rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px', display: 'block' }}>
                  Tipo de voz da música (quem vai cantar) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginTop: '6px' }}>
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
                          borderRadius: '14px',
                          cursor: 'pointer',
                          border: selected
                            ? (isCustom ? '2px solid #f59e0b' : '2px solid var(--primary)')
                            : '1.5px solid #e2e8f0',
                          backgroundColor: selected
                            ? (isCustom ? 'rgba(245, 158, 11, 0.08)' : 'var(--primary-light)')
                            : '#ffffff',
                          color: selected
                            ? (isCustom ? '#d97706' : 'var(--primary)')
                            : '#334155',
                          boxShadow: selected ? '0 4px 14px rgba(124, 58, 237, 0.15)' : 'none',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {selected && (
                          <span style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: isCustom ? '#f59e0b' : 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={12} strokeWidth={3} />
                          </span>
                        )}
                        <Icon size={24} />
                        <strong style={{ fontSize: '0.96rem' }}>{label}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tip Box */}
            <div
              style={{
                marginTop: '8px',
                padding: '14px 18px',
                borderRadius: '14px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💡</span>
              <span style={{ fontSize: '0.84rem', color: '#92400e', lineHeight: 1.45 }}>
                Nossos produtores de estúdio ajustam o tom e a instrumentação para combinar com perfeição à voz escolhida.
              </span>
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
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '24px',
                padding: '28px 24px',
                border: '1px solid #eef2f6',
                boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#f5f3ff',
                    border: '1px solid #ddd6fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.15rem',
                    flexShrink: 0,
                  }}
                >
                  💿
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Capa do Álbum & Resumo
                </h3>
              </div>

              {/* Mockup da Capa de Álbum */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1',
                  maxHeight: '260px',
                  borderRadius: '18px',
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
                  <div style={{ textAlign: 'center', padding: '10px', fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '700' }}>
                    ⏳ Enviando foto...
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1.5px dashed var(--primary)',
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      fontWeight: '700',
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
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
              <div style={{ fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Homenageado(a):</span>
                  <strong style={{ color: '#0f172a' }}>{formData.honoreeName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Dedicado por:</span>
                  <strong style={{ color: '#0f172a' }}>{formData.customerName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Relação:</span>
                  <strong style={{ color: '#0f172a' }}>
                    {formData.relationship === 'Outro' && formData.customRelationship
                      ? formData.customRelationship
                      : (formData.relationship || (isSelfTribute ? 'Eu mesmo' : 'Especial'))}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Ritmo & Clima:</span>
                  <strong style={{ color: '#0f172a' }}>{formData.musicStyle} • {formData.musicMood}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Tipo da Voz:</span>
                  <strong style={{ color: '#0f172a' }}>{formData.voiceType}</strong>
                </div>
              </div>
            </div>

            {/* Coluna 2: Dados de Contato e WhatsApp */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '24px',
                padding: '28px 24px',
                border: '1px solid #eef2f6',
                boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.15rem',
                      flexShrink: 0,
                    }}
                  >
                    📲
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    Onde enviar o seu pedido?
                  </h3>
                </div>

                {/* Nome de quem está pedindo */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '18px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: '#fff7ed',
                      border: '1px solid #fed7aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    👤
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px', display: 'block' }}>
                      Seu nome completo ou apelido <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.customerName || ''}
                      onChange={(e) => updateField('customerName', e.target.value)}
                      placeholder="Ex: Maria Silva"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1.5px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.96rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      ✓ Preenchido da 1ª etapa (ajuste se preferir).
                    </span>
                  </div>
                </div>

                {/* WhatsApp do cliente */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '18px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    💬
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginBottom: '6px', display: 'block' }}>
                      Seu WhatsApp (com DDD) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.customerPhone || ''}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="(99) 99999-9999"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1.5px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: '1rem',
                        fontWeight: '700',
                        outline: 'none',
                        boxSizing: 'border-box',
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
                </div>

                {/* AVISO IMPORTANTE: A música é ouvida no estúdio e o link é enviado pelo WhatsApp */}
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '14px',
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
                    <strong>Como funciona o envio:</strong> Você poderá ouvir a prévia completa no próximo passo, e também enviaremos o <strong>link de acompanhamento e download</strong> diretamente no seu WhatsApp!
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
                      borderRadius: '12px',
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
                <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: '1.4', margin: '4px 0 0 0' }}>
                  Ao prosseguir, você concorda com nossos{' '}
                  <Link href="/termos-de-uso" target="_blank" style={{ color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>
                    Termos de Uso
                  </Link>
                  {' '}e a{' '}
                  <Link href="/politica-de-privacidade" target="_blank" style={{ color: 'var(--primary)', fontWeight: '600', textDecoration: 'underline' }}>
                    Política de Privacidade
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
