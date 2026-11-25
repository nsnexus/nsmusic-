'use client';

import { useEffect, useRef, useState } from 'react';
import PixQrCode from '@/components/PixQrCode';
import { copiarTexto } from '@/lib/copiarTexto';

// Uma mensagem do chat de suporte. Os tipos vêm prontos de /api/suporte/chat (src/lib/suporteChat.js).

export const CORES = {
  topo: '#008069',
  fundo: '#EFEAE2',
  minha: '#D9FDD3',
  dele: '#FFFFFF',
  acao: '#008069',
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 260, padding: '4px 2px 0' }}>
      <audio
        ref={ref} src={url} preload="none" data-chat-audio
        onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => { setTocando(false); setProgresso(0); }}
        onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
        onTimeUpdate={(e) => setProgresso(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        onError={() => setErro(true)}
      />
      <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: '50%', background: '#FFAD1F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v-4a8 8 0 0 1 16 0v4" /><rect x="3" y="15" width="5" height="6" rx="1.5" fill="currentColor" /><rect x="16" y="15" width="5" height="6" rx="1.5" fill="currentColor" /></svg>
      </span>
      <button type="button" onClick={alternar} aria-label={tocando ? 'Pausar' : 'Tocar'} style={{ width: 36, height: 44, border: 0, background: 'none', color: '#54656F', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
        {tocando
          ? <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          : <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M7 4.5l13 7.5-13 7.5z" /></svg>}
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10 }}>
        <div style={{ position: 'relative', height: 4, borderRadius: 2, background: '#D1D7DB' }}>
          <div style={{ width: `${Math.round(progresso * 100)}%`, height: '100%', borderRadius: 2, background: '#8696A0' }} />
          <span style={{ position: 'absolute', top: -4, left: `calc(${Math.round(progresso * 100)}% - 6px)`, width: 12, height: 12, borderRadius: '50%', background: tocando ? '#4FB6EC' : '#8696A0' }} />
        </div>
        <span style={{ fontSize: 11.5, color: CORES.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {erro ? 'Não tocou aqui, use o arquivo' : (duracao ? fmtTempo(duracao) : (titulo || 'Áudio'))}
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
    case 'arquivo': {
      const ext = (m.extensao || String(m.nome || '').split('.').pop() || 'MP3').slice(0, 4).toUpperCase();
      return (
        <a href={m.url} download={m.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, width: 260, background: 'rgba(0,0,0,.05)', borderRadius: 6, padding: '12px 10px', textDecoration: 'none', color: CORES.texto, boxSizing: 'border-box' }}>
          <svg viewBox="0 0 26 32" width="26" height="32" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M3 0h14l9 9v20a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z" fill="#79909B" />
            <path d="M17 0v6a3 3 0 0 0 3 3h6z" fill="#B2C1C8" />
            <text x="13" y="24" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">{ext}</text>
          </svg>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
            <span style={{ fontSize: 12, color: CORES.suave }}>{ext} · Toque para baixar</span>
          </span>
          <span style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #8696A0', color: '#8696A0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Baixar"><path d="M12 5v11M7 11l5 5 5-5M6 20h12" /></svg>
          </span>
        </a>
      );
    }
    case 'link':
      return <Cartao href={m.url} titulo={m.titulo} externo={/^https?:/.test(m.url)} sub={m.url.startsWith('intent:') ? 'Abre esta página no Chrome' : m.url.startsWith('/') ? `nsmusic.ia.br${m.url.split('?')[0]}` : m.url.replace(/^https?:\/\/(www\.)?/, '')} />;
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
      <div style={{ position: 'relative', maxWidth: '82%', padding: '6px 8px 5px', background: minha ? CORES.minha : CORES.dele, borderRadius: minha ? '8px 0 8px 8px' : '0 8px 8px 8px', boxShadow: '0 1px .5px rgba(11,20,26,.13)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <svg viewBox="0 0 8 13" width="8" height="13" aria-hidden="true" style={{ position: 'absolute', top: 0, [minha ? 'right' : 'left']: -8 }}>
          <path d={minha ? 'M0 0h8L1 9.5C.5 10.2 0 10 0 9z' : 'M8 0H0l7 9.5c.5.7 1 .5 1-.5z'} fill={minha ? CORES.minha : CORES.dele} />
        </svg>
        <Conteudo m={m} />
        <span style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: CORES.suave, marginTop: -2 }}>
          {m.hora}
          {minha ? <svg viewBox="0 0 16 11" width="16" height="11" role="img" aria-label="Lida"><path d="M1 6l3 3 6-7M6 9l1 1 6-8" fill="none" stroke="#53BDEB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
        </span>
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
