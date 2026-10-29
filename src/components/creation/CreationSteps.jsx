'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Mic } from 'lucide-react';
import { occasions, recipients, stylesList, moods } from '@/app/criar/wizardOptions';

const RECIPIENT_CARDS = [
  { id: 'namorado', label: 'Namorada / Namorado', icon: '💗', sub: 'Amor & paixão', relations: ['Namorada', 'Namorado'] },
  { id: 'esposa', label: 'Esposa / Marido', icon: '💍', sub: 'Casamento', relations: ['Esposa', 'Marido'] },
  { id: 'mae', label: 'Mãe / Pai', icon: '👩', sub: 'Família querida', relations: ['Mãe', 'Pai'] },
  { id: 'filho', label: 'Filho / Filha', icon: '🧒', sub: 'Amor de filho', relations: ['Filha', 'Filho'] },
  { id: 'amigo', label: 'Amiga / Amigo', icon: '🤝', sub: 'Amizade verdadeira', relations: ['Amiga', 'Amigo'] },
  { id: 'irmao', label: 'Irmã / Irmão', icon: '👫', sub: 'Irmandade', relations: ['Irmã', 'Irmão'] },
  { id: 'avo', label: 'Vó / Vô', icon: '👵', sub: 'Carinho de avós', relations: ['Vó', 'Vô'] },
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
  { id: 'Sertanejo', label: 'Sertanejo', icon: '🤠', sub: 'Romântico ou modão', destaque: true },
  { id: 'Romântica', label: 'Romântica / Pop', icon: '💖', sub: 'Suave e envolvente' },
  { id: 'Samba / Pagode', label: 'Pagode / Samba', icon: '🥁', sub: 'Alegre e descontraído' },
  { id: 'Gospel / Adoração', label: 'Gospel / Louvor', icon: '⛪', sub: 'Fé e inspiração' },
  { id: 'MPB / Bossa Nova', label: 'MPB / Acústico', icon: '☕', sub: 'Voz e violão intimista' },
  { id: 'Forró / Baião', label: 'Forró / Piseiro', icon: '🪗', sub: 'Ritmo dançante' },
  { id: 'Trap / Rap', label: 'Trap / Rap', icon: '🎙️', sub: 'Batidas modernas' },
  { id: 'Rock', label: 'Rock', icon: '🎸', sub: 'Marcante com guitarras' },
];

const CLIMA_CARDS = [
  { id: 'Emocionante', label: 'Emocionante', icon: '🥹', sub: 'Letra profunda e marcante' },
  { id: 'Alegre', label: 'Alegre / Feliz', icon: '😄', sub: 'Vibe positiva e animada' },
  { id: 'Romântica', label: 'Romântico', icon: '💖', sub: 'Puro sentimento e paixão' },
  { id: 'Aconchegante', label: 'Aconchegante', icon: '🕊️', sub: 'Suave, carinhoso e calmo' },
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
  const previousRecipient = useRef(null);

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
      if (!card.relations.includes(data.relationship)) {
        updateField('relationship', card.relations[0]);
        updateField('recipientType', card.relations[0]);
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

    return (
      <section className="nx-form-column" style={{ width: '100%', maxWidth: '34rem', margin: '0 auto' }}>
        {/* Balão do Guia / Mascote */}
        <div className="wz-guide">
          <div className="wz-guide-icon">🎵</div>
          <div className="wz-guide-bubble">
            Pra quem é essa música? Isso ajuda o estúdio a dar o tom perfeito na letra e na melodia.
          </div>
        </div>

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
                  <span className="c2-ic">{card.icon}</span>
                  <span className="c2-lb">{card.label}</span>
                  {card.sub && <span className="c2-sub">{card.sub}</span>}
                </button>
              );
            })}
          </div>

          {/* Sub-pills se a categoria tem mais de uma variação (ex: Namorada vs Namorado, Mãe vs Pai) */}
          {activeCardObj && activeCardObj.relations && activeCardObj.relations.length > 1 && (
            <div style={{
              margin: '-4px 0 16px',
              padding: '10px 14px',
              borderRadius: '14px',
              background: '#FFF1F6',
              border: '1px solid #FCE4ED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#B5124E' }}>
                Especificar:
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
                        padding: '6px 14px',
                        borderRadius: '100px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        border: isRelActive ? '1px solid #E32B6D' : '1px solid #F1E4E8',
                        backgroundColor: isRelActive ? '#E32B6D' : '#ffffff',
                        color: isRelActive ? '#ffffff' : '#1E1418',
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
          <div className="wz-t">Nome de quem vai receber</div>
          <div className="wz-s">
            Coloque o nome ou apelido de quem vai receber a homenagem. Esse nome vai aparecer na letra <b>exatamente como você escrever</b>.
          </div>

          <div data-missing={isHonoreeMissing ? "true" : undefined} style={{ marginBottom: '14px' }}>
            <input
              className={`wz-inp ${isHonoreeMissing ? 'erro' : ''}`}
              value={data.honoreeName || ''}
              readOnly={isSelfTribute}
              onChange={e => updateField('honoreeName', e.target.value)}
              placeholder={isSelfTribute ? 'Seu próprio nome' : 'Digite o nome... (Ex: Helena)'}
              autoComplete="off"
              maxLength={100}
            />
            {isHonoreeMissing && (
              <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                ● Digite o nome de quem vai receber
              </span>
            )}
          </div>

          <div data-missing={isCustomerMissing ? "true" : undefined} style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#1E1418', marginBottom: '6px' }}>
              Seu primeiro nome (quem está dedicando) *
            </label>
            <input
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
                  <span className="c2-ic">{occ.icon}</span>
                  <span className="c2-lb">{occ.label}</span>
                </button>
              );
            })}
          </div>

          {(showCustomOccasion || (!isOccasionInQuick && !!data.occasion)) && (
            <div style={{ marginTop: '10px' }}>
              <select
                className="wz-inp"
                value={data.occasion || ''}
                onChange={e => updateField('occasion', e.target.value)}
              >
                <option value="">Selecione outra ocasião...</option>
                {occasions.map(o => (
                  <option key={o.id} value={o.id}>{o.icon} {o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Faixa de Confiança */}
        <div
          style={{
            marginTop: '20px',
            marginBottom: '10px',
            padding: '12px 16px',
            borderRadius: '16px',
            backgroundColor: '#FFF7F9',
            border: '1px solid #FCE4ED',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.84rem',
            color: '#B5124E'
          }}
        >
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🔒</span>
          <span>
            <b>100% Grátis para testar:</b> Você cria a letra personalizada e ouve a prévia antes de pagar qualquer valor.
          </span>
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
        <div className="wz-guide">
          <div className="wz-guide-icon">🎵</div>
          <div className="wz-guide-bubble">
            Conte a história de vocês... O que torna {data.honoreeName || 'essa pessoa'} especial? Não precisa rimar nem escrever bonito, conte do seu jeito sincero!
          </div>
        </div>

        <div className="wz-t">Conte a história de vocês</div>
        <div className="wz-s">
          Conte momentos marcantes, apelidos carinhosos, onde se conheceram ou o que mais admira. A IA transformará isso em versos emocionantes.
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

        {/* Sugestões de ideias para clicar e preencher */}
        <div style={{ marginTop: '14px', marginBottom: '14px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#857D80', display: 'block', marginBottom: '8px' }}>
            💡 Sugestões para inspirar:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[
              ['Uma lembrança marcante', 'Uma lembrança que guardo com muito carinho é '],
              ['O que mais admiro', 'O que eu mais admiro em você é '],
              ['Uma declaração especial', 'Hoje eu queria te dizer que '],
            ].map(([title, prompt]) => (
              <button
                key={title}
                type="button"
                onClick={() => appendStoryPrompt(prompt)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '100px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #F1E4E8',
                  color: '#1E1418',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                + {title}
              </button>
            ))}
          </div>
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
            border: '1.5px solid #FCE4ED',
            backgroundColor: isListening ? '#ffe4e6' : '#FFF7F9',
            color: '#B5124E',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          <Mic size={18} aria-hidden="true" />
          <span>{isListening ? 'Parar de gravar' : 'Prefiro contar por áudio / voz'}</span>
        </button>

        {/* Detalhes extras */}
        <details className="nx-details" style={{ marginTop: '16px' }}>
          <summary style={{ fontSize: '0.86rem', fontWeight: 600, color: '#857D80', cursor: 'pointer' }}>
            + Nomes adicionais ou frase especial obrigatória
          </summary>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              className="wz-inp"
              value={data.requiredNames || ''}
              onChange={e => updateField('requiredNames', e.target.value)}
              placeholder="Ex: nossos filhos Pedro e Laura"
            />
            <input
              className="wz-inp"
              value={data.requiredPhrase || ''}
              onChange={e => updateField('requiredPhrase', e.target.value)}
              placeholder="Ex: sempre ao seu lado até o fim"
            />
          </div>
        </details>
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
        <div className="wz-guide">
          <div className="wz-guide-icon">🎵</div>
          <div className="wz-guide-bubble">
            Qual estilo combina mais com vocês? Escolha o ritmo que vai dar vida à sua canção.
          </div>
        </div>

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
                  <span className="c2-ic">{g.icon}</span>
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
            style={{ marginBottom: '16px', fontSize: '0.84rem', color: '#B5124E', fontWeight: 700 }}
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
                      <span className="c2-ic">{s.icon || '🎵'}</span>
                      <span className="c2-lb">{s.label}</span>
                      <span className="c2-sub">{s.desc}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* 2. CLIMA DA MÚSICA */}
        <div data-missing={isMoodMissing ? "true" : undefined} style={{ marginTop: '1.4rem' }}>
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
                  <span className="c2-ic">{c.icon}</span>
                  <span className="c2-lb">{c.label}</span>
                  <span className="c2-sub">{c.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. TIPO DE VOZ */}
        <div data-missing={isVoiceMissing ? "true" : undefined} style={{ marginTop: '1.4rem' }}>
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
                  <span className="c2-ic">{v.icon}</span>
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
        <div className="wz-guide">
          <div className="wz-guide-icon">🎵</div>
          <div className="wz-guide-bubble">
            Quase pronto! Confira os detalhes do seu pedido e informe seu WhatsApp para acompanhar a composição.
          </div>
        </div>

        <div className="wz-t">Seu presente começa assim</div>
        <div className="wz-s">Confira o resumo antes de gerar a letra personalizada com a IA.</div>

        {/* Card Resumo */}
        <article className="nx-card nx-review" style={{ padding: '18px', borderRadius: '18px', border: '1.5px solid #F1E4E8', marginBottom: '16px' }}>
          <span className="nx-eyebrow" style={{ fontSize: '0.78rem', color: '#B5124E', fontWeight: 700 }}>
            {data.occasion || 'Homenagem'}
          </span>
          <h2 style={{ fontSize: '1.35rem', margin: '6px 0 4px', color: '#161113' }}>Para {data.honoreeName}</h2>
          <p style={{ fontSize: '0.88rem', margin: '0 0 10px', color: '#857D80' }}>
            De {data.customerName} · {data.musicStyle} · {data.musicMood}
            {data.voiceType && (
              <span> · Voz: {data.voiceType === 'minha_voz' ? '🎙️ Própria' : data.voiceType === 'feminina' ? 'Feminina' : data.voiceType === 'dueto' ? 'Dueto' : 'Masculina'}</span>
            )}
          </p>
          <p className="nx-story-review" style={{ fontSize: '0.86rem', lineHeight: 1.5, maxHeight: '140px', overflowY: 'auto' }}>
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
            Seu WhatsApp para receber o link *
          </label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#857D80', marginBottom: '8px' }}>
            Enviaremos o link seguro para você ouvir a prévia e baixar sua canção quando quiser.
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
          <div style={{ padding: '8px 12px', borderRadius: '10px', backgroundColor: '#FFF7F9', border: '1px solid #FCE4ED', color: '#B5124E', fontSize: '0.84rem' }}>
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
            backgroundColor: '#FFF7F9',
            border: '1.5px solid #E32B6D'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span style={{ fontWeight: 800, color: '#B5124E', fontSize: '0.92rem' }}>✨ Timbre de Voz Reconhecido!</span>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#1E1418' }}>
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
