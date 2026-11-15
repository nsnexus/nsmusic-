'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Download, MessageCircle, Pencil, Crop } from 'lucide-react';
import { markPreviewListened } from '@/lib/previewTracking';
import { isInAppBrowser, isIOS, isAndroid, getChromeIntentUrl } from '@/lib/inAppBrowser';
import CustomAudioPlayer from './CustomAudioPlayer';

export default function SongCard({
  order,
  orderId,
  tracks,
  paid,
  onDownload,
  downloadingSlot,
  onCoverChange,
  onReframeCover,
  uploadingCover,
  coverError,
  onChooseGiftTrack,
  trackOffset = 0,
  onPreviewEnded,
}) {
  const [version, setVersion] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [inApp, setInApp] = useState(false);
  const [ios, setIos] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  useEffect(() => {
    setInApp(isInAppBrowser());
    setIos(isIOS());
  }, []);
  const audio = useRef(null);
  const available = (tracks || []).filter(Boolean);
  const index = Math.min(version, Math.max(available.length - 1, 0));
  const source = available[index] || '';
  const previewDuration = element => Math.min(60, Number.isFinite(element?.duration) ? element.duration : 60);

  useEffect(() => {
    setAudioError(false);
    setIsAudioPlaying(false);
  }, [source]);

  const targetId = orderId || order?.id || order?.orderNumber;

  const getSlot = (idx) => {
    if (trackOffset === 0) return idx === 0 ? 'primary' : 'second';
    return idx === 0 ? 'third' : 'fourth';
  };

  const currentSlot = getSlot(index);

  return (
    <article className="nx-card">
      <style>{`
        @keyframes impeccableSpinVinyl {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulseLiveDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      <div className="nx-song-heading">
        <div className="nx-song-top" style={{ alignItems: 'center', gap: '20px' }}>
          {/* Capa da homenagem: estática; enquanto toca, só um equalizador discreto no canto */}
          <div
            className="nx-cover-wrap nx-cover-img"
            style={{
              position: 'relative', width: '136px', height: '136px', flexShrink: 0,
              borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f1f5f9',
              boxShadow: isAudioPlaying
                ? '0 0 0 3px rgba(109, 40, 217, 0.18), 0 10px 24px -6px rgba(31, 26, 36, 0.28)'
                : '0 10px 24px -8px rgba(31, 26, 36, 0.22)',
              transition: 'box-shadow 0.3s ease',
            }}
          >
            <Image
              src={order?.coverUrl || '/experiencia/familia.webp'}
              alt="Capa da sua música"
              width={136}
              height={136}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              unoptimized={Boolean(order?.coverUrl)}
              onError={(e) => {
                if (e.currentTarget.src !== '/experiencia/familia.webp') {
                  e.currentTarget.src = '/experiencia/familia.webp';
                }
              }}
            />

            {isAudioPlaying && (
              <span className="nx-eq" role="img" aria-label="Tocando">
                <i /><i /><i /><i />
              </span>
            )}

            {onCoverChange && (
              <span style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 2 }}>
                <label className="nx-cover-action" title="Trocar foto da capa" style={{ cursor: uploadingCover ? 'wait' : 'pointer' }}>
                  {uploadingCover ? <span className="nx-cover-spin" aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onCoverChange}
                    disabled={uploadingCover}
                    aria-label="Trocar foto da capa"
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                  />
                </label>
                {onReframeCover && order?.coverUrl && (
                  <button type="button" className="nx-cover-action" onClick={onReframeCover} disabled={uploadingCover} aria-label="Reenquadrar foto da capa" title="Reenquadrar">
                    <Crop size={14} aria-hidden="true" />
                  </button>
                )}
              </span>
            )}
          </div>

          <div>
            <h2>Uma canção para {order?.honoreeName || 'alguém especial'}</h2>
            <p>De {order?.customerName || 'você'}, com carinho.</p>
          </div>
        </div>
      </div>

      <div className="nx-versions" role="group" aria-label="Versões da música">
        {available.map((_, number) => {
          const trackNum = number + 1 + trackOffset;
          const label = trackOffset > 0
            ? `Música ${trackNum}`
            : available.length > 2
              ? `Música ${trackNum}`
              : `Versão ${trackNum}`;
          return (
            <button
              type="button"
              key={number}
              aria-pressed={index === number}
              style={{ minHeight: '44px', fontWeight: '600' }}
              onClick={() => { setVersion(number); }}
            >
              {label}{!paid ? ' · prévia' : ''}
            </button>
          );
        })}
      </div>

      {/* Player de Áudio Exclusivo e de Alta Fidelidade */}
      {source ? (
        <CustomAudioPlayer
          source={source}
          reload={reload}
          paid={paid}
          previewMaxDuration={60}
          onPreviewEnded={!paid ? onPreviewEnded : undefined}
          trackLabel={
            trackOffset > 0
              ? `Música ${index + 1 + trackOffset}`
              : available.length > 2
                ? `Música ${index + 1 + trackOffset}`
                : `Versão ${index + 1 + trackOffset}`
          }
          onPlayTrack={() => {
            if (!paid) {
              markPreviewListened(targetId);
            }
          }}
          onCanPlayTrack={() => setAudioError(false)}
          onErrorTrack={() => setAudioError(true)}
          onPlayingChange={(playing) => setIsAudioPlaying(playing)}
        />
      ) : (
        <p className="nx-message" role="status">
          Preparando os arquivos da sua música. Eles aparecem aqui assim que estiverem prontos.
        </p>
      )}

      {audioError && (
        <div className="nx-message nx-error" role="alert">
          Não foi possível carregar o áudio. Sua música continua salva.<br />
          <button type="button" className="nx-text-button" onClick={() => { setAudioError(false); setReload(Date.now()); }}>
            Tentar carregar novamente
          </button>
        </div>
      )}

      {!paid && (
        <p className="nx-preview-note">
          Prévia gratuita de até 60 segundos em cada versão. A compra libera as músicas completas e os arquivos MP3.
        </p>
      )}

      {paid && source && (
        <div className="nx-song-actions">
          <button
            type="button"
            className="nx-button nx-primary"
            disabled={Boolean(downloadingSlot)}
            onClick={() => onDownload(
              source,
              `Musica_M${index + 1 + trackOffset}_${(order?.honoreeName || 'Homenagem').replace(/[^\w]/g, '_')}.mp3`,
              currentSlot
            )}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Download size={18} />
            {downloadingSlot === currentSlot
              ? 'Preparando download…'
              : `Baixar MP3 · Música ${index + 1 + trackOffset}`}
          </button>
        </div>
      )}

      {message && <p className="nx-message" role="status">{message}</p>}

      {paid && inApp && (
        <div className="nx-message" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', marginTop: '10px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
            💡 <strong>Dica para salvar no celular:</strong> O WhatsApp bloqueia o download direto de arquivos.
            {ios
              ? ' No iPhone, toque no ícone do Safari (🧭) ou Compartilhar no rodapé para abrir no Safari e salvar.'
              : ' Toque no botão abaixo para abrir no Chrome ou toque nos 3 pontinhos no topo da tela.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {!ios && (
              <a
                href={getChromeIntentUrl()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  background: '#10b981',
                  color: '#064e3b',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
              >
                🌐 Abrir no Chrome
              </a>
            )}
            <button
              type="button"
              className="nx-text-button"
              style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6366f1' }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setMessage('✅ Link copiado! Cole no Chrome ou Safari para baixar.');
                } catch {
                  setMessage('Use o menu do aplicativo e escolha abrir no navegador.');
                }
              }}
            >
              📋 Copiar link da página
            </button>
          </div>
        </div>
      )}

      <details className="nx-details">
        <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          Ver a letra {order?.honoreeName ? `de ${order.honoreeName}` : `(Música ${1 + trackOffset})`}
        </summary>
        <div className="nx-lyrics">
          {order?.lyrics || order?.sunoTracks?.[0]?.prompt || 'A letra ainda está sendo preparada.'}
        </div>
      </details>

      {coverError && <p className="nx-message nx-error" role="alert">{coverError}</p>}

      {paid && available.length > 1 && onChooseGiftTrack && (
        <details className="nx-details">
          <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
            Versão que toca na página de presente
          </summary>
          <label className="nx-field">
            <span>Escolha a versão</span>
            <select
              value={order?.homenagemMusicaUrl === order?.audioFiles?.[1] ? '1' : '0'}
              onChange={event => onChooseGiftTrack(order?.audioFiles?.[Number(event.target.value)] || order?.audioUrl, Number(event.target.value))}
            >
              <option value="0">Música {1 + trackOffset}</option>
              <option value="1">Música {2 + trackOffset}</option>
            </select>
          </label>
        </details>
      )}
    </article>
  );
}
