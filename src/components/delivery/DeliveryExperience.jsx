'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import SongCard from './SongCard';
import PurchaseCheckout from './PurchaseCheckout';
import SecondSongOffer from './SecondSongOffer';
import ReferralCard from '@/components/account/ReferralCard';

export default function DeliveryExperience({
  order,
  orderId,
  paid,
  tracks,
  promo,
  onDownload,
  downloadingSlot,
  onCoverChange,
  uploadingCover,
  coverError,
  onChooseGiftTrack,
  onProduct,
  onCharge,
  receiptStatus,
  onReceipt,
  onApproved,
  supportUrl,
  firstGenOrder,
  firstGenTracks,
  secondGenOrder,
  secondGenTracks,
  activeGenTab,
  onSelectGenTab,
}) {
  const isChildOrder = Boolean(
    order?.parentOrderId ||
    order?.extras?.parentOrderId ||
    order?.origem === 'segunda_geracao' ||
    order?.isSecondGeneration ||
    order?.extras?.isSecondGeneration
  );

  const [internalTab, setInternalTab] = useState(isChildOrder ? 'second' : 'first');
  const activeTab = activeGenTab !== undefined ? activeGenTab : internalTab;
  const setActiveTab = onSelectGenTab || setInternalTab;

  const effectiveFirstTracks = firstGenTracks?.length ? firstGenTracks : tracks;
  const hasSecondGen = Boolean(secondGenOrder);
  const hasSecondGenAudio = Boolean(
    secondGenTracks?.length > 0 ||
    secondGenOrder?.audioUrl ||
    (Array.isArray(secondGenOrder?.audioFiles) && secondGenOrder.audioFiles.length > 0) ||
    ['AUDIO_GERADO', 'CONCLUIDO', 'FINALIZADO', 'ENTREGUE'].includes(secondGenOrder?.productionStatus)
  );
  const isSecondGenGenerating = hasSecondGen && !hasSecondGenAudio && (
    secondGenOrder?.productionStatus === 'PROCESSANDO' ||
    secondGenOrder?.productionStatus === 'GERANDO' ||
    secondGenOrder?.productionStatus === 'GERANDO_AUDIO' ||
    secondGenOrder?.productionStatus === 'EM_PRODUCAO'
  );

  const secondGenUsed = Boolean(
    (order?.segundaGeracaoUsada || order?.extras?.segundaGeracaoUsada) && (hasSecondGenAudio || !secondGenOrder)
  ) || hasSecondGenAudio;
  const hasFreeSecondGen = Boolean(paid && !isChildOrder && !secondGenUsed && !isSecondGenGenerating);

  const primarySongCard = (
    <SongCard
      order={firstGenOrder || order}
      orderId={firstGenOrder?.id || orderId}
      paid={paid}
      tracks={effectiveFirstTracks}
      generationLabel={hasSecondGen ? `🎵 1ª Canção · Para ${firstGenOrder?.honoreeName || 'alguém especial'}` : null}
      trackOffset={0}
      onDownload={onDownload}
      downloadingSlot={downloadingSlot}
      onCoverChange={onCoverChange}
      uploadingCover={uploadingCover}
      coverError={coverError}
      onChooseGiftTrack={onChooseGiftTrack}
    />
  );

  const secondSongCard = hasSecondGen ? (
    hasSecondGenAudio ? (
      <SongCard
        order={secondGenOrder}
        orderId={secondGenOrder?.id || secondGenOrder?.orderNumber}
        paid={paid}
        tracks={secondGenTracks}
        generationLabel={`✨ 2ª Canção · Para ${secondGenOrder?.honoreeName || 'alguém especial'}`}
        trackOffset={2}
        onDownload={onDownload}
        downloadingSlot={downloadingSlot}
        onCoverChange={onCoverChange}
        uploadingCover={uploadingCover}
        coverError={coverError}
        onChooseGiftTrack={onChooseGiftTrack}
      />
    ) : isSecondGenGenerating ? (
      <article
        className="nx-card"
        style={{
          border: '1.5px dashed #a855f7',
          background: '#faf5ff',
          textAlign: 'center',
          padding: '28px 20px',
          borderRadius: '20px'
        }}
      >
        <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>⏳</div>
        <span
          style={{
            display: 'inline-block',
            fontSize: '0.72rem',
            fontWeight: '800',
            textTransform: 'uppercase',
            color: '#7e22ce',
            background: '#f3e8ff',
            padding: '3px 10px',
            borderRadius: '999px',
            marginBottom: '8px'
          }}
        >
          2ª Canção em Produção
        </span>
        <h3 style={{ color: '#581c87', margin: '0 0 8px', fontSize: '1.2rem' }}>
          As músicas para {secondGenOrder?.honoreeName || 'sua segunda homenagem'} estão sendo preparadas pelo estúdio!
        </h3>
        <p style={{ color: '#6b21a8', fontSize: '0.88rem', margin: '0 auto 16px', maxWidth: '420px', lineHeight: 1.5 }}>
          Nossa inteligência artificial está finalizando os arranjos e vocais. Elas aparecerão automaticamente aqui assim que ficarem prontas.
        </p>
        <button
          type="button"
          className="nx-button"
          onClick={() => window.location.reload()}
          style={{ background: '#7e22ce', color: '#fff', borderColor: '#7e22ce' }}
        >
          🔄 Atualizar página para verificar
        </button>
      </article>
    ) : (
      <article
        className="nx-card"
        style={{
          border: '1.5px dashed #64748b',
          background: '#f8fafc',
          textAlign: 'center',
          padding: '28px 20px',
          borderRadius: '20px'
        }}
      >
        <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>📝</div>
        <span
          style={{
            display: 'inline-block',
            fontSize: '0.72rem',
            fontWeight: '800',
            textTransform: 'uppercase',
            color: '#475569',
            background: '#e2e8f0',
            padding: '3px 10px',
            borderRadius: '999px',
            marginBottom: '8px'
          }}
        >
          2ª Canção em Rascunho
        </span>
        <h3 style={{ color: '#1e293b', margin: '0 0 8px', fontSize: '1.2rem' }}>
          Você iniciou a criação para {secondGenOrder?.honoreeName || 'alguém especial'}!
        </h3>
        <p style={{ color: '#475569', fontSize: '0.88rem', margin: '0 auto 16px', maxWidth: '420px', lineHeight: 1.5 }}>
          A letra e os detalhes estão salvos no seu rascunho. Continue para enviar ao estúdio e gerar as músicas.
        </p>
        <Link
          href={`/criar?orderRef=${encodeURIComponent(secondGenOrder?.id || secondGenOrder?.orderNumber || '')}`}
          className="nx-button"
          style={{ background: '#059669', color: '#fff', borderColor: '#059669', textDecoration: 'none' }}
        >
          Continuar Criação da 2ª Música →
        </Link>
      </article>
    )
  ) : null;

  const isSecondTab = activeTab === 'second' && hasSecondGen;
  const currentOrderForBonuses = isSecondTab ? secondGenOrder : (firstGenOrder || order);

  const bonuses = [
    {
      key: 'video',
      label: 'Vídeo homenagem',
      owned: Boolean(
        currentOrderForBonuses?.hasVideoAccess ||
        currentOrderForBonuses?.videoAddonPaid ||
        currentOrderForBonuses?.videoUrl ||
        (!isSecondTab && order?.hasVideoAccess)
      ),
      action: (currentOrderForBonuses?.videoUrl)
        ? 'Assistir e baixar'
        : currentOrderForBonuses?.videoStatus === 'GERANDO'
          ? 'Acompanhar produção'
          : 'Adicionar minhas fotos'
    },
    {
      key: 'carta',
      label: 'Carta virtual',
      owned: Boolean(
        currentOrderForBonuses?.hasCartaAccess ||
        currentOrderForBonuses?.cartaAddonPaid ||
        (!isSecondTab && order?.hasCartaAccess)
      ),
      action: (currentOrderForBonuses?.cartaTexto) ? 'Ver ou editar carta' : 'Escrever minha carta'
    },
    {
      key: 'retrospectiva',
      label: 'Retrospectiva',
      owned: Boolean(
        currentOrderForBonuses?.hasRetrospectivaAccess ||
        currentOrderForBonuses?.retrospectivaAddonPaid ||
        (!isSecondTab && order?.hasRetrospectivaAccess)
      ),
      action: 'Montar minha retrospectiva'
    },
    {
      key: 'playback',
      label: 'Playback instrumental',
      owned: Boolean(
        currentOrderForBonuses?.hasPlaybackAccess ||
        currentOrderForBonuses?.playbackAddonPaid ||
        (!isSecondTab && order?.hasPlaybackAccess)
      ),
      action: 'Ouvir e baixar'
    },
    {
      key: 'karaoke',
      label: 'Vídeo karaokê',
      owned: Boolean(
        currentOrderForBonuses?.hasKaraokeAccess ||
        currentOrderForBonuses?.karaokeAddonPaid ||
        (!isSecondTab && order?.hasKaraokeAccess)
      ),
      action: 'Acessar meu karaokê'
    },
    {
      key: 'voz',
      label: 'Minha voz',
      owned: Boolean(
        currentOrderForBonuses?.hasCustomVoiceAccess ||
        currentOrderForBonuses?.customVoiceAddonPaid ||
        (!isSecondTab && order?.hasCustomVoiceAccess)
      ),
      action: 'Personalizar minha voz'
    },
  ];

  return (
    <div className="nx-experience">
      <header className="nx-header">
        <div className="nx-header-inner">
          <Link href="/" className="nx-brand">
            <Image src="/logo.png" alt="NS Music" width={44} height={44} />
            <span>Histórias que viram música.</span>
          </Link>
          <Link href="/conta" className="nx-account-link">Minha conta</Link>
        </div>
      </header>

      <main className="nx-main">
        {!paid ? (
          <>
            <div className="nx-head">
              <span className="nx-eyebrow">Sua história já virou música</span>
              <h1>O começo de um presente inesquecível.</h1>
              <p>Ouça a prévia para {order?.honoreeName || 'alguém especial'}. Depois, escolha como quer emocionar.</p>
            </div>
            <div className="nx-preview-layout nx-preview-focused">
              {primarySongCard}
            </div>
            <PurchaseCheckout
              orderId={orderId}
              promo={promo}
              onCharge={onCharge}
              receiptStatus={receiptStatus}
              onReceipt={onReceipt}
              onApproved={onApproved}
            />
          </>
        ) : (
          <div className="nx-post-layout">
            {hasSecondGen ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, #fdf2f8 0%, #f5f3ff 100%)',
                  border: '1.5px solid #f472b6',
                  borderRadius: '20px',
                  padding: '16px 20px',
                  marginBottom: '14px',
                  textAlign: 'center',
                  boxShadow: '0 4px 15px rgba(244, 114, 182, 0.12)'
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '0.74rem',
                    fontWeight: '800',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#be185d',
                    background: '#fce7f3',
                    padding: '3px 12px',
                    borderRadius: '999px',
                    marginBottom: '6px'
                  }}
                >
                  🎁 Pacote de 4 Músicas Liberado
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e1b4b', margin: '0 0 6px' }}>
                  Suas 4 Músicas Personalizadas
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  Você tem acesso a <strong>todas as 4 versões completas</strong> (2 da 1ª homenagem + 2 da 2ª homenagem). Alterne entre as abas abaixo para ouvir, compartilhar ou personalizar os extras de cada uma.
                </p>
              </div>
            ) : (
              <p className="nx-message nx-success">
                Pagamento confirmado. Seu presente está liberado para ouvir e guardar.
              </p>
            )}

            {/* SELETOR DE ABAS QUANDO EXISTE 2ª GERAÇÃO */}
            {hasSecondGen && (
              <div
                role="tablist"
                aria-label="Escolha a homenagem"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '6px',
                  borderRadius: '16px',
                  marginBottom: '18px'
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSecondTab}
                  onClick={() => setActiveTab('first')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 10px',
                    borderRadius: '12px',
                    border: !isSecondTab ? '1.5px solid #059669' : '1.5px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: !isSecondTab ? '#ffffff' : 'transparent',
                    boxShadow: !isSecondTab ? '0 2px 10px rgba(5, 150, 105, 0.12)' : 'none',
                    color: !isSecondTab ? '#065f46' : '#64748b',
                    fontWeight: !isSecondTab ? 700 : 500,
                  }}
                >
                  <span style={{ fontSize: '0.94rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎵</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {firstGenOrder?.honoreeName ? `Para ${firstGenOrder.honoreeName}` : '1ª Canção'}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: '3px' }}>
                    Músicas 1 e 2
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={isSecondTab}
                  onClick={() => setActiveTab('second')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 10px',
                    borderRadius: '12px',
                    border: isSecondTab ? '1.5px solid #7c3aed' : '1.5px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: isSecondTab ? '#ffffff' : 'transparent',
                    boxShadow: isSecondTab ? '0 2px 10px rgba(124, 58, 237, 0.12)' : 'none',
                    color: isSecondTab ? '#5b21b6' : '#64748b',
                    fontWeight: isSecondTab ? 700 : 500,
                  }}
                >
                  <span style={{ fontSize: '0.94rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✨</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {secondGenOrder?.honoreeName ? `Para ${secondGenOrder.honoreeName}` : '2ª Canção'}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: '3px' }}>
                    {isSecondGenGenerating ? 'Em produção...' : 'Músicas 3 e 4'}
                  </span>
                </button>
              </div>
            )}

            {/* CARD DA MÚSICA SELECIONADA */}
            {isSecondTab ? secondSongCard : primarySongCard}

            {/* EXTRAS E ARQUIVOS VINCULADOS À HOMENAGEM ATIVA */}
            {bonuses.some(item => item.owned) && (
              <section>
                <div className="nx-section-heading">
                  <h2>
                    Seus presentes e arquivos
                    {hasSecondGen && (
                      <span style={{ fontSize: '0.84rem', fontWeight: 500, color: '#64748b', display: 'block', marginTop: '2px' }}>
                        Personalizados para {currentOrderForBonuses?.honoreeName || (isSecondTab ? '2ª Canção' : '1ª Canção')}
                      </span>
                    )}
                  </h2>
                  <p>Personalize os itens que acompanham a sua música.</p>
                </div>
                <div className="nx-bonus-grid">
                  {bonuses.filter(item => item.owned).map(item => (
                    <article className="nx-card" key={item.key}>
                      <h3>{item.label}</h3>
                      <button type="button" className="nx-text-button" onClick={() => onProduct(item.key)}>
                        {item.action} →
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {!hasSecondGen && <SecondSongOffer orderId={orderId} order={order} />}
            <ReferralCard />

            <details className="nx-card nx-extra-options">
              <summary>
                Quero completar meu presente
                {hasSecondGen && (
                  <span style={{ fontSize: '0.82rem', fontWeight: 400, color: '#64748b', marginLeft: '6px' }}>
                    (para {currentOrderForBonuses?.honoreeName || (isSecondTab ? '2ª canção' : '1ª canção')})
                  </span>
                )}
              </summary>
              <div className="nx-chips">
                {bonuses.filter(item => !item.owned).map(item => (
                  <button type="button" key={item.key} onClick={() => onProduct(item.key)}>
                    {item.label} →
                  </button>
                ))}
              </div>
              <p className="nx-helper">Você vê os detalhes e o preço antes de comprar um complemento.</p>
            </details>

            {hasFreeSecondGen ? (
              <Link
                href={`/criar?novo=1&origem=segunda_geracao&orderRef=${encodeURIComponent(orderId || order?.id || '')}`}
                className="nx-button"
                style={{ background: '#059669', borderColor: '#059669', color: '#ffffff', fontWeight: 700 }}
              >
                ✨ Criar Minhas +2 Músicas Grátis
              </Link>
            ) : (
              <Link href="/criar?novo=1" className="nx-button">
                Criar outra música
              </Link>
            )}
          </div>
        )}

        <footer className="nx-helper" style={{ textAlign: 'center', marginTop: 38 }}>
          Precisa de ajuda? <a href={supportUrl} target="_blank" rel="noopener noreferrer">Fale com a gente no WhatsApp</a>
        </footer>
      </main>
    </div>
  );
}
