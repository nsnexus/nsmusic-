'use client';

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
}) {
  const effectiveFirstTracks = firstGenTracks?.length ? firstGenTracks : tracks;
  const hasSecondGen = Boolean(secondGenOrder);
  const hasSecondGenAudio = Boolean(
    secondGenTracks?.length > 0 ||
    secondGenOrder?.audioUrl ||
    (Array.isArray(secondGenOrder?.audioFiles) && secondGenOrder.audioFiles.length > 0)
  );
  const isSecondGenGenerating = hasSecondGen && !hasSecondGenAudio && (
    secondGenOrder?.productionStatus === 'PROCESSANDO' ||
    secondGenOrder?.productionStatus === 'GERANDO' ||
    secondGenOrder?.productionStatus === 'RASCUNHO'
  );

  const primarySongCard = (
    <SongCard
      order={firstGenOrder || order}
      orderId={firstGenOrder?.id || orderId}
      paid={paid}
      tracks={effectiveFirstTracks}
      generationLabel={hasSecondGen ? '🎵 1ª Geração · Músicas 1 e 2' : null}
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
      <div style={{ marginTop: '24px' }}>
        <SongCard
          order={secondGenOrder}
          orderId={secondGenOrder?.id}
          paid={paid}
          tracks={secondGenTracks}
          generationLabel="✨ 2ª Geração Bônus · Músicas 3 e 4"
          trackOffset={2}
          onDownload={onDownload}
          downloadingSlot={downloadingSlot}
          onCoverChange={onCoverChange}
          uploadingCover={uploadingCover}
          coverError={coverError}
          onChooseGiftTrack={onChooseGiftTrack}
        />
      </div>
    ) : isSecondGenGenerating ? (
      <article
        className="nx-card"
        style={{
          marginTop: '24px',
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
          2ª Geração em Produção
        </span>
        <h3 style={{ color: '#581c87', margin: '0 0 8px', fontSize: '1.2rem' }}>
          Suas outras 2 músicas estão sendo preparadas pelo estúdio!
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
    ) : null
  ) : null;

  const currentOrderForBonuses = firstGenOrder || order;
  const bonuses = [
    { key: 'video', label: 'Vídeo homenagem', owned: Boolean(currentOrderForBonuses.hasVideoAccess || currentOrderForBonuses.videoAddonPaid || currentOrderForBonuses.videoUrl || order?.hasVideoAccess), action: (currentOrderForBonuses.videoUrl || order?.videoUrl) ? 'Assistir e baixar' : currentOrderForBonuses.videoStatus === 'GERANDO' ? 'Acompanhar produção' : 'Adicionar minhas fotos' },
    { key: 'carta', label: 'Carta virtual', owned: Boolean(currentOrderForBonuses.hasCartaAccess || currentOrderForBonuses.cartaAddonPaid || order?.hasCartaAccess), action: (currentOrderForBonuses.cartaTexto || order?.cartaTexto) ? 'Ver ou editar carta' : 'Escrever minha carta' },
    { key: 'retrospectiva', label: 'Retrospectiva', owned: Boolean(currentOrderForBonuses.hasRetrospectivaAccess || currentOrderForBonuses.retrospectivaAddonPaid || order?.hasRetrospectivaAccess), action: 'Montar minha retrospectiva' },
    { key: 'playback', label: 'Playback instrumental', owned: Boolean(currentOrderForBonuses.hasPlaybackAccess || currentOrderForBonuses.playbackAddonPaid || order?.hasPlaybackAccess), action: 'Ouvir e baixar' },
    { key: 'karaoke', label: 'Vídeo karaokê', owned: Boolean(currentOrderForBonuses.hasKaraokeAccess || currentOrderForBonuses.karaokeAddonPaid || order?.hasKaraokeAccess), action: 'Acessar meu karaokê' },
    { key: 'voz', label: 'Minha voz', owned: Boolean(currentOrderForBonuses.hasCustomVoiceAccess || currentOrderForBonuses.customVoiceAddonPaid || order?.hasCustomVoiceAccess), action: 'Personalizar minha voz' },
  ];

  return (
    <div className="nx-experience">
      <header className="nx-header">
        <div className="nx-header-inner">
          <Link href="/" className="nx-brand">
            <Image src="/logo.png" alt="NS Music" width={44} height={44} priority />
            <span>Histórias que viram música.</span>
          </Link>
          <Link className="nx-account-link" href="/conta">Minha conta</Link>
        </div>
      </header>

      <main className="nx-delivery-main">
        {!paid ? (
          <>
            <div className="nx-center-head">
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
                  marginBottom: '10px',
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
                  Você tem acesso a <strong>todas as 4 versões completas</strong> abaixo (2 da 1ª geração + 2 da 2ª geração bônus).
                </p>
              </div>
            ) : (
              <p className="nx-message nx-success">
                Pagamento confirmado. Seu presente está liberado para ouvir e guardar.
              </p>
            )}

            {primarySongCard}
            {secondSongCard}

            {bonuses.some(item => item.owned) && (
              <section>
                <div className="nx-section-heading">
                  <h2>Seus presentes e arquivos</h2>
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

            <SecondSongOffer orderId={orderId} order={order} />
            <ReferralCard />

            <details className="nx-card nx-extra-options">
              <summary>Quero completar meu presente</summary>
              <div className="nx-chips">
                {bonuses.filter(item => !item.owned).map(item => (
                  <button type="button" key={item.key} onClick={() => onProduct(item.key)}>
                    {item.label} →
                  </button>
                ))}
              </div>
              <p className="nx-helper">Você vê os detalhes e o preço antes de comprar um complemento.</p>
            </details>

            <Link href="/criar?novo=1" className="nx-button">
              Criar outra música
            </Link>
          </div>
        )}

        <footer className="nx-helper" style={{ textAlign: 'center', marginTop: 38 }}>
          Precisa de ajuda? <a href={supportUrl} target="_blank" rel="noopener noreferrer">Fale com a gente no WhatsApp</a>
        </footer>
      </main>
    </div>
  );
}
