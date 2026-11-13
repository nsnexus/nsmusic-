'use client';

import { useState } from 'react';

const TEMPLATE_BODY = `Olá, {{1}}! Passando para avisar que a sua música especial de {{2}} ainda está salva e pronta para você ouvir e baixar. Mas atenção: por questões de armazenamento, sua prévia fica disponível por apenas 24 horas! Para garantir seu pedido agora, acesse: {{3}}. Se precisar de ajuda ou tiver qualquer dúvida, fale direto conosco pelo WhatsApp: {{4}}`;

export default function RecoveryMetaTemplateBox({ whatsappSuporte = '' }) {
  const [copiado, setCopiado] = useState(false);

  const copiarTexto = async () => {
    try {
      await navigator.clipboard.writeText(TEMPLATE_BODY);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Fallback
    }
  };

  const linkSuporte = whatsappSuporte ? `https://wa.me/${whatsappSuporte}` : '';

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#e0f2fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
            }}
          >
            📋
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
              Modelo Oficial Meta Cloud API (WhatsApp Marketing)
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
              Cadastre este modelo no Meta Business Manager &gt; WhatsApp Manager &gt; Modelos de Mensagem.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={copiarTexto}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: copiado ? '#ecfdf5' : '#f8fafc',
            color: copiado ? '#059669' : '#334155',
            fontWeight: '600',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          {copiado ? '✅ Copiado para a área de transferência!' : '📋 Copiar Texto do Modelo'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
          padding: '12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', display: 'block' }}>
            Nome do Modelo
          </span>
          <code style={{ fontSize: '0.88rem', fontWeight: '700', color: '#0f172a' }}>recuperacao_pedido_24h</code>
        </div>
        <div>
          <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', display: 'block' }}>
            Categoria
          </span>
          <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#0284c7' }}>Marketing</span>
        </div>
        <div>
          <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', display: 'block' }}>
            Idioma
          </span>
          <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#0f172a' }}>Português (Brasil) [pt_BR]</span>
        </div>
        <div>
          <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', display: 'block' }}>
            WhatsApp Suporte
          </span>
          {linkSuporte ? (
            <a
              href={linkSuporte}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.88rem', fontWeight: '700', color: '#059669', textDecoration: 'none' }}
            >
              +{whatsappSuporte} ↗
            </a>
          ) : (
            <span style={{ fontSize: '0.88rem', color: '#94a3b8' }}>Não definido</span>
          )}
        </div>
      </div>

      <div
        style={{
          background: '#f1f5f9',
          borderRadius: '8px',
          padding: '16px',
          fontFamily: 'monospace',
          fontSize: '0.88rem',
          color: '#1e293b',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          borderLeft: '4px solid #0284c7',
        }}
      >
        {TEMPLATE_BODY}
      </div>

      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Variáveis Dinâmicas do Modelo:</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '0.76rem', color: '#64748b' }}>
          <div><code style={{ color: '#0284c7', fontWeight: '700' }}>&#123;&#123;1&#125;&#125;</code>: Primeiro nome do cliente</div>
          <div><code style={{ color: '#0284c7', fontWeight: '700' }}>&#123;&#123;2&#125;&#125;</code>: Nome do homenageado</div>
          <div><code style={{ color: '#0284c7', fontWeight: '700' }}>&#123;&#123;3&#125;&#125;</code>: Link de entrega/pagamento</div>
          <div><code style={{ color: '#0284c7', fontWeight: '700' }}>&#123;&#123;4&#125;&#125;</code>: Link direto do WhatsApp do Suporte</div>
        </div>
      </div>
    </div>
  );
}

