'use client';

import { Lock, Sparkles, Check, X, ShieldCheck } from 'lucide-react';

export default function MobileValueComparison({ honoreeName }) {
  const name = honoreeName || 'sua homenagem';

  return (
    <section
      aria-label="Comparativo entre prévia e música completa"
      style={{
        margin: '20px 0 24px',
        padding: '20px 16px',
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 8px 24px -4px rgba(79, 70, 229, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '0.72rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#4f46e5',
            backgroundColor: '#eef2ff',
            padding: '4px 12px',
            borderRadius: '999px',
            marginBottom: '6px',
          }}
        >
          <Sparkles size={12} />
          Por que liberar agora?
        </span>
        <h3
          style={{
            fontSize: '1.15rem',
            fontWeight: 800,
            color: '#1e1b4b',
            margin: '4px 0 4px',
            lineHeight: 1.3,
          }}
        >
          A diferença entre a prévia e a canção oficial
        </h3>
        <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0 }}>
          Veja tudo o que é liberado para presentear {name}:
        </p>
      </div>

      {/* Grid de 2 Colunas adaptado para Mobile */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Coluna 1: Prévia Gratuita Atual */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: '16px',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                }}
              >
                <Lock size={15} />
              </div>
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#334155', display: 'block' }}>
                  Prévia Gratuita
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Apenas demonstração</span>
              </div>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', color: '#64748b' }}>
                <X size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Corta abruptamente aos <strong>60 segundos</strong></span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', color: '#64748b' }}>
                <X size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Não pode ser baixada no celular</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', color: '#64748b' }}>
                <X size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Sem arquivo de áudio para enviar no WhatsApp</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Coluna 2: Canção Completa Liberada */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fdf4ff 0%, #f5f3ff 100%)',
            border: '2px solid #8b5cf6',
            borderRadius: '16px',
            padding: '16px 14px',
            position: 'relative',
            boxShadow: '0 4px 16px rgba(139, 92, 246, 0.12)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '-10px',
              right: '12px',
              backgroundColor: '#8b5cf6',
              color: '#ffffff',
              fontSize: '0.66rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              boxShadow: '0 2px 6px rgba(139, 92, 246, 0.35)',
            }}
          >
            Liberado com 1 PIX
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                backgroundColor: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669',
              }}
            >
              <Sparkles size={15} />
            </div>
            <div>
              <strong style={{ fontSize: '0.94rem', color: '#1e1b4b', display: 'block' }}>
                Música Oficial Completa
              </strong>
              <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                Acesso Imediato e Vitalício
              </span>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: '#1e1b4b', fontWeight: 600 }}>
              <Check size={16} color="#059669" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span><strong>Música inteira (~3 minutos)</strong> com início, refrão e final</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: '#1e1b4b', fontWeight: 600 }}>
              <Check size={16} color="#059669" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span><strong>Arquivo MP3 HD de estúdio</strong> baixável diretamente no celular</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: '#1e1b4b', fontWeight: 600 }}>
              <Check size={16} color="#059669" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Pronta para enviar no WhatsApp e tocar na celebração</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: '#059669', fontWeight: 700 }}>
              <ShieldCheck size={16} color="#059669" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Garantia total de emoção sem custos adicionais</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

