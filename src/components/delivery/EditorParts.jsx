'use client';

import { useState } from 'react';
import Image from 'next/image';
import PixQrCode from '@/components/PixQrCode';
import { getPriceForSku } from '@/lib/pricing';
import { formatBrl } from '@/lib/deliveryPackages';
import { buildAudioProxySrc } from '@/lib/audioProxy';

export function EditorSection({ id, number, title, description, children, className = '' }) {
  return <section id={id} className={`nx-card nx-editor-section ${className}`}><div className="nx-editor-section-head"><span className="nx-section-number" aria-hidden="true">{number}</span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>{children}</section>;
}

export function ShareLinks({ url, label = 'presente', disabled = false }) {
  const [message, setMessage] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado. Agora é só enviar para quem você ama.'); }
    catch { setMessage('Não foi possível copiar automaticamente. Use o endereço abaixo.'); }
  };
  return <div className="nx-editor-share"><div className="nx-checkout-actions"><a href={disabled ? undefined : url} aria-disabled={disabled} target="_blank" rel="noopener noreferrer" className="nx-button">Ver página do presente ↗</a><button type="button" className="nx-button" onClick={copy} disabled={disabled}>Copiar link</button></div><a className="nx-text-button" href={disabled ? undefined : `https://wa.me/?text=${encodeURIComponent(`Preparei um ${label} para você. ${url}`)}`} aria-disabled={disabled} target="_blank" rel="noopener noreferrer">Compartilhar no WhatsApp ↗</a>{message && <p className="nx-message" role="status">{message}</p>}{message && <input className="nx-share-address" aria-label="Link do presente" readOnly value={url} />}</div>;
}

export function AddonCheckout({ sku, title, description, features, image, pix, loading, error, timedOut, onGenerate }) {
  const [copyMessage, setCopyMessage] = useState('');
  const amount = formatBrl(getPriceForSku(sku));
  return <div className="nx-addon-offer"><div className="nx-addon-editorial"><Image src={image} alt="Imagem editorial ilustrativa do presente" width={720} height={480} unoptimized /><div><span className="nx-eyebrow">Um carinho a mais</span><h2>{title}</h2><p>{description}</p><small>Imagem ilustrativa. Seu presente usa a sua história e as suas fotos.</small></div></div><section className="nx-card nx-addon-purchase"><h2>Complete seu presente</h2><ul className="nx-checklist">{features.map(feature => <li key={feature}>{feature}</li>)}</ul><div className="nx-addon-price">{amount}<span>pagamento único</span></div>{error && <p className="nx-message nx-error" role="alert">{error}</p>}{!pix?.qrCode ? <button type="button" className="nx-button nx-primary" onClick={onGenerate} disabled={loading}>{loading ? 'Preparando seu PIX…' : `Adicionar por ${amount}`}</button> : <div className="nx-editor-pix"><p>Copie o código e pague pelo aplicativo do seu banco.</p><button type="button" className="nx-button nx-primary" onClick={async () => { try { await navigator.clipboard.writeText(pix.qrCode); setCopyMessage('Código PIX copiado.'); } catch { setCopyMessage('Selecione o código abaixo para copiar manualmente.'); } }}>Copiar código PIX</button><label className="nx-field"><span>PIX Copia e Cola</span><textarea className="nx-pix-code" readOnly value={pix.qrCode} /></label><details className="nx-details"><summary>Mostrar QR Code</summary><PixQrCode payload={pix.qrCode} size={180} label={`QR Code para ${title}`} /></details>{copyMessage && <p role="status" className="nx-message">{copyMessage}</p>}<p className="nx-helper" role="status">{timedOut ? 'A confirmação ainda não chegou. Se já pagou, atualize esta página em alguns instantes.' : 'Aguardando a confirmação do pagamento. Não é necessário pagar de novo.'}</p></div>}<p className="nx-helper">A edição é liberada após a confirmação do pagamento.</p></section></div>;
}

export function TrackPicker({ tracks, value, onChange, busy, name, proxied = false }) {
  return <fieldset className="nx-track-picker"><legend>Qual versão combina com o presente?</legend>{tracks.map((url, index) => <div className="nx-track-choice" key={url}><label><input type="radio" name={name} checked={value === url} onChange={() => onChange(url)} disabled={busy} /><span>Versão {index + 1}</span></label><audio controls preload="none" src={proxied ? url : buildAudioProxySrc(url)} aria-label={`Ouvir versão ${index + 1}`} /></div>)}{busy && <p role="status" className="nx-helper">Salvando sua escolha…</p>}</fieldset>;
}
