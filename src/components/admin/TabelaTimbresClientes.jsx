'use client';

import React, { useState, useEffect } from 'react';

export default function TabelaTimbresClientes() {
  // Aba ativa: 'TIMBRES' (clientes já gravados) ou 'LINKS' (links gerados para envio)
  const [subAba, setSubAba] = useState('LINKS');

  // Dados de Timbres dos Clientes
  const [clientesVoz, setClientesVoz] = useState([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [busca, setBusca] = useState('');
  const [resetandoTelefone, setResetandoTelefone] = useState('');

  // Dados de Links/Convites de Gravação
  const [invites, setInvites] = useState([]);
  const [carregandoInvites, setCarregandoInvites] = useState(true);
  const [modalNovoLinkAberto, setModalNovoLinkAberto] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novasNotas, setNovasNotas] = useState('');
  const [criandoLink, setCriandoLink] = useState(false);
  const [linkRecemCriado, setLinkRecemCriado] = useState(null);

  // Estados de Edição/Vínculo de Contato de um Link
  const [editandoInvite, setEditandoInvite] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editTelefone, setEditTelefone] = useState('');
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  // Mensagens globais
  const [msgSucesso, setMsgSucesso] = useState('');
  const [msgErro, setMsgErro] = useState('');
  const [copiadoId, setCopiadoId] = useState('');

  const carregarClientes = async () => {
    setCarregandoClientes(true);
    try {
      const res = await fetch('/api/admin/voice/customers');
      const data = await res.json();
      if (data.ok && Array.isArray(data.voices)) {
        setClientesVoz(data.voices);
      } else {
        setClientesVoz([]);
      }
    } catch (err) {
      console.error('Erro ao carregar timbres dos clientes:', err);
    } finally {
      setCarregandoClientes(false);
    }
  };

  const carregarInvites = async () => {
    setCarregandoInvites(true);
    try {
      const res = await fetch('/api/admin/voice/invites');
      const data = await res.json();
      if (data.ok && Array.isArray(data.invites)) {
        setInvites(data.invites);
      } else {
        setInvites([]);
      }
    } catch (err) {
      console.error('Erro ao carregar links de voz:', err);
    } finally {
      setCarregandoInvites(false);
    }
  };

  useEffect(() => {
    carregarClientes();
    carregarInvites();
  }, []);

  const handleCopiarTexto = (texto, id = '') => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    setCopiadoId(id || texto);
    setTimeout(() => {
      setCopiadoId('');
    }, 2500);
  };

  // Criação de um novo link para envio
  const handleCriarLink = async (e) => {
    e.preventDefault();
    if (!novoNome.trim()) {
      setMsgErro('Por favor, informe o nome da pessoa para gerar o link.');
      return;
    }

    setCriandoLink(true);
    setMsgErro('');
    setMsgSucesso('');

    try {
      const res = await fetch('/api/admin/voice/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          customerName: novoNome.trim(),
          phone: novoTelefone.trim(),
          notes: novasNotas.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao gerar link de voz.');
      }

      setLinkRecemCriado(data.invite);
      setNovoNome('');
      setNovoTelefone('');
      setNovasNotas('');
      setMsgSucesso(`Link gerado com sucesso para ${data.invite.customerName}!`);
      await carregarInvites();
    } catch (err) {
      setMsgErro(err.message || 'Falha de conexão ao gerar link.');
    } finally {
      setCriandoLink(false);
    }
  };

  // Alternar ativação manual do link (desabilitar / habilitar)
  const handleToggleActive = async (invite) => {
    const novoStatus = !invite.active;
    const acaoTexto = novoStatus ? 'reativar' : 'desativar manualmente';
    const conf = window.confirm(
      `Deseja realmente ${acaoTexto} o link de ${invite.customerName}?${
        !novoStatus ? '\nA pessoa não conseguirá mais gravar enquanto o link estiver desativado.' : ''
      }`
    );
    if (!conf) return;

    setMsgErro('');
    setMsgSucesso('');

    try {
      const res = await fetch('/api/admin/voice/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle',
          token: invite.token,
          active: novoStatus
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao alterar estado do link.');
      }

      setMsgSucesso(`Link de ${invite.customerName} foi ${novoStatus ? 'reativado' : 'desativado'} com sucesso!`);
      await carregarInvites();
    } catch (err) {
      setMsgErro(err.message || 'Erro ao alterar estado do link.');
    }
  };

  // Excluir link
  const handleExcluirLink = async (invite) => {
    const conf = window.confirm(`Deseja realmente remover o link de ${invite.customerName}?`);
    if (!conf) return;

    try {
      const res = await fetch('/api/admin/voice/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          token: invite.token
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao excluir link.');
      }

      setMsgSucesso('Link removido com sucesso.');
      await carregarInvites();
    } catch (err) {
      setMsgErro(err.message || 'Erro ao remover link.');
    }
  };

  // Salvar novo vínculo de contato
  const handleSalvarVinculo = async (e) => {
    e.preventDefault();
    if (!editandoInvite) return;

    setSalvandoVinculo(true);
    setMsgErro('');
    setMsgSucesso('');

    try {
      const res = await fetch('/api/admin/voice/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_contact',
          token: editandoInvite.token,
          customerName: editNome.trim() || editandoInvite.customerName,
          phone: editTelefone.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao vincular contato.');
      }

      setMsgSucesso(`Voz vinculada com sucesso a ${editNome || editandoInvite.customerName}!`);
      setEditandoInvite(null);
      await carregarInvites();
      await carregarClientes();
    } catch (err) {
      setMsgErro(err.message || 'Falha ao vincular contato.');
    } finally {
      setSalvandoVinculo(false);
    }
  };

  // Resetar timbre de cliente
  const handleResetarTimbre = async (cliente) => {
    const nome = cliente.customerName || cliente.customer_name || 'este cliente';
    const conf = window.confirm(
      `Deseja realmente redefinir o timbre de voz de ${nome} (${cliente.phone})?\n\nO cliente poderá gravar uma nova amostra.`
    );
    if (!conf) return;

    setResetandoTelefone(cliente.phone);
    setMsgErro('');
    setMsgSucesso('');
    try {
      const res = await fetch('/api/admin/voice/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', phone: cliente.phone })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMsgSucesso(`Timbre de ${nome} foi redefinido com sucesso!`);
        await carregarClientes();
      } else {
        setMsgErro(data.error || 'Erro ao redefinir timbre.');
      }
    } catch (err) {
      setMsgErro(err.message || 'Erro de conexão ao redefinir timbre.');
    } finally {
      setResetandoTelefone('');
    }
  };

  const getUrlCompleta = (token) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/voz/gravar/${token}`;
    }
    return `https://nsmusic.nsnexus.com.br/voz/gravar/${token}`;
  };

  const getTextoWhatsapp = (invite) => {
    const url = getUrlCompleta(invite.token);
    const nome = invite.customerName || 'olá';
    return encodeURIComponent(
      `Olá, ${nome}! Segue o seu link exclusivo para gravar uma amostra de 15 segundos da sua voz para criarmos suas músicas personalizadas com Inteligência Artificial:\n\n👉 ${url}\n\nÉ rápido e você pode gravar direto pelo celular em um ambiente silencioso.`
    );
  };

  // Filtragem dos links
  const invitesFiltrados = invites.filter((inv) => {
    if (!busca.trim()) return true;
    const termo = busca.toLowerCase().trim();
    const nome = (inv.customerName || '').toLowerCase();
    const fone = (inv.phone || '').toLowerCase();
    const vId = (inv.voiceId || '').toLowerCase();
    return nome.includes(termo) || fone.includes(termo) || vId.includes(termo);
  });

  // Filtragem dos timbres
  const clientesFiltrados = clientesVoz.filter((c) => {
    if (!busca.trim()) return true;
    const termo = busca.toLowerCase().trim();
    const nome = (c.customerName || c.customer_name || '').toLowerCase();
    const fone = (c.phone || '').toLowerCase();
    const vId = (c.voiceId || c.voice_id || '').toLowerCase();
    return nome.includes(termo) || fone.includes(termo) || vId.includes(termo);
  });

  return (
    <div style={{ maxWidth: '1060px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              🎤 Gestão de Vozes & Links de Gravação
            </h2>
          </div>
          <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Gere links temporários para qualquer pessoa gravar sua voz, obtenha o ID do timbre e vincule aos seus contatos.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              carregarInvites();
              carregarClientes();
            }}
            disabled={carregandoInvites || carregandoClientes}
            style={{
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              color: '#334155',
              padding: '9px 14px',
              borderRadius: '9px',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔄 Atualizar
          </button>

          <button
            type="button"
            onClick={() => {
              setModalNovoLinkAberto(true);
              setLinkRecemCriado(null);
            }}
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              color: '#ffffff',
              padding: '9px 16px',
              borderRadius: '9px',
              fontSize: '0.84rem',
              fontWeight: '800',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 10px rgba(124, 58, 237, 0.25)'
            }}
          >
            + 🔗 Gerar Link para Contato
          </button>
        </div>
      </div>

      {/* Alertas */}
      {msgSucesso && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          fontSize: '0.86rem',
          fontWeight: '600',
          marginBottom: '16px'
        }}>
          ✅ {msgSucesso}
        </div>
      )}

      {msgErro && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: '0.86rem',
          fontWeight: '600',
          marginBottom: '16px'
        }}>
          ⚠️ {msgErro}
        </div>
      )}

      {/* Sub-abas de Navegação */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '18px',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '10px'
      }}>
        <button
          type="button"
          onClick={() => setSubAba('LINKS')}
          style={{
            background: subAba === 'LINKS' ? '#7c3aed' : 'transparent',
            color: subAba === 'LINKS' ? '#ffffff' : '#475569',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.86rem',
            fontWeight: '800',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🔗 Links de Voz ({invites.length})
        </button>

        <button
          type="button"
          onClick={() => setSubAba('TIMBRES')}
          style={{
            background: subAba === 'TIMBRES' ? '#7c3aed' : 'transparent',
            color: subAba === 'TIMBRES' ? '#ffffff' : '#475569',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.86rem',
            fontWeight: '800',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          📋 Timbres de Clientes ({clientesVoz.length})
        </button>
      </div>

      {/* Barra de Filtro / Busca */}
      <div style={{ marginBottom: '18px' }}>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Filtrar por nome do contato, telefone (ex: 1199999...) ou Voice ID..."
          style={{
            width: '100%',
            padding: '11px 16px',
            borderRadius: '10px',
            border: '1.5px solid #cbd5e1',
            background: '#ffffff',
            color: '#0f172a',
            fontSize: '0.88rem',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* MODAL / CARD DE NOVO LINK */}
      {modalNovoLinkAberto && (
        <div style={{
          backgroundColor: '#ffffff',
          border: '2px solid #7c3aed',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 10px 25px -5px rgba(124, 58, 237, 0.15)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              🔗 Gerar Novo Link para Contato Clonar a Voz
            </h3>
            <button
              type="button"
              onClick={() => {
                setModalNovoLinkAberto(false);
                setLinkRecemCriado(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              ✕
            </button>
          </div>

          {!linkRecemCriado ? (
            <form onSubmit={handleCriarLink}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Nome da Pessoa / Contato *
                  </label>
                  <input
                    type="text"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    WhatsApp com DDD (opcional para vincular direto)
                  </label>
                  <input
                    type="text"
                    value={novoTelefone}
                    onChange={(e) => setNovoTelefone(e.target.value)}
                    placeholder="Ex: 11987654321"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  Anotações / Observações (opcional)
                </label>
                <input
                  type="text"
                  value={novasNotas}
                  onChange={(e) => setNovasNotas(e.target.value)}
                  placeholder="Ex: Cliente VIP, pediu voz no estilo sertanejo"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalNovoLinkAberto(false)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={criandoLink}
                  style={{
                    background: '#7c3aed',
                    border: 'none',
                    color: '#ffffff',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    cursor: criandoLink ? 'default' : 'pointer'
                  }}
                >
                  {criandoLink ? '⏳ Gerando...' : '✨ Gerar Link de Gravação'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '12px',
              padding: '18px'
            }}>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#065f46', marginBottom: '6px' }}>
                🎉 Link pronto para envio para {linkRecemCriado.customerName}!
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 12px 0' }}>
                Você pode desativar este link manualmente a qualquer momento quando a pessoa terminar.
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                padding: '10px 12px',
                borderRadius: '8px',
                marginBottom: '14px'
              }}>
                <span style={{ fontSize: '0.84rem', color: '#0f172a', fontWeight: '600', wordBreak: 'break-all', flex: 1 }}>
                  {getUrlCompleta(linkRecemCriado.token)}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopiarTexto(getUrlCompleta(linkRecemCriado.token), 'recem_criado')}
                  style={{
                    background: copiadoId === 'recem_criado' ? '#10b981' : '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {copiadoId === 'recem_criado' ? '✓ Copiado!' : '📋 Copiar Link'}
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {linkRecemCriado.phone && (
                  <a
                    href={`https://wa.me/${linkRecemCriado.phone}?text=${getTextoWhatsapp(linkRecemCriado)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: '#10b981',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '9px 16px',
                      borderRadius: '8px',
                      fontSize: '0.84rem',
                      fontWeight: '800',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    💬 Enviar pelo WhatsApp (+{linkRecemCriado.phone})
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setLinkRecemCriado(null);
                    setModalNovoLinkAberto(false);
                  }}
                  style={{
                    background: '#e2e8f0',
                    color: '#334155',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    fontSize: '0.84rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE VÍNCULO DE CONTATO */}
      {editandoInvite && (
        <div style={{
          backgroundColor: '#ffffff',
          border: '2px solid #0284c7',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.15)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              👤 Vincular Timbre a um Contato
            </h3>
            <button
              type="button"
              onClick={() => setEditandoInvite(null)}
              style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 16px 0' }}>
            Voice ID: <code>{editandoInvite.voiceId || 'Pendente'}</code>
          </p>

          <form onSubmit={handleSalvarVinculo}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  Nome do Contato
                </label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  placeholder="Ex: Carlos Silva"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  WhatsApp com DDD
                </label>
                <input
                  type="text"
                  value={editTelefone}
                  onChange={(e) => setEditTelefone(e.target.value)}
                  placeholder="Ex: 11987654321"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditandoInvite(null)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={salvandoVinculo}
                style={{
                  background: '#0284c7',
                  border: 'none',
                  color: '#ffffff',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '800',
                  cursor: salvandoVinculo ? 'default' : 'pointer'
                }}
              >
                {salvandoVinculo ? 'Salvando...' : 'Salvar Vínculo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ABA 1: LISTA DE LINKS DE VOZ */}
      {subAba === 'LINKS' && (
        <div>
          {carregandoInvites ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              color: '#64748b'
            }}>
              ⏳ Carregando links de gravação...
            </div>
          ) : invitesFiltrados.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              background: '#ffffff',
              borderRadius: '14px',
              border: '2px dashed #cbd5e1',
              color: '#64748b'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🔗</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', margin: '0 0 6px 0' }}>
                {busca ? 'Nenhum link encontrado para esta busca' : 'Nenhum link de gravação gerado ainda'}
              </h3>
              <p style={{ fontSize: '0.85rem', margin: '0 0 16px 0', maxWidth: '480px', marginInline: 'auto' }}>
                Clique no botão acima <strong>&quot;+ Gerar Link para Contato&quot;</strong> para criar um link exclusivo e enviar para a pessoa gravar a voz dela.
              </p>
              <button
                type="button"
                onClick={() => setModalNovoLinkAberto(true)}
                style={{
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '0.84rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                + Gerar Primeiro Link
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {invitesFiltrados.map((inv) => {
                const url = getUrlCompleta(inv.token);
                const isConcluido = inv.status === 'concluido' || Boolean(inv.voiceId);
                const isAtivo = inv.active !== false;

                return (
                  <div
                    key={inv.token}
                    style={{
                      background: '#ffffff',
                      border: !isAtivo
                        ? '1.5px solid #cbd5e1'
                        : isConcluido
                        ? '1.5px solid #a7f3d0'
                        : '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '18px 20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      opacity: !isAtivo ? 0.75 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    {/* Linha Superior: Nome, Badges e Botões de Controle */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '10px',
                      marginBottom: '12px'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                            {inv.customerName || 'Convidado'}
                          </span>

                          {/* Status Badge */}
                          {!isAtivo ? (
                            <span style={{
                              fontSize: '0.74rem',
                              background: '#fee2e2',
                              color: '#991b1b',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: '700'
                            }}>
                              🔴 Desativado Manualmente
                            </span>
                          ) : isConcluido ? (
                            <span style={{
                              fontSize: '0.74rem',
                              background: '#ecfdf5',
                              color: '#065f46',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: '700'
                            }}>
                              🟢 Concluído (Voz Clonada)
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.74rem',
                              background: '#fefce8',
                              color: '#854d0e',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: '700'
                            }}>
                              🟡 Pendente (Aguardando Gravação)
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.82rem', marginTop: '4px' }}>
                          {inv.phone ? (
                            <a
                              href={`https://wa.me/${inv.phone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#059669', textDecoration: 'none', fontWeight: '700' }}
                            >
                              💬 +{inv.phone}
                            </a>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Sem telefone vinculado</span>
                          )}

                          <span style={{ color: '#cbd5e1' }}>•</span>
                          <span style={{ color: '#94a3b8' }}>
                            Gerado em {new Date(inv.createdAt || inv.updatedAt).toLocaleDateString('pt-BR')}
                          </span>

                          {inv.notes && (
                            <>
                              <span style={{ color: '#cbd5e1' }}>•</span>
                              <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                                &quot;{inv.notes}&quot;
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Botão de Toggle Ativo/Inativo */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(inv)}
                          style={{
                            background: isAtivo ? '#fee2e2' : '#ecfdf5',
                            color: isAtivo ? '#991b1b' : '#065f46',
                            border: '1px solid',
                            borderColor: isAtivo ? '#fca5a5' : '#a7f3d0',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                          title={isAtivo ? 'Desativar este link manualmente' : 'Reativar este link'}
                        >
                          {isAtivo ? '🛑 Desabilitar Link' : '✅ Reativar Link'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExcluirLink(inv)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            padding: '4px 6px'
                          }}
                          title="Excluir Link"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Linha do Link e Ações */}
                    <div style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px', flex: 1 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569' }}>Link:</span>
                        <code style={{
                          fontSize: '0.8rem',
                          color: '#0284c7',
                          background: '#ffffff',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          wordBreak: 'break-all'
                        }}>
                          {url}
                        </code>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleCopiarTexto(url, inv.token)}
                          style={{
                            background: copiadoId === inv.token ? '#10b981' : '#ffffff',
                            color: copiadoId === inv.token ? '#ffffff' : '#334155',
                            border: '1px solid #cbd5e1',
                            padding: '6px 12px',
                            borderRadius: '7px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {copiadoId === inv.token ? '✓ Copiado!' : '📋 Copiar Link'}
                        </button>

                        {inv.phone && (
                          <a
                            href={`https://wa.me/${inv.phone}?text=${getTextoWhatsapp(inv)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: '#10b981',
                              color: '#ffffff',
                              textDecoration: 'none',
                              padding: '6px 12px',
                              borderRadius: '7px',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            💬 WhatsApp
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Detalhes do Voice ID e Áudio se Concluído */}
                    {isConcluido && (
                      <div style={{
                        marginTop: '10px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem' }}>
                          <span style={{ fontWeight: '800', color: '#166534' }}>ID do Timbre (Voice ID):</span>
                          <code style={{
                            background: '#ffffff',
                            border: '1px solid #86efac',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            color: '#15803d',
                            fontWeight: '700',
                            fontFamily: 'monospace'
                          }}>
                            {inv.voiceId}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopiarTexto(inv.voiceId, `vid_${inv.token}`)}
                            style={{
                              background: copiadoId === `vid_${inv.token}` ? '#10b981' : '#ffffff',
                              color: copiadoId === `vid_${inv.token}` ? '#ffffff' : '#166534',
                              border: '1px solid #86efac',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {copiadoId === `vid_${inv.token}` ? '✓ Copiado!' : 'Copiar ID'}
                          </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {inv.sampleAudioUrl && (
                            <audio
                              src={inv.sampleAudioUrl}
                              controls
                              style={{ height: '34px', maxWidth: '240px' }}
                            />
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setEditandoInvite(inv);
                              setEditNome(inv.customerName || '');
                              setEditTelefone(inv.phone || '');
                            }}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              padding: '6px 12px',
                              borderRadius: '7px',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            👤 Vincular a Contato
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA 2: LISTA DE TIMBRES DE CLIENTES */}
      {subAba === 'TIMBRES' && (
        <div>
          {carregandoClientes ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              color: '#64748b'
            }}>
              ⏳ Carregando timbres salvos no banco de dados...
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              background: '#ffffff',
              borderRadius: '14px',
              border: '2px dashed #cbd5e1',
              color: '#64748b'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🎤</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', margin: '0 0 6px 0' }}>
                {busca ? 'Nenhum timbre encontrado para esta busca' : 'Nenhum timbre de cliente salvo ainda'}
              </h3>
              <p style={{ fontSize: '0.85rem', margin: 0, maxWidth: '480px', marginInline: 'auto' }}>
                Quando seus contatos gravarem suas vozes pelos links gerados ou na página de entrega, eles aparecerão aqui vinculados com seus Voice IDs.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {clientesFiltrados.map((item, idx) => {
                const phone = item.phone || '';
                const nome = item.customerName || item.customer_name || 'Cliente';
                const voiceIdItem = item.voiceId || item.voice_id || '';
                const sampleUrl = item.sampleAudioUrl || item.sample_audio_url || '';
                const status = item.status || 'ativo';
                const isAtivo = status === 'ativo';
                const isResetando = resetandoTelefone === phone;

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      background: '#ffffff',
                      border: isAtivo ? '1.5px solid #e2e8f0' : '1.5px dashed #f59e0b',
                      borderRadius: '12px',
                      padding: '18px 20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    {/* Linha Superior */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginBottom: '3px' }}>
                          {nome}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.82rem' }}>
                          <a
                            href={`https://wa.me/${phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#059669',
                              textDecoration: 'none',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            💬 +{phone}
                          </a>
                          <span style={{ color: '#cbd5e1' }}>•</span>
                          <span style={{ color: '#64748b' }}>
                            {item.pedidosCount || 1} música(s) gerada(s)
                          </span>
                          {item.createdAt && (
                            <>
                              <span style={{ color: '#cbd5e1' }}>•</span>
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                                Cadastrado em {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div>
                        {isAtivo ? (
                          <span style={{
                            fontSize: '0.75rem',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            color: '#065f46',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontWeight: '700'
                          }}>
                            🟢 Timbre Ativo
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.75rem',
                            background: '#fefce8',
                            border: '1px solid #fef08a',
                            color: '#854d0e',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontWeight: '700'
                          }}>
                            🟡 Timbre Resetado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Linha do Voice ID e Player da Amostra */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      padding: '10px 14px',
                      borderRadius: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#475569' }}>
                        <span style={{ fontWeight: '700', color: '#334155' }}>Voice ID:</span>
                        <code style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          color: '#0284c7',
                          fontFamily: 'monospace',
                          fontWeight: '700'
                        }}>
                          {voiceIdItem || 'Sem ID'}
                        </code>
                        {voiceIdItem && (
                          <button
                            type="button"
                            onClick={() => handleCopiarTexto(voiceIdItem, `cust_${voiceIdItem}`)}
                            style={{
                              background: copiadoId === `cust_${voiceIdItem}` ? '#10b981' : '#ffffff',
                              color: copiadoId === `cust_${voiceIdItem}` ? '#ffffff' : '#334155',
                              border: '1px solid #cbd5e1',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {copiadoId === `cust_${voiceIdItem}` ? '✓ Copiado' : 'Copiar'}
                          </button>
                        )}
                      </div>

                      {sampleUrl && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <audio
                            src={sampleUrl}
                            controls
                            style={{ height: '32px', maxWidth: '240px' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '8px',
                      paddingTop: '4px'
                    }}>
                      <button
                        type="button"
                        onClick={() => handleResetarTimbre(item)}
                        disabled={isResetando}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          color: '#dc2626',
                          padding: '7px 14px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          cursor: isResetando ? 'default' : 'pointer'
                        }}
                      >
                        {isResetando ? '⏳ Resetando...' : '🔄 Redefinir Timbre'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
