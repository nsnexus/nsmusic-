'use client';

import { useEffect, useRef, useState } from 'react';
import PixQrCode from '@/components/PixQrCode';
import { copiarTexto } from '@/lib/copiarTexto';

// Uma mensagem do chat de suporte. Os tipos vêm prontos de /api/suporte/chat (src/lib/suporteChat.js).

export const CORES = {
  topo: '#0E3A3B',
  fundo: '#EFE7DD',
  minha: '#D9FDD3',
  dele: '#FFFFFF',
  acao: '#0F7B6C',
  link: '#0B6F8F',
  texto: '#111B21',
  suave: '#667781',
};

const ICONE = { width: 16, height: 16, fill: 'currentColor', 'aria-hidden': true };

// *negrito* do WhatsApp → <strong>, sem HTML vindo do servidor.
function TextoRico({ texto }) {
  const partes = String(texto || '').split(/(\*[^*\n]+\*)/g);
  return partes.map((p, i) => (p.startsWith('*') && p.endsWith('*') && p.length > 2
    ? <strong key={i}>{p.slice(1, -1)}</strong>
    : <span key={i}>{p}</span>));
}

function fmtTempo(s) {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function Audio({ url, titulo }) {
  const ref = useRef(null);
  const [tocando, setTocando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [erro, setErro] = useState(false);

  useEffect(() => () => { try { ref.current?.pause(); } catch (_) {} }, []);

  const alternar = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      document.querySelectorAll('audio[data-chat-audio]').forEach((o) => { if (o !== a) o.pause(); });
      a.play().catch(() => setErro(true));
    } else a.pause();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 240, padding: '4px 2px' }}>
      <audio
        ref={ref} src={url} preload="none" data-chat-audio
        onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => { setTocando(false); setProgresso(0); }}
        onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
        onTimeUpdate={(e) => setProgresso(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        onError={() => setErro(true)}
      />
      <button type="button" onClick={alternar} aria-label={tocando ? 'Pausar' : 'Tocar'} style={{ width: 40, height: 40, borderRadius: '50%', border: 0, background: CORES.topo, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        {tocando
          ? <svg viewBox="0 0 24 24" {...ICONE}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          : <svg viewBox="0 0 24 24" {...ICONE}><path d="M7 4l13 8-13 8z" /></svg>}
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ height: 4, borderRadius: 2, background: '#D1D7DB', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(progresso * 100)}%`, height: '100%', background: CORES.acao }} />
        </div>
        <span style={{ fontSize: 11.5, color: CORES.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {erro ? 'Não deu pra tocar aqui — use o arquivo abaixo' : `${titulo ? `${titulo} · ` : ''}${fmtTempo(duracao)}`}
        </span>
      </div>
    </div>
  );
}

function Pix({ copiaECola, checkoutUrl, valor, titulo }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    const ok = await copiarTexto(copiaECola);
    setCopiado(ok);
    if (ok) setTimeout(() => setCopiado(false), 4000);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 240, padding: '6px 2px 2px' }}>
      <span style={{ fontSize: 12, color: CORES.suave }}>{titulo || 'Pix'}</span>
      {valor ? <strong style={{ fontSize: 22 }}>{`R$ ${Number(valor).toFixed(2).replace('.', ',')}`}</strong> : null}
      {copiaECola ? (
        <>
          <PixQrCode payload={copiaECola} size={170} />
          <textarea readOnly value={copiaECola} aria-label="Código Pix copia e cola" rows={2} style={{ width: '100%', fontSize: 11, color: CORES.suave, border: '1px solid #E3E6E8', borderRadius: 6, padding: 6, resize: 'none', boxSizing: 'border-box' }} />
          <button type="button" onClick={copiar} style={{ width: '100%', minHeight: 44, border: 0, borderRadius: 8, background: CORES.acao, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {copiado ? 'Código copiado!' : 'Copiar código Pix'}
          </button>
        </>
      ) : null}
      {checkoutUrl ? (
        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" style={{ width: '100%', minHeight: 44, borderRadius: 8, background: CORES.acao, color: '#fff', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          Pagar agora
        </a>
      ) : null}
    </div>
  );
}

function Cartao({ href, titulo, sub, externo, cor }) {
  return (
    <a href={href} target={externo ? '_blank' : undefined} rel={externo ? 'noopener noreferrer' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, width: 240, background: cor || 'rgba(0,0,0,.04)', color: cor ? '#fff' : CORES.texto, borderRadius: 8, padding: '10px 12px', textDecoration: 'none', boxSizing: 'border-box', minHeight: 44 }}>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <strong style={{ fontSize: 13.5 }}>{titulo}</strong>
        {sub ? <span style={{ fontSize: 12, color: cor ? '#E7F6F2' : CORES.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span> : null}
      </span>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </a>
  );
}

function Conteudo({ m }) {
  switch (m.tipo) {
    case 'texto':
      return <span style={{ fontSize: 14.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', padding: '0 2px' }}><TextoRico texto={m.texto} /></span>;
    case 'letra':
      return <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto', padding: '4px 4px', background: 'rgba(0,0,0,.03)', borderRadius: 6 }}>{m.texto}</div>;
    case 'audio':
      return <Audio url={m.url} titulo={m.titulo} />;
    case 'arquivo':
      return (
        <a href={m.url} download={m.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, width: 240, background: 'rgba(0,0,0,.04)', borderRadius: 7, padding: 10, textDecoration: 'none', color: CORES.texto, boxSizing: 'border-box' }}>
          <span style={{ width: 34, height: 40, borderRadius: 4, background: '#E8505B', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 5, boxSizing: 'border-box', flexShrink: 0 }}>{m.extensao || 'MP3'}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#54656F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Baixar"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        </a>
      );
    case 'link':
      return <Cartao href={m.url} titulo={m.titulo} sub={m.url.startsWith('/') ? `nsmusic.ia.br${m.url.split('?')[0]}` : m.url} />;
    case 'whatsapp':
      return <Cartao href={m.url} titulo={m.titulo} externo cor="#1FA855" />;
    case 'pix':
      return <Pix {...m} />;
    case 'imagem':
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={m.url} alt={m.nome || 'Imagem enviada'} style={{ width: 230, maxHeight: 300, objectFit: 'cover', borderRadius: 7, display: 'block' }} />;
    default:
      return null;
  }
}

export default function Bolha({ m, onOpcao, opcoesAtivas }) {
  const minha = m.de === 'eu';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: minha ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '82%', padding: '6px 8px 5px', background: minha ? CORES.minha : CORES.dele, borderRadius: minha ? '10px 2px 10px 10px' : '2px 10px 10px 10px', boxShadow: '0 1px 1px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Conteudo m={m} />
        <span style={{ alignSelf: 'flex-end', fontSize: 11, color: CORES.suave, marginTop: -2 }}>{m.hora}</span>
      </div>
      {opcoesAtivas && Array.isArray(m.opcoes) && m.opcoes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, width: '82%' }}>
          {m.opcoes.map((o) => (
            <button key={o.id} type="button" onClick={() => onOpcao(o)} style={{ background: '#fff', border: 0, borderRadius: 8, padding: '11px 12px', minHeight: 44, fontSize: 14, fontWeight: 600, color: CORES.link, cursor: 'pointer', boxShadow: '0 1px 1px rgba(0,0,0,.1)' }}>
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
