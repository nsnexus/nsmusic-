'use client';

import Image from 'next/image';

export function StudioLyricsAnimation() { return <StudioProgress phase="Transformando sua história em letra" />; }
export function StudioAudioAnimation() { return <StudioProgress phase="Sua música está ganhando vida" />; }

function StudioProgress({ phase }) {
  return <div className="nx-studio-progress"><Image unoptimized src="/experiencia/amor.webp" alt="" width={640} height={426} sizes="(max-width: 640px) 85vw, 400px" /><div><span className="nx-eyebrow">Um presente só seu</span><h2>{phase}</h2><p>Cada detalhe parte do que você contou. Você pode acompanhar o andamento aqui.</p><span className="nx-progress-line" aria-hidden="true" /></div></div>;
}
