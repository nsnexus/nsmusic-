'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { formatToWhatsAppNumber, resolveDeliveryUrl } from '@/lib/whatsappTemplates';

function getSaudacaoAtual() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function OrderWhatsAppFeedbackCard({ order }) {
  const [saudacao, setSaudacao] = useState(getSaudacaoAtual);
  const [mensagem, setMensagem] = useState('');
  const [copiado, setCopiado] = useState(false);

  const clienteNome = useMemo(() => {
    const raw = String(order?.customerName || '').trim();
    if (!raw || raw.toLowerCase() === 'cliente') return 'tudo bem?';
    // Pega o primeiro nome para a conversa soar mais pessoal e amigável
    return raw.split(' ')[0];
  }, [order?.customerName]);

  const homenageadoNome = useMemo(() => {
    const raw = String(order?.honoreeName || order?.honoree_name || order?.recipientName || '').trim();
    if (raw) return raw;
    if (order?.relationship) return `sua ${order.relationship.toLowerCase()}`;
    return 'homenageado(a)';
  }, [order?.honoreeName, order?.honoree_name, order?.recipientName, order?.relationship]);

  const deliveryLink = useMemo(() => {
    if (!order?.id) return '';
    return resolveDeliveryUrl(order.id);
  }, [order?.id]);

  // Gera o template padrão
  const gerarTextoPadrao = (saudacaoEscolhida) => {
    const saud = saudacaoEscolhida || saudacao;
    const saudacaoLinha = clienteNome === 'tudo bem?' 
      ? `${saud}! Tudo bem por aí? 😊`
      : `${saud}, ${clienteNome}! Tudo bem? 😊`;

    return `${saudacaoLinha}

Passando aqui pra saber: o que você achou da música que fizemos pra ${homenageadoNome}? Ficou do jeitinho que você imaginava?

Se você quiser ajustar alguma coisa na letra ou nos detalhes, é só me falar por aqui que a gente ajeita com todo carinho! 🎵

${deliveryLink ? `(Caso queira ouvir novamente a prévia: ${deliveryLink})` : ''}`.trim();
  };

  // Inicializa a mensagem na montagem ou quando a saudação/pedido mudar
  useEffect(() => {
    setMensagem(gerarTextoPadrao(saudacao));
  }, [saudacao, clienteNome, homenageadoNome, deliveryLink]);

  const handleTrocarSaudacao = (novaSaudacao) => {
    setSaudacao(novaSaudacao);
    setMensagem(gerarTextoPadrao(novaSaudacao));
  };

  const phoneLimpo = useMemo(() => {
    return formatToWhatsAppNumber(order?.customerPhone);
  }, [order?.customerPhone]);

  const whatsappUrl = useMemo(() => {
    if (!phoneLimpo) return '#';
    return `https://wa.me/${phoneLimpo}?text=${encodeURIComponent(mensagem)}`;
  }, [phoneLimpo, mensagem]);

  const handleCopiar = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(mensagem);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }
    } catch (e) {
      alert('Não foi possível copiar automaticamente.');
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
        marginTop: '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>💬</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
              Mensagem Pronta para o WhatsApp (Ajuste / Feedback)
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Envie uma mensagem calorosa perguntando o que o cliente achou da música e se quer ajustar algo.
            </p>
          </div>
        </div>

        {/* Seleção de Saudação por Horário */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: '🌅 Bom dia', val: 'Bom dia' },
            { label: '☀️ Boa tarde', val: 'Boa tarde' },
            { label: '🌙 Boa noite', val: 'Boa noite' },
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              onClick={() => handleTrocarSaudacao(item.val)}
              style={{
                padding: '4px 10px',
                fontSize: '0.78rem',
                fontWeight: '700',
                borderRadius: '8px',
                cursor: 'pointer',
                border: saudacao === item.val ? '1.5px solid #059669' : '1px solid #cbd5e1',
                backgroundColor: saudacao === item.val ? '#ecfdf5' : '#ffffff',
                color: saudacao === item.val ? '#065f46' : '#475569',
                transition: 'all 0.15s ease',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Caixa de Texto Editável da Mensagem */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
          Texto da Mensagem (Você pode editar antes de enviar):
        </label>
        <textarea
          rows={7}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '0.88rem',
            lineHeight: '1.5',
            color: '#1e293b',
            borderRadius: '10px',
            border: '1.5px solid #cbd5e1',
            backgroundColor: '#f8fafc',
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Barra de Ações com 1 Clique */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {order?.customerPhone ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '9px 18px',
                backgroundColor: '#25D366',
                color: '#ffffff',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: '700',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)',
                cursor: 'pointer',
              }}
            >
              <span>📲</span>
              <span>Enviar no WhatsApp</span>
            </a>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: '600' }}>
              ⚠️ Cliente sem telefone cadastrado
            </span>
          )}

          <button
            type="button"
            onClick={handleCopiar}
            style={{
              padding: '9px 16px',
              backgroundColor: copiado ? '#ecfdf5' : '#ffffff',
              color: copiado ? '#059669' : '#334155',
              border: copiado ? '1.5px solid #059669' : '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{copiado ? '✅' : '📋'}</span>
            <span>{copiado ? 'Mensagem Copiada!' : 'Copiar Mensagem'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMensagem(gerarTextoPadrao(saudacao))}
          title="Restaura o texto original da mensagem"
          style={{
            background: 'none',
            border: 'none',
            fontSize: '0.78rem',
            color: '#64748b',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          🔄 Restaurar mensagem padrão
        </button>
      </div>
    </div>
  );
}
