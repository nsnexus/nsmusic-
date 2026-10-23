'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Mic } from 'lucide-react';
import { occasions, recipients, stylesList, moods } from '@/app/criar/wizardOptions';

const groups = [
  { id: 'family', label: 'Minha família', photo: '/experiencia/familia.webp', relations: ['Mãe', 'Pai', 'Filha', 'Filho', 'Vó', 'Vô', 'Irmã', 'Irmão', 'Tia', 'Tio', 'Primo(a)', 'Padrinho / Madrinha'] },
  { id: 'love', label: 'Meu amor', photo: '/experiencia/amor.webp', relations: ['Esposa', 'Marido', 'Namorada', 'Namorado', 'Noiva', 'Noivo'] },
  { id: 'friend', label: 'Amizade', relations: ['Amiga', 'Amigo'] },
  { id: 'self', label: 'Para mim', relations: ['Eu mesmo'] },
  { id: 'other', label: 'Outra pessoa', relations: [] },
];

function Field({ label, children, help, isMissing = false, missingText = 'Falta preencher' }) {
  return (
    <label
      className="nx-field"
      data-missing={isMissing ? "true" : undefined}
      style={{
        position: 'relative',
        borderRadius: isMissing ? '12px' : '0px',
        padding: isMissing ? '8px 10px' : '0px',
        margin: isMissing ? '8px 0' : '20px 0',
        backgroundColor: isMissing ? '#fffdf7' : 'transparent',
        border: isMissing ? '1.5px dashed #f59e0b' : '1px solid transparent',
        transition: 'all 0.25s ease'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <span>{label}</span>
        {isMissing && (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#b45309',
              backgroundColor: '#fef3c7',
              padding: '2px 8px',
              borderRadius: '10px',
              border: '1px solid #fde68a',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
            {missingText}
          </span>
        )}
      </span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}

export function CreationEditorial() {
  return (
    <aside className="nx-editorial">
      <Image unoptimized src="/experiencia/familia.webp" alt="Mãe e filha compartilhando um momento de carinho" width={1280} height={853} sizes="(max-width: 800px) 100vw, 430px" />
      <div><p className="nx-editorial-title">Tem sentimento que merece virar canção.</p><p>Você conta a história. Ela ganha letra, melodia e um lugar especial na memória.</p></div>
      <small>Imagem editorial ilustrativa.</small>
    </aside>
  );
}

export default function CreationSteps({ step, formData: data, updateField, isListening, toggleVoiceDictation, appendStoryPrompt, isUploadingCover, handleImageUpload, handlePhoneChange, phoneVerifyStatus, phoneVerifyMessage, recognizedVoice, checkingVoice, isSelfTribute, setIsSelfTribute }) {
  const [chosenGroup, setChosenGroup] = useState(null);
  const [showAllStyles, setShowAllStyles] = useState(false);
  const previousRecipient = useRef(null);
  const activeGroup = chosenGroup || (isSelfTribute ? 'self' : groups.find(g => g.relations.includes(data.relationship))?.id);
  const category = groups.find(g => g.id === activeGroup);
  const options = !category || category.id === 'other' ? recipients.filter(r => r.id !== 'Eu mesmo') : recipients.filter(r => category.relations.includes(r.id));
  const pickGroup = (id) => {
    if (id === activeGroup) return;
    if (id === 'self') {
      previousRecipient.current = { honoreeName: data.honoreeName, relationship: data.relationship, recipientType: data.recipientType };
      setIsSelfTribute(true);
      updateField('honoreeName', data.customerName || '');
      updateField('relationship', 'Eu mesmo');
      updateField('recipientType', 'Eu mesmo');
    } else {
      if (isSelfTribute) {
        updateField('honoreeName', previousRecipient.current?.honoreeName || '');
      }
      setIsSelfTribute(false);
      updateField('relationship', '');
      updateField('recipientType', '');
    }
    setChosenGroup(id);
  };

  if (step === 1) return (
    <section className="nx-form-column">
      <h1>Para quem é<br />essa música?</h1>
      <p className="nx-subtitle">Comece por alguém que merece ouvir o quanto é especial.</p>
      <div className="nx-recipient-grid" role="group" aria-label="Tipo de homenagem">
        {groups.slice(0, 2).map(group => <button key={group.id} type="button" className="nx-recipient" aria-pressed={activeGroup === group.id} onClick={() => pickGroup(group.id)}>
          <Image unoptimized src={group.photo} alt="" width={640} height={426} sizes="(max-width: 800px) 44vw, 250px" priority />
          <span>{group.label}<i aria-hidden="true">{activeGroup === group.id ? '✓' : ''}</i></span>
        </button>)}
      </div>
      <div className="nx-chips" role="group" aria-label="Outras relações">{groups.slice(2).map(group => <button key={group.id} type="button" aria-pressed={activeGroup === group.id} onClick={() => pickGroup(group.id)}>{group.label}</button>)}</div>
      {!isSelfTribute && (
        <Field label="O que essa pessoa é sua?" isMissing={!data.relationship} missingText="Falta selecionar">
          <select
            value={data.relationship || ''}
            onChange={e => { updateField('relationship', e.target.value); updateField('recipientType', e.target.value); }}
            style={!data.relationship ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
          >
            <option value="">Escolha a relação</option>
            {options.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
      )}
      {data.relationship === 'Outro' && (
        <Field label="Qual é a relação de vocês?" isMissing={!data.customRelationship?.trim()} missingText="Falta especificar">
          <input
            value={data.customRelationship || ''}
            onChange={e => updateField('customRelationship', e.target.value)}
            placeholder="Ex.: minha sogra"
            maxLength={100}
            style={!data.customRelationship?.trim() ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
          />
        </Field>
      )}
      <div className="nx-field-row">
        <Field label="Nome Homenageado" isMissing={!data.honoreeName?.trim()} missingText="Falta preencher">
          <input
            value={data.honoreeName || ''}
            readOnly={isSelfTribute}
            onChange={e => updateField('honoreeName', e.target.value)}
            placeholder={isSelfTribute ? 'Seu próprio nome' : 'Ex.: Helena'}
            autoComplete="off"
            maxLength={100}
            style={!data.honoreeName?.trim() ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
          />
        </Field>
        <Field label="Seu primeiro nome" isMissing={!data.customerName?.trim()} missingText="Falta preencher">
          <input
            value={data.customerName || ''}
            onChange={e => { updateField('customerName', e.target.value); if (isSelfTribute) updateField('honoreeName', e.target.value); }}
            placeholder="Ex.: Mariana"
            autoComplete="given-name"
            maxLength={100}
            style={!data.customerName?.trim() ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
          />
        </Field>
      </div>
      {isSelfTribute && <p className="nx-helper">Esta homenagem será para você. Seu nome aparece nos dois campos.</p>}
      <Field label="Qual é a ocasião?" isMissing={!data.occasion} missingText="Falta escolher">
        <select
          value={data.occasion || ''}
          onChange={e => updateField('occasion', e.target.value)}
          style={!data.occasion ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
        >
          <option value="">Escolha o motivo</option>
          {occasions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </Field>
    </section>
  );

  if (step === 2) {
    const storyLen = (data.story || '').trim().length;
    const isStoryMissing = storyLen < 50;
    return (
      <section className="nx-form-column">
        <h1>Uma história que<br />só vocês têm.</h1>
        <p className="nx-subtitle">O que torna {data.honoreeName || 'essa pessoa'} especial? Não precisa escrever bonito, só do seu jeito.</p>
        <Field
          label="O que você gostaria de dizer?"
          help={`${storyLen} caracteres · conte pelo menos 50 para começar.`}
          isMissing={isStoryMissing}
          missingText={storyLen === 0 ? 'Falta contar a história (mínimo 50 letras)' : `Faltam ${50 - storyLen} letras para o mínimo (50)`}
        >
          <textarea
            value={data.story || ''}
            onChange={e => updateField('story', e.target.value)}
            placeholder="Conte uma lembrança, o que mais admira nessa pessoa e o que gostaria que ela sentisse ao ouvir…"
            rows={8}
            style={isStoryMissing ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
          />
        </Field>
        <div className="nx-chips" role="group" aria-label="Ideias para sua história">{[
          ['Uma lembrança', 'Uma lembrança que guardo com carinho é '], ['Uma qualidade', 'O que mais admiro em você é '], ['Uma mensagem', 'Hoje eu queria te dizer que '],
        ].map(([title, prompt]) => <button key={title} type="button" onClick={() => appendStoryPrompt(prompt)}>{title}</button>)}</div>
        <button type="button" className={`nx-button ${isListening ? 'nx-recording' : ''}`} onClick={toggleVoiceDictation} aria-pressed={isListening} style={{ minHeight: '48px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}><Mic size={18} aria-hidden="true" /><span>{isListening ? 'Parar de gravar' : 'Prefiro contar por voz'}</span></button>
        <p className="nx-helper">Você pode revisar o texto antes de continuar. O ditado depende do suporte do seu navegador.</p>
        <details className="nx-details"><summary>Quero incluir nomes ou uma frase especial</summary><Field label="Nomes que precisam aparecer"><input value={data.requiredNames || ''} onChange={e => updateField('requiredNames', e.target.value)} placeholder="Ex.: meus filhos Pedro e Laura" /></Field><Field label="Uma frase de vocês"><input value={data.requiredPhrase || ''} onChange={e => updateField('requiredPhrase', e.target.value)} placeholder="Ex.: sempre ao seu lado" /></Field></details>
      </section>
    );
  }

  if (step === 3) {
    const mainIds = ['Romântica', 'Sertanejo', 'MPB / Bossa Nova', 'Gospel / Adoração', 'Pop', 'Samba / Pagode'];
    const visibleStyles = showAllStyles ? stylesList : stylesList.filter(s => mainIds.includes(s.id) || s.id === data.musicStyle);
    const isStyleMissing = !data.musicStyle;
    return (
      <section className="nx-form-column">
        <h1>Como essa história<br />vai soar?</h1><p className="nx-subtitle">Escolha um estilo que tenha a ver com vocês.</p>
        
        <div
          data-missing={isStyleMissing ? "true" : undefined}
          style={isStyleMissing ? {
            borderRadius: '14px',
            padding: '10px 12px',
            margin: '10px 0',
            backgroundColor: '#fffdf7',
            border: '1.5px dashed #f59e0b',
            transition: 'all 0.25s ease'
          } : { transition: 'all 0.25s ease' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 650, color: 'var(--nx-ink)' }}>Estilo musical</span>
            {isStyleMissing && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#b45309',
                  backgroundColor: '#fef3c7',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid #fde68a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                Falta escolher o estilo
              </span>
            )}
          </div>
          <div className="nx-sound-grid" role="group" aria-label="Estilo musical">
            {visibleStyles.map(style => (
              <button key={style.id} type="button" aria-pressed={data.musicStyle === style.id} onClick={() => updateField('musicStyle', style.id)}>
                <strong>{style.label}</strong>
                <small>{style.desc}</small>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="nx-text-button" onClick={() => setShowAllStyles(v => !v)}>
          {showAllStyles ? 'Mostrar menos estilos' : 'Ver todos os estilos'}
        </button>

        <div className="nx-field-row">
          <Field
            label="Clima da música"
            isMissing={!data.musicMood}
            missingText="Falta selecionar"
          >
            <select
              value={data.musicMood || ''}
              onChange={e => updateField('musicMood', e.target.value)}
              style={!data.musicMood ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
            >
              <option value="">Escolha o clima</option>
              {moods.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          <Field
            label="Voz"
            isMissing={!data.voiceType}
            missingText="Falta escolher"
          >
            <select
              value={data.voiceType || ''}
              onChange={e => {
                const val = e.target.value;
                updateField('voiceType', val);
                if (val === 'minha_voz' && recognizedVoice?.voiceId) {
                  updateField('customVoiceId', recognizedVoice.voiceId);
                } else if (val !== 'minha_voz') {
                  updateField('customVoiceId', null);
                }
              }}
              style={!data.voiceType ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
            >
              <option value="">Escolha a voz</option>
              <option value="masculina">Masculina</option>
              <option value="feminina">Feminina</option>
              <option value="dueto">Dueto</option>
              {recognizedVoice && <option value="minha_voz">🎙️ Minha própria voz ({recognizedVoice.customerName || 'Cliente'})</option>}
            </select>
          </Field>
        </div>
        <p className="nx-helper">As preferências orientam a composição. Você ouve a prévia antes de decidir pela compra.</p>
      </section>
    );
  }

  if (step === 4) return (
    <section className="nx-form-column">
      <h1>Seu presente<br />começa assim.</h1><p className="nx-subtitle">Confira os detalhes antes de criar a letra.</p>
      <article className="nx-card nx-review">
        <span className="nx-eyebrow">{data.occasion}</span>
        <h2>Para {data.honoreeName}</h2>
        <p>
          De {data.customerName} · {data.musicStyle} · {data.musicMood}
          {data.voiceType && (
            <span> · Voz: {data.voiceType === 'minha_voz' ? '🎙️ Minha Própria Voz' : data.voiceType === 'feminina' ? 'Feminina' : data.voiceType === 'dueto' ? 'Dueto' : 'Masculina'}</span>
          )}
        </p>
        <p className="nx-story-review">{data.story}</p>
      </article>
      <Field label="Foto de capa (opcional)" help="Você também pode adicionar ou trocar a foto depois."><input type="file" accept="image/*" disabled={isUploadingCover} onChange={handleImageUpload} /></Field>
      {isUploadingCover && <p className="nx-helper" role="status">Enviando sua foto…</p>}
      {data.coverUrl && <Image src={data.coverUrl} alt="Sua foto de capa" width={96} height={96} unoptimized className="nx-upload-preview" />}
      <Field
        label="Seu WhatsApp para receber o link"
        help="Enviaremos o link para você acompanhar e ouvir a sua música."
        isMissing={phoneVerifyStatus !== 'valid'}
        missingText={!data.customerPhone ? 'WhatsApp obrigatório' : 'DDD + número de celular'}
      >
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={data.customerPhone || ''}
          onChange={e => handlePhoneChange(e.target.value)}
          placeholder="(11) 99999-9999"
          aria-invalid={phoneVerifyStatus === 'invalid'}
          style={phoneVerifyStatus !== 'valid' && data.customerPhone ? { borderColor: '#f59e0b', backgroundColor: '#fffdf5' } : {}}
        />
      </Field>
      {phoneVerifyMessage && <p className="nx-helper" role="status" style={{ color: phoneVerifyStatus === 'valid' ? '#16a34a' : phoneVerifyStatus === 'invalid' ? '#dc2626' : undefined, fontWeight: phoneVerifyStatus === 'valid' || phoneVerifyStatus === 'invalid' ? 600 : undefined }}>{phoneVerifyMessage.replace('❌ ', '')}</p>}

      {/* Verificando se o WhatsApp informado possui voz cadastrada */}
      {checkingVoice && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          borderRadius: '10px',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.84rem',
          color: '#b45309'
        }}>
          <span>⏳</span>
          <span>Verificando se este WhatsApp tem voz clonada cadastrada...</span>
        </div>
      )}

      {/* Card Dourado de Timbre Reconhecido */}
      {recognizedVoice && (
        <div
          style={{
            marginTop: '14px',
            marginBottom: '10px',
            padding: '16px',
            borderRadius: '16px',
            backgroundColor: '#fffbeb',
            border: '1.5px solid #f59e0b',
            boxShadow: '0 4px 18px rgba(245, 158, 11, 0.12)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#92400e', fontSize: '0.96rem' }}>
                <span>✨</span>
                <span>Timbre de Voz Reconhecido!</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#78350f', lineHeight: 1.45 }}>
                Olá, <strong>{recognizedVoice.customerName || 'Cliente'}</strong>! Identificamos o seu timbre de voz clonado ativo no estúdio. Deseja que esta nova música seja cantada com a <strong>sua própria voz</strong>?
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (data.voiceType === 'minha_voz') {
                  updateField('voiceType', 'masculina');
                  updateField('customVoiceId', null);
                } else {
                  updateField('voiceType', 'minha_voz');
                  updateField('customVoiceId', recognizedVoice.voiceId);
                }
              }}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: 'none',
                fontWeight: '800',
                fontSize: '0.86rem',
                cursor: 'pointer',
                background: data.voiceType === 'minha_voz'
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {data.voiceType === 'minha_voz' ? '✓ Cantando com Minha Voz' : '🎙️ Ativar Minha Voz'}
            </button>
          </div>

          <div style={{
            marginTop: '10px',
            fontSize: '0.80rem',
            padding: '6px 10px',
            borderRadius: '8px',
            backgroundColor: data.voiceType === 'minha_voz' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.1)',
            color: data.voiceType === 'minha_voz' ? '#065f46' : '#92400e',
            fontWeight: '600'
          }}>
            {data.voiceType === 'minha_voz'
              ? '🎤 Esta música será gravada e cantada exclusivamente com a sua voz!'
              : 'ℹ️ Voz padrão do estúdio selecionada. Clique no botão acima para cantar com a sua voz.'}
          </div>
        </div>
      )}

      <p className="nx-helper" style={{ fontSize: '0.82rem', color: '#534b57', margin: '10px 0 4px 0' }}>
        Ao prosseguir, você concorda com nossos <Link href="/termos-de-uso" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Termos de Uso</Link> e <Link href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Política de Privacidade</Link>.
      </p>
      <p className="nx-helper">Você revisa a letra antes de gerar a música. A foto é opcional.</p>
    </section>
  );
  return null;
}
