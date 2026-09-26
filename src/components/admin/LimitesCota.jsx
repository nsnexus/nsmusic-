'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';

export default function LimitesCota() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState('');
  const [msg, setMsg] = useState('');
  const [abaInterna, setAbaInterna] = useState('GERADORES'); // 'GERADORES' | 'BLOQUEADOS'

  // Campos do formulário manual de bloqueio
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoMotivo, setNovoMotivo] = useState('Gerou mais de 9 músicas sem pagar');

  const chamar = useCallback(async (metodo, corpo) => {
    const user = getAuth().currentUser;
    const token = user ? await user.getIdToken() : '';
    const res = await fetch('/api/admin/cotas', {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Falha na requisição (HTTP ${res.status}).`);
    return data;
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setDados(await chamar('GET'));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [chamar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Ação 1: Resetar cota automática
  const resetarCota = async (telefone) => {
    setProcessando(`reset_${telefone}`);
    setMsg('');
    try {
      await chamar('POST', { action: 'reset', telefone });
      setMsg('✅ Cota liberada com sucesso. O cliente já pode gerar novamente.');
      await carregar();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setProcessando('');
    }
  };

  // Ação 2: Bloquear contato manualmente
  const bloquearContato = async (telefone, nome = '', motivo = '') => {
    if (!telefone) return;
    setProcessando(`block_${telefone}`);
    setMsg('');
    try {
      await chamar('POST', {
        action: 'block',
        telefone,
        nome,
        motivo: motivo || novoMotivo || 'Gerações excessivas',
      });
      setMsg(`✅ Contato ${telefone} bloqueado com sucesso na plataforma.`);
      setNovoTelefone('');
      setNovoNome('');
      await carregar();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setProcessando('');
    }
  };

  // Ação 3: Desbloquear contato
  const desbloquearContato = async (idOuTelefone) => {
    if (!idOuTelefone) return;
    setProcessando(`unblock_${idOuTelefone}`);
    setMsg('');
    try {
      await chamar('POST', { action: 'unblock', id: idOuTelefone });
      setMsg('✅ Contato desbloqueado com sucesso.');
      await carregar();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setProcessando('');
    }
  };

  if (carregando) return <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Carregando limites e bloqueios...</p>;
  if (erro) return <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{erro}</p>;

  const topGeradores = dados?.topGeradores || [];
  const blocklist = dados?.blocklist || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px' }}>
            Limites & Bloqueio de Usuários
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            Controle quem pode gerar músicas no site. Usuários bloqueados não conseguem criar novos pedidos nem gerar áudio.
          </p>
        </div>

        {/* Sub-abas */}
        <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button
            type="button"
            onClick={() => setAbaInterna('GERADORES')}
            style={{
              padding: '6px 12px',
              borderRadius: '7px',
              border: 'none',
              background: abaInterna === 'GERADORES' ? '#7c3aed' : 'transparent',
              color: abaInterna === 'GERADORES' ? '#fff' : '#475569',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            🔥 Maiores Criadores ({topGeradores.length})
          </button>
          <button
            type="button"
            onClick={() => setAbaInterna('BLOQUEADOS')}
            style={{
              padding: '6px 12px',
              borderRadius: '7px',
              border: 'none',
              background: abaInterna === 'BLOQUEADOS' ? '#dc2626' : 'transparent',
              color: abaInterna === 'BLOQUEADOS' ? '#fff' : '#475569',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            🚫 Bloqueados ({blocklist.length})
          </button>
        </div>
      </div>

      {/* Card: Adicionar Bloqueio Manual */}
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#991b1b', margin: '0 0 8px' }}>
          🚫 Bloquear Contato Manualmente
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#7f1d1d', margin: '0 0 12px' }}>
          Digite o telefone ou e-mail da pessoa que você deseja impedir de gerar músicas.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            bloquearContato(novoTelefone, novoNome, novoMotivo);
          }}
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            type="text"
            placeholder="WhatsApp (ex: 98984578421)"
            value={novoTelefone}
            onChange={(e) => setNovoTelefone(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #fca5a5',
              fontSize: '0.85rem',
              flex: '1 1 180px',
              background: '#fff',
            }}
            required
          />
          <input
            type="text"
            placeholder="Nome (opcional)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #fca5a5',
              fontSize: '0.85rem',
              flex: '1 1 140px',
              background: '#fff',
            }}
          />
          <input
            type="text"
            placeholder="Motivo"
            value={novoMotivo}
            onChange={(e) => setNovoMotivo(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #fca5a5',
              fontSize: '0.85rem',
              flex: '1 1 200px',
              background: '#fff',
            }}
          />
          <button
            type="submit"
            disabled={Boolean(processando)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: processando ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {processando.startsWith('block_') ? 'Bloqueando...' : '🚫 Bloquear'}
          </button>
        </form>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '0.85rem',
          background: msg.startsWith('✅') ? '#ecfdf5' : '#fef2f2',
          border: msg.startsWith('✅') ? '1px solid #a7f3d0' : '1px solid #fecaca',
          color: msg.startsWith('✅') ? '#065f46' : '#991b1b',
          fontWeight: '600',
        }}>
          {msg}
        </div>
      )}

      {/* ABA 1: Maiores Criadores & Limites */}
      {abaInterna === 'GERADORES' && (
        <div>
          {topGeradores.length === 0 ? (
            <div style={{ padding: '24px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.9rem', textAlign: 'center' }}>
              Nenhum cliente gerou 2 ou mais músicas nos últimos {dados?.dias || 15} dias.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Cliente</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>WhatsApp</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Músicas Criadas</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Pagas</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Último Pedido</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {topGeradores.map((c) => {
                    const isProc = processando === `block_${c.telefone}` || processando === `unblock_${c.telefone}` || processando === `reset_${c.telefone}`;
                    return (
                      <tr key={c.telefone} style={{ borderTop: '1px solid #e2e8f0', background: c.bloqueadoManual ? '#fff5f5' : '#fff' }}>
                        <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: '600' }}>
                          {c.nome || 'Cliente'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', fontFamily: 'monospace' }}>
                          <a
                            href={`https://wa.me/${c.telefone.startsWith('55') ? c.telefone : `55${c.telefone}`}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#0284c7', textDecoration: 'none' }}
                          >
                            {c.telefone} ↗
                          </a>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: c.usados >= 5 ? '#fef3c7' : '#f1f5f9',
                            color: c.usados >= 5 ? '#b45309' : '#334155',
                            fontWeight: '800',
                          }}>
                            {c.usados}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: c.pagos > 0 ? '#059669' : '#94a3b8', fontWeight: c.pagos > 0 ? '700' : '400' }}>
                          {c.pagos}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {c.bloqueadoManual ? (
                            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c', fontWeight: '700', fontSize: '0.75rem' }}>
                              🚫 Bloqueado
                            </span>
                          ) : c.bloqueadoCota ? (
                            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', background: '#fef3c7', color: '#b45309', fontWeight: '700', fontSize: '0.75rem' }}>
                              ⚠️ Cota Esgotada
                            </span>
                          ) : (
                            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', background: '#ecfdf5', color: '#047857', fontWeight: '700', fontSize: '0.75rem' }}>
                              ✅ Ativo
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.8rem' }}>
                          {c.ultimoPedidoEm ? new Date(c.ultimoPedidoEm).toLocaleString('pt-BR') : '—'}
                          {c.resetAt && (
                            <span style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8' }}>
                              cota liberada em {new Date(c.resetAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {c.bloqueadoManual ? (
                              <button
                                type="button"
                                onClick={() => desbloquearContato(c.telefone)}
                                disabled={isProc}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #10b981',
                                  background: '#fff',
                                  color: '#059669',
                                  fontWeight: '700',
                                  fontSize: '0.75rem',
                                  cursor: isProc ? 'default' : 'pointer',
                                }}
                              >
                                Desbloquear
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => bloquearContato(c.telefone, c.nome, 'Bloqueio rápido via maiores geradores')}
                                disabled={isProc}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#dc2626',
                                  color: '#fff',
                                  fontWeight: '700',
                                  fontSize: '0.75rem',
                                  cursor: isProc ? 'default' : 'pointer',
                                }}
                              >
                                🚫 Bloquear
                              </button>
                            )}

                            {c.bloqueadoCota && !c.bloqueadoManual && (
                              <button
                                type="button"
                                onClick={() => resetarCota(c.telefone)}
                                disabled={isProc}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#7c3aed',
                                  color: '#fff',
                                  fontWeight: '700',
                                  fontSize: '0.75rem',
                                  cursor: isProc ? 'default' : 'pointer',
                                }}
                              >
                                Liberar Cota
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: Pessoas Bloqueadas Manualmente */}
      {abaInterna === 'BLOQUEADOS' && (
        <div>
          {blocklist.length === 0 ? (
            <div style={{ padding: '24px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.9rem', textAlign: 'center' }}>
              Nenhum contato bloqueado manualmente no momento.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Tipo</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Contato</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Nome</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Motivo</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Data do Bloqueio</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {blocklist.map((b) => (
                    <tr key={b.id || b.value} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: b.type === 'phone' ? '#dbeafe' : '#f3e8ff',
                          color: b.type === 'phone' ? '#1d4ed8' : '#7e22ce',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                        }}>
                          {b.type === 'phone' ? 'WhatsApp' : 'E-mail'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#0f172a', fontFamily: 'monospace', fontWeight: '700' }}>
                        {b.displayValue || b.value}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>
                        {b.name || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>
                        {b.reason || 'Sem motivo registrado'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.8rem' }}>
                        {b.blockedAt ? new Date(b.blockedAt).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => desbloquearContato(b.id || b.value)}
                          disabled={processando === `unblock_${b.id || b.value}`}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '7px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            color: '#059669',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {processando === `unblock_${b.id || b.value}` ? 'Desbloqueando...' : 'Desbloquear'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
