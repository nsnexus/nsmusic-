'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

export default function AbaContas({ authUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Estado para concessão de créditos
  const [selectedUserForCredit, setSelectedUserForCredit] = useState(null);
  const [creditAmount, setCreditAmount] = useState(1);
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState('');

  // Estado para link de redefinição de senha
  const [generatingLink, setGeneratingLink] = useState('');
  const [recoveryLinkData, setRecoveryLinkData] = useState(null);

  // Músicas expandidas por conta
  const [expandedOrders, setExpandedOrders] = useState(() => new Set());

  // Estado para vinculação de pedidos a contas
  const [selectedUserForLink, setSelectedUserForLink] = useState(null);
  const [orderIdentifierInput, setOrderIdentifierInput] = useState('');
  const [linkingOrder, setLinkingOrder] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const [unlinkingOrderId, setUnlinkingOrderId] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const idToken = await authUser?.getIdToken();
      const res = await fetch('/api/admin/accounts', {
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao carregar lista de contas');
      }
      setUsers(data.users || []);
    } catch (err) {
      console.error('Erro ao buscar contas:', err);
      setError(err.message || 'Erro ao carregar contas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authUser) {
      fetchUsers();
    }
  }, [authUser]);

  const handleGrantCredits = async (e) => {
    e.preventDefault();
    if (!selectedUserForCredit || creditAmount <= 0) return;
    setGranting(true);
    setGrantMsg('');
    try {
      const idToken = await authUser?.getIdToken();
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          action: 'grant_credits',
          userId: selectedUserForCredit.id,
          amount: creditAmount
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao conceder créditos');
      }
      // Atualiza o saldo localmente
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUserForCredit.id ? { ...u, balance: data.balance } : u))
      );
      setGrantMsg(`✅ ${data.message || 'Créditos concedidos com sucesso!'}`);
      setTimeout(() => {
        setSelectedUserForCredit(null);
        setGrantMsg('');
      }, 2000);
    } catch (err) {
      setGrantMsg(`❌ ${err.message}`);
    } finally {
      setGranting(false);
    }
  };

  const handleGenerateRecoveryLink = async (user) => {
    if (!user?.email) return;
    setGeneratingLink(user.id);
    try {
      const idToken = await authUser?.getIdToken();
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          action: 'recovery_link',
          email: user.email
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar link');
      }
      if (data.actionLink) {
        if (typeof window !== 'undefined') {
          navigator.clipboard.writeText(data.actionLink);
        }
        setRecoveryLinkData({
          userEmail: user.email,
          userPhone: user.phone,
          link: data.actionLink
        });
      }
    } catch (err) {
      alert(`Erro ao gerar link de redefinição: ${err.message}`);
    } finally {
      setGeneratingLink('');
    }
  };

  const toggleExpand = (userId) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleLinkOrder = async (e, directOrderId = null, targetUserId = null) => {
    if (e?.preventDefault) e.preventDefault();
    const uId = targetUserId || selectedUserForLink?.id;
    const ordId = directOrderId || orderIdentifierInput.trim();
    if (!uId || !ordId) return;

    setLinkingOrder(true);
    setLinkMsg('');
    try {
      const idToken = await authUser?.getIdToken();
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          action: 'link_order',
          userId: uId,
          orderIdentifier: ordId
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao vincular pedido');
      }
      setLinkMsg(`✅ ${data.message || 'Pedido vinculado com sucesso!'}`);
      await fetchUsers();
      setTimeout(() => {
        setSelectedUserForLink(null);
        setOrderIdentifierInput('');
        setLinkMsg('');
      }, 1500);
    } catch (err) {
      setLinkMsg(`❌ ${err.message}`);
    } finally {
      setLinkingOrder(false);
    }
  };

  const handleUnlinkOrder = async (orderId) => {
    if (!orderId) return;
    if (!window.confirm('Deseja realmente desvincular este pedido desta conta?')) return;
    setUnlinkingOrderId(orderId);
    try {
      const idToken = await authUser?.getIdToken();
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          action: 'unlink_order',
          orderIdentifier: orderId
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao desvincular pedido');
      }
      await fetchUsers();
    } catch (err) {
      alert(`Erro ao desvincular pedido: ${err.message}`);
    } finally {
      setUnlinkingOrderId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const email = (u.email || '').toLowerCase();
      const name = (u.name || '').toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      return email.includes(q) || name.includes(q) || phone.includes(q);
    });
  }, [users, search]);

  return (
    <div style={{ marginTop: '20px' }}>
      {/* Barra de controle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          background: '#ffffff',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1rem',
                pointerEvents: 'none'
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Buscar por e-mail, nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.88rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: '600' }}>
            Total: <strong style={{ color: '#0f172a' }}>{filteredUsers.length}</strong> conta(s)
          </span>
        </div>

        <button
          type="button"
          onClick={fetchUsers}
          disabled={loading}
          style={{
            padding: '9px 16px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#334155',
            fontWeight: '600',
            fontSize: '0.84rem',
            cursor: loading ? 'default' : 'pointer'
          }}
        >
          {loading ? 'Carregando...' : '🔄 Atualizar Lista'}
        </button>
      </div>

      {/* Alerta de link de recuperação gerado */}
      {recoveryLinkData && (
        <div
          style={{
            marginBottom: '20px',
            padding: '16px',
            borderRadius: '10px',
            background: '#ecfdf5',
            border: '1.5px solid #10b981',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '700', color: '#065f46', fontSize: '0.92rem' }}>
              ✅ Link de redefinição de senha gerado e copiado para a área de transferência!
            </span>
            <button
              type="button"
              onClick={() => setRecoveryLinkData(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#065f46' }}
            >
              ✕
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#047857' }}>
            Conta: <strong>{recoveryLinkData.userEmail}</strong>
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              readOnly
              value={recoveryLinkData.link}
              style={{
                flex: 1,
                minWidth: '280px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #a7f3d0',
                background: '#ffffff',
                fontSize: '0.82rem',
                color: '#0f172a'
              }}
            />
            {recoveryLinkData.userPhone && (
              <a
                href={`https://wa.me/${recoveryLinkData.userPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Olá! Aqui está o link para você redefinir a sua senha no NS Music:\n\n${recoveryLinkData.link}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: '#25D366',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                📲 Enviar no WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Modal / Dialog de concessão de créditos */}
      {selectedUserForCredit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                🪙 Conceder Créditos
              </h3>
              <button
                type="button"
                onClick={() => setSelectedUserForCredit(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '0.86rem', color: '#475569' }}>
              Conta: <strong style={{ color: '#0f172a' }}>{selectedUserForCredit.email}</strong>
              <br />
              Saldo atual: <strong>{selectedUserForCredit.balance} créditos</strong>
            </p>

            <form onSubmit={handleGrantCredits}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Quantidade de créditos a adicionar:
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  {[1, 2, 5, 10].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCreditAmount(amt)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: creditAmount === amt ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                        background: creditAmount === amt ? '#f5f3ff' : '#ffffff',
                        color: creditAmount === amt ? '#7c3aed' : '#334155',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      +{amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.95rem',
                    fontWeight: '700',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {grantMsg && (
                <div style={{ marginBottom: '12px', fontSize: '0.84rem', fontWeight: '600', color: grantMsg.startsWith('✅') ? '#059669' : '#dc2626' }}>
                  {grantMsg}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedUserForCredit(null)}
                  disabled={granting}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={granting}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                    color: '#ffffff',
                    fontWeight: '700',
                    cursor: granting ? 'default' : 'pointer'
                  }}
                >
                  {granting ? 'Adicionando...' : 'Confirmar Adição'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Dialog de vincular pedido */}
      {selectedUserForLink && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                🔗 Vincular Pedido a esta Conta
              </h3>
              <button
                type="button"
                onClick={() => setSelectedUserForLink(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '0.86rem', color: '#475569' }}>
              Conta de destino: <strong style={{ color: '#0f172a' }}>{selectedUserForLink.email}</strong>
              {selectedUserForLink.name && ` (${selectedUserForLink.name})`}
            </p>

            <form onSubmit={handleLinkOrder}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Número ou ID do Pedido:
                </label>
                <input
                  type="text"
                  placeholder="Ex: NS-A1B2C3D4 ou ID do pedido"
                  value={orderIdentifierInput}
                  onChange={(e) => setOrderIdentifierInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.92rem',
                    fontWeight: '600',
                    boxSizing: 'border-box'
                  }}
                  autoFocus
                />
                <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b', marginTop: '4px' }}>
                  Você pode colar o número do pedido (ex: NS-...) ou o ID do banco.
                </span>
              </div>

              {linkMsg && (
                <div style={{ marginBottom: '12px', fontSize: '0.84rem', fontWeight: '600', color: linkMsg.startsWith('✅') ? '#059669' : '#dc2626' }}>
                  {linkMsg}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedUserForLink(null)}
                  disabled={linkingOrder}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={linkingOrder || !orderIdentifierInput.trim()}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontWeight: '700',
                    cursor: linkingOrder || !orderIdentifierInput.trim() ? 'default' : 'pointer',
                    opacity: !orderIdentifierInput.trim() ? 0.6 : 1
                  }}
                >
                  {linkingOrder ? 'Vinculando...' : 'Confirmar Vínculo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de contas */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '0.95rem' }}>
          ⏳ Carregando contas cadastradas...
        </div>
      ) : error ? (
        <div style={{ padding: '20px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
          ❌ {error}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          Nenhuma conta encontrada com o termo pesquisado.
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Cliente / Conta</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Criado em</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Saldo de Créditos</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700' }}>Músicas Criadas</th>
                  <th style={{ padding: '12px 16px', fontWeight: '700', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isExpanded = expandedOrders.has(u.id);
                  const orderCount = u.orders?.length || 0;

                  return (
                    <React.Fragment key={u.id}>
                      <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{u.email}</div>
                          {u.name && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{u.name}</div>}
                          {u.phone && (
                            <div style={{ fontSize: '0.78rem', color: '#2563eb', marginTop: '2px' }}>
                              📱 {u.phone}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', color: '#64748b' }}>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {u.createdAt ? new Date(u.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              fontSize: '0.82rem',
                              fontWeight: '700',
                              background: u.balance > 0 ? '#fef3c7' : '#f1f5f9',
                              color: u.balance > 0 ? '#b45309' : '#64748b',
                              border: u.balance > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0'
                            }}
                          >
                            🪙 {u.balance} {u.balance === 1 ? 'crédito' : 'créditos'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          {orderCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(u.id)}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                color: '#0f172a',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              🎵 {orderCount} música(s) {isExpanded ? '▲' : '▼'}
                            </button>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Nenhuma música</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForCredit(u);
                                setCreditAmount(1);
                                setGrantMsg('');
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                                color: '#ffffff',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                              title="Adicionar créditos na carteira deste cliente"
                            >
                              🪙 + Créditos
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForLink(u);
                                setOrderIdentifierInput('');
                                setLinkMsg('');
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #c7d2fe',
                                background: '#eef2ff',
                                color: '#4338ca',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                              title="Vincular um pedido (por número ou ID) a esta conta"
                            >
                              🔗 Vincular Pedido
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGenerateRecoveryLink(u)}
                              disabled={generatingLink === u.id}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#334155',
                                fontSize: '0.78rem',
                                fontWeight: '600',
                                cursor: generatingLink === u.id ? 'default' : 'pointer'
                              }}
                              title="Gerar link direto para o cliente redefinir a senha"
                            >
                              {generatingLink === u.id ? 'Gerando...' : '🔑 Link Senha'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Dropdown de músicas associadas à conta */}
                      {isExpanded && (
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan={5} style={{ padding: '12px 24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                                Músicas associadas a esta conta ({u.email}):
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUserForLink(u);
                                  setOrderIdentifierInput('');
                                  setLinkMsg('');
                                }}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: '#eef2ff',
                                  border: '1px solid #c7d2fe',
                                  color: '#4338ca',
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                              >
                                + Vincular Novo Pedido
                              </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                              {u.orders.map((ord) => (
                                <div
                                  key={ord.id}
                                  style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '8px'
                                  }}
                                >
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      Para: {ord.honoreeName || 'Homenageado'}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                      {ord.musicStyle || 'Estilo'} • {ord.paymentStatus}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                                      Pedido {ord.orderNumber || ord.id}
                                    </div>
                                    <div style={{ marginTop: '4px' }}>
                                      {ord.isExplicitlyLinked ? (
                                        <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: '700' }}>
                                          ✓ Vinculado no banco
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: '600' }} title="Encontrado pelo mesmo e-mail do cliente, mas não possui o user_id gravado formalmente">
                                          ⚠️ Match por e-mail
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                    <Link
                                      href={`/admin/pedidos/${ord.id}`}
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        background: '#f1f5f9',
                                        color: '#2563eb',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        textDecoration: 'none',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      Ver Pedido ➔
                                    </Link>
                                    {ord.isExplicitlyLinked ? (
                                      <button
                                        type="button"
                                        onClick={() => handleUnlinkOrder(ord.id)}
                                        disabled={unlinkingOrderId === ord.id}
                                        style={{
                                          padding: '3px 8px',
                                          borderRadius: '4px',
                                          background: '#fff1f2',
                                          border: '1px solid #fecdd3',
                                          color: '#e11d48',
                                          fontSize: '0.7rem',
                                          fontWeight: '600',
                                          cursor: unlinkingOrderId === ord.id ? 'default' : 'pointer'
                                        }}
                                        title="Desvincular este pedido desta conta"
                                      >
                                        {unlinkingOrderId === ord.id ? '...' : 'Desvincular'}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleLinkOrder(null, ord.id, u.id)}
                                        disabled={linkingOrder}
                                        style={{
                                          padding: '3px 8px',
                                          borderRadius: '4px',
                                          background: '#ecfdf5',
                                          border: '1px solid #a7f3d0',
                                          color: '#059669',
                                          fontSize: '0.7rem',
                                          fontWeight: '700',
                                          cursor: linkingOrder ? 'default' : 'pointer'
                                        }}
                                        title="Gravar vínculo formal deste pedido nesta conta"
                                      >
                                        Vincular
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
