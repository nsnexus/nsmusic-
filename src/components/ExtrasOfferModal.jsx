'use client';

import { useState } from 'react';
import { getPriceForSku } from '@/lib/pricing';

export default function ExtrasOfferModal({
  isOpen,
  onClose,
  onSelect,
  honoreeName = 'alguém especial',
  isPaid = false,
  jaTemVideo = false,
  jaTemCarta = false,
  jaTemRetrospectiva = false,
}) {
  const [naoMostrarMais, setNaoMostrarMais] = useState(false);
  const [selectedSku, setSelectedSku] = useState(
    isPaid ? 'retrospectiva_addon' : 'combo_retrospectiva'
  );

  if (!isOpen) return null;

  const precoFormatado = (sku) => {
    const preco = getPriceForSku(sku);
    return preco === null ? '' : `R$ ${preco.toFixed(2).replace('.', ',')}`;
  };

  // Pacotes antes de pagar (funil principal - Imagem 3)
  const pacotesPrePagamento = [
    {
      sku: 'audio_only',
      icone: '🎵',
      titulo: 'Só a música',
      desc: "2 versões completas em MP3 HD (sem marca d'água)",
      preco: precoFormatado('audio_only'),
      destaque: false,
    },
    {
      sku: 'combo',
      icone: '🎬',
      titulo: 'Música + Vídeo Homenagem',
      desc: '2 versões MP3 + Vídeo com fotos e letra sincronizada',
      preco: precoFormatado('combo'),
      destaque: false,
    },
    {
      sku: 'combo_retrospectiva',
      icone: '📖',
      titulo: 'Música + Retrospectiva',
      desc: '2 versões MP3 + Retrospectiva completa com fotos e vídeo',
      preco: precoFormatado('combo_retrospectiva'),
      destaque: '👑 MAIS ESCOLHIDO',
    },
    {
      sku: 'combo_carta',
      icone: '💌',
      titulo: 'Música + Carta Virtual',
      desc: '2 versões MP3 + Carta virtual personalizada para emocionar',
      preco: precoFormatado('combo_carta'),
      destaque: false,
    },
  ];

  // Opções de add-on avulso se o cliente já pagou a música principal
  const opcoesPosPagamento = [
    !jaTemRetrospectiva && {
      sku: 'retrospectiva_addon',
      icone: '📖',
      titulo: 'Retrospectiva Completa',
      desc: 'Página exclusiva com linha do tempo, fotos e música tocando',
      preco: precoFormatado('retrospectiva_addon'),
      destaque: '👑 MAIS ESCOLHIDO',
    },
    !jaTemVideo && {
      sku: 'video_addon',
      icone: '🎬',
      titulo: 'Vídeo Homenagem',
      desc: `Clipe com as fotos de ${honoreeName} no ritmo da música`,
      preco: precoFormatado('video_addon'),
      destaque: false,
    },
    !jaTemCarta && {
      sku: 'carta_addon',
      icone: '💌',
      titulo: 'Carta Virtual',
      desc: 'Carta emocionante com envelope digital e foto',
      preco: precoFormatado('carta_addon'),
      destaque: false,
    },
  ].filter(Boolean);

  const opcoes = isPaid ? opcoesPosPagamento : pacotesPrePagamento;

  const handleConfirmar = () => {
    onSelect(selectedSku);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000,
        overflowY: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Escolha o seu pacote"
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '22px',
          padding: '24px 20px 20px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          position: 'relative',
        }}
      >
        {/* Botão Fechar (X) */}
        <button
          type="button"
          onClick={() => onClose(naoMostrarMais)}
          aria-label="Fechar"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#f1f5f9',
            border: 'none',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '700',
            transition: 'background 0.2s',
          }}
        >
          ✕
        </button>

        {/* Top Icon Badge */}
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              margin: '0 auto 12px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px -2px rgba(139, 92, 246, 0.4)',
              fontSize: '1.6rem',
            }}
          >
            🎵
          </div>

          <h3
            style={{
              fontFamily: 'var(--font-family-title, sans-serif)',
              fontSize: '1.35rem',
              fontWeight: '800',
              color: '#1e293b',
              margin: '0 0 6px',
              lineHeight: 1.25,
            }}
          >
            {isPaid ? (
              'Adicione um extra especial'
            ) : (
              <>
                Escolha o seu{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    display: 'inline-block',
                  }}
                >
                  pacote
                </span>
              </>
            )}
          </h3>

          <p
            style={{
              fontSize: '0.86rem',
              color: '#64748b',
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            {isPaid
              ? `Adicione mais emoção à homenagem de ${honoreeName} com os recursos exclusivos abaixo:`
              : 'Selecione o que você gostaria de incluir com a sua música:'}
          </p>
        </div>

        {/* Lista de Opções (Radio Cards) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {opcoes.map((opcao) => {
            const isSelected = selectedSku === opcao.sku;

            return (
              <div
                key={opcao.sku}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedSku(opcao.sku)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedSku(opcao.sku);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: isSelected
                    ? '2px solid #8b5cf6'
                    : '1.5px solid #e2e8f0',
                  backgroundColor: isSelected
                    ? 'rgba(139, 92, 246, 0.05)'
                    : '#ffffff',
                  cursor: 'pointer',
                  position: 'relative',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected
                    ? '0 4px 14px rgba(139, 92, 246, 0.15)'
                    : 'none',
                }}
              >
                {/* Badge "👑 MAIS ESCOLHIDO" */}
                {opcao.destaque && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '14px',
                      background: 'linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%)',
                      color: '#ffffff',
                      fontSize: '0.62rem',
                      fontWeight: '800',
                      padding: '2px 9px',
                      borderRadius: '999px',
                      boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {opcao.destaque}
                  </span>
                )}

                {/* Radio Circle */}
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: isSelected ? '2px solid #8b5cf6' : '2px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    backgroundColor: '#ffffff',
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: '#8b5cf6',
                      }}
                    />
                  )}
                </div>

                {/* Conteúdo de Texto */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: '700',
                      fontSize: '0.92rem',
                      color: '#1e293b',
                      lineHeight: 1.3,
                      marginBottom: '2px',
                    }}
                  >
                    {opcao.titulo}
                  </div>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      color: '#64748b',
                      lineHeight: 1.35,
                    }}
                  >
                    {opcao.desc}
                  </div>
                </div>

                {/* Preço */}
                <div
                  style={{
                    fontWeight: '800',
                    fontSize: '0.96rem',
                    color: isSelected ? '#7c3aed' : '#334155',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {opcao.preco}
                </div>
              </div>
            );
          })}
        </div>

        {/* Botão de Ação Primário */}
        <button
          type="button"
          onClick={handleConfirmar}
          style={{
            width: '100%',
            marginTop: '16px',
            padding: '13px 20px',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#ffffff',
            fontSize: '0.98rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(124, 58, 237, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span>🚀 Continuar com este pacote →</span>
        </button>

        {/* Botão de Saída Secundário */}
        <button
          type="button"
          onClick={() => onClose(naoMostrarMais)}
          style={{
            width: '100%',
            marginTop: '6px',
            padding: '8px',
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Agora não, obrigado
        </button>

        {/* Checkbox "Não mostrar esta oferta de novo" */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            marginTop: '10px',
            fontSize: '0.78rem',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={naoMostrarMais}
            onChange={(e) => setNaoMostrarMais(e.target.checked)}
            style={{ cursor: 'pointer', accentColor: '#8b5cf6' }}
          />
          Não mostrar esta oferta de novo
        </label>

        {/* Mensagem de Brinde no Rodapé */}
        <div
          style={{
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid #f1f5f9',
            textAlign: 'center',
            fontSize: '0.76rem',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span>🎁</span>
          <span>Todos os pacotes incluem as 2 versões em MP3 HD.</span>
        </div>
      </div>
    </div>
  );
}
