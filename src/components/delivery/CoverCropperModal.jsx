'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCw, ZoomIn, ZoomOut, Move, Check, X, RefreshCw } from 'lucide-react';

const VIEWPORT_SIZE = 300; // Tamanho do quadrado de recorte na tela (px)
const OUTPUT_SIZE = 1000;  // Resolução final quadrada da capa (px)

export default function CoverCropperModal({
  isOpen,
  imageSrc,
  onClose,
  onSave,
  isSaving = false,
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });

  const imageRef = useRef(null);
  const viewportRef = useRef(null);

  // Reseta estado quando o modal abre ou a imagem muda
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);
      setImageLoaded(false);
      setImageError(false);
    }
  }, [isOpen, imageSrc]);

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setImageNaturalSize({ width: naturalWidth, height: naturalHeight });
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    console.warn('[CoverCropperModal] Falha ao carregar imagem para enquadramento.');
    setImageError(true);
    setImageLoaded(false);
  };

  // Drag com PointerEvents (compatível com mouse e touch)
  const handlePointerDown = (e) => {
    if (isSaving) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e) => {
    if (!isDragging || isSaving) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  };

  // Gera o canvas com a imagem recortada e repassa o Blob para onSave
  const handleConfirm = useCallback(() => {
    if (!imageRef.current || !imageLoaded || isSaving) return;

    try {
      const img = imageRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Limpa fundo
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const ratio = OUTPUT_SIZE / VIEWPORT_SIZE;

      // Calcula dimensões base ajustadas (fit inicial tipo "cover" dentro do viewport)
      const isRotated90or270 = rotation === 90 || rotation === 270;
      const effectiveImgWidth = isRotated90or270 ? imageNaturalSize.height : imageNaturalSize.width;
      const effectiveImgHeight = isRotated90or270 ? imageNaturalSize.width : imageNaturalSize.height;

      const baseScale = Math.max(
        VIEWPORT_SIZE / (effectiveImgWidth || 1),
        VIEWPORT_SIZE / (effectiveImgHeight || 1)
      );

      const drawWidth = imageNaturalSize.width * baseScale * ratio;
      const drawHeight = imageNaturalSize.height * baseScale * ratio;

      // Centraliza e aplica translação, rotação e escala
      ctx.save();
      ctx.translate(
        OUTPUT_SIZE / 2 + pan.x * ratio,
        OUTPUT_SIZE / 2 + pan.y * ratio
      );
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);
      ctx.drawImage(
        img,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
      ctx.restore();

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onSave(blob);
          }
        },
        'image/jpeg',
        0.92
      );
    } catch (err) {
      console.error('[CoverCropperModal] Erro ao renderizar recorte:', err);
    }
  }, [imageLoaded, isSaving, pan, rotation, zoom, imageNaturalSize, onSave]);

  if (!isOpen) return null;

  // Calcula escala base de preenchimento cover no viewport
  const isRotated90or270 = rotation === 90 || rotation === 270;
  const effectiveImgWidth = isRotated90or270 ? imageNaturalSize.height : imageNaturalSize.width;
  const effectiveImgHeight = isRotated90or270 ? imageNaturalSize.width : imageNaturalSize.height;

  const baseScale = imageLoaded && effectiveImgWidth && effectiveImgHeight
    ? Math.max(VIEWPORT_SIZE / effectiveImgWidth, VIEWPORT_SIZE / effectiveImgHeight)
    : 1;

  const renderedWidth = imageNaturalSize.width * baseScale;
  const renderedHeight = imageNaturalSize.height * baseScale;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cropper-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(5, 7, 15, 0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#0f172a',
          borderRadius: '20px',
          border: '1.5px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(236, 72, 153, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 id="cropper-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
              Enquadrar Foto de Capa
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Arraste e ajuste o zoom para posicionar o rosto na capa quadrada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Fechar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: isSaving ? 'default' : 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewport de Enquadramento */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px 16px',
            backgroundColor: '#090d16',
          }}
        >
          <div
            ref={viewportRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              width: `${VIEWPORT_SIZE}px`,
              height: `${VIEWPORT_SIZE}px`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '16px',
              border: '2px solid #ec4899',
              boxShadow: '0 0 24px rgba(236, 72, 153, 0.35)',
              cursor: isDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              backgroundColor: '#020617',
              userSelect: 'none',
            }}
          >
            {/* Imagem a ser reenquadrada */}
            {imageSrc && !imageError && (
              <img
                ref={imageRef}
                src={typeof imageSrc === 'string' && imageSrc.startsWith('http') ? `/api/image-proxy?url=${encodeURIComponent(imageSrc)}` : imageSrc}
                alt="Prévia de enquadramento"
                onLoad={handleImageLoad}
                onError={handleImageError}
                crossOrigin="anonymous"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${renderedWidth}px`,
                  height: `${renderedHeight}px`,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  transition: isDragging ? 'none' : 'transform 0.08s ease-out',
                }}
              />
            )}

            {imageError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', color: '#f87171', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 10px' }}>
                  Não foi possível abrir esta foto para recorte.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Escolher outra foto
                </button>
              </div>
            )}

            {/* Linhas de guia sutis (regra dos terços) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gridTemplateRows: '1fr 1fr 1fr',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.25)', borderBottom: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.25)', borderBottom: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div style={{ borderBottom: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.25)', borderBottom: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.25)', borderBottom: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div style={{ borderBottom: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.25)' }} />
              <div />
            </div>

            {/* Dica de arrastar flutuante no início */}
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(4px)',
                padding: '3px 8px',
                borderRadius: '12px',
                fontSize: '0.68rem',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                pointerEvents: 'none',
              }}
            >
              <Move size={12} /> Arraste para mover
            </div>
          </div>
        </div>

        {/* Controles de Zoom e Rotação */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Slider de Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.1).toFixed(2))))}
              title="Diminuir zoom"
              aria-label="Diminuir zoom"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '6px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ZoomOut size={16} />
            </button>

            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              aria-label="Controle de zoom"
              style={{
                flex: 1,
                accentColor: '#ec4899',
                cursor: 'pointer',
                height: '6px',
              }}
            />

            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                padding: '6px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ZoomIn size={16} />
            </button>

            <span style={{ fontSize: '0.75rem', color: '#94a3b8', width: '38px', textAlign: 'right' }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Botões Auxiliares: Girar e Centralizar */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={handleRotate}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500,
              }}
            >
              <RotateCw size={14} /> Girar 90°
            </button>

            <button
              type="button"
              onClick={handleReset}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500,
              }}
            >
              <RefreshCw size={14} /> Centralizar
            </button>
          </div>
        </div>

        {/* Footer com Cancelar e Salvar */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#090d16',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'transparent',
              color: '#cbd5e1',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: isSaving ? 'default' : 'pointer',
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!imageLoaded || isSaving}
            style={{
              padding: '9px 20px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
              color: '#fff',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: !imageLoaded || isSaving ? 'default' : 'pointer',
              opacity: !imageLoaded || isSaving ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(236, 72, 153, 0.4)',
            }}
          >
            {isSaving ? (
              <>Salvando capa...</>
            ) : (
              <>
                <Check size={16} /> Salvar Capa
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
