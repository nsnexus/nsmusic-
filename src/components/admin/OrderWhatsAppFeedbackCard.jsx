'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { formatToWhatsAppNumber, resolveDeliveryUrl, buildAudioDownloadLink } from '@/lib/whatsappTemplates';

function getSaudacaoAtual() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function OrderWhatsAppFeedbackCard({ order }) {
  const [saudacao, setSaudacao] = useState(getSaudacaoAtual);
  // Se o pedido já estiver pago/aprovado, abre direto no modelo de pagamento aprovado; senão, modelo de feedback
  const [modeloSelecionado, setModeloSelecionado] = useState(() => {
    const isPago = order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO';
    return isPago ? 'pagamento' : 'feedback';
  });
  const [mensagem, setMensagem] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState('');

  const clienteNome = useMemo(() => {
    const raw = String(order?.customerName || '').trim();
    if (!raw || raw.toLowerCase() === 'cliente') return 'tudo bem?';
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

  const audio1Url = useMemo(() => {
    return order?.audioFiles?.[0] || order?.audioUrl || '';
  }, [order?.audioFiles, order?.audioUrl]);

  const audio2Url = useMemo(() => {
    return order?.audioFiles?.[1] || order?.audioUrl2 || '';
  }, [order?.audioFiles, order?.audioUrl2]);

  const downloadLinkV1 = useMemo(() => {
    if (!audio1Url) return '';
    return buildAudioDownloadLink(audio1Url, `NS-Music-${homenageadoNome}-Versao-1.mp3`);
  }, [audio1Url, homenageadoNome]);

  const downloadLinkV2 = useMemo(() => {
    if (!audio2Url) return '';
    return buildAudioDownloadLink(audio2Url, `NS-Music-${homenageadoNome}-Versao-2.mp3`);
  }, [audio2Url, homenageadoNome]);

  const hasVideoAccess = Boolean(order?.hasVideoAccess || order?.videoAddonPaid);

  // Gera o texto conforme o modelo escolhido
  const gerarTextoModelo = (tipo, saudacaoEscolhida) => {
    const saud = saudacaoEscolhida || saudacao;
    const saudacaoLinha = clienteNome === 'tudo bem?'
      ? `${saud}! Tudo bem por aí? 😊`
      : `${saud}, ${clienteNome}! Tudo bem? 😊`;

    if (tipo === 'pagamento') {
      const videoInfo = hasVideoAccess
        ? `\n\n🎬 *Vídeo Homenagem:* O vídeo também está liberado! É só enviar de 10 a 20 fotos na página do seu pedido que sincronizamos com a música.`
        : `\n\n🎬 *Deseja transformar em Vídeo?* Você também pode transformar essa música em um lindo vídeo emocionante com as fotos de ${homenageadoNome} por apenas R$ 6,90 diretamente na página do pedido.`;

      let blocoAudios = '';
      if (downloadLinkV1 && downloadLinkV2) {
        blocoAudios = `Aqui estão os links para download direto das 2 versões em alta qualidade:\n\n🎵 *Baixar Versão 1 (Download direto):*\n${downloadLinkV1}\n\n🎵 *Baixar Versão 2 (Download direto):*\n${downloadLinkV2}`;
      } else if (downloadLinkV1) {
        blocoAudios = `Aqui está o link para download direto da música em alta qualidade:\n\n🎵 *Baixar Música (Download direto):*\n${downloadLinkV1}`;
      } else {
        blocoAudios = `As músicas completas estão sendo sincronizadas na página do pedido.`;
      }

      return `${saudacaoLinha}

Seu pagamento foi confirmado com sucesso! 🎉 A música de *${homenageadoNome}* está 100% liberada para você ouvir e baixar.

${blocoAudios}

📱 *Acessar página completa do seu pedido:*
${deliveryLink || '(Link de entrega não disponível)'}${videoInfo}

Qualquer dúvida ou se precisar de alguma coisa, é só me chamar por aqui! Muito obrigado pela confiança! 💜`.trim();
    }

    if (tipo === 'musica_pronta') {
      return `${saudacaoLinha}

A música que preparamos para *${homenageadoNome}* acabou de ficar pronta com todo o carinho! 🎧

Preparamos 2 versões com arranjos diferentes para você ouvir e escolher a sua preferida.

Ouça a prévia agora pelo link:
${deliveryLink || '(Link de entrega não disponível)'}

Assim que você ouvir, me conta o que achou! 🎶`.trim();
    }

    // Padrão: Feedback e Ajuste
    return `${saudacaoLinha}

Passando aqui pra saber: o que você achou da música que fizemos pra ${homenageadoNome}? Ficou do jeitinho que você imaginava?

Se você quiser ajustar alguma coisa na letra ou nos detalhes, é só me falar por aqui que a gente ajeita com todo carinho! 🎵

${deliveryLink ? `(Caso queira ouvir novamente a prévia: ${deliveryLink})` : ''}`.trim();
  };

  // Inicializa ou atualiza a mensagem quando muda saudação, modelo ou dados
  useEffect(() => {
    setMensagem(gerarTextoModelo(modeloSelecionado, saudacao));
  }, [modeloSelecionado, saudacao, clienteNome, homenageadoNome, deliveryLink, downloadLinkV1, downloadLinkV2, hasVideoAccess]);

  const handleTrocarModelo = (novoModelo) => {
    setModeloSelecionado(novoModelo);
    setMensagem(gerarTextoModelo(novoModelo, saudacao));
  };

  const handleTrocarSaudacao = (novaSaudacao) => {
    setSaudacao(novaSaudacao);
    setMensagem(gerarTextoModelo(modeloSelecionado, novaSaudacao));
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

  const handleCopiarLinkAvulso = async (url, chave) => {
    if (!url) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopiadoLink(chave);
        setTimeout(() => setCopiadoLink(''), 2000);
      }
    } catch (e) {
      alert('Não foi possível copiar o link.');
    }
  };

  return (
    <div
      className="admin-card-responsive"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
        marginTop: '24px',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>💬</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
              Modelos de Mensagem para WhatsApp
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Escolha o modelo pronto para envio rápido com links diretos de download e da entrega.
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

      {/* Seletor de Modelo de Mensagem (Tabs) */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => handleTrocarModelo('pagamento')}
          style={{
            padding: '8px 14px',
            fontSize: '0.84rem',
            fontWeight: '800',
            borderRadius: '10px',
            cursor: 'pointer',
            border: modeloSelecionado === 'pagamento' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
            backgroundColor: modeloSelecionado === 'pagamento' ? '#f5f3ff' : '#f8fafc',
            color: modeloSelecionado === 'pagamento' ? '#6d28d9' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🎁</span>
          <span>Pagamento Aprovado & Downloads</span>
        </button>

        <button
          type="button"
          onClick={() => handleTrocarModelo('feedback')}
          style={{
            padding: '8px 14px',
            fontSize: '0.84rem',
            fontWeight: '800',
            borderRadius: '10px',
            cursor: 'pointer',
            border: modeloSelecionado === 'feedback' ? '2px solid #2563eb' : '1px solid #cbd5e1',
            backgroundColor: modeloSelecionado === 'feedback' ? '#eff6ff' : '#f8fafc',
            color: modeloSelecionado === 'feedback' ? '#1d4ed8' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>💬</span>
          <span>Feedback & Ajuste da Letra</span>
        </button>

        <button
          type="button"
          onClick={() => handleTrocarModelo('musica_pronta')}
          style={{
            padding: '8px 14px',
            fontSize: '0.84rem',
            fontWeight: '800',
            borderRadius: '10px',
            cursor: 'pointer',
            border: modeloSelecionado === 'musica_pronta' ? '2px solid #d97706' : '1px solid #cbd5e1',
            backgroundColor: modeloSelecionado === 'musica_pronta' ? '#fffbeb' : '#f8fafc',
            color: modeloSelecionado === 'musica_pronta' ? '#b45309' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🎧</span>
          <span>Música Pronta (Ouvir Prévia)</span>
        </button>
      </div>

      {/* Barra de atalhos rápidos para copiar links avulsos */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '12px',
        padding: '10px 14px',
        backgroundColor: '#f8fafc',
        borderRadius: '10px',
        border: '1px dashed #cbd5e1',
      }}>
        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
          Atalhos de Links:
        </span>

        {downloadLinkV1 && (
          <button
            type="button"
            onClick={() => handleCopiarLinkAvulso(downloadLinkV1, 'v1')}
            style={{
              padding: '4px 10px',
              fontSize: '0.76rem',
              fontWeight: '700',
              borderRadius: '6px',
              cursor: 'pointer',
              border: '1px solid #c7d2fe',
              backgroundColor: copiadoLink === 'v1' ? '#ecfdf5' : '#eef2ff',
              color: copiadoLink === 'v1' ? '#065f46' : '#3730a3',
            }}
          >
            {copiadoLink === 'v1' ? '✅ Link V1 Copiado!' : '🎵 Copiar Link Download Versão 1'}
          </button>
        )}

        {downloadLinkV2 && (
          <button
            type="button"
            onClick={() => handleCopiarLinkAvulso(downloadLinkV2, 'v2')}
            style={{
              padding: '4px 10px',
              fontSize: '0.76rem',
              fontWeight: '700',
              borderRadius: '6px',
              cursor: 'pointer',
              border: '1px solid #c7d2fe',
              backgroundColor: copiadoLink === 'v2' ? '#ecfdf5' : '#eef2ff',
              color: copiadoLink === 'v2' ? '#065f46' : '#3730a3',
            }}
          >
            {copiadoLink === 'v2' ? '✅ Link V2 Copiado!' : '🎵 Copiar Link Download Versão 2'}
          </button>
        )}

        {deliveryLink && (
          <button
            type="button"
            onClick={() => handleCopiarLinkAvulso(deliveryLink, 'pedido')}
            style={{
              padding: '4px 10px',
              fontSize: '0.76rem',
              fontWeight: '700',
              borderRadius: '6px',
              cursor: 'pointer',
              border: '1px solid #cbd5e1',
              backgroundColor: copiadoLink === 'pedido' ? '#ecfdf5' : '#ffffff',
              color: copiadoLink === 'pedido' ? '#065f46' : '#334155',
            }}
          >
            {copiadoLink === 'pedido' ? '✅ Link Pedido Copiado!' : '📱 Copiar Link do Pedido'}
          </button>
        )}
      </div>

      {/* Caixa de Texto Editável da Mensagem */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
            Texto da Mensagem (Você pode editar livremente antes de enviar):
          </label>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {mensagem.length} caracteres
          </span>
        </div>
        <textarea
          rows={9}
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
                padding: '10px 20px',
                backgroundColor: '#25D366',
                color: '#ffffff',
                borderRadius: '8px',
                fontSize: '0.88rem',
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
              padding: '10px 18px',
              backgroundColor: copiado ? '#ecfdf5' : '#ffffff',
              color: copiado ? '#059669' : '#334155',
              border: copiado ? '1.5px solid #059669' : '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{copiado ? '✅' : '📋'}</span>
            <span>{copiado ? 'Mensagem Copiada!' : 'Copiar Mensagem Completa'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMensagem(gerarTextoModelo(modeloSelecionado, saudacao))}
          title="Restaura o texto original do modelo selecionado"
          style={{
            background: 'none',
            border: 'none',
            fontSize: '0.78rem',
            color: '#64748b',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          🔄 Restaurar texto original do modelo
        </button>
      </div>
    </div>
  );
}
