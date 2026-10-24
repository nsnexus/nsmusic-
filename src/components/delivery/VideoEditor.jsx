'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { AddonCheckout, EditorSection, ShareLinks, TrackPicker } from './EditorParts';

function LocalPhoto({ file, index, onRemove }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value); }, [file]);
  return <div className="nx-photo-tile">{url && <Image src={url} alt={`Nova foto ${index + 1}`} width={160} height={160} unoptimized />}<button type="button" className="nx-photo-remove" aria-label={`Remover nova foto ${index + 1}`} onClick={onRemove}>×</button></div>;
}

export default function VideoEditor({ order, orderId, access, existingPhotos, files, busy, progress, error, onAddPhotos, onRemovePhoto, onRemoveFile, tracks, selectedTrack, onTrack, onGenerate, onDownload, pix, pendingPix, pixError, timedOut, onBuy, onResetVideo }) {
  const total = existingPhotos.length + files.length;
  const ready = total >= 10 && total <= 20 && Boolean(tracks[0]);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/h/${orderId}` : '';
  const [isGenerateVisible, setIsGenerateVisible] = useState(false);
  const prevFilesLength = useRef(files.length);

  // Auto-scroll suave após selecionar novas fotos para orientar o cliente
  useEffect(() => {
    if (files.length > prevFilesLength.current) {
      const timer = setTimeout(() => {
        const target = document.getElementById('video-prompt-rolar') || document.getElementById('video-secao-trilha') || document.getElementById('video-secao-gerar');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 350);
      return () => clearTimeout(timer);
    }
    prevFilesLength.current = files.length;
  }, [files.length]);

  // Monitora se o botão final de gerar o vídeo está visível na tela
  useEffect(() => {
    const target = document.getElementById('video-secao-gerar');
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsGenerateVisible(entry.isIntersecting);
    }, { threshold: 0.1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [ready, busy, order?.videoUrl]);

  if (!access && !order?.videoUrl) return <AddonCheckout sku="video_addon" title="As fotos ganham uma trilha especial." description="Um vídeo com as suas memórias e a música criada a partir da sua história." features={['De 10 a 20 fotos escolhidas por você', 'Sua música como trilha sonora', 'Vídeo para assistir, baixar e compartilhar']} image="/experiencia/familia.webp" pix={pix} loading={pendingPix} error={pixError} timedOut={timedOut} onGenerate={onBuy} />;
  if (order?.videoUrl) return <div className="nx-editor-columns"><section className="nx-card nx-video-ready"><span className="nx-eyebrow">Seu vídeo está pronto</span><h2>Uma lembrança para ver de novo.</h2><video controls preload="metadata" playsInline src={order.videoUrl} poster={order.coverUrl || undefined} /><button type="button" className="nx-button nx-primary" onClick={onDownload}>Baixar meu vídeo</button><p className="nx-helper">Guarde o arquivo no seu aparelho para enviar ou assistir quando quiser.</p></section><aside className="nx-card"><h2>Hora de entregar o presente</h2><p>Envie a página da homenagem para compartilhar a música e o vídeo.</p><ShareLinks url={url} label="vídeo especial" /></aside></div>;

  return (
    <div className="nx-editor-columns">
      <div className="nx-editor-stack">
        <EditorSection id="video-secao-fotos" number="01" title="Escolha as suas melhores memórias" description="Separe de 10 a 20 fotos. Elas aparecem no vídeo na ordem mostrada abaixo.">
          <div className="nx-editor-count">
            <strong>{total} de 20 fotos</strong>
            <span>{total < 10 ? `Faltam ${10 - total} para começar` : 'Quantidade ideal para criar'}</span>
          </div>

          {total > 0 && (
            <div className="nx-photo-grid">
              {existingPhotos.map((photo, index) => (
                <div key={`${photo}-${index}`} className="nx-photo-tile">
                  <Image src={photo} alt={`Foto ${index + 1} do vídeo`} width={160} height={160} unoptimized />
                  <span className="nx-photo-number">{index + 1}</span>
                  <button type="button" className="nx-photo-remove" aria-label={`Remover foto ${index + 1}`} disabled={busy} onClick={() => onRemovePhoto(index)}>×</button>
                </div>
              ))}
              {files.map((file, index) => (
                <LocalPhoto key={`${file.name}-${file.lastModified}-${index}`} file={file} index={index} onRemove={() => { if (!busy) onRemoveFile(index); }} />
              ))}
            </div>
          )}

          {total < 20 && (
            <label className="nx-upload-zone">
              <strong>{total ? 'Adicionar mais fotos' : 'Escolher fotos da galeria'}</strong>
              <span>Prefira fotos nítidas, com as pessoas bem enquadradas.</span>
              <input type="file" aria-label="Adicionar fotos ao vídeo" accept="image/png,image/jpeg,image/webp" multiple onChange={onAddPhotos} disabled={busy} />
            </label>
          )}

          {error && <p role="alert" className="nx-message nx-error">{error}</p>}

          {/* Destaque / Instrução após adicionar fotos */}
          {total >= 10 && (
            <div
              id="video-prompt-rolar"
              style={{
                marginTop: '16px',
                padding: '16px 20px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(103, 64, 139, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)',
                border: '1.5px solid rgba(103, 64, 139, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(103, 64, 139, 0.06)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#581c87', fontWeight: 700, fontSize: '1rem' }}>
                <span style={{ fontSize: '1.2rem' }}>✨</span>
                <span>Fotos adicionadas com sucesso ({total} fotos)!</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.45, maxWidth: '440px' }}>
                Tudo pronto nesta etapa! Agora <strong>role para baixo</strong> para conferir a trilha sonora e clicar em <strong>&quot;Criar meu vídeo&quot;</strong>.
              </p>
              <button
                type="button"
                onClick={() => {
                  document.getElementById('video-secao-gerar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="nx-button nx-primary"
                style={{
                  marginTop: '6px',
                  padding: '11px 24px',
                  fontSize: '0.92rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <span>Continuar para Criar o Vídeo</span>
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>↓</span>
              </button>
            </div>
          )}

          {total > 0 && total < 10 && (
            <div
              style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#fffbeb',
                border: '1.5px solid #fde68a',
                fontSize: '0.88rem',
                color: '#92400e',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>📸</span>
              <span>
                Você escolheu <strong>{total} fotos</strong>. Adicione mais <strong>{10 - total}</strong> para atingir o mínimo de 10 e poder gerar o vídeo.
              </span>
            </div>
          )}
        </EditorSection>

        <EditorSection id="video-secao-trilha" number="02" title="Escolha a trilha da sua história" description="Ouça as versões e escolha a que vai acompanhar as fotos.">
          {tracks.length ? (
            <TrackPicker tracks={tracks} value={tracks[selectedTrack === 'v2' ? 1 : 0]} onChange={value => onTrack(value === tracks[1] ? 'v2' : 'v1')} busy={busy} name="video-musica" proxied />
          ) : (
            <p className="nx-message">Sua música ainda está sendo preparada. Aguarde para criar o vídeo.</p>
          )}
        </EditorSection>

        <EditorSection id="video-secao-gerar" number="03" title="Vamos juntar tudo?" description="Sua seleção de fotos e música vira um vídeo para guardar.">
          {busy || order?.videoStatus === 'GERANDO' ? (
            <div className="nx-editor-processing" role="status" aria-live="polite">
              <span className="nx-progress-line" />
              <h3>{progress || 'Preparando o seu vídeo…'}</h3>
              <p>Mantenha esta página aberta. Se o processamento acontecer no aparelho, trocar de aba pode interromper a geração.</p>
              {onResetVideo && (
                <div style={{ marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={onResetVideo}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Demorando muito? Cancelar e tentar novamente
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="nx-message">Durante a geração, mantenha esta aba aberta e o aparelho desbloqueado.</p>
              <button
                type="button"
                className="nx-button nx-primary"
                disabled={!ready}
                onClick={onGenerate}
                style={ready ? {
                  boxShadow: '0 4px 18px rgba(103, 64, 139, 0.35)',
                  fontWeight: 700
                } : {}}
              >
                Criar meu vídeo{total > 0 ? ` com ${total} fotos` : ''}
              </button>
            </>
          )}
        </EditorSection>
      </div>

      <aside className="nx-editor-preview">
        <span className="nx-eyebrow">Seu filme começa aqui</span>
        <div className="nx-video-preview">
          {existingPhotos[0] ? (
            <Image src={existingPhotos[0]} alt="Primeira foto do seu vídeo" width={480} height={600} unoptimized />
          ) : (
            <Image src="/experiencia/familia.webp" alt="Imagem editorial ilustrativa de família" width={480} height={600} unoptimized />
          )}
          <div>
            <span>Um presente para</span>
            <h2>{order?.honoreeName || 'alguém especial'}</h2>
            <p>{total ? `${total} memórias com a sua música.` : 'As suas fotos vão dar vida a este presente.'}</p>
          </div>
        </div>
        <p className="nx-helper">Prévia ilustrativa. O vídeo final usa as fotos e a versão da música que você escolher.</p>
      </aside>

      {/* Barra flutuante de instrução/rolagem fixa no rodapé quando as fotos estão prontas e o botão final não está visível */}
      {ready && !busy && order?.videoStatus !== 'GERANDO' && !order?.videoUrl && !isGenerateVisible && (
        <div
          style={{
            position: 'fixed',
            bottom: '22px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: 'calc(100% - 32px)',
            maxWidth: '460px',
            pointerEvents: 'auto'
          }}
        >
          <button
            type="button"
            onClick={() => {
              document.getElementById('video-secao-gerar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: '50px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.94rem',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(124, 58, 237, 0.45)'
            }}
          >
            <span>Fotos prontas! Clique ou role para baixo para gerar o vídeo</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>↓</span>
          </button>
        </div>
      )}
    </div>
  );
}
