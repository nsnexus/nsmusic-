'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Grade das fotos do vídeo com arrasta e solta (celular e computador).
//
// No celular o arraste começa depois de segurar a foto por um instante (TouchSensor com delay):
// assim o dedo que só quer rolar a página não move foto sem querer. No computador basta clicar e
// arrastar. A ordem final vai para `onMove(de, para)`, que grava `slideshowImages` no pedido.
//
// O HTML5 drag-and-drop nativo não funciona com toque no Android/iOS, por isso @dnd-kit.

function idsDasFotos(photos) {
  // A mesma URL pode aparecer duas vezes (cliente subiu a mesma foto de novo): o id precisa ser único.
  const vistos = {};
  return photos.map((url) => {
    vistos[url] = (vistos[url] || 0) + 1;
    return `${url}#${vistos[url]}`;
  });
}

function Tile({ photo, index, total, busy, onRemove, overlay = false, dragging = false, sortable }) {
  const primeira = index === 0;
  const ultima = index === total - 1;
  const style = sortable ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition } : undefined;
  return (
    <div
      ref={sortable?.setNodeRef}
      style={style}
      className={`nx-photo-tile nx-photo-sortable${primeira ? ' nx-photo-first' : ''}${dragging ? ' nx-photo-dragging' : ''}${overlay ? ' nx-photo-overlay' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      {...(sortable?.attributes || {})}
      {...(sortable?.listeners || {})}
      aria-label={sortable ? `Foto ${index + 1} de ${total}. Segure e arraste para mudar a posição.` : undefined}
    >
      <Image src={photo} alt={`Foto ${index + 1} do vídeo`} width={160} height={160} unoptimized draggable={false} />
      <span className="nx-photo-order" aria-hidden="true">{index + 1}</span>
      {total > 1 && primeira && <span className="nx-photo-tag">Abre o vídeo</span>}
      {total > 1 && ultima && <span className="nx-photo-tag nx-photo-tag-end">Fecha o vídeo</span>}
      {!overlay && (
        <button
          type="button"
          className="nx-photo-remove"
          aria-label={`Remover foto ${index + 1}`}
          disabled={busy}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => onRemove(index)}
        >×</button>
      )}
    </div>
  );
}

function SortableTile(props) {
  const sortable = useSortable({ id: props.id, disabled: props.disabled });
  return <Tile {...props} sortable={sortable} dragging={sortable.isDragging} />;
}

export default function SortablePhotoGrid({ photos, busy, onMove, onRemove, children }) {
  const ids = useMemo(() => idsDasFotos(photos), [photos]);
  const [ativo, setAtivo] = useState(null);
  const podeOrdenar = Boolean(onMove) && photos.length > 1 && !busy;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const indiceAtivo = ativo ? ids.indexOf(ativo) : -1;

  const aoSoltar = ({ active, over }) => {
    setAtivo(null);
    if (!over || active.id === over.id) return;
    const de = ids.indexOf(active.id);
    const para = ids.indexOf(over.id);
    if (de >= 0 && para >= 0) onMove(de, para);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => { setAtivo(active.id); if (navigator.vibrate) navigator.vibrate(15); }}
      onDragEnd={aoSoltar}
      onDragCancel={() => setAtivo(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="nx-photo-grid">
          {photos.map((photo, index) => (
            <SortableTile key={ids[index]} id={ids[index]} photo={photo} index={index} total={photos.length} busy={busy} onRemove={onRemove} disabled={!podeOrdenar} />
          ))}
          {children}
        </div>
      </SortableContext>
      <DragOverlay adjustScale={false} dropAnimation={{ duration: 180 }}>
        {indiceAtivo >= 0 ? <Tile photo={photos[indiceAtivo]} index={indiceAtivo} total={photos.length} busy={busy} onRemove={onRemove} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
