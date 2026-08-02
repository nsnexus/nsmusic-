'use client';

import Link from 'next/link';
import { styles } from './wizardStyles';
import { recipients, relationshipsEuSouO, relationshipsEuSouA, occasions, stylesList, moods } from './wizardOptions';

// Passos 1-9 do wizard de /criar — extraído de page.jsx (M-20 no AUDIT_REPORT.md). Mantém toda a
// lógica/estado no componente pai (criar/page.jsx); este componente só recebe formData e os
// handlers já prontos, sem duplicar nenhuma regra de negócio.
export default function WizardSteps({
  step,
  formData,
  updateField,
  selectFieldAndAdvance,
  isListening,
  toggleVoiceDictation,
  appendStoryPrompt,
  isUploadingCover,
  handleImageUpload,
  handlePhoneChange,
  phoneVerifyStatus,
  phoneVerifyMessage,
}) {
  switch (step) {
    case 1:
      return (
        <div>
          <h1 style={styles.stepTitle}>Quem vai RECEBER a música?</h1>
          <p style={styles.stepSubtitle}>Escolha a pessoa que será homenageada — ao clicar, a tela avança automaticamente!</p>
          <div style={styles.gridCards}>
            {recipients.map((item) => (
              <div
                key={item.id}
                onClick={() => selectFieldAndAdvance('recipientType', item.id)}
                style={{
                  ...styles.wizardCard,
                  borderColor: formData.recipientType === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: formData.recipientType === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                {formData.recipientType === item.id && <div style={styles.checkCircle}>✓</div>}
                <span style={{ fontSize: '2.2rem', marginBottom: '10px' }}>{item.icon}</span>
                <span style={{ fontSize: '0.95rem', fontWeight: '600' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 2:
      return (
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={styles.stepTitle}>Qual o nome de quem vai RECEBER a música?</h1>
          <p style={styles.stepSubtitle}>Coloque o nome ou apelido de quem vai receber a homenagem. Esse nome vai aparecer na letra da música.</p>
          <input
            type="text"
            value={formData.honoreeName}
            onChange={(e) => updateField('honoreeName', e.target.value)}
            placeholder="Digite o nome..."
            style={styles.wizardInput}
          />
        </div>
      );
    case 3:
      return (
        <div>
          <h1 style={styles.stepTitle}>Qual seu parentesco com essa pessoa?</h1>
          <p style={styles.stepSubtitle}>Selecione quem é VOCÊ em relação a quem vai receber a música</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '30px', marginTop: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)', marginBottom: '16px', textAlign: 'center', fontWeight: '800' }}>🧔 Eu sou o...</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {relationshipsEuSouO.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => selectFieldAndAdvance('relationship', item.id)}
                    style={{
                      ...styles.wizardListBtn,
                      borderColor: formData.relationship === item.id ? 'var(--primary)' : 'var(--border-color)',
                      backgroundColor: formData.relationship === item.id ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                      color: formData.relationship === item.id ? 'var(--primary)' : 'var(--text-primary)',
                      boxShadow: formData.relationship === item.id ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--secondary)', marginBottom: '16px', textAlign: 'center', fontWeight: '800' }}>👩 Eu sou a...</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {relationshipsEuSouA.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => selectFieldAndAdvance('relationship', item.id)}
                    style={{
                      ...styles.wizardListBtn,
                      borderColor: formData.relationship === item.id ? 'var(--secondary)' : 'var(--border-color)',
                      backgroundColor: formData.relationship === item.id ? 'rgba(236, 72, 153, 0.08)' : '#FFFFFF',
                      color: formData.relationship === item.id ? 'var(--secondary)' : 'var(--text-primary)',
                      boxShadow: formData.relationship === item.id ? '0 4px 14px rgba(236, 72, 153, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button
              onClick={() => selectFieldAndAdvance('relationship', 'Outro')}
              style={{
                ...styles.wizardListBtn,
                width: '180px',
                borderColor: formData.relationship === 'Outro' ? 'var(--primary)' : 'var(--border-color)',
                backgroundColor: formData.relationship === 'Outro' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                color: formData.relationship === 'Outro' ? 'var(--primary)' : 'var(--text-primary)',
              }}
            >
              Outro
            </button>
          </div>
        </div>
      );
    case 4:
      return (
        <div>
          <h1 style={styles.stepTitle}>Qual a ocasião?</h1>
          <p style={styles.stepSubtitle}>Escolha o momento que você quer eternizar</p>
          <div style={styles.gridCards}>
            {occasions.map((item) => (
              <div
                key={item.id}
                onClick={() => selectFieldAndAdvance('occasion', item.id)}
                style={{
                  ...styles.wizardCard,
                  borderColor: formData.occasion === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: formData.occasion === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                {formData.occasion === item.id && <div style={styles.checkCircle}>✓</div>}
                <span style={{ fontSize: '2.2rem', marginBottom: '10px' }}>{item.icon}</span>
                <span style={{ fontSize: '0.95rem', fontWeight: '600', textAlign: 'center' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 5:
      return (
        <div style={{ maxWidth: '750px', margin: '0 auto' }}>
          <h1 style={styles.stepTitle}>Conte sua história 📜</h1>
          <p style={styles.stepSubtitle}>Digite ou use o microfone para contar os detalhes. Faremos uma composição inesquecível!</p>

          {/* Barra de Ferramentas de Voz e Sugestões Rápida */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={toggleVoiceDictation}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: isListening ? '2px solid #ef4444' : '1px solid var(--primary)',
                background: isListening ? 'rgba(239, 68, 68, 0.2)' : 'rgba(124, 58, 237, 0.15)',
                color: isListening ? '#fca5a5' : '#c4b5fd',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isListening ? '⏹ Gravando... (Fale Agora)' : '🎙️ Ditar por Voz (Gravar Fala)'}
            </button>

            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sugestões rápidas:</span>

            <button
              type="button"
              onClick={() => appendStoryPrompt("Nos conhecemos em um momento marcante de nossas vidas e desde então não nos separamos mais.")}
              style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              💡 Como nos conhecemos
            </button>

            <button
              type="button"
              onClick={() => appendStoryPrompt("As maiores virtudes dessa pessoa são a bondade, o sorriso contagiante e a dedicação à família.")}
              style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              💡 Qualidades e virtudes
            </button>

            <button
              type="button"
              onClick={() => appendStoryPrompt("Quero expressar minha gratidão por cada segundo ao lado dela e reafirmar meu amor eterno.")}
              style={{ padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              💡 Declaração de Amor
            </button>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={styles.wizardLabel}>Sua história *</label>
            <textarea
              value={formData.story}
              onChange={(e) => updateField('story', e.target.value)}
              placeholder="Como vocês se conheceram? Qual o momento mais especial? O que essa pessoa significa pra você? (Ou clique no microfone acima para falar)"
              style={{ ...styles.wizardTextarea, height: '140px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: formData.story.length >= 50 ? 'var(--success)' : 'var(--danger)' }}>
                {formData.story.length < 50 ? `Mínimo de 50 caracteres (faltam ${50 - formData.story.length})` : 'Tamanho ideal atingido ✓'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formData.story.length}/2000</span>
            </div>
          </div>

          <div>
            <label style={styles.wizardLabel}>Momentos especiais para mencionar (opcional)</label>
            <textarea
              value={formData.importantMoments}
              onChange={(e) => updateField('importantMoments', e.target.value)}
              placeholder="Ex: primeiro encontro no parque, viagem para a praia, pedido de casamento..."
              style={{ ...styles.wizardTextarea, height: '100px' }}
            />
          </div>
        </div>
      );
    case 6:
      return (
        <div>
          <h1 style={styles.stepTitle}>Gênero musical</h1>
          <p style={styles.stepSubtitle}>Selecione o ritmo ideal para a sua canção</p>
          <div style={styles.gridCards2}>
            {stylesList.map((item) => (
              <div
                key={item.id}
                onClick={() => selectFieldAndAdvance('musicStyle', item.id)}
                style={{
                  ...styles.wizardCardLarge,
                  borderColor: formData.musicStyle === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: formData.musicStyle === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                {formData.musicStyle === item.id && <div style={styles.checkCircle}>✓</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '2.2rem' }}>{item.icon}</span>
                  <div style={{ textAlign: 'left' }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: '700' }}>{item.label}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 7:
      return (
        <div>
          <h1 style={styles.stepTitle}>Clima da música</h1>
          <p style={styles.stepSubtitle}>Qual o clima que a música deve transmitir?</p>
          <div style={styles.gridCards2}>
            {moods.map((item) => (
              <div
                key={item.id}
                onClick={() => selectFieldAndAdvance('musicMood', item.id)}
                style={{
                  ...styles.wizardCardLarge,
                  borderColor: formData.musicMood === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: formData.musicMood === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                {formData.musicMood === item.id && <div style={styles.checkCircle}>✓</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '2.2rem' }}>{item.icon}</span>
                  <div style={{ textAlign: 'left' }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: '700' }}>{item.label}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 8:
      return (
        <div style={{ maxWidth: '650px', margin: '0 auto' }}>
          <h1 style={styles.stepTitle}>Detalhes finais</h1>
          <p style={styles.stepSubtitle}>Últimos ajustes para personalizar ainda mais sua música</p>

          <div style={{ marginBottom: '20px' }}>
            <label style={styles.wizardLabel}>Nomes que devem aparecer na música</label>
            <input
              type="text"
              value={formData.requiredNames}
              onChange={(e) => updateField('requiredNames', e.target.value)}
              placeholder="Ex: João e Maria"
              style={styles.wizardInput}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={styles.wizardLabel}>Frase especial para incluir (opcional)</label>
            <input
              type="text"
              value={formData.requiredPhrase}
              onChange={(e) => updateField('requiredPhrase', e.target.value)}
              placeholder="Ex: Te amo mais que ontem e menos que amanhã"
              style={styles.wizardInput}
            />
          </div>

          <div>
            <label style={styles.wizardLabel}>Tipo de voz da música (quem vai cantar)</label>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => updateField('voiceType', 'masculina')}
                style={{
                  ...styles.voiceBtn,
                  borderColor: formData.voiceType === 'masculina' ? 'var(--primary)' : 'var(--border-color)',
                  backgroundColor: formData.voiceType === 'masculina' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                  color: formData.voiceType === 'masculina' ? 'var(--primary)' : 'var(--text-primary)',
                  boxShadow: formData.voiceType === 'masculina' ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                🎤 Masculina
              </button>
              <button
                type="button"
                onClick={() => updateField('voiceType', 'feminina')}
                style={{
                  ...styles.voiceBtn,
                  borderColor: formData.voiceType === 'feminina' ? 'var(--primary)' : 'var(--border-color)',
                  backgroundColor: formData.voiceType === 'feminina' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                  color: formData.voiceType === 'feminina' ? 'var(--primary)' : 'var(--text-primary)',
                  boxShadow: formData.voiceType === 'feminina' ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                🎤 Feminina
              </button>
              <button
                type="button"
                onClick={() => updateField('voiceType', 'dueto')}
                style={{
                  ...styles.voiceBtn,
                  borderColor: formData.voiceType === 'dueto' ? 'var(--primary)' : 'var(--border-color)',
                  backgroundColor: formData.voiceType === 'dueto' ? 'rgba(124, 58, 237, 0.08)' : '#FFFFFF',
                  color: formData.voiceType === 'dueto' ? 'var(--primary)' : 'var(--text-primary)',
                  boxShadow: formData.voiceType === 'dueto' ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                👥 Dueto
              </button>
            </div>
          </div>

          {/* Foto de Capa da Música */}
          <div style={{ marginTop: '28px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
            <label style={styles.wizardLabel}>🖼️ Foto de Capa da Música (Opcional)</label>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Envie uma foto especial (casal, família, aniversariante). Se não enviar, utilizaremos a capa padrão do estúdio.
            </p>

            <div>
              {formData.coverUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--primary)' }}>
                  <img
                    src={formData.coverUrl}
                    alt="Capa personalizada"
                    style={{ width: '70px', height: '70px', borderRadius: '10px', objectFit: 'cover' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.88rem', color: '#34d399', fontWeight: 'bold' }}>✓ Foto enviada com sucesso!</span>
                    <button
                      type="button"
                      onClick={() => updateField('coverUrl', '')}
                      style={{ background: 'none', border: 'none', color: '#fca5a5', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', padding: 0 }}
                    >
                      🗑️ Remover foto (usar capa padrão)
                    </button>
                  </div>
                </div>
              ) : isUploadingCover ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '22px',
                  borderRadius: '14px',
                  border: '2px dashed rgba(124, 58, 237, 0.4)',
                  background: 'rgba(124, 58, 237, 0.04)',
                }}>
                  <span style={{ fontSize: '1.8rem' }}>⏳</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#fff' }}>Enviando foto...</span>
                </div>
              ) : (
                <label style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '22px',
                  borderRadius: '14px',
                  border: '2px dashed rgba(124, 58, 237, 0.4)',
                  background: 'rgba(124, 58, 237, 0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}>
                  <span style={{ fontSize: '1.8rem' }}>📸</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#fff' }}>Clique para enviar uma foto de capa</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Suporta fotos em JPG, PNG ou WEBP</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      );
    case 9:
      return (
        <div className="responsive-grid-2">
          <div style={styles.checkoutSummary} className="glass-card">
            <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--primary)' }}>Resumo do pedido</h3>

            <div style={styles.summaryItemRow}>
              <span style={{ color: 'var(--text-secondary)' }}>Para quem:</span>
              <span style={{ fontWeight: '600' }}>{formData.honoreeName} ({formData.recipientType})</span>
            </div>
            <div style={styles.summaryItemRow}>
              <span style={{ color: 'var(--text-secondary)' }}>De quem:</span>
              <span style={{ fontWeight: '600' }}>{formData.relationship}</span>
            </div>
            <div style={styles.summaryItemRow}>
              <span style={{ color: 'var(--text-secondary)' }}>Ocasião:</span>
              <span style={{ fontWeight: '600' }}>{formData.occasion}</span>
            </div>
            <div style={styles.summaryItemRow}>
              <span style={{ color: 'var(--text-secondary)' }}>Gênero:</span>
              <span style={{ fontWeight: '600' }}>{formData.musicStyle}</span>
            </div>
            <div style={styles.summaryItemRow}>
              <span style={{ color: 'var(--text-secondary)' }}>Clima:</span>
              <span style={{ fontWeight: '600' }}>{formData.musicMood}</span>
            </div>
            <div style={styles.summaryItemRow}>
              <span style={{ color: 'var(--text-secondary)' }}>Voz:</span>
              <span style={{ fontWeight: '600' }}>
                {formData.voiceType === 'masculina' ? 'Masculina' : formData.voiceType === 'feminina' ? 'Feminina' : '👩‍🎤 Dueto (Masc. + Fem.)'}
              </span>
            </div>
            <div style={styles.summaryItemRow}>
              <span style={{ color: 'var(--text-secondary)' }}>Capa:</span>
              <span style={{ fontWeight: '600', color: formData.coverUrl ? '#34d399' : 'var(--text-muted)' }}>
                {formData.coverUrl ? '📸 Foto enviada' : '🖼️ Capa padrão'}
              </span>
            </div>

            <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>História contada:</span>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', fontStyle: 'italic', lineHeight: '1.5' }}>
                {formData.story}
              </p>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>Seus dados de contato</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={styles.wizardLabel}>SEU nome (quem está pedindo a música) *</label>
              <input
                type="text"
                value={formData.customerName}
                onChange={(e) => updateField('customerName', e.target.value)}
                placeholder="Ex: Maria Silva"
                style={styles.wizardInput}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={styles.wizardLabel}>SEU WhatsApp (enviaremos a música pronta aqui) *</label>
              <input
                type="tel"
                value={formData.customerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="(99) 99999-9999"
                style={styles.wizardInput}
              />
              <span style={{ fontSize: '0.75rem', color: phoneVerifyStatus === 'valid' ? 'var(--success)' : (phoneVerifyStatus === 'invalid' || phoneVerifyStatus === 'unknown') ? '#ef4444' : phoneVerifyStatus === 'checking' ? '#f59e0b' : 'var(--text-muted)', marginTop: '4px', display: 'block', fontWeight: (phoneVerifyStatus === 'invalid' || phoneVerifyStatus === 'unknown') ? 'bold' : 'normal' }}>
                {phoneVerifyMessage || 'Digite o DDD + 9 dígitos'}
              </span>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={styles.wizardLabel}>E-mail (opcional)</label>
              <input
                type="email"
                value={formData.customerEmail}
                onChange={(e) => updateField('customerEmail', e.target.value)}
                placeholder="seuemail@exemplo.com"
                style={styles.wizardInput}
              />
            </div>

            <div style={styles.infoAlert} className="glass-card">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                🔒 Respeitamos sua privacidade. Seus contatos serão utilizados exclusivamente para entregar e acompanhar a criação da sua composição.
              </p>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <input
                type="checkbox"
                id="termsAccepted"
                checked={formData.termsAccepted}
                onChange={(e) => updateField('termsAccepted', e.target.checked)}
                style={{ marginTop: '3px', width: '18px', height: '18px', flexShrink: 0 }}
              />
              <label htmlFor="termsAccepted" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
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
      );
    default:
      return null;
  }
}
