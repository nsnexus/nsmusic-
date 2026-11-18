'use client';

import { useEffect, useState } from 'react';
import { QrCode, Download, Share2, X } from 'lucide-react';

// QR Code do link de homenagem (/h/, /c/, /r/), desenhado no próprio navegador com a lib `qrcode`
// (mesmo motivo do PixQrCode: o link é a única entrada, não precisa de servidor nem de serviço externo).
// O cliente baixa um cartão pronto para imprimir/colar no presente: título, QR e instrução de uso.
//
// Uso: <QrCodeHomenagem url={...} honoreeName={...} tipo="musica" buttonStyle={...}>Rótulo</QrCodeHomenagem>

const TITULOS = {
  musica: 'Uma música feita para',
  carta: 'Uma carta feita para',
  retrospectiva: 'Uma retrospectiva feita para',
};

function quebrarLinhas(ctx, texto, larguraMax) {
  const palavras = String(texto).split(/\s+/);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width > larguraMax && atual) { linhas.push(atual); atual = p; }
    else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 2);
}

async function desenharCartao(url, honoreeName, tipo) {
  const QRCode = await import('qrcode');
  const qrDataUrl = await QRCode.toDataURL(url, { width: 880, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1f1a24', light: '#FFFFFF' } });
  const qrImg = await new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  const W = 1080;
  const H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const fundo = ctx.createLinearGradient(0, 0, W, H);
  fundo.addColorStop(0, '#fdf2f8');
  fundo.addColorStop(1, '#ede9fe');
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#6d28d9';
  ctx.font = '600 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(TITULOS[tipo] || TITULOS.musica, W / 2, 150);

  ctx.fillStyle = '#1f1a24';
  ctx.font = '800 76px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const linhas = quebrarLinhas(ctx, honoreeName || 'alguém especial', W - 160);
  linhas.forEach((l, i) => ctx.fillText(l, W / 2, 245 + i * 88));

  const qrSize = 760;
  const qrX = (W - qrSize) / 2;
  const qrY = 245 + linhas.length * 88 + 20;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(76, 29, 149, 0.18)';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(qrX - 40, qrY - 40, qrSize + 80, qrSize + 80, 48); else ctx.rect(qrX - 40, qrY - 40, qrSize + 80, qrSize + 80);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = '#1f1a24';
  ctx.font = '700 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Aponte a câmera do celular', W / 2, qrY + qrSize + 120);
  ctx.fillStyle = '#6b6276';
  ctx.font = '500 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(tipo === 'carta' ? 'e abra a sua carta ❤' : 'e ouça a sua homenagem ❤', W / 2, qrY + qrSize + 175);

  ctx.fillStyle = '#a78bfa';
  ctx.font = '600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('NS Music', W / 2, H - 50);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { dataUrl: canvas.toDataURL('image/png'), blob };
}

export default function QrCodeHomenagem({ url, honoreeName = '', tipo = 'musica', buttonStyle, className, children }) {
  const [aberto, setAberto] = useState(false);
  const [cartao, setCartao] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto || !url) return;
    let ativo = true;
    setCartao(null); setErro('');
    desenharCartao(url, honoreeName, tipo)
      .then((c) => { if (ativo) setCartao(c); })
      .catch((e) => { console.warn('[QrCodeHomenagem] Falha ao desenhar:', e?.message); if (ativo) setErro('Não foi possível gerar o QR Code agora. Tente de novo.'); });
    return () => { ativo = false; };
  }, [aberto, url, honoreeName, tipo]);

  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto]);

  if (!url) return null;

  const nomeArquivo = `qrcode-homenagem-${(honoreeName || 'presente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.png`;
  const arquivo = cartao?.blob ? new File([cartao.blob], nomeArquivo, { type: 'image/png' }) : null;
  const podeCompartilhar = typeof navigator !== 'undefined' && arquivo && navigator.canShare?.({ files: [arquivo] });

  const compartilhar = async () => {
    try { await navigator.share({ files: [arquivo], title: 'QR Code da homenagem' }); }
    catch (e) { if (e?.name !== 'AbortError') setErro('Não foi possível compartilhar. Use o botão Baixar imagem.'); }
  };

  const botaoModal = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flex: 1,
    minHeight: '46px', padding: '10px 14px', borderRadius: '12px', fontWeight: 700, fontSize: '0.92rem',
    cursor: 'pointer', textDecoration: 'none', border: 'none',
  };

  return (
    <>
      <button type="button" className={className} style={buttonStyle} onClick={() => setAberto(true)}>
        {children || (<><QrCode size={18} aria-hidden="true" /> Gerar QR Code</>)}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QR Code da homenagem"
          onClick={() => setAberto(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 10, 25, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', width: '100%', maxWidth: '380px', maxHeight: '92vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px', padding: '18px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', color: '#1f1a24' }}
          >
            <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} style={{ position: 'absolute', top: '10px', right: '10px', width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: '#f1edf5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} aria-hidden="true" />
            </button>
            <h2 style={{ fontSize: '1.1rem', margin: '0 40px 4px 0' }}>QR Code da homenagem</h2>
            <p style={{ fontSize: '0.86rem', color: '#6b6276', margin: '0 0 12px', lineHeight: 1.45 }}>
              Imprima e cole no presente, num cartão ou na embalagem. Quem apontar a câmera do celular abre a homenagem na hora.
            </p>

            {cartao ? (
              <img src={cartao.dataUrl} alt={`QR Code da homenagem para ${honoreeName || 'a pessoa homenageada'}`} style={{ width: '100%', borderRadius: '14px', display: 'block', border: '1px solid #ece6f2' }} />
            ) : !erro ? (
              <div role="status" style={{ aspectRatio: '3 / 4', borderRadius: '14px', background: '#f5f2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6276', fontSize: '0.9rem' }}>Gerando QR Code…</div>
            ) : null}

            {erro && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.86rem', margin: '10px 0 0' }}>{erro}</p>}

            {cartao && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <a href={cartao.dataUrl} download={nomeArquivo} style={{ ...botaoModal, background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)', color: '#ffffff' }}>
                    <Download size={18} aria-hidden="true" /> Baixar imagem
                  </a>
                  {podeCompartilhar && (
                    <button type="button" onClick={compartilhar} style={{ ...botaoModal, background: '#f1edf5', color: '#4c1d95' }}>
                      <Share2 size={18} aria-hidden="true" /> Compartilhar
                    </button>
                  )}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#8a8195', margin: '10px 0 0', lineHeight: 1.4 }}>
                  Se o download não começar (comum dentro do WhatsApp), toque e segure na imagem e escolha <strong>Salvar imagem</strong>.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
