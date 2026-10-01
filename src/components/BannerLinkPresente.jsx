'use client';

import React from 'react';

/**
 * Banner superior de compartilhamento para o produto ativo (Música /h/, Carta /c/, Retrospectiva /r/).
 * Exibido no topo da aba correspondente após a confirmação do pagamento.
 */
export default function BannerLinkPresente({
  tipo = 'musica',
  honoreeName = '',
  orderId = '',
  linkUrl = '',
  whatsappUrl = '',
  viewUrl = '',
  onCopy = () => {},
  copied = false,
}) {
  const nomeHomenageado = honoreeName || 'a pessoa homenageada';

  const configPorTipo = {
    musica: {
      badgeIcon: '🎁',
      badgeText: 'Link Oficial de Presente',
      subBadge: 'Criado para emocionar ❤️',
      title: `Envie a homenagem para ${nomeHomenageado}!`,
      description:
        'Criamos uma página linda e emocionante, pronta para você compartilhar. Ela foi feita sob medida para a pessoa abrir no celular, ver a capa personalizada e ouvir a música direto!',
      whatsappLabel: 'Enviar no WhatsApp',
      copyLabel: 'Copiar Link de Presente',
      tipCode: '/h/...',
      tipText: `Envie para ${nomeHomenageado} sempre o link oficial de presente acima (/h/...). A tela em que você está agora (/entrega) é o seu painel de controle pessoal onde você faz downloads e gerencia seus pedidos.`,
      badgeGradient: 'linear-gradient(90deg, #ec4899, #8b5cf6)',
      glowColor: 'rgba(236, 72, 153, 0.35)',
      borderColor: 'rgba(244, 114, 182, 0.45)',
      boxShadow: '0 12px 32px -4px rgba(236, 72, 153, 0.28), 0 4px 14px rgba(0, 0, 0, 0.45)',
    },
    carta: {
      badgeIcon: '💌',
      badgeText: 'Link Oficial da Carta',
      subBadge: 'Envelope Animado com Música ✨',
      title: `Envie a carta virtual para ${nomeHomenageado}!`,
      description:
        'Uma experiência emocionante com envelope que abre ao toque, papel personalizado, suas fotos e a música tocando de fundo!',
      whatsappLabel: 'Enviar Carta no WhatsApp',
      copyLabel: 'Copiar Link da Carta',
      tipCode: '/c/...',
      tipText: `Envie para ${nomeHomenageado} o link da carta acima (/c/...). Na área abaixo você pode personalizar o texto, a música e o tema visual da carta.`,
      badgeGradient: 'linear-gradient(90deg, #f43f5e, #f59e0b)',
      glowColor: 'rgba(244, 63, 94, 0.35)',
      borderColor: 'rgba(251, 146, 60, 0.45)',
      boxShadow: '0 12px 32px -4px rgba(244, 63, 94, 0.28), 0 4px 14px rgba(0, 0, 0, 0.45)',
    },
    retrospectiva: {
      badgeIcon: '📖',
      badgeText: 'Link Oficial da Retrospectiva',
      subBadge: 'Linha do Tempo e Memórias 💖',
      title: `Envie a retrospectiva para ${nomeHomenageado}!`,
      description:
        'Uma página só de vocês com a história completa: contador de tempo, linha do tempo interativa, fotos e a música tocando de fundo!',
      whatsappLabel: 'Enviar no WhatsApp',
      copyLabel: 'Copiar Link da Retrospectiva',
      tipCode: '/r/...',
      tipText: `Envie para ${nomeHomenageado} o link da retrospectiva acima (/r/...). Na área abaixo você pode adicionar fotos, momentos marcantes e editar o contador.`,
      badgeGradient: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
      glowColor: 'rgba(139, 92, 246, 0.35)',
      borderColor: 'rgba(167, 139, 250, 0.45)',
      boxShadow: '0 12px 32px -4px rgba(139, 92, 246, 0.28), 0 4px 14px rgba(0, 0, 0, 0.45)',
    },
  };

  const cfg = configPorTipo[tipo] || configPorTipo.musica;
  const urlFinal = linkUrl || (orderId ? `https://nsmusic.com.br/${tipo === 'carta' ? 'c' : tipo === 'retrospectiva' ? 'r' : 'h'}/${orderId}` : '');

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.16) 0%, rgba(168, 85, 247, 0.14) 40%, rgba(15, 23, 42, 0.82) 100%)',
        border: `1.5px solid ${cfg.borderColor}`,
        boxShadow: cfg.boxShadow,
        borderRadius: '16px',
        padding: '18px 20px',
        marginBottom: '20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Efeito decorativo de brilho suave */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '160px',
          height: '160px',
          background: `radial-gradient(circle, ${cfg.glowColor} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: cfg.badgeGradient,
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '4px 12px',
              borderRadius: '999px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
          >
            <span>{cfg.badgeIcon}</span> {cfg.badgeText}
          </span>
          <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
            {cfg.subBadge}
          </span>
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-family-gala, sans-serif)',
            fontSize: '1.35rem',
            fontWeight: '800',
            color: '#ffffff',
            margin: '0 0 6px',
            lineHeight: '1.3',
          }}
        >
          {cfg.title}
        </h3>

        <p
          style={{
            fontSize: '0.88rem',
            color: '#e2e8f0',
            margin: '0 0 14px',
            lineHeight: '1.5',
          }}
        >
          {cfg.description}
        </p>

        {/* Caixa com o link visível */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '10px',
            padding: '8px 12px',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: '#f472b6' }}>🔗</span>
          <span
            style={{
              fontSize: '0.85rem',
              color: '#fbcfe8',
              fontWeight: '600',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {urlFinal}
          </span>
        </div>

        {/* Botões de Ação */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.92rem',
                padding: '11px 18px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(37, 211, 102, 0.35)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>📲</span> {cfg.whatsappLabel}
            </a>
          )}

          <button
            type="button"
            onClick={onCopy}
            className="btn"
            style={{
              background: copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.12)',
              border: copied ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.25)',
              color: copied ? '#6ee7b7' : '#ffffff',
              fontWeight: '700',
              fontSize: '0.92rem',
              padding: '11px 18px',
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <span>{copied ? '✅' : '📋'}</span>
            {copied ? 'Link Copiado!' : cfg.copyLabel}
          </button>

          {viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{
                background: 'transparent',
                border: '1px solid rgba(244, 114, 182, 0.4)',
                color: '#f472b6',
                fontWeight: '600',
                fontSize: '0.88rem',
                padding: '11px 16px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <span>👁️</span> Ver como {nomeHomenageado} vai ver
            </a>
          )}
        </div>

        {/* Aviso para não mandar o link de /entrega */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px dashed rgba(244, 114, 182, 0.35)',
            borderRadius: '10px',
            padding: '9px 13px',
            marginTop: '14px',
            fontSize: '0.82rem',
            color: '#cbd5e1',
            lineHeight: '1.45',
          }}
        >
          <strong style={{ color: '#f472b6' }}>💡 Dica importante:</strong> {cfg.tipText}
        </div>
      </div>
    </div>
  );
}
