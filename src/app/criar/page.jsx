'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { doc, getDoc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function CriarMusica() {
  const [step, setStep] = useState(1);
  const [orderId, setOrderId] = useState('');
  
  const [formData, setFormData] = useState({
    // Step 1
    recipientType: '',
    // Step 2
    honoreeName: '',
    // Step 3
    relationship: '',
    // Step 4
    occasion: '',
    // Step 5
    story: '',
    importantMoments: '',
    // Step 6
    musicStyle: '',
    // Step 7
    musicMood: '',
    // Step 8
    requiredNames: '',
    requiredPhrase: '',
    voiceType: 'masculina',
    // Step 9
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    termsAccepted: true,
    // Step 10: Lyrics state
    lyrics: '',
    lyricsVersion: 1,
    lyricsStatus: 'idle', // 'idle', 'generating', 'generated', 'error'
    lyricsComment: '',
    // Step 11: Suno AI Audio state
    sunoStatus: 'idle', // 'idle', 'generating', 'generated', 'error'
    sunoProgress: '',
    sunoTracks: [],
    addVersion2: false,
    // Step 12: Pricing package
    selectedPackage: '',
    // Step 13: Addons
    addons: {
      extraSongs2: false, // will represent version 2 addon
      photoVideo: false,
      spotifyDistribution: false,
      premiumCover: false,
      qrCode: false,
      instrumentalVersion: false,
      wavFormat: false,
      priorityDelivery: false,
    }
  });

  const totalWizardSteps = 9;
  const audio1Ref = useRef(null);
  const audio2Ref = useRef(null);

  // States for packages and addons loaded dynamically from Firestore
  const [packagesList, setPackagesList] = useState([
    { id: 'essencial', name: 'Essencial', price: 49.90, desc: '1 Música + MP3 + Capa Simples' },
    { id: 'presente', name: 'Presente Completo', price: 79.90, desc: '1 Música + MP3/WAV + Capa Personalizada + QR Code' },
    { id: 'tres_versoes', name: 'Multi-Estilos (3 Versões)', price: 119.90, desc: '3 Versões com ritmos diferentes + Capa + QR Code' }
  ]);

  const [addonsConfig, setAddonsConfig] = useState([
    { id: 'extraSongs2', name: '➕ Adicionar Versão 2 (Estilo alternativo gerado com IA)', price: 39.90 },
    { id: 'photoVideo', name: '🎥 Vídeo com fotos (sincronizado com a música)', price: 49.90 },
    { id: 'spotifyDistribution', name: '🎧 Publicação no Spotify e plataformas de streaming', price: 99.90 },
    { id: 'premiumCover', name: '🖼️ Capa Premium personalizada profissional', price: 19.90 },
    { id: 'qrCode', name: '📱 QR Code da música para cartões e presentes', price: 9.90 },
    { id: 'instrumentalVersion', name: '🎤 Versão Instrumental (Sem voz - para karaokê)', price: 19.90 },
    { id: 'wavFormat', name: '💿 Áudio em formato WAV (Qualidade de estúdio)', price: 9.90 },
    { id: 'priorityDelivery', name: '🚀 Entrega Prioritária em até 24 horas', price: 29.90 },
  ]);

  // Load prices dynamically from Firestore database config document
  useEffect(() => {
    const loadPricing = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'config', 'pricing'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.packages) setPackagesList(data.packages);
          if (data.addons) setAddonsConfig(data.addons);
        }
      } catch (err) {
        console.error("Erro ao carregar preços do banco de dados:", err);
      }
    };
    loadPricing();
  }, []);

  // Sync Version 2 selection with addons list
  useEffect(() => {
    updateAddon('extraSongs2', formData.addVersion2);
  }, [formData.addVersion2]);

  // Configuration options
  const recipients = [
    { id: 'Namorada', label: 'Namorada', icon: '💖' },
    { id: 'Esposa', label: 'Esposa', icon: '💍' },
    { id: 'Namorado', label: 'Namorado', icon: '❤️' },
    { id: 'Marido', label: 'Marido', icon: '💑' },
    { id: 'Mãe', label: 'Mãe', icon: '👩' },
    { id: 'Pai', label: 'Pai', icon: '👨' },
    { id: 'Vó', label: 'Vó', icon: '👵' },
    { id: 'Vô', label: 'Vô', icon: '👴' },
    { id: 'Filha', label: 'Filha', icon: '👧' },
    { id: 'Filho', label: 'Filho', icon: '👦' },
    { id: 'Amiga', label: 'Amiga', icon: '💛' },
    { id: 'Amigo', label: 'Amigo', icon: '🤝' },
    { id: 'Chefe', label: 'Chefe', icon: '💼' },
    { id: 'Eu mesmo', label: 'Eu mesmo', icon: '🎤' },
    { id: 'Outro', label: 'Outro', icon: '🎵' },
  ];

  const relationshipsEuSouO = [
    { id: 'Esposo', label: 'Esposo' },
    { id: 'Filho', label: 'Filho' },
    { id: 'Namorado', label: 'Namorado' },
    { id: 'Amigo', label: 'Amigo' },
    { id: 'Pai', label: 'Pai' },
    { id: 'Neto', label: 'Neto' },
  ];

  const relationshipsEuSouA = [
    { id: 'Esposa', label: 'Esposa' },
    { id: 'Filha', label: 'Filha' },
    { id: 'Namorada', label: 'Namorada' },
    { id: 'Amiga', label: 'Amiga' },
    { id: 'Mãe', label: 'Mãe' },
    { id: 'Neta', label: 'Neta' },
  ];

  const occasions = [
    { id: 'Aniversário', label: 'Aniversário', icon: '🎂' },
    { id: 'Aniv. de Casamento', label: 'Aniv. de Casamento', icon: '💎' },
    { id: 'Dia dos Namorados', label: 'Dia dos Namorados', icon: '💝' },
    { id: 'Dia das Mães', label: 'Dia das Mães', icon: '🌷' },
    { id: 'Declaração de Amor', label: 'Declaração de Amor', icon: '💌' },
    { id: 'Pedido de Namoro', label: 'Pedido de Namoro', icon: '💍' },
    { id: 'Surpresa', label: 'Surpresa', icon: '🎁' },
    { id: 'Homenagem', label: 'Homenagem', icon: '🌟' },
    { id: 'Aniversário de Namoro', label: 'Aniversário de Namoro', icon: '💑' },
    { id: 'Formatura', label: 'Formatura', icon: '🎓' },
    { id: 'Chá Revelação', label: 'Chá Revelação', icon: '👶' },
    { id: 'Outro', label: 'Outro', icon: '✨' },
  ];

  const stylesList = [
    { id: 'Romântica', label: 'Romântica', icon: '💖', desc: 'Ritmo amoroso e cativante' },
    { id: 'Sertanejo', label: 'Sertanejo', icon: '🤠', desc: 'Estilo romântico ou universitário' },
    { id: 'Pop', label: 'Pop', icon: '⚡', desc: 'Moderno, jovem e dançante' },
    { id: 'Rock', label: 'Rock', icon: '🎸', desc: 'Atitude com guitarras marcantes' },
    { id: 'MPB / Bossa Nova', label: 'MPB / Bossa Nova', icon: '☕', desc: 'Estilo clássico e intimista' },
    { id: 'Gospel / Adoração', label: 'Gospel / Adoração', icon: '⛪', desc: 'Mensagem de fé e inspiração' },
    { id: 'Samba / Pagode', label: 'Samba / Pagode', icon: '🥁', desc: 'Descontraído e alegre' },
    { id: 'Folk Acústico', label: 'Folk Acústico', icon: '🪵', desc: 'Voz e violão aconchegante' }
  ];

  const moods = [
    { id: 'Alegre', label: 'Alegre', icon: '☀️' },
    { id: 'Emocionante', label: 'Emocionante', icon: '🥺' },
    { id: 'Energética', label: 'Energética', icon: '🔥' },
    { id: 'Calma', label: 'Calma', icon: '🍃' },
    { id: 'Nostálgica', label: 'Nostálgica', icon: '🍂' },
  ];

  // Helper functions
  const updateField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (value) => {
    const clean = value.replace(/\D/g, '');
    let formatted = clean;
    if (clean.length > 0) {
      formatted = `(${clean.slice(0, 2)}`;
    }
    if (clean.length > 2) {
      formatted += `) ${clean.slice(2, 7)}`;
    }
    if (clean.length > 7) {
      formatted += `-${clean.slice(7, 11)}`;
    }
    updateField('customerPhone', formatted);
  };

  const isPhoneValid = (phone) => {
    const clean = phone.replace(/\D/g, '');
    return clean.length === 11 || clean.length === 10;
  };

  const updateAddon = (id, value) => {
    setFormData(prev => ({
      ...prev,
      addons: { ...prev.addons, [id]: value }
    }));
  };

  const getSelectedPackagePrice = () => {
    const pkg = packagesList.find(p => p.id === formData.selectedPackage);
    return pkg ? pkg.price : 0;
  };

  const getAddonsPrice = () => {
    let price = 0;
    addonsConfig.forEach(addon => {
      if (formData.addons[addon.id]) {
        price += addon.price;
      }
    });
    return price;
  };

  const getTotalPrice = () => {
    return getSelectedPackagePrice() + getAddonsPrice();
  };

  // Step 9: Save Order to Firestore first, then trigger lyrics generation
  const handleSaveAndGenerateLyrics = async () => {
    updateField('lyricsStatus', 'generating');
    setStep(10);
    try {
      // Create initial order in Firestore in 'Aguardando Pagamento'
      const docRef = await addDoc(collection(db, 'orders'), {
        orderNumber: `NS-${Math.floor(10000 + Math.random() * 90000)}-2026`,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        customerEmail: formData.customerEmail,
        honoreeName: formData.honoreeName,
        recipientType: formData.recipientType,
        relationship: formData.relationship,
        occasion: formData.occasion,
        story: formData.story,
        importantMoments: formData.importantMoments,
        musicStyle: formData.musicStyle,
        musicMood: formData.musicMood,
        voiceType: formData.voiceType,
        paymentStatus: 'AGUARDANDO_PAGAMENTO',
        productionStatus: 'LETRA_GERADA',
        createdAt: new Date()
      });

      setOrderId(docRef.id);

      // Call lyrics generation
      const response = await fetch('/api/lyrics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          lyrics: data.lyrics,
          lyricsStatus: 'generated'
        }));
        // Update order in Firestore with generated lyrics
        await updateDoc(docRef, { lyrics: data.lyrics });
      } else {
        throw new Error('Falha ao gerar letra');
      }
    } catch (err) {
      console.error(err);
      const fallbackLyrics = `[Verso 1]\nNo compasso do tempo eu te vi chegar\n${formData.honoreeName || 'Amor'}, seu jeito me ensinou a sonhar\nNossa trilha tem risos, tem carinho e união\nGuardo cada momento no meu coração.\n\n[Refrão]\nCom você, a vida tem outro sabor\nNum abraço apertado esquecemos a dor\n${formData.requiredPhrase || 'Te amo mais que ontem e muito mais que amanhã'},\nNossa melodia é eterna, pura e sã.\n\n[Verso 2]\nLembro de cada detalhe da nossa história singular\nDos planos traçados olhando pro mar\nCom sua voz tão marcante e carinho sem igual\nVocê transformou nossa vida em algo especial.`;
      
      setFormData(prev => ({
        ...prev,
        lyrics: fallbackLyrics,
        lyricsStatus: 'generated'
      }));

      if (orderId) {
        await updateDoc(doc(db, 'orders', orderId), { lyrics: fallbackLyrics });
      }
    }
  };

  const generateLyrics = async () => {
    // Legacy helper trigger, handled inside handleSaveAndGenerateLyrics
  };

  const requestLyricsAdjustment = async () => {
    if (!formData.lyricsComment.trim()) return;
    updateField('lyricsStatus', 'generating');
    try {
      const response = await fetch('/api/lyrics/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentLyrics: formData.lyrics,
          comment: formData.lyricsComment,
          formData
        })
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          lyrics: data.lyrics,
          lyricsStatus: 'generated',
          lyricsVersion: prev.lyricsVersion + 1,
          lyricsComment: ''
        }));
        // Update lyrics version in Firestore
        if (orderId) {
          await updateDoc(doc(db, 'orders', orderId), { lyrics: data.lyrics });
        }
      } else {
        throw new Error('Falha ao ajustar');
      }
    } catch (err) {
      console.error(err);
      updateField('lyricsStatus', 'generated');
    }
  };

  // Step 10 Approval -> Move to Audio Generation preview screen (Step 11)
  const handleApproveLyrics = async () => {
    setStep(11);
    updateField('sunoStatus', 'generating');
    updateField('sunoProgress', 'Enviando composição de letra ao Suno AI...');

    try {
      const response = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: formData.lyrics,
          tags: `${formData.musicStyle} ${formData.musicMood} voice ${formData.voiceType}`,
          orderId
        })
      });

      if (!response.ok) {
        throw new Error('Falha ao acionar a API do Suno.');
      }

      const data = await response.json();
      const tracks = data.tracks;

      if (!tracks || tracks.length === 0) {
        throw new Error('Nenhum áudio retornado.');
      }

      setFormData(prev => ({
        ...prev,
        sunoTracks: tracks
      }));

      // Poll status for completing audio rendering
      pollSunoStatus(tracks.map(t => t.id).join(','));
    } catch (err) {
      console.error(err);
      // Fallback with static presentation tracks if API offline
      setTimeout(() => {
        const mockTracks = [
          { id: 'mock_1', audio_url: '/audio/track1.mp3', status: 'complete', title: 'Versão 1 - Romântica' },
          { id: 'mock_2', audio_url: '/audio/track2.mp3', status: 'complete', title: 'Versão 2 - Acústica' }
        ];
        setFormData(prev => ({
          ...prev,
          sunoTracks: mockTracks,
          sunoStatus: 'generated'
        }));
      }, 3000);
    }
  };

  const pollSunoStatus = (ids) => {
    let attempts = 0;
    const maxAttempts = 30; // 150 seconds max
    updateField('sunoProgress', 'Aguardando o Suno compor e renderizar os áudios (1 a 2 min)...');

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/suno/status?ids=${ids}`);
        if (res.ok) {
          const statusData = await res.json();
          const isComplete = statusData.every(t => t.status === 'complete');
          const hasAudio = statusData.every(t => t.audio_url);

          if (isComplete || hasAudio) {
            setFormData(prev => ({
              ...prev,
              sunoTracks: statusData,
              sunoStatus: 'generated'
            }));
            clearInterval(interval);

            // Save audioUrls to Firestore automatically
            if (orderId) {
              const primaryAudio = statusData.find(t => t.audio_url)?.audio_url || '';
              await updateDoc(doc(db, 'orders', orderId), {
                audioUrl: primaryAudio,
                audioFiles: statusData.map(t => t.audio_url).filter(Boolean)
              });
            }
          } else {
            updateField('sunoProgress', `Suno compondo arranjos... Tentativa ${attempts} de ${maxAttempts}`);
          }
        }
      } catch (err) {
        console.error(err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        updateField('sunoStatus', 'error');
        updateField('sunoProgress', 'Não foi possível concluir em tempo real. Os áudios serão enviados manualmente.');
      }
    }, 5000);
  };

  // Time update handler to lock playback of previews to 60 seconds
  const handleAudioTimeUpdate = (e, playerIdx) => {
    const audio = e.target;
    if (audio.currentTime > 60) {
      audio.pause();
      audio.currentTime = 60;
      alert("🔒 Prévia de 60 segundos finalizada! Efetue o pagamento para liberar a música completa e fazer o download.");
    }
  };

  const nextStep = () => {
    setStep(prev => prev + 1);
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const isNextDisabled = () => {
    if (step === 1 && !formData.recipientType) return true;
    if (step === 2 && !formData.honoreeName) return true;
    if (step === 3 && !formData.relationship) return true;
    if (step === 4 && !formData.occasion) return true;
    if (step === 5 && formData.story.length < 50) return true;
    if (step === 6 && !formData.musicStyle) return true;
    if (step === 7 && !formData.musicMood) return true;
    if (step === 9 && (!formData.customerName || !isPhoneValid(formData.customerPhone))) return true;
    if (step === 10 && formData.lyricsStatus !== 'generated') return true;
    if (step === 11 && formData.sunoStatus !== 'generated') return true;
    if (step === 12 && !formData.selectedPackage) return true;
    return false;
  };

  const renderWizardStep = () => {
    switch (step) {
      case 1:
        return (
          <div>
            <h1 style={styles.stepTitle}>Quem vai RECEBER a música?</h1>
            <p style={styles.stepSubtitle}>Escolha a pessoa que será homenageada — é para ela que a letra será escrita</p>
            <div style={styles.gridCards}>
              {recipients.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => updateField('recipientType', item.id)}
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
                <h3 style={{ fontSize: '1.1rem', color: 'var(--secondary)', marginBottom: '16px', textAlign: 'center' }}>🧔 Eu sou o...</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {relationshipsEuSouO.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => updateField('relationship', item.id)}
                      style={{
                        ...styles.wizardListBtn,
                        borderColor: formData.relationship === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                        backgroundColor: formData.relationship === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--accent)', marginBottom: '16px', textAlign: 'center' }}>👩 Eu sou a...</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {relationshipsEuSouA.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => updateField('relationship', item.id)}
                      style={{
                        ...styles.wizardListBtn,
                        borderColor: formData.relationship === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                        backgroundColor: formData.relationship === item.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
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
                onClick={() => updateField('relationship', 'Outro')}
                style={{
                  ...styles.wizardListBtn,
                  width: '180px',
                  borderColor: formData.relationship === 'Outro' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: formData.relationship === 'Outro' ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
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
                  onClick={() => updateField('occasion', item.id)}
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
            <h1 style={styles.stepTitle}>Conte sua história</h1>
            <p style={styles.stepSubtitle}>Quanto mais detalhes, mais especial será a música</p>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={styles.wizardLabel}>Sua história *</label>
              <textarea 
                value={formData.story}
                onChange={(e) => updateField('story', e.target.value)}
                placeholder="Como vocês se conheceram? Qual o momento mais especial? O que essa pessoa significa pra você?"
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
                  onClick={() => updateField('musicStyle', item.id)}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', marginTop: '30px' }}>
              {moods.map((item) => (
                <button
                  key={item.id}
                  onClick={() => updateField('musicMood', item.id)}
                  style={{
                    ...styles.wizardPillBtn,
                    borderColor: formData.musicMood === item.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: formData.musicMood === item.id ? 'rgba(124, 58, 237, 0.1)' : 'rgba(255,255,255,0.02)',
                    color: formData.musicMood === item.id ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  {item.icon} {item.label}
                </button>
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
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <button
                  onClick={() => updateField('voiceType', 'masculina')}
                  style={{
                    ...styles.voiceBtn,
                    background: formData.voiceType === 'masculina' ? 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' : 'rgba(255,255,255,0.02)',
                    border: formData.voiceType === 'masculina' ? 'none' : '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  🎤 Masculina
                </button>
                <button
                  onClick={() => updateField('voiceType', 'feminina')}
                  style={{
                    ...styles.voiceBtn,
                    background: formData.voiceType === 'feminina' ? 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' : 'rgba(255,255,255,0.02)',
                    border: formData.voiceType === 'feminina' ? 'none' : '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  🎤 Feminina
                </button>
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
                <span style={{ fontWeight: '600' }}>{formData.voiceType === 'masculina' ? 'Masculina' : 'Feminina'}</span>
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
                <span style={{ fontSize: '0.75rem', color: isPhoneValid(formData.customerPhone) ? 'var(--success)' : 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  {isPhoneValid(formData.customerPhone) ? '✓ WhatsApp válido' : 'Digite o DDD + 9 dígitos'}
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
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderWorkflowStep = () => {
    switch (step) {
      case 10: // Lyrics Generation & Editing
        return (
          <div>
            {formData.lyricsStatus === 'generating' ? (
              <div style={styles.generatingState}>
                <div style={styles.spinner} />
                <h3 style={{ marginTop: '24px', fontFamily: 'var(--font-family-title)', fontSize: '1.6rem' }}>Compondo versos personalizados...</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '8px', maxWidth: '500px' }}>
                  Unindo suas memórias e transformando em melodia. Isso pode levar alguns segundos.
                </p>
              </div>
            ) : (
              <div>
                <h1 style={styles.stepTitle}>Sua Letra Exclusiva ✨</h1>
                <p style={styles.stepSubtitle}>Revisada e gerada com IA especialmente para você. Se gostar, aprove para compor a música!</p>
                
                <div className="responsive-grid-split">
                  <div style={styles.lyricsBox}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>LETRA DA MÚSICA</span>
                      <span style={styles.stepIndicator}>Versão {formData.lyricsVersion}</span>
                    </div>
                    <pre style={styles.lyricsText}>{formData.lyrics}</pre>
                  </div>
                  
                  <div style={styles.lyricsActions}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={styles.wizardLabel}>Gostaria de mudar algo na composição?</label>
                      <textarea 
                        value={formData.lyricsComment}
                        onChange={(e) => updateField('lyricsComment', e.target.value)}
                        placeholder="Ex: mude o segundo verso para falar da nossa viagem a Gramado..."
                        style={{ ...styles.wizardTextarea, height: '100px' }}
                      />
                      <button 
                        onClick={requestLyricsAdjustment}
                        disabled={!formData.lyricsComment.trim()}
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '14px', fontSize: '0.95rem' }}
                      >
                        Solicitar Ajuste Gratuito ✍️
                      </button>
                    </div>

                    <div style={styles.infoAlert} className="glass-card">
                      <p style={{ fontSize: '0.85rem', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                        💡 Você tem direito a ajustes ilimitados na composição para que ela fique do jeitinho que sonhou.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 11: // Direct Suno Audio Generation & 60s Preview Playback
        return (
          <div>
            {formData.sunoStatus === 'generating' ? (
              <div style={styles.generatingState}>
                <div style={styles.spinner} />
                <h3 style={{ marginTop: '24px', fontFamily: 'var(--font-family-title)', fontSize: '1.6rem' }}>Criando os arranjos e gravando áudios...</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '8px', maxWidth: '500px' }}>
                  {formData.sunoProgress || 'Aguardando o processamento do Suno AI...'}
                </p>
              </div>
            ) : (
              <div>
                <h1 style={styles.stepTitle}>Sua Música Está Pronta! 🎧</h1>
                <p style={styles.stepSubtitle}>Ouça as prévias de 60 segundos geradas exclusivamente para você. Escolha seu pacote para liberar o download!</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px', margin: '30px auto 0' }}>
                  {/* Version 1 Preview Card */}
                  <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: '700' }}>🎵 Versão Principal (Versão 1)</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 'bold' }}>Disponível na Compra ✓</span>
                    </div>
                    {formData.sunoTracks[0]?.audio_url ? (
                      <audio 
                        ref={audio1Ref}
                        src={formData.sunoTracks[0].audio_url} 
                        controls 
                        onTimeUpdate={(e) => handleAudioTimeUpdate(e, 1)}
                        style={{ width: '100%' }} 
                      />
                    ) : (
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Processamento de áudio alternativo ativo. Download completo habilitado.
                      </div>
                    )}
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      🔒 Prévia limitada a 60 segundos. A versão completa sem cortes será disponibilizada imediatamente após o pagamento.
                    </span>
                  </div>

                  {/* Version 2 Preview & Upsell Card */}
                  {formData.sunoTracks[1] && (
                    <div 
                      className="glass-card" 
                      style={{ 
                        padding: '24px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '16px', 
                        border: formData.addVersion2 ? '1px solid var(--secondary)' : '1px solid rgba(255,255,255,0.06)',
                        backgroundColor: formData.addVersion2 ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255,255,255,0.01)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: '700' }}>🎵 Versão Alternativa (Versão 2)</h3>
                        <span style={{ fontSize: '0.95rem', color: 'var(--secondary)', fontWeight: '800' }}>
                          + R$ {addonsConfig.find(a => a.id === 'extraSongs2')?.price.toFixed(2)}
                        </span>
                      </div>
                      
                      {formData.sunoTracks[1].audio_url ? (
                        <audio 
                          ref={audio2Ref}
                          src={formData.sunoTracks[1].audio_url} 
                          controls 
                          onTimeUpdate={(e) => handleAudioTimeUpdate(e, 2)}
                          style={{ width: '100%' }} 
                        />
                      ) : (
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          Processando...
                        </div>
                      )}

                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '8px' }}>
                        <input 
                          type="checkbox" 
                          checked={formData.addVersion2}
                          onChange={(e) => updateField('addVersion2', e.target.checked)}
                          style={styles.checkbox}
                        />
                        <span style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>
                          🔥 Levar também a Versão 2 completa com desconto adicional!
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      case 12: // Choice of Audio Package (Delivery formats)
        return (
          <div>
            <h1 style={styles.stepTitle}>Escolha o Pacote de Entrega 💎</h1>
            <p style={styles.stepSubtitle}>Como você prefere receber a sua homenagem?</p>
            
            <div style={styles.packagesSelectGrid}>
              {packagesList.map((pkg) => (
                <div 
                  key={pkg.id}
                  onClick={() => updateField('selectedPackage', pkg.id)}
                  style={{
                    ...styles.pkgSelectCard,
                    borderColor: formData.selectedPackage === pkg.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: formData.selectedPackage === pkg.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: '700' }}>{pkg.name}</h3>
                    <span style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--secondary)' }}>R$ {pkg.price.toFixed(2)}</span>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{pkg.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case 13: // Checkout and Mercado Pago redirect
        return (
          <div>
            <h1 style={styles.stepTitle}>Finalizar Pedido 💳</h1>
            <p style={styles.stepSubtitle}>Revise os valores e prossiga para o pagamento seguro</p>

            <div className="responsive-grid-2">
              <div style={styles.checkoutSummary} className="glass-card">
                <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--primary)' }}>Resumo do Pedido</h3>
                
                <div style={styles.summaryItem}>
                  <span>Pacote: {packagesList.find(p => p.id === formData.selectedPackage)?.name}</span>
                  <span style={{ fontWeight: '700' }}>R$ {getSelectedPackagePrice().toFixed(2)}</span>
                </div>

                {formData.addVersion2 && (
                  <div style={{ ...styles.summaryItem, fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    <span>➕ Versão 2 (Estilo Alternativo)</span>
                    <span>R$ {addonsConfig.find(a => a.id === 'extraSongs2')?.price.toFixed(2)}</span>
                  </div>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />
                
                <div style={{ ...styles.summaryItem, fontSize: '1.4rem', fontWeight: '800' }}>
                  <span>Total Geral:</span>
                  <span className="gradient-text">R$ {getTotalPrice().toFixed(2)}</span>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Detalhes de Acesso</h3>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.7', marginBottom: '24px' }}>
                  <p><strong>Cliente:</strong> {formData.customerName}</p>
                  <p><strong>WhatsApp:</strong> {formData.customerPhone}</p>
                  <p><strong>Download completo:</strong> Liberado instantaneamente após a confirmação!</p>
                </div>

                <div style={styles.infoAlert} className="glass-card">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    🔒 Pagamento processado com segurança via <strong>Mercado Pago</strong>. Suas músicas completas em qualidade HD serão liberadas imediatamente após a aprovação da transação.
                  </p>
                </div>

                <button 
                  onClick={async () => {
                    try {
                      // Update order with total amount and final choices in Firestore
                      if (orderId) {
                        await updateDoc(doc(db, 'orders', orderId), {
                          total: getTotalPrice(),
                          package: formData.selectedPackage,
                          addVersion2: formData.addVersion2,
                          updatedAt: new Date()
                        });
                      }

                      const response = await fetch('/api/payments/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          formData,
                          totalAmount: getTotalPrice()
                        })
                      });
                      if (response.ok) {
                        const data = await response.json();
                        if (data.init_point) {
                          window.location.href = data.init_point;
                        } else {
                          alert('Erro ao redirecionar para a tela de pagamento do Mercado Pago.');
                        }
                      } else {
                        const errData = await response.json();
                        alert(`Erro do Mercado Pago: ${errData.error || 'Falha no processamento.'}`);
                      }
                    } catch (err) {
                      console.error(err);
                      alert('Ocorreu um erro ao processar seu pagamento. Verifique suas chaves de API.');
                    }
                  }}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '18px', fontSize: '1.15rem', marginTop: '24px' }}
                >
                  Confirmar & Pagar com Mercado Pago 💳
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <Link href="/">
            <img src="/logo.png" alt="NSMusic" style={{ height: '40px', width: 'auto' }} />
          </Link>
          <div style={styles.stepIndicator}>
            {step <= totalWizardSteps ? (
              `Passo ${step} de ${totalWizardSteps}`
            ) : (
              step === 10 ? 'Etapa: Composição' : step === 11 ? 'Etapa: Prévia do Áudio' : step === 12 ? 'Etapa: Pacote' : 'Etapa: Pagamento'
            )}
          </div>
        </div>
      </header>

      {/* Main content container */}
      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container" style={{ maxWidth: '900px' }}>
          
          {/* Wizard step indicators */}
          {step <= totalWizardSteps && (
            <div style={styles.progressBarBg}>
              <div style={{ ...styles.progressBarFill, width: `${(step / totalWizardSteps) * 100}%` }} />
            </div>
          )}

          {/* Form step renderers */}
          <div style={{ marginTop: '40px' }}>
            {step <= totalWizardSteps ? renderWizardStep() : renderWorkflowStep()}
          </div>

          {/* Navigation Controls */}
          {formData.lyricsStatus !== 'generating' && formData.sunoStatus !== 'generating' && (
            <div style={styles.navigationControls}>
              {step > 1 && (
                <button 
                  onClick={prevStep} 
                  className="btn btn-secondary"
                  style={{ padding: '12px 24px' }}
                >
                  ← Voltar
                </button>
              )}
              
              <div style={{ marginLeft: 'auto' }}>
                {step <= totalWizardSteps ? (
                  <button 
                    onClick={step === 9 ? handleSaveAndGenerateLyrics : nextStep}
                    disabled={isNextDisabled()}
                    className="btn btn-primary"
                    style={{
                      padding: '14px 32px',
                      fontSize: '1rem',
                      background: isNextDisabled() ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                      color: isNextDisabled() ? 'var(--text-muted)' : '#fff'
                    }}
                  >
                    {step === 9 ? '🎵 Criar Minha Música' : 'Próximo →'}
                  </button>
                ) : (
                  step < 13 && (
                    <button 
                      onClick={step === 10 ? handleApproveLyrics : nextStep}
                      disabled={isNextDisabled()}
                      className="btn btn-primary"
                      style={{
                        padding: '14px 32px',
                        fontSize: '1rem',
                        background: isNextDisabled() ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                        color: isNextDisabled() ? 'var(--text-muted)' : '#fff'
                      }}
                    >
                      {step === 10 ? 'Aprovar Letra & Criar Áudio →' : 'Avançar para Pacotes →'}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0a0a0c',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    borderRadius: 0,
    borderWidth: '0 0 1px 0',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepIndicator: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid var(--border-color)',
  },
  progressBarBg: {
    width: '100%',
    height: '6px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: '100px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
    transition: 'width 0.3s ease',
  },
  stepTitle: {
    fontSize: '2rem',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: '8px',
    fontFamily: 'var(--font-family-title)',
  },
  stepSubtitle: {
    fontSize: '1rem',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    marginBottom: '32px',
  },
  gridCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '16px',
    marginTop: '20px',
  },
  gridCards2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  wizardCard: {
    aspectRatio: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid',
    borderRadius: 'var(--border-radius-md)',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    userSelect: 'none',
  },
  wizardCardLarge: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    border: '1px solid',
    borderRadius: 'var(--border-radius-md)',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    userSelect: 'none',
  },
  checkCircle: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
  },
  wizardInput: {
    width: '100%',
    padding: '16px 20px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontFamily: 'var(--font-family-body)',
    fontSize: '1.15rem',
    outline: 'none',
    transition: 'all 0.2s',
    marginTop: '20px',
    textAlign: 'center',
  },
  wizardLabel: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '8px',
    display: 'block',
  },
  wizardTextarea: {
    width: '100%',
    padding: '16px 20px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontFamily: 'var(--font-family-body)',
    fontSize: '1rem',
    outline: 'none',
    transition: 'all 0.2s',
    resize: 'vertical',
  },
  wizardListBtn: {
    width: '100%',
    padding: '16px',
    border: '1px solid',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
  },
  wizardPillBtn: {
    padding: '14px 28px',
    borderRadius: '100px',
    border: '1px solid',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  voiceBtn: {
    flex: 1,
    padding: '18px',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontSize: '1.05rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.25s',
  },
  navigationControls: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '40px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '24px',
  },
  checkoutSummary: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  summaryItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.95rem',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    paddingBottom: '8px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.95rem',
  },
  infoAlert: {
    padding: '16px 20px',
    borderRadius: 'var(--border-radius-sm)',
    border: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  generatingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    textAlign: 'center',
  },
  spinner: {
    width: '60px',
    height: '60px',
    border: '4px solid rgba(255,255,255,0.06)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  lyricsBox: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-md)',
    padding: '32px',
  },
  lyricsText: {
    fontFamily: 'var(--font-family-body)',
    fontSize: '1.05rem',
    lineHeight: '1.75',
    color: '#fff',
    whiteSpace: 'pre-wrap',
  },
  lyricsActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  packagesSelectGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '700px',
    margin: '30px auto 0',
  },
  pkgSelectCard: {
    padding: '24px 32px',
    borderRadius: 'var(--border-radius-md)',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.25s',
  },
  addonsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '700px',
    margin: '30px auto 0',
  },
  addonItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 24px',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
};
