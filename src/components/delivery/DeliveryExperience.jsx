'use client';

import Link from 'next/link';
import Image from 'next/image';
import SongCard from './SongCard';
import PurchaseCheckout from './PurchaseCheckout';
import SecondSongOffer from './SecondSongOffer';
import ReferralCard from '@/components/account/ReferralCard';

export default function DeliveryExperience({ order, orderId, paid, tracks, promo, onDownload, downloadingSlot, onCoverChange, uploadingCover, coverError, onChooseGiftTrack, onProduct, onCharge, receiptStatus, onReceipt, onApproved, supportUrl }) {
  const song = <SongCard order={order} orderId={orderId} paid={paid} tracks={tracks} onDownload={onDownload} downloadingSlot={downloadingSlot} onCoverChange={onCoverChange} uploadingCover={uploadingCover} coverError={coverError} onChooseGiftTrack={onChooseGiftTrack} />;
  const bonuses = [
    { key: 'video', label: 'Vídeo homenagem', owned: order.hasVideoAccess || order.videoAddonPaid || order.videoUrl, action: order.videoUrl ? 'Assistir e baixar' : order.videoStatus === 'GERANDO' ? 'Acompanhar produção' : 'Adicionar minhas fotos' },
    { key: 'carta', label: 'Carta virtual', owned: order.hasCartaAccess || order.cartaAddonPaid, action: order.cartaTexto ? 'Ver ou editar carta' : 'Escrever minha carta' },
    { key: 'retrospectiva', label: 'Retrospectiva', owned: order.hasRetrospectivaAccess || order.retrospectivaAddonPaid, action: 'Montar minha retrospectiva' },
    { key: 'playback', label: 'Playback instrumental', owned: order.hasPlaybackAccess || order.playbackAddonPaid, action: 'Ouvir e baixar' },
    { key: 'karaoke', label: 'Vídeo karaokê', owned: order.hasKaraokeAccess || order.karaokeAddonPaid, action: 'Acessar meu karaokê' },
    { key: 'voz', label: 'Minha voz', owned: order.hasCustomVoiceAccess || order.customVoiceAddonPaid, action: 'Personalizar minha voz' },
  ];
  return <div className="nx-experience"><header className="nx-header"><div className="nx-header-inner"><Link href="/" className="nx-brand"><Image src="/logo.png" alt="NS Music" width={44} height={44} priority /><span>Histórias que viram música.</span></Link><Link className="nx-account-link" href="/conta">Minha conta</Link></div></header>
    <main className="nx-delivery-main">
      {!paid ? <><div className="nx-center-head"><span className="nx-eyebrow">Sua história já virou música</span><h1>O começo de um presente inesquecível.</h1><p>Ouça a prévia para {order.honoreeName || 'alguém especial'}. Depois, escolha como quer emocionar.</p></div><div className="nx-preview-layout nx-preview-focused">{song}</div><PurchaseCheckout orderId={orderId} promo={promo} onCharge={onCharge} receiptStatus={receiptStatus} onReceipt={onReceipt} onApproved={onApproved} /></> : <div className="nx-post-layout"><p className="nx-message nx-success">Pagamento confirmado. Seu presente está liberado para ouvir e guardar.</p>{song}{bonuses.some(item => item.owned) && <section><div className="nx-section-heading"><h2>Seus presentes e arquivos</h2><p>Personalize os itens que acompanham a sua música.</p></div><div className="nx-bonus-grid">{bonuses.filter(item => item.owned).map(item => <article className="nx-card" key={item.key}><h3>{item.label}</h3><button type="button" className="nx-text-button" onClick={() => onProduct(item.key)}>{item.action} →</button></article>)}</div></section>}<SecondSongOffer orderId={orderId} order={order} /><ReferralCard /><details className="nx-card nx-extra-options"><summary>Quero completar meu presente</summary><div className="nx-chips">{bonuses.filter(item => !item.owned).map(item => <button type="button" key={item.key} onClick={() => onProduct(item.key)}>{item.label} →</button>)}</div><p className="nx-helper">Você vê os detalhes e o preço antes de comprar um complemento.</p></details><Link href="/criar?novo=1" className="nx-button">Criar outra música</Link></div>}
      <footer className="nx-helper" style={{ textAlign: 'center', marginTop: 38 }}>Precisa de ajuda? <a href={supportUrl} target="_blank" rel="noopener noreferrer">Fale com a gente no WhatsApp</a></footer>
    </main>
  </div>;
}
