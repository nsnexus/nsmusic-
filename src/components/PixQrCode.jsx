'use client';

import { useEffect, useState } from 'react';

// QR Code do PIX desenhado no navegador a partir do próprio copia-e-cola.
//
// Por que no cliente e não no servidor: o BR Code (o texto do copia-e-cola) é a única entrada que um
// QR Code precisa — desenhá-lo é função pura desse texto. A primeira versão buscava a imagem pronta
// na Efí (GET /v2/loc/:id/qrcode), o que dependia de a cobrança devolver um `loc.id`, de uma segunda
// autenticação OAuth, de mais um hop pelo Worker de mTLS e da allowlist dele — e qualquer um desses
// falhando devolvia imagem vazia em silêncio, que foi o que aconteceu em produção. Aqui não há nada
// disso: se o copia-e-cola existe, o QR Code aparece.
//
// O import de `qrcode` é dinâmico para a biblioteca não entrar no bundle inicial de quem só abre a
// página sem chegar no checkout.

export default function PixQrCode({ payload, size = 220, label = 'QR Code para pagamento via PIX' }) {
  const [dataUrl, setDataUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!payload) return;

    // Evita gravar estado depois que o componente saiu da tela (o cliente pode pagar e a página
    // trocar de bloco antes do desenho terminar).
    let ativo = true;
    setFailed(false);

    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(payload, {
        width: size * 2, // desenha no dobro para não borrar em tela de alta densidade
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' },
      }))
      .then((url) => {
        if (ativo) setDataUrl(url);
      })
      .catch((err) => {
        console.warn('[PixQrCode] Falha ao desenhar o QR Code:', err?.message);
        if (ativo) setFailed(true);
      });

    return () => { ativo = false; };
  }, [payload, size]);

  if (!payload) return null;

  // Falha aqui nunca bloqueia o pagamento: o copia-e-cola ao lado continua sendo um caminho
  // completo, então o componente some em vez de mostrar erro e assustar quem ia pagar.
  if (failed) return null;

  if (!dataUrl) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          maxWidth: '100%',
          margin: '0 auto',
          borderRadius: '12px',
          background: 'rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}
      >
        Gerando QR Code...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={label}
      style={{
        width: `${size}px`,
        maxWidth: '100%',
        height: 'auto',
        background: '#FFFFFF',
        padding: '10px',
        borderRadius: '12px',
        display: 'block',
        margin: '0 auto',
      }}
    />
  );
}
