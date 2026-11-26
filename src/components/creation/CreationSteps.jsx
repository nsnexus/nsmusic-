'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Mic, Sparkles } from 'lucide-react';
import { recipients, stylesList, moods } from '@/app/criar/wizardOptions';
import Icone3D from './Icone3D';

const RECIPIENT_CARDS = [
  { id: 'namorado', label: 'Namorada / Namorado', icon: '💗', sub: 'Amor & paixão', relations: ['Namorada', 'Namorado'] },
  { id: 'esposa', label: 'Esposa / Marido', icon: '💍', sub: 'Casamento', relations: ['Esposa', 'Marido'] },
  { id: 'mae', label: 'Mãe / Pai', icon: '👩', sub: 'Família querida', relations: ['Mãe', 'Pai'] },
  { id: 'filho', label: 'Filho / Filha', icon: '🧒', sub: 'Amor de filho', relations: ['Filha', 'Filho'] },
  { id: 'amigo', label: 'Amiga / Amigo', icon: '🤝', sub: 'Amizade verdadeira', relations: ['Amiga', 'Amigo'] },
  { id: 'irmao', label: 'Irmã / Irmão', icon: '👫', sub: 'Irmandade', relations: ['Irmã', 'Irmão'] },
  { id: 'avo', label: 'Vó / Vô', icon: '👵', sub: 'Carinho de avós', relations: ['Vó', 'Vô'] },
  { id: 'neto', label: 'Neta / Neto', icon: '🧸', sub: 'Amor de avós', relations: ['Neta', 'Neto'] },
  { id: 'sobrinho', label: 'Sobrinha / Sobrinho', icon: '🎈', sub: 'Carinho de tios', relations: ['Sobrinha', 'Sobrinho'] },
  { id: 'familia', label: 'Família toda', icon: '👨‍👩‍👧', sub: 'Homenagem familiar', value: 'Família' },
  { id: 'self', label: 'Para mim', icon: '🎤', sub: 'Minha própria canção', value: 'Eu mesmo' },
  { id: 'outro', label: 'Outro (eu escrevo)', icon: '✍️', sub: 'Personalizado' },
];

const OCASIAO_CARDS = [
  { id: 'Aniversário', label: 'Aniversário', icon: '🎂' },
  { id: 'Declaração de Amor', label: 'Declaração de amor', icon: '💌' },
  { id: 'Aniv. de Casamento', label: 'Aniv. de casamento', icon: '💎' },
  { id: 'Homenagem', label: 'Homenagem', icon: '🌟' },
  { id: 'Surpresa', label: 'Surpresa', icon: '🎁' },
  { id: 'Dia das Mães', label: 'Dia das Mães', icon: '🌷' },
  { id: 'Dia dos Namorados', label: 'Dia dos Namorados', icon: '💝' },
  { id: 'Pedido de Namoro', label: 'Pedido de namoro', icon: '💍' },
  { id: 'Aniversário de Namoro', label: 'Aniv. de namoro', icon: '💞' },
  { id: 'Casamento', label: 'Casamento', icon: '💒' },
  { id: 'Formatura', label: 'Formatura', icon: '🎓' },
  { id: 'Outro', label: 'Outro motivo...', icon: '✨' },
];

const GENERO_CARDS = [
  { id: 'Sertanejo Universitário', label: 'Sertanejo Universitário', icon: '🤠', sub: 'Moderno e romântico' },
  { id: 'Sertanejo Raiz', label: 'Sertanejo Raiz', icon: '🪕', sub: 'Modão e viola caipira' },
  { id: 'Romântica', label: 'Romântica / Pop', icon: '💖', sub: 'Suave e envolvente' },
  { id: 'Samba / Pagode', label: 'Pagode / Samba', icon: '🥁', sub: 'Alegre e descontraído' },
  { id: 'Natal', label: 'Natal', icon: '🎄', sub: 'Sinos e clima natalino' },
  { id: 'Gospel / Adoração', label: 'Gospel / Louvor', icon: '⛪', sub: 'Fé e inspiração' },
  { id: 'MPB / Bossa Nova', label: 'MPB / Acústico', icon: '☕', sub: 'Voz e violão intimista' },
  { id: 'Forró / Baião', label: 'Forró / Piseiro', icon: '🪗', sub: 'Ritmo dançante' },
  { id: 'Carimbó', label: 'Carimbó', icon: '🪘', sub: 'Ritmo paraense, tambor e roda' },
  { id: 'Trap / Rap', label: 'Trap / Rap', icon: '🎙️', sub: 'Batidas modernas' },
  { id: 'Trap Acústico', label: 'Trap Acústico', icon: '🎸', sub: 'Violão e batidas trap' },
  { id: 'Rock', label: 'Rock', icon: '🎸', sub: 'Marcante com guitarras' },
  { id: 'K-Pop', label: 'K-Pop', icon: '✨', sub: 'Moderno e contagiante' },
  { id: 'Flash Back', label: 'Flash Back', icon: '🪩', sub: 'Clássicos 70, 80 e 90' },
  { id: 'Pagode Anos 90', label: 'Pagode Anos 90', icon: '🪕', sub: 'Nostálgico e romântico' },
];

const CLIMA_CARDS = [
  { id: 'Emocionante', label: 'Emocionante', icon: '🥹', sub: 'Tocar o coração e emocionar' },
  { id: 'Alegre', label: 'Alegre / Feliz', icon: '😄', sub: 'Vibe positiva e alto astral' },
  { id: 'Romântica', label: 'Romântica', icon: '💖', sub: 'Declaração amorosa e carinho' },
  { id: 'Calma', label: 'Calma / Aconchegante', icon: '🍃', sub: 'Suave, relaxante e intimista' },
  { id: 'Nostálgica', label: 'Nostálgica', icon: '🍂', sub: 'Recordações e boas saudades' },
  { id: 'Energética', label: 'Energética', icon: '🔥', sub: 'Vibe vibrante e ritmo forte' },
  { id: 'Festiva', label: 'Festiva', icon: '🎉', sub: 'Clima de celebração e festa' },
  { id: 'Inspiradora', label: 'Inspiradora', icon: '✨', sub: 'Superação, força e fé' },
  { id: 'Divertida', label: 'Divertida', icon: '☀️', sub: 'Bem-humorada, leve e alegre' },
  { id: 'Melancólica', label: 'Melancólica', icon: '🕊️', sub: 'Saudade e homenagem querida' },
];

export function CreationEditorial() {
  return (
    <aside className="nx-editorial">
      <Image unoptimized src="/experiencia/familia.webp" alt="Mãe e filha compartilhando um momento de carinho" width={1280} height={853} sizes="(max-width: 800px) 100vw, 430px" />
      <div><p className="nx-editorial-title">Tem sentimento que merece virar canção.</p><p>Você conta a história. Ela ganha letra, melodia e um lugar especial na memória.</p></div>
      <small>Imagem editorial ilustrativa.</small>
    </aside>
  );
}

export default function CreationSteps({
  step,
  formData: data,
  updateField,
  showValidation = false,
  isListening,
  toggleVoiceDictation,
  appendStoryPrompt,
  isUploadingCover,
  handleImageUpload,
  handlePhoneChange,
  phoneVerifyStatus,
  phoneVerifyMessage,
  recognizedVoice,
  checkingVoice,
  isSelfTribute,
  setIsSelfTribute
}) {
  const [chosenCardId, setChosenCardId] = useState(null);
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [showCustomOccasion, setShowCustomOccasion] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [storySuggestionError, setStorySuggestionError] = useState('');
  const previousRecipient = useRef(null);

  const handleSuggestStory = async () => {
    setIsGeneratingStory(true);
    setStorySuggestionError('');
    try {
      const res = await fetch('/api/lyrics/suggest-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          honoreeName: data.honoreeName || '',
          customerName: data.customerName || '',
          relationship: data.relationship || '',
          occasion: data.occasion || '',
        }),
      });
      const json = await res.json();
      if (res.ok && json.suggestion) {
        updateField('story', json.suggestion);
      } else {
        setStorySuggestionError(json.error || 'Não foi possível gerar a sugestão agora.');
      }
    } catch {
      setStorySuggestionError('Erro ao conectar com o gerador de histórias. Tente novamente.');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  // Mapeia relacionamento atual para o card selecionado
  const getActiveCardId = () => {
    if (isSelfTribute || data.relationship === 'Eu mesmo') return 'self';
    if (['Namorada', 'Namorado', 'Meu amor'].includes(data.relationship)) return 'namorado';
    if (['Esposa', 'Marido'].includes(data.relationship)) return 'esposa';
    if (['Mãe', 'Pai'].includes(data.relationship)) return 'mae';
    if (['Filha', 'Filho'].includes(data.relationship)) return 'filho';
    if (['Amiga', 'Amigo'].includes(data.relationship)) return 'amigo';
    if (['Irmã', 'Irmão'].includes(data.relationship)) return 'irmao';
    if (['Vó', 'Vô'].includes(data.relationship)) return 'avo';
    if (['Neta', 'Neto'].includes(data.relationship)) return 'neto';
    if (['Sobrinha', 'Sobrinho'].includes(data.relationship)) return 'sobrinho';
    if (data.relationship === 'Família') return 'familia';
    if (data.relationship === 'Outro' || data.customRelationship) return 'outro';
    return chosenCardId;
  };

  const activeCardId = getActiveCardId();

  const handleCardClick = (card) => {
    setChosenCardId(card.id);

    if (card.id === 'self') {
      previousRecipient.current = { honoreeName: data.honoreeName, relationship: data.relationship, recipientType: data.recipientType };
      setIsSelfTribute(true);
      updateField('honoreeName', data.customerName || '');
      updateField('relationship', 'Eu mesmo');
      updateField('recipientType', 'Eu mesmo');
      return;
    }

    if (isSelfTribute) {
      setIsSelfTribute(false);
      updateField('honoreeName', previousRecipient.current?.honoreeName || '');
    }

    if (card.value) {
      updateField('relationship', card.value);
      updateField('recipientType', card.value);
      return;
    }

    if (card.relations && card.relations.length > 0) {
      // Cards com duas opções (Mãe / Pai etc.) não pré-selecionam: a pessoa precisa escolher de
      // propósito, senão muita gente segue sem perceber que ficou "Pai" marcado.
      if (!card.relations.includes(data.relationship)) {
        if (card.relations.length > 1) {
          updateField('relationship', '');
          updateField('recipientType', '');
        } else {
          updateField('relationship', card.relations[0]);
          updateField('recipientType', card.relations[0]);
        }
      }
      return;
    }

    if (card.id === 'outro') {
      updateField('relationship', 'Outro');
      updateField('recipientType', 'Outro');
    }
  };

  /* ========================================================
     ETAPA 1: QUEM VAI RECEBER + NOMES + OCASIÃO (ESTILO CAPIVARINHA)
     ======================================================== */
  if (step === 1) {
    const isRelMissing = showValidation && !isSelfTribute && !data.relationship?.trim();
    const isCustomRelMissing = showValidation && data.relationship === 'Outro' && !data.customRelationship?.trim();
    const isHonoreeMissing = showValidation && !data.honoreeName?.trim();
    const isCustomerMissing = showValidation && !data.customerName?.trim();
    const isOccasionMissing = showValidation && !data.occasion;

    const quickOccasionIds = OCASIAO_CARDS.map(o => o.id).filter(id => id !== 'Outro');
    const isOccasionInQuick = quickOccasionIds.includes(data.occasion);

    const activeCardObj = RECIPIENT_CARDS.find(c => c.id === activeCardId);
    const normNome = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const namesLookSwapped = Boolean(normNome(data.honoreeName)) && normNome(data.honoreeName) === normNome(data.customerName);

    return (
      <section className="nx-form-column" style={{ width: '100%', maxWidth: '34rem', margin: '0 auto' }}>
        {/* 1. QUEM VAI RECEBER (GRID 2-COL DE CARDS) */}
        <div data-missing={isRelMissing ? "true" : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h1 className="wz-t" style={{ margin: 0 }}>Quem vai receber</h1>
            {isRelMissing && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                ● Escolha uma opção
              </span>
            )}
          </div>
          <div className="wz-s">Escolha para quem você quer criar este presente especial.</div>

          <div className="cards2" role="group" aria-label="Quem vai receber">
            {RECIPIENT_CARDS.map(card => {
              const isSelected = activeCardId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleCardClick(card)}
                  className={`card2 ${isSelected ? 'on' : ''}`}
                >
                  <Icone3D emoji={card.icon} prioridade />
                  <span className="c2-lb">{card.label}</span>
                  {card.sub && <span className="c2-sub">{card.sub}</span>}
                </button>
              );
            })}
          </div>

          {/* Sub-pills se a categoria tem mais de uma variação (ex: Namorada vs Namorado, Mãe vs Pai) */}
          {activeCardObj && activeCardObj.relations && activeCardObj.relations.length > 1 && (
            <div data-missing={!data.relationship ? 'true' : undefined} style={{
              margin: '-4px 0 16px',
              padding: '10px 14px',
              borderRadius: '14px',
              background: !data.relationship ? '#fffbeb' : '#f8fafc',
              border: !data.relationship ? (showValidation ? '1.5px solid #dc2626' : '1.5px solid #f59e0b') : '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: !data.relationship ? (showValidation ? '#dc2626' : '#b45309') : '#4f46e5' }}>
                {!data.relationship ? `Escolha: ${activeCardObj.relations.join(' ou ')}` : 'Quem é?'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {activeCardObj.relations.map(rel => {
                  const isRelActive = data.relationship === rel;
                  return (
                    <button
                      key={rel}
                      type="button"
                      onClick={() => {
                        updateField('relationship', rel);
                        updateField('recipientType', rel);
                      }}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '100px',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        border: isRelActive ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                        backgroundColor: isRelActive ? '#4f46e5' : '#ffffff',
                        color: isRelActive ? '#ffffff' : '#1e293b',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {rel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Input para caso 'Outro' */}
          {activeCardId === 'outro' && (
            <div style={{ margin: '-4px 0 16px' }}>
              <input
                className={`wz-inp ${isCustomRelMissing ? 'erro' : ''}`}
                value={data.customRelationship || ''}
                onChange={e => updateField('customRelationship', e.target.value)}
                placeholder="Qual é a relação de vocês? (Ex: minha sogra, meu treinador)..."
                maxLength={100}
              />
            </div>
          )}
        </div>

        {/* 2. NOMES NA MÚSICA */}
        <div style={{ marginTop: '1.4rem' }}>
          {!isSelfTribute && (
            <>
              <div className="wz-t">Nome de quem vai receber</div>
              <div className="wz-s">
                A <b>pessoa homenageada</b>: o nome ou apelido dela aparece na letra <b>exatamente como você escrever</b>.
              </div>

              <div data-missing={isHonoreeMissing ? "true" : undefined} style={{ marginBottom: '14px' }}>
                <label htmlFor="wz-nome-homenageado" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E1418', marginBottom: '6px' }}>
                  Nome de quem recebe o presente *
                </label>
                <input
                  id="wz-nome-homenageado"
                  className={`wz-inp ${isHonoreeMissing ? 'erro' : ''}`}
                  value={data.honoreeName || ''}
                  onChange={e => updateField('honoreeName', e.target.value)}
                  placeholder="Ex: Helena"
                  autoComplete="off"
                  maxLength={100}
                />
                {isHonoreeMissing && (
                  <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                    ● Digite o nome de quem vai receber
                  </span>
                )}
              </div>
            </>
          )}

          {isSelfTribute && (
            <>
              <div className="wz-t">Seu nome</div>
              <div className="wz-s">A música é sua: o nome que você digitar aparece na letra <b>exatamente como escrever</b>.</div>
            </>
          )}

          <div data-missing={isCustomerMissing ? "true" : undefined} style={{ marginBottom: '16px' }}>
            <label htmlFor="wz-nome-cliente" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E1418', marginBottom: '6px' }}>
              {isSelfTribute ? 'Seu primeiro nome *' : 'Seu primeiro nome (você, que está dando o presente) *'}
            </label>
            <input
              id="wz-nome-cliente"
              className={`wz-inp ${isCustomerMissing ? 'erro' : ''}`}
              value={data.customerName || ''}
              onChange={e => {
                updateField('customerName', e.target.value);
                if (isSelfTribute) updateField('honoreeName', e.target.value);
              }}
              placeholder="Ex: Mariana"
              autoComplete="given-name"
              maxLength={100}
            />
            {isCustomerMissing && (
              <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                ● Digite o seu primeiro nome
              </span>
            )}
            {!isSelfTribute && namesLookSwapped && (
              <div role="alert" style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', fontSize: '0.84rem', lineHeight: 1.4 }}>
                Os dois nomes estão iguais. O campo de cima é de <b>quem vai receber</b> o presente; este é o <b>seu</b> nome. Confira antes de continuar.
              </div>
            )}
          </div>
        </div>

        {/* 3. QUAL É A OCASIÃO (GRID 2-COL DE CARDS) */}
        <div data-missing={isOccasionMissing ? "true" : undefined} style={{ marginTop: '1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="wz-t" style={{ margin: 0 }}>Qual a ocasião?</div>
            {isOccasionMissing && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                ● Escolha uma ocasião
              </span>
            )}
          </div>
          <div className="wz-s">Isso deixa a música na medida certa para o momento.</div>

          <div className="cards2" role="group" aria-label="Qual a ocasião">
            {OCASIAO_CARDS.map(occ => {
              const isSelected = occ.id === 'Outro'
                ? (showCustomOccasion || (!isOccasionInQuick && !!data.occasion))
                : data.occasion === occ.id;

              return (
                <button
                  key={occ.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (occ.id === 'Outro') {
                      setShowCustomOccasion(true);
                      if (isOccasionInQuick) updateField('occasion', '');
                    } else {
                      setShowCustomOccasion(false);
                      updateField('occasion', occ.id);
                    }
                  }}
                  className={`card2 ${isSelected ? 'on' : ''}`}
                >
                  <Icone3D emoji={occ.icon} />
                  <span className="c2-lb">{occ.label}</span>
                </button>
              );
            })}
          </div>

          {(showCustomOccasion || (!isOccasionInQuick && !!data.occasion)) && (
            <div style={{ marginTop: '10px' }}>
              <label htmlFor="wz-ocasiao-outra" className="wz-s" style={{ display: 'block', marginBottom: '6px' }}>Qual é a ocasião?</label>
              <input
                id="wz-ocasiao-outra"
                type="text"
                className="wz-inp"
                maxLength={60}
                autoFocus
                value={isOccasionInQuick ? '' : (data.occasion || '')}
                onChange={e => updateField('occasion', e.target.value)}
                placeholder="Ex: Bodas de prata, Despedida, Volta por cima..."
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  /* ========================================================
     ETAPA 2: A HISTÓRIA DE VOCÊS (TEXTAREA + VOZ + SUGESTÕES)
     ======================================================== */
  if (step === 2) {
    const storyLen = (data.story || '').trim().length;
    const isStoryMissing = showValidation && storyLen < 50;

    return (
      <section className="nx-form-column" style={{ width: '100%', maxWidth: '34rem', margin: '0 auto' }}>
        <h1 className="wz-t" style={{ margin: 0 }}>A história de vocês</h1>
        <div className="wz-s">
          Conte momentos marcantes, apelidos carinhosos ou o que torna {data.honoreeName || 'essa pessoa'} tão especial. Não precisa rimar, conte do seu jeito sincero!
        </div>

        <div data-missing={isStoryMissing ? "true" : undefined}>
          <textarea
            className={`wz-inp ${isStoryMissing ? 'erro' : ''}`}
            value={data.story || ''}
            onChange={e => updateField('story', e.target.value)}
            placeholder="A gente se conheceu... chamo de... o que mais admiro é... queria que essa música dissesse que..."
            rows={8}
            style={{ minHeight: '8.5rem', lineHeight: 1.6 }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: storyLen >= 50 ? '#16a34a' : '#857D80', fontWeight: 600 }}>
              {storyLen} caracteres · mínimo de 50
            </span>
            {isStoryMissing && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                ● Escreva pelo menos 50 letras
              </span>
            )}
          </div>
        </div>

        {/* Botão de Sugestão de História com IA (ChatGPT / Gemini) */}
        <div style={{ marginTop: '14px', marginBottom: '12px' }}>
          <button
            type="button"
            onClick={handleSuggestStory}
            disabled={isGeneratingStory}
            style={{
              width: '100%',
              minHeight: '48px',
              padding: '12px 18px',
              borderRadius: '100px',
              border: '1.5px solid #c7d2fe',
              background: 'linear-gradient(135deg, #eef2ff 0%, #ede9fe 100%)',
              color: '#4338ca',
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: isGeneratingStory ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 10px rgba(79, 70, 229, 0.08)',
              transition: 'all 0.2s ease',
              opacity: isGeneratingStory ? 0.75 : 1,
            }}
          >
            <Sparkles size={18} style={{ color: '#6366f1', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>{isGeneratingStory ? 'Criando sua história...' : 'Sugerir história com IA'}</span>
          </button>
          {storySuggestionError && (
            <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '6px', textAlign: 'center' }}>
              {storySuggestionError}
            </div>
          )}
        </div>

        {/* Botão de gravação por voz */}
        <button
          type="button"
          className={`nx-button ${isListening ? 'nx-recording' : ''}`}
          onClick={toggleVoiceDictation}
          aria-pressed={isListening}
          style={{
            width: '100%',
            minHeight: '48px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.92rem',
            borderRadius: '100px',
            border: '1.5px solid #e0e7ff',
            backgroundColor: isListening ? '#fef2f2' : '#f8fafc',
            color: isListening ? '#dc2626' : '#475569',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          {isListening ? (
            <span className="rec-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          ) : (
            <Mic size={18} aria-hidden="true" />
          )}
          <span style={{ whiteSpace: 'nowrap' }}>{isListening ? 'Gravando… toque para parar' : 'Prefiro contar por áudio / voz'}</span>
        </button>
      </section>
    );
  }

  /* ========================================================
     ETAPA 3: GÊNERO MUSICAL, CLIMA E TIPO DE VOZ (CARDS)
     ======================================================== */
  if (step === 3) {
    const isStyleMissing = showValidation && !data.musicStyle;
    const isMoodMissing = showValidation && !data.musicMood;
    const isVoiceMissing = showValidation && !data.voiceType;

    return (
      <section className="nx-form-column" style={{ width: '100%', maxWidth: '34rem', margin: '0 auto' }}>
        {/* 1. GÊNERO MUSICAL */}
        <div data-missing={isStyleMissing ? "true" : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="wz-t" style={{ margin: 0 }}>Gênero musical</div>
            {isStyleMissing && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                ● Escolha um estilo
              </span>
            )}
          </div>
          <div className="wz-s">O ritmo define a harmonia e a emoção da melodia.</div>

          <div className="cards2" role="group" aria-label="Gênero musical">
            {GENERO_CARDS.map(g => {
              const isSelected = data.musicStyle === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => updateField('musicStyle', g.id)}
                  className={`card2 ${isSelected ? 'on' : ''}`}
                >
                  {g.destaque && !isSelected && <span className="c2-selo">⭐ Mais pedido</span>}
                  <Icone3D emoji={g.icon} />
                  <span className="c2-lb">{g.label}</span>
                  <span className="c2-sub">{g.sub}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="nx-text-button"
            onClick={() => setShowAllStyles(v => !v)}
            style={{ marginBottom: '16px', fontSize: '0.84rem', color: '#4f46e5', fontWeight: 700 }}
          >
            {showAllStyles ? '↑ Mostrar menos estilos' : '↓ Ver todos os estilos (+10 opções)'}
          </button>

          {showAllStyles && (
            <div className="cards2" style={{ marginBottom: '16px' }}>
              {stylesList
                .filter(s => !GENERO_CARDS.some(g => g.id === s.id))
                .map(s => {
                  const isSelected = data.musicStyle === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => updateField('musicStyle', s.id)}
                      className={`card2 ${isSelected ? 'on' : ''}`}
                    >
                      <Icone3D emoji={s.icon || '🎵'} />
                      <span className="c2-lb">{s.label}</span>
                      <span className="c2-sub">{s.desc}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* 2. CLIMA DA MÚSICA */}
        <div data-missing={isMoodMissing ? "true" : undefined} style={{ marginTop: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="wz-t" style={{ margin: 0 }}>Clima da música</div>
            {isMoodMissing && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                ● Escolha o clima
              </span>
            )}
          </div>
          <div className="wz-s">Qual sentimento deve predominar na canção?</div>

          <div className="cards2" role="group" aria-label="Clima da música">
            {CLIMA_CARDS.map(c => {
              const isSelected = data.musicMood === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => updateField('musicMood', c.id)}
                  className={`card2 ${isSelected ? 'on' : ''}`}
                >
                  <Icone3D emoji={c.icon} />
                  <span className="c2-lb">{c.label}</span>
                  <span className="c2-sub">{c.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. TIPO DE VOZ */}
        <div data-missing={isVoiceMissing ? "true" : undefined} style={{ marginTop: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="wz-t" style={{ margin: 0 }}>Tipo de voz</div>
            {isVoiceMissing && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                ● Escolha a voz
              </span>
            )}
          </div>
          <div className="wz-s">Quem você quer que cante a sua música?</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            {[
              { id: 'masculina', label: 'Voz Masculina', icon: '🎙️', sub: 'Voz grave e marcante' },
              { id: 'feminina', label: 'Voz Feminina', icon: '🎙️', sub: 'Voz doce e expressiva' },
              { id: 'dueto', label: 'Dueto (Casal)', icon: '🎤', sub: 'Masc. + Feminina' },
            ].map(v => {
              const isSelected = data.voiceType === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    updateField('voiceType', v.id);
                    updateField('customVoiceId', null);
                  }}
                  className={`card2 ${isSelected ? 'on' : ''}`}
                  style={{ minHeight: '5.2rem' }}
                >
                  <Icone3D emoji={v.icon} />
                  <span className="c2-lb">{v.label}</span>
                  <span className="c2-sub">{v.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  /* ========================================================
     ETAPA 4: RESUMO & WHATSAPP
     ======================================================== */
  if (step === 4) {
    const isPhoneMissing = showValidation && phoneVerifyStatus !== 'valid';

    return (
      <section className="nx-form-column" style={{ width: '100%', maxWidth: '34rem', margin: '0 auto' }}>
        <div className="wz-t">Seu presente começa assim</div>
        <div className="wz-s">Confira o resumo antes de gerar a letra personalizada com a IA.</div>

        {/* Card Resumo */}
        <article className="nx-card nx-review" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '16px', backgroundColor: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>Para {data.honoreeName}</h2>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4338ca', backgroundColor: '#eef2ff', padding: '2px 8px', borderRadius: '6px' }}>
              {data.occasion || 'Homenagem'}
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', margin: '0 0 10px', color: '#64748b' }}>
            De {data.customerName} · {data.musicStyle} · {data.musicMood}
            {data.voiceType && (
              <span> · Voz: {data.voiceType === 'minha_voz' ? '🎙️ Própria' : data.voiceType === 'feminina' ? 'Feminina' : data.voiceType === 'dueto' ? 'Dueto' : 'Masculina'}</span>
            )}
          </p>
          <p className="nx-story-review" style={{ fontSize: '0.84rem', lineHeight: 1.5, maxHeight: '130px', overflowY: 'auto', color: '#334155' }}>
            {data.story}
          </p>
        </article>

        {/* Foto de Capa (Opcional) */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E1418', marginBottom: '4px' }}>
            Foto de capa (opcional)
          </label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#857D80', marginBottom: '8px' }}>
            Ela estampa o disco da sua música. Você também pode adicionar depois de ouvir.
          </span>
          <input type="file" accept="image/*" disabled={isUploadingCover} onChange={handleImageUpload} />
          {isUploadingCover && <p className="nx-helper" role="status">Enviando foto...</p>}
          {data.coverUrl && <Image src={data.coverUrl} alt="Sua foto de capa" width={96} height={96} unoptimized className="nx-upload-preview" style={{ marginTop: '8px', borderRadius: '12px' }} />}
        </div>

        {/* Campo WhatsApp */}
        <div data-missing={isPhoneMissing ? "true" : undefined} style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E1418', marginBottom: '4px' }}>
            Seu WhatsApp *
          </label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#857D80', marginBottom: '8px' }}>
            É com ele que você acha sua música depois em Minha conta, para ouvir e baixar quando quiser.
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={`wz-inp ${isPhoneMissing ? 'erro' : ''}`}
            value={data.customerPhone || ''}
            onChange={e => handlePhoneChange(e.target.value)}
            placeholder="(11) 99999-9999"
          />
          {phoneVerifyMessage && (
            <p style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              marginTop: '6px',
              color: phoneVerifyStatus === 'valid' ? '#16a34a' : phoneVerifyStatus === 'invalid' ? '#dc2626' : '#857D80'
            }}>
              {phoneVerifyMessage.replace('❌ ', '')}
            </p>
          )}
        </div>

        {/* Verificação de Timbre */}
        {checkingVoice && (
          <div style={{ padding: '8px 12px', borderRadius: '10px', backgroundColor: '#eef2ff', border: '1px solid #e0e7ff', color: '#4338ca', fontSize: '0.84rem' }}>
            ⏳ Verificando se este WhatsApp possui voz cadastrada...
          </div>
        )}

        {/* Voz Clonada Reconhecida */}
        {recognizedVoice && (
          <div style={{
            marginTop: '12px',
            marginBottom: '12px',
            padding: '14px',
            borderRadius: '16px',
            backgroundColor: '#f5f3ff',
            border: '1.5px solid #7c3aed'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span style={{ fontWeight: 800, color: '#6d28d9', fontSize: '0.92rem' }}>✨ Timbre de Voz Reconhecido!</span>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#1e1b4b' }}>
                  Olá, <strong>{recognizedVoice.customerName || 'Cliente'}</strong>! Deseja cantar com a sua própria voz clonada?
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
                className="btn-wz-primary"
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                {data.voiceType === 'minha_voz' ? '✓ Minha Voz Ativa' : '🎙️ Ativar Minha Voz'}
              </button>
            </div>
          </div>
        )}

        <p className="nx-helper" style={{ fontSize: '0.78rem', color: '#857D80', marginTop: '14px' }}>
          Ao continuar, você concorda com nossos <Link href="/termos-de-uso" target="_blank" style={{ textDecoration: 'underline' }}>Termos</Link> e <Link href="/politica-de-privacidade" target="_blank" style={{ textDecoration: 'underline' }}>Privacidade</Link>. Você revisará a letra antes de compor a música.
        </p>
      </section>
    );
  }

  return null;
}
