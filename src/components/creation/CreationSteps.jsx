'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { occasions, recipients, stylesList, moods } from '@/app/criar/wizardOptions';

const groups = [
  { id: 'family', label: 'Minha família', photo: '/experiencia/familia.webp', relations: ['Mãe', 'Pai', 'Filha', 'Filho', 'Vó', 'Vô', 'Irmã', 'Irmão', 'Tia', 'Tio', 'Primo(a)', 'Padrinho / Madrinha'] },
  { id: 'love', label: 'Meu amor', photo: '/experiencia/amor.webp', relations: ['Esposa', 'Marido', 'Namorada', 'Namorado', 'Noiva', 'Noivo'] },
  { id: 'friend', label: 'Amizade', relations: ['Amiga', 'Amigo'] },
  { id: 'self', label: 'Para mim', relations: ['Eu mesmo'] },
  { id: 'other', label: 'Outra pessoa', relations: [] },
];

function Field({ label, children, help }) {
  return <label className="nx-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
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
      {!isSelfTribute && <Field label="O que essa pessoa é sua?">
        <select value={data.relationship || ''} onChange={e => { updateField('relationship', e.target.value); updateField('recipientType', e.target.value); }}><option value="">Escolha a relação</option>{options.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      </Field>}
      {data.relationship === 'Outro' && <Field label="Qual é a relação de vocês?"><input value={data.customRelationship || ''} onChange={e => updateField('customRelationship', e.target.value)} placeholder="Ex.: minha sogra" maxLength={100} /></Field>}
      <div className="nx-field-row">
        <Field label="Nome de quem vai receber"><input value={data.honoreeName || ''} readOnly={isSelfTribute} onChange={e => updateField('honoreeName', e.target.value)} placeholder={isSelfTribute ? 'Seu próprio nome' : 'Ex.: Helena'} autoComplete="off" maxLength={100} /></Field>
        <Field label="Seu primeiro nome"><input value={data.customerName || ''} onChange={e => { updateField('customerName', e.target.value); if (isSelfTribute) updateField('honoreeName', e.target.value); }} placeholder="Ex.: Mariana" autoComplete="given-name" maxLength={100} /></Field>
      </div>
      {isSelfTribute && <p className="nx-helper">Esta homenagem será para você. Seu nome aparece nos dois campos.</p>}
      <Field label="Qual é a ocasião?"><select value={data.occasion || ''} onChange={e => updateField('occasion', e.target.value)}><option value="">Escolha o motivo</option>{occasions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
    </section>
  );

  if (step === 2) return (
    <section className="nx-form-column">
      <h1>Uma história que<br />só vocês têm.</h1>
      <p className="nx-subtitle">O que torna {data.honoreeName || 'essa pessoa'} especial? Não precisa escrever bonito, só do seu jeito.</p>
      <Field label="O que você gostaria de dizer?" help={`${(data.story || '').trim().length} caracteres · conte pelo menos 50 para começar.`}>
        <textarea value={data.story || ''} onChange={e => updateField('story', e.target.value)} placeholder="Conte uma lembrança, o que mais admira nessa pessoa e o que gostaria que ela sentisse ao ouvir..." rows={8} />
      </Field>
      <div className="nx-chips" role="group" aria-label="Ideias para sua história">{[
        ['Uma lembrança', 'Uma lembrança que guardo com carinho é '], ['Uma qualidade', 'O que mais admiro em você é '], ['Uma mensagem', 'Hoje eu queria te dizer que '],
      ].map(([title, prompt]) => <button key={title} type="button" onClick={() => appendStoryPrompt(prompt)}>{title}</button>)}</div>
      <button type="button" className={`nx-button ${isListening ? 'nx-recording' : ''}`} onClick={toggleVoiceDictation} aria-pressed={isListening}>{isListening ? 'Parar de gravar' : 'Prefiro contar por voz'}</button>
      <p className="nx-helper">Você pode revisar o texto antes de continuar. O ditado depende do suporte do seu navegador.</p>
      <details className="nx-details"><summary>Quero incluir nomes ou uma frase especial</summary><Field label="Nomes que precisam aparecer"><input value={data.requiredNames || ''} onChange={e => updateField('requiredNames', e.target.value)} placeholder="Ex.: meus filhos Pedro e Laura" /></Field><Field label="Uma frase de vocês"><input value={data.requiredPhrase || ''} onChange={e => updateField('requiredPhrase', e.target.value)} placeholder="Ex.: sempre ao seu lado" /></Field></details>
    </section>
  );

  if (step === 3) {
    const mainIds = ['Romântica', 'Sertanejo', 'MPB / Bossa Nova', 'Gospel / Adoração', 'Pop', 'Samba / Pagode'];
    const visibleStyles = showAllStyles ? stylesList : stylesList.filter(s => mainIds.includes(s.id) || s.id === data.musicStyle);
    return (
      <section className="nx-form-column">
        <h1>Como essa história<br />vai soar?</h1><p className="nx-subtitle">Escolha um estilo que tenha a ver com vocês.</p>
        <div className="nx-sound-grid" role="group" aria-label="Estilo musical">{visibleStyles.map(style => <button key={style.id} type="button" aria-pressed={data.musicStyle === style.id} onClick={() => updateField('musicStyle', style.id)}><strong>{style.label}</strong><small>{style.desc}</small></button>)}</div>
        <button type="button" className="nx-text-button" onClick={() => setShowAllStyles(v => !v)}>{showAllStyles ? 'Mostrar menos estilos' : 'Ver todos os estilos'}</button>
        <div className="nx-field-row"><Field label="Clima da música"><select value={data.musicMood || ''} onChange={e => updateField('musicMood', e.target.value)}><option value="">Escolha o clima</option>{moods.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field><Field label="Voz"><select value={data.voiceType || ''} onChange={e => updateField('voiceType', e.target.value)}><option value="masculina">Masculina</option><option value="feminina">Feminina</option><option value="dueto">Dueto</option>{recognizedVoice && <option value="minha_voz">Minha voz cadastrada</option>}</select></Field></div>
        <p className="nx-helper">As preferências orientam a composição. Você ouve a prévia antes de decidir pela compra.</p>
      </section>
    );
  }

  if (step === 4) return (
    <section className="nx-form-column">
      <h1>Seu presente<br />começa assim.</h1><p className="nx-subtitle">Confira os detalhes antes de criar a letra.</p>
      <article className="nx-card nx-review">
        <span className="nx-eyebrow">{data.occasion}</span><h2>Para {data.honoreeName}</h2><p>De {data.customerName} · {data.musicStyle} · {data.musicMood}</p><p className="nx-story-review">{data.story}</p>
      </article>
      <Field label="Foto de capa (opcional)" help="Você também pode adicionar ou trocar a foto depois."><input type="file" accept="image/*" disabled={isUploadingCover} onChange={handleImageUpload} /></Field>
      {isUploadingCover && <p className="nx-helper" role="status">Enviando sua foto…</p>}
      {data.coverUrl && <Image src={data.coverUrl} alt="Sua foto de capa" width={96} height={96} unoptimized className="nx-upload-preview" />}
      <Field label="Seu WhatsApp para receber o link" help="Enviaremos o link para você acompanhar e ouvir a sua música."><input type="tel" inputMode="tel" autoComplete="tel" value={data.customerPhone || ''} onChange={e => handlePhoneChange(e.target.value)} placeholder="(11) 99999-9999" aria-invalid={phoneVerifyStatus === 'invalid'} /></Field>
      {phoneVerifyMessage && <p className="nx-helper" role="status" style={{ color: phoneVerifyStatus === 'valid' ? '#16a34a' : phoneVerifyStatus === 'invalid' ? '#dc2626' : undefined, fontWeight: phoneVerifyStatus === 'valid' || phoneVerifyStatus === 'invalid' ? 600 : undefined }}>{phoneVerifyMessage.replace('❌ ', '')}</p>}
      <p className="nx-helper" style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '10px 0 4px 0' }}>
        Ao prosseguir, você concorda com nossos <Link href="/termos-de-uso" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Termos de Uso</Link> e <Link href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Política de Privacidade</Link>.
      </p>
      <p className="nx-helper">Você revisa a letra antes de gerar a música. A foto é opcional.</p>
    </section>
  );
  return null;
}
