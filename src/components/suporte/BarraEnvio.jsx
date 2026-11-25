'use client';

import { useEffect, useRef, useState } from 'react';
import { CORES } from './Bolha';

// Barra de baixo do chat: texto, anexo, foto e áudio gravado — como no WhatsApp.

const MAX_GRAVACAO_S = 60;
const traco = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const botaoRedondo = { width: 48, height: 48, borderRadius: '50%', border: 0, background: CORES.acao, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
const iconeAnexo = { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#54656F', cursor: 'pointer' };

export default function BarraEnvio({ onTexto, onArquivo, onAudio, placeholder = 'Mensagem', teclado = 'text' }) {
  const [rascunho, setRascunho] = useState('');
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erroMic, setErroMic] = useState('');
  const gravador = useRef(null);
  const partes = useRef([]);
  const relogio = useRef(null);
  const descartar = useRef(false);

  const pararTudo = () => {
    clearInterval(relogio.current);
    relogio.current = null;
    try { gravador.current?.stream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
  };
  useEffect(() => () => { descartar.current = true; try { gravador.current?.stop(); } catch (_) {} pararTudo(); }, []);

  const enviarTexto = () => {
    const t = rascunho.trim();
    if (!t) return;
    setRascunho('');
    onTexto(t);
  };

  const iniciarGravacao = async () => {
    setErroMic('');
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErroMic('Seu navegador não grava áudio aqui. Pode escrever?');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      partes.current = [];
      descartar.current = false;
      rec.ondataavailable = (e) => { if (e.data?.size) partes.current.push(e.data); };
      rec.onstop = () => {
        pararTudo();
        if (descartar.current || partes.current.length === 0) return;
        const blob = new Blob(partes.current, { type: rec.mimeType || 'audio/webm' });
        onAudio(blob);
      };
      gravador.current = rec;
      rec.start();
      setSegundos(0);
      setGravando(true);
      relogio.current = setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= MAX_GRAVACAO_S) { try { gravador.current?.stop(); } catch (_) {} setGravando(false); }
          return s + 1;
        });
      }, 1000);
    } catch (_) {
      setErroMic('Não consegui acessar o microfone. Libere o microfone no navegador ou escreva sua mensagem.');
    }
  };

  const finalizarGravacao = (enviar) => {
    descartar.current = !enviar;
    setGravando(false);
    try { gravador.current?.stop(); } catch (_) { pararTudo(); }
  };

  const escolherArquivo = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onArquivo(f);
  };

  return (
    <footer style={{ background: '#F0F2F5', padding: '8px 8px calc(10px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
      {erroMic ? <p role="alert" style={{ margin: '0 4px 6px', fontSize: 12.5, color: '#B42318' }}>{erroMic}</p> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {gravando ? (
          <>
            <button type="button" onClick={() => finalizarGravacao(false)} aria-label="Descartar áudio" style={{ ...iconeAnexo, width: 44, height: 44, border: 0, background: 'none' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" {...traco}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
            </button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 24, padding: '0 16px', minHeight: 44 }}>
              <span className="sup-rec" style={{ width: 10, height: 10, borderRadius: '50%', background: '#E0393E' }} />
              <span style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{`${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`}</span>
              <span style={{ fontSize: 13, color: CORES.suave }}>Gravando…</span>
            </div>
            <button type="button" onClick={() => finalizarGravacao(true)} aria-label="Enviar áudio" style={botaoRedondo}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 20l18-8L3 4l2 7 9 1-9 1z" /></svg>
            </button>
          </>
        ) : (
          <>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, background: '#fff', borderRadius: 24, padding: '2px 4px 2px 16px', minHeight: 44, boxSizing: 'border-box' }}>
              <label htmlFor="sup-texto" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Mensagem</label>
              <input
                id="sup-texto" type={teclado === 'tel' ? 'tel' : 'text'} inputMode={teclado === 'tel' ? 'numeric' : 'text'}
                value={rascunho} onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviarTexto(); } }}
                placeholder={placeholder} autoComplete={teclado === 'tel' ? 'tel' : 'off'}
                style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontSize: 16, color: CORES.texto, background: 'transparent' }}
              />
              <label style={iconeAnexo} aria-label="Anexar arquivo">
                <svg viewBox="0 0 24 24" width="21" height="21" {...traco}><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9" /></svg>
                <input type="file" accept="image/*,application/pdf" onChange={escolherArquivo} style={{ display: 'none' }} />
              </label>
              <label style={iconeAnexo} aria-label="Enviar foto">
                <svg viewBox="0 0 24 24" width="21" height="21" {...traco}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                <input type="file" accept="image/*" capture="environment" onChange={escolherArquivo} style={{ display: 'none' }} />
              </label>
            </div>
            {rascunho.trim() ? (
              <button type="button" onClick={enviarTexto} aria-label="Enviar" style={botaoRedondo}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 20l18-8L3 4l2 7 9 1-9 1z" /></svg>
              </button>
            ) : (
              <button type="button" onClick={iniciarGravacao} aria-label="Gravar áudio" style={botaoRedondo}>
                <svg viewBox="0 0 24 24" width="21" height="21" {...traco}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
              </button>
            )}
          </>
        )}
      </div>
    </footer>
  );
}
