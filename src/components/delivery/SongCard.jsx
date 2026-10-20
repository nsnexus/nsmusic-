'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Share2, Download } from 'lucide-react';
import { markPreviewListened } from '@/lib/previewTracking';
import { isInAppBrowser } from '@/lib/inAppBrowser';

export default function SongCard({ order, orderId, tracks, paid, onDownload, downloadingSlot, onCoverChange, uploadingCover, coverError, onChooseGiftTrack }) {
  const [version, setVersion] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(isInAppBrowser()); }, []);
  const audio = useRef(null);
  const available = tracks.filter(Boolean);
  const index = Math.min(version, Math.max(available.length - 1, 0));
  const source = available[index] || '';
  const previewDuration = element => Math.min(60, Number.isFinite(element.duration) ? element.duration : 60);
  useEffect(() => {
    setAudioError(false);
    const element = audio.current;
    return () => { element?.pause(); };
  }, [source]);

  const share = async () => {
    const url = `${window.location.origin}/h/${encodeURIComponent(orderId)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Uma homenagem para ${order.honoreeName}`, text: 'Preparei uma música para você.', url });
      else { await navigator.clipboard.writeText(url); setMessage('Link do presente copiado.'); }
    } catch (error) { if (error.name !== 'AbortError') setMessage('Não foi possível compartilhar agora. Tente novamente.'); }
  };

  return <article className="nx-card">
    <div className="nx-song-heading"><div className="nx-song-top"><Image src={order.coverUrl || '/experiencia/familia.webp'} alt="Capa da sua música" width={160} height={172} unoptimized={Boolean(order.coverUrl)} /><div><span className="nx-eyebrow">Um presente só seu</span><h2>Uma canção para {order.honoreeName || 'alguém especial'}</h2><p>De {order.customerName || 'você'}, com carinho.</p></div></div>{paid && <button type="button" className="nx-share-button" aria-label="Compartilhar presente" onClick={share}><Share2 size={19} /></button>}</div>
    <div className="nx-versions" role="group" aria-label="Versões da música">{available.map((_, number) => <button type="button" key={number} aria-pressed={index === number} style={{ minHeight: '44px', fontWeight: '600' }} onClick={() => { audio.current?.pause(); setVersion(number); }}>Versão {number + 1}{!paid ? ' · prévia' : ''}</button>)}</div>
    {source ? <audio
      ref={audio} key={`${source}-${reload}`} src={reload ? `${source}${source.includes('?') ? '&' : '?'}retry=${reload}` : source}
      controls preload="metadata" controlsList={paid ? undefined : 'nodownload noplaybackrate'}
      style={{ width: '100%', height: 46 }} aria-label={`${paid ? 'Música completa' : 'Prévia de até 60 segundos'}, versão ${index + 1}`}
      onContextMenu={event => { if (!paid) event.preventDefault(); }}
      onPlay={event => { if (!paid) { if (event.currentTarget.currentTime >= previewDuration(event.currentTarget)) event.currentTarget.currentTime = 0; markPreviewListened(orderId); } }}
      onTimeUpdate={event => { if (!paid && event.currentTarget.currentTime >= previewDuration(event.currentTarget)) { event.currentTarget.pause(); event.currentTarget.currentTime = 0; } }}
      onSeeking={event => { if (!paid && event.currentTarget.currentTime > previewDuration(event.currentTarget)) event.currentTarget.currentTime = previewDuration(event.currentTarget); }}
      onCanPlay={() => setAudioError(false)} onError={() => setAudioError(true)}
    /> : <p className="nx-message" role="status">Preparando os arquivos da sua música. Eles aparecem aqui assim que estiverem prontos.</p>}
    {audioError && <div className="nx-message nx-error" role="alert">Não foi possível carregar o áudio. Sua música continua salva.<br /><button type="button" className="nx-text-button" onClick={() => { setAudioError(false); setReload(Date.now()); }}>Tentar carregar novamente</button></div>}
    {!paid && <p className="nx-preview-note">Prévia gratuita de até 60 segundos em cada versão. A compra libera as músicas completas e os arquivos MP3.</p>}
    {paid && source && <div className="nx-song-actions"><button type="button" className="nx-button nx-primary" disabled={Boolean(downloadingSlot)} onClick={() => onDownload(source, `Musica_V${index + 1}_${order.honoreeName || 'Homenagem'}.mp3`, index ? 'second' : 'primary')}><Download size={18} />{downloadingSlot ? 'Preparando download…' : `Baixar MP3 · versão ${index + 1}`}</button></div>}
    {message && <p className="nx-message" role="status">{message}</p>}
    {paid && inApp && <div className="nx-message">Se o aplicativo não permitir salvar o MP3, abra esta página no Chrome ou Safari pelo menu do aplicativo.<br /><button type="button" className="nx-text-button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setMessage('Link desta página copiado. Cole no navegador para baixar.'); } catch { setMessage('Use o menu do aplicativo e escolha abrir no navegador.'); } }}>Copiar link para abrir no navegador</button></div>}
    <details className="nx-details"><summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>Ver a letra da música</summary><div className="nx-lyrics">{order.lyrics || order.sunoTracks?.[0]?.prompt || 'A letra ainda está sendo preparada.'}</div></details>
    <details className="nx-details"><summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>Personalizar meu presente</summary>
      <label className="nx-field"><span>Trocar foto de capa</span><input type="file" accept="image/*" onChange={onCoverChange} disabled={uploadingCover} /></label>
      {uploadingCover && <p className="nx-helper" role="status">Enviando sua foto…</p>}{coverError && <p className="nx-message nx-error" role="alert">{coverError}</p>}
      {paid && available.length > 1 && onChooseGiftTrack && <label className="nx-field"><span>Versão que toca na página de presente</span><select value={order.homenagemMusicaUrl === order.audioFiles?.[1] ? '1' : '0'} onChange={event => onChooseGiftTrack(order.audioFiles?.[Number(event.target.value)] || order.audioUrl, Number(event.target.value))}><option value="0">Versão 1</option><option value="1">Versão 2</option></select></label>}
    </details>
  </article>;
}
