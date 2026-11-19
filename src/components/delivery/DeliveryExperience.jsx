'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import CompletePresente from './CompletePresente';
import AtalhosPresentes from './AtalhosPresentes';
import CompartilharPresente from './CompartilharPresente';
import Image from 'next/image';
import SongCard from './SongCard';
import PurchaseCheckout from './PurchaseCheckout';
import SecondSongOffer from './SecondSongOffer';
import GeracoesExtrasFamilia from './GeracoesExtrasFamilia';
import MobileValueComparison from './MobileValueComparison';
import MobileTrustBadges from './MobileTrustBadges';
import MobileStickyBar from './MobileStickyBar';

const PreviaEncerradaModal = dynamic(() => import('./PreviaEncerradaModal'), { ssr: false });

// Leva o cliente até a escolha de pacote. Usado pelo pop-up de fim de prévia e pela barra fixa.
function irParaPagamento() {
  const el = document.getElementById('checkout-panel') || document.getElementById('pagamento');
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function DeliveryExperience({
  order,
  orderId,
  paid,
  tracks,
  promo,
  onDownload,
  downloadingSlot,
  onCoverChange,
  onReframeCover,
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
  // Quando os 60s de prévia acabam, o cliente precisa ver na hora onde comprar — antes o player
  // só parava e a página ficava sem nenhum caminho visível até o cliente rolar.
  const [previaEncerrada, setPreviaEncerrada] = useState(false);
  const handlePreviewEnded = () => { if (!paid) setPreviaEncerrada(true); };
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
      onReframeCover={onReframeCover}
      uploadingCover={uploadingCover}
      coverError={coverError}
      onChooseGiftTrack={onChooseGiftTrack}
      onPreviewEnded={handlePreviewEnded}
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
        onReframeCover={onReframeCover}
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
          style={{ background: 'var(--nx-pay, #059669)', color: '#fff', borderColor: '#059669', textDecoration: 'none' }}
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

      <main
        className="nx-main nx-delivery-main"
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: '24px 16px 90px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
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

            {/* Comparativo de Valor Mobile: Prévia vs Oficial */}
            <MobileValueComparison honoreeName={order?.honoreeName} />

            {/* Badges de Confiança e Garantia de Emoção */}
            <MobileTrustBadges />

            {/* Barra Fixa Flutuante para Celular */}
            <MobileStickyBar onScrollToCheckout={irParaPagamento} />

            <PreviaEncerradaModal
              isOpen={previaEncerrada}
              onClose={() => setPreviaEncerrada(false)}
              onGoToPix={() => { setPreviaEncerrada(false); irParaPagamento(); }}
              honoreeName={order?.honoreeName}
            />
          </>
        ) : (
          <div className="nx-post-layout">

            {/* SELETOR DE ABAS QUANDO EXISTE 2ª GERAÇÃO */}
            {hasSecondGen && (
              <div
                role="tablist"
                aria-label="Escolha a homenagem"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '6px',
                  borderRadius: '16px',
                  marginBottom: '12px'
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
                    padding: '10px 6px',
                    minWidth: 0,
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
                  <span style={{ fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%', minWidth: 0 }}>
                    <span>🎵</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
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
                    padding: '10px 6px',
                    minWidth: 0,
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
                  <span style={{ fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%', minWidth: 0 }}>
                    <span>✨</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {secondGenOrder?.honoreeName ? `Para ${secondGenOrder.honoreeName}` : '2ª Canção'}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: '3px' }}>
                    {isSecondGenGenerating ? 'Em produção...' : 'Músicas 3 e 4'}
                  </span>
                </button>
              </div>
            )}

            <AtalhosPresentes itens={bonuses} onProduct={onProduct} />

            {/* CARD DA MÚSICA SELECIONADA */}
            <div id="minhas-musicas" style={{ scrollMarginTop: '16px' }}>
              {isSecondTab ? secondSongCard : primarySongCard}
            </div>

            <CompletePresente itens={bonuses} onProduct={onProduct} />

            <CompartilharPresente order={currentOrderForBonuses || order} orderId={currentOrderForBonuses?.id || orderId} />

            <GeracoesExtrasFamilia order={order} />

            {!hasSecondGen && <SecondSongOffer orderId={orderId} order={order} />}


          </div>
        )}

        <footer className="nx-helper" style={{ textAlign: 'center', marginTop: 38 }}>
          Precisa de ajuda? <a href={supportUrl} target="_blank" rel="noopener noreferrer">Fale com a gente no WhatsApp</a>
        </footer>
      </main>
    </div>
  );
}
