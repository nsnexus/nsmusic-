'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Share2, Download, MessageCircle } from 'lucide-react';
import { markPreviewListened } from '@/lib/previewTracking';
import { isInAppBrowser } from '@/lib/inAppBrowser';
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
  generationLabel,
  trackOffset = 0,
}) {
  const [version, setVersion] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [inApp, setInApp] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  useEffect(() => { setInApp(isInAppBrowser()); }, []);
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

  const share = async () => {
    const url = `${window.location.origin}/h/${encodeURIComponent(targetId)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Uma homenagem para ${order?.honoreeName || 'alguém especial'}`, text: 'Preparei uma música para você.', url });
      else { await navigator.clipboard.writeText(url); setMessage('Link do presente copiado.'); }
    } catch (error) { if (error.name !== 'AbortError') setMessage('Não foi possível compartilhar agora. Tente novamente.'); }
  };

  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  const handleSendToWhatsApp = async () => {
    if (sendingWhatsApp) return;
    setSendingWhatsApp(true);
    setMessage('');
    try {
      const res = await fetch('/api/orders/send-audio-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetId,
          trackIndex: index + trackOffset
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setMessage('✅ Música enviada diretamente para o seu WhatsApp! Abra seu aplicativo para ouvir e salvar.');
      } else {
        setMessage(data.error || 'Não foi possível enviar para o WhatsApp agora. Use o botão Baixar MP3.');
      }
    } catch (err) {
      setMessage('Falha na conexão com o WhatsApp. Tente novamente em instantes.');
    } finally {
      setSendingWhatsApp(false);
    }
  };

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
          {/* Vinil Rotativo + Capa da Homenagem */}
          <div style={{ position: 'relative', width: '136px', height: '136px', flexShrink: 0 }}>
            {/* Vinil estilizado com sulcos de áudio que surge lateralmente e gira quando toca */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '4px',
                right: isAudioPlaying ? '-22px' : '0px',
                width: '128px',
                height: '128px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, #0f172a 32%, #1e293b 33%, #0f172a 46%, #1e293b 47%, #0f172a 62%, #334155 63%, #0f172a 64%)',
                boxShadow: isAudioPlaying ? '0 10px 24px rgba(15, 23, 42, 0.4)' : '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'right 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 0,
                animation: isAudioPlaying ? 'impeccableSpinVinyl 5.5s linear infinite' : 'none',
              }}
            >
              {/* Centro do disco de vinil */}
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #ec4899 100%)',
                  border: '3px solid #0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0f172a' }} />
              </div>
            </div>

            {/* Capa Fotográfica em primeiro plano */}
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                width: '136px',
                height: '136px',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 10px 24px -4px rgba(79, 70, 229, 0.18), 0 4px 10px -2px rgba(15, 23, 42, 0.08)',
                border: '2px solid rgba(255, 255, 255, 0.9)',
                backgroundColor: '#f1f5f9',
              }}
            >
              <Image
                src={order?.coverUrl || '/experiencia/familia.webp'}
                alt="Capa da sua música"
                width={136}
                height={136}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                unoptimized={Boolean(order?.coverUrl)}
              />
              {isAudioPlaying && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '6px',
                    left: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.88)',
                    backdropFilter: 'blur(6px)',
                    borderRadius: '999px',
                    padding: '2.5px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      display: 'inline-block',
                      animation: 'pulseLiveDot 1.2s infinite',
                    }}
                  />
                  TOCANDO
                </div>
              )}
            </div>
          </div>

          <div>
            {generationLabel ? (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.72rem',
                  fontWeight: '800',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: trackOffset > 0 ? '#6d28d9' : '#047857',
                  background: trackOffset > 0 ? '#f5f3ff' : '#ecfdf5',
                  border: `1px solid ${trackOffset > 0 ? '#ddd6fe' : '#a7f3d0'}`,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  marginBottom: '8px',
                }}
              >
                {generationLabel}
              </span>
            ) : (
              <span className="nx-eyebrow">Um presente só seu</span>
            )}
            <h2>Uma canção para {order?.honoreeName || 'alguém especial'}</h2>
            <p>De {order?.customerName || 'você'}, com carinho.</p>
          </div>
        </div>
        {paid && (
          <button type="button" className="nx-share-button" aria-label="Compartilhar presente" onClick={share}>
            <Share2 size={19} />
          </button>
        )}
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
        <div className="nx-song-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

          <button
            type="button"
            className="nx-button"
            disabled={sendingWhatsApp}
            onClick={handleSendToWhatsApp}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              border: '1.5px solid #a7f3d0',
              fontWeight: '700',
              padding: '11px 16px',
              borderRadius: '12px',
              cursor: sendingWhatsApp ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              fontSize: '0.92rem',
            }}
          >
            <MessageCircle size={18} color="#059669" />
            <span>
              {sendingWhatsApp
                ? 'Enviando para seu WhatsApp…'
                : 'Receber áudio direto no WhatsApp 📲'}
            </span>
          </button>
        </div>
      )}

      {message && <p className="nx-message" role="status">{message}</p>}

      {paid && inApp && (
        <div className="nx-message" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', marginTop: '10px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
            💡 <strong>Dica para celular:</strong> Se o WhatsApp bloquear o download direto para a sua pasta de arquivos, toque em <strong>Receber áudio direto no WhatsApp</strong> acima para receber o arquivo na sua conversa, ou abra no Chrome/Safari pelo menu do app.
          </p>
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
            📋 Copiar link desta página
          </button>
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

      <details className="nx-details">
        <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          Personalizar meu presente
        </summary>
        <label className="nx-field">
          <span>Trocar foto de capa</span>
          <input type="file" accept="image/*" onChange={onCoverChange} disabled={uploadingCover} />
        </label>
        {onReframeCover && order?.coverUrl && (
          <button
            type="button"
            onClick={onReframeCover}
            disabled={uploadingCover}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              color: '#334155',
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            ✂️ Reenquadrar foto atual
          </button>
        )}
        {uploadingCover && <p className="nx-helper" role="status">Enviando sua foto…</p>}
        {coverError && <p className="nx-message nx-error" role="alert">{coverError}</p>}
        {paid && available.length > 1 && onChooseGiftTrack && (
          <label className="nx-field">
            <span>Versão que toca na página de presente</span>
            <select
              value={order?.homenagemMusicaUrl === order?.audioFiles?.[1] ? '1' : '0'}
              onChange={event => onChooseGiftTrack(order?.audioFiles?.[Number(event.target.value)] || order?.audioUrl, Number(event.target.value))}
            >
              <option value="0">Música {1 + trackOffset}</option>
              <option value="1">Música {2 + trackOffset}</option>
            </select>
          </label>
        )}
      </details>
    </article>
  );
}
