'use client';

import { useState, useEffect } from 'react';

const CHAVE = 'ns_popup_navegador_visto';

// Pop-up mostrado uma vez por visita quando a página foi aberta de dentro do WhatsApp/Instagram.
// Ensina o caminho que comprovadamente funciona (⋮ → "Abrir no Chrome" / "Abrir no Safari"), porque
// dentro do app o envio de fotos e o download falham. Quem fecha continua vendo a faixa no topo.
export default function PopupAbrirNoNavegador({ ios, chromeIntentUrl, onCopiar, copiado }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CHAVE) === '1') return;
    } catch (e) {
      // Sem sessionStorage (modo restrito): mostra o pop-up mesmo assim.
    }
    setAberto(true);
  }, []);

  if (!aberto) return null;

  const fechar = () => {
    try { sessionStorage.setItem(CHAVE, '1'); } catch (e) { /* segue sem lembrar */ }
    setAberto(false);
  };

  const passo = { display: 'flex', gap: '12px', alignItems: 'flex-start', textAlign: 'left' };
  const numero = { flex: '0 0 30px', height: '30px', borderRadius: '50%', background: '#67408b', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-navegador-titulo"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 8, 28, 0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      {/* Seta apontando para os três pontinhos do topo (Android) */}
      {!ios && (
        <div aria-hidden="true" style={{ position: 'fixed', top: '6px', right: '14px', fontSize: '2.4rem', lineHeight: 1, color: '#fbbf24', animation: 'c2-pulinho 1.2s ease-in-out infinite' }}>
          ☝️
        </div>
      )}
      <div style={{ width: '100%', maxWidth: '480px', background: '#ffffff', color: '#29232d', borderRadius: '22px 22px 0 0', padding: '22px 20px 24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.35)', fontFamily: 'var(--font-family-body)' }}>
        <h2 id="popup-navegador-titulo" style={{ margin: '0 0 6px', fontSize: '1.2rem', fontFamily: 'var(--font-family-title)' }}>
          Abra no navegador para funcionar 100%
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '0.92rem', color: '#4e4653', lineHeight: 1.5 }}>
          Você está dentro do WhatsApp. Aqui, <strong>enviar fotos, gerar o vídeo e baixar a música podem não funcionar</strong>. Leva 5 segundos:
        </p>

        <div style={{ display: 'grid', gap: '12px', marginBottom: '18px', fontSize: '0.95rem', lineHeight: 1.45 }}>
          <div style={passo}>
            <span style={numero}>1</span>
            <span>{ios
              ? <>Toque no ícone da <strong>bússola (Safari)</strong> ou em <strong>Compartilhar</strong>, no rodapé da tela.</>
              : <>Toque nos <strong>três pontinhos (⋮)</strong> lá em cima, no canto direito.</>}</span>
          </div>
          <div style={passo}>
            <span style={numero}>2</span>
            <span>{ios
              ? <>Escolha <strong>“Abrir no Safari”</strong>.</>
              : <>Escolha <strong>“Abrir no Chrome”</strong> (ou “Abrir no navegador”).</>}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '9px' }}>
          {!ios && chromeIntentUrl && (
            <a href={chromeIntentUrl} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', background: '#10b981', color: '#053b2c', fontWeight: 800, padding: '14px', borderRadius: '12px', fontSize: '1rem' }}>
              🌐 Tentar abrir no Chrome agora
            </a>
          )}
          <button type="button" onClick={onCopiar} style={{ background: '#f3eef7', border: '1px solid #d9cbe6', color: '#4a2d66', fontWeight: 700, padding: '12px', borderRadius: '12px', fontSize: '0.92rem', cursor: 'pointer' }}>
            {copiado ? '✅ Link copiado! Cole no navegador' : '🔗 Copiar o link desta página'}
          </button>
          <button type="button" onClick={fechar} style={{ background: 'transparent', border: 'none', color: '#6b6170', fontWeight: 600, padding: '8px', fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'underline' }}>
            Continuar aqui mesmo
          </button>
        </div>
      </div>
    </div>
  );
}
