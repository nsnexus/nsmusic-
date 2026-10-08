'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function TabelaTimbresClientes() {
  const [clientesVoz, setClientesVoz] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [resetandoTelefone, setResetandoTelefone] = useState('');
  const [msgSucesso, setMsgSucesso] = useState('');
  const [msgErro, setMsgErro] = useState('');

  const carregarClientes = async () => {
    setCarregando(true);
    setMsgErro('');
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
      setMsgErro('Não foi possível carregar a base de timbres. Verifique sua conexão.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarClientes();
  }, []);

  const handleResetarTimbre = async (cliente) => {
    const nome = cliente.customerName || cliente.customer_name || 'este cliente';
    const conf = window.confirm(
      `Deseja realmente redefinir o timbre de voz de ${nome} (${cliente.phone})?\n\nO status do timbre será alterado para "resetado" e o cliente poderá gravar uma nova amostra de voz.`
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
        setMsgSucesso(`Timbre de ${nome} (${cliente.phone}) foi redefinido com sucesso!`);
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

  const filtrados = clientesVoz.filter((c) => {
    if (!busca.trim()) return true;
    const termo = busca.toLowerCase().trim();
    const nome = (c.customerName || c.customer_name || '').toLowerCase();
    const fone = (c.phone || '').toLowerCase();
    const vId = (c.voiceId || c.voice_id || '').toLowerCase();
    return nome.includes(termo) || fone.includes(termo) || vId.includes(termo);
  });

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Cabeçalho da Seção */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              🎤 Timbres de Clientes (Voz Clonada)
            </h2>
            <span style={{
              background: '#ede9fe',
              color: '#7c3aed',
              fontSize: '0.75rem',
              fontWeight: '800',
              padding: '3px 8px',
              borderRadius: '999px',
              border: '1px solid #ddd6fe'
            }}>
              {clientesVoz.length} {clientesVoz.length === 1 ? 'cadastrado' : 'cadastrados'}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Vozes clonadas vinculadas ao WhatsApp dos clientes. Clientes com voz gravada podem gerar novas músicas por R$ 9,99.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={carregarClientes}
            disabled={carregando}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: carregando ? 'default' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {carregando ? '⏳ Carregando...' : '🔄 Atualizar Lista'}
          </button>

          <Link
            href="/admin/voz"
            style={{
              background: '#2563eb',
              color: '#ffffff',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: '700',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🎙️ Abrir Lab de Testes ➔
          </Link>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {msgSucesso && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          fontSize: '0.85rem',
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
          fontSize: '0.85rem',
          fontWeight: '600',
          marginBottom: '16px'
        }}>
          ⚠️ {msgErro}
        </div>
      )}

      {/* Barra de Filtro / Busca */}
      <div style={{ marginBottom: '18px' }}>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Filtrar por nome do cliente, WhatsApp (ex: 1199999...) ou Voice ID..."
          style={{
            width: '100%',
            padding: '12px 16px',
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

      {/* Conteúdo: Loading, Vazio ou Lista */}
      {carregando ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          color: '#64748b',
          fontSize: '0.9rem'
        }}>
          ⏳ Carregando timbres cadastrados no banco de dados...
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '50px 20px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '2px dashed #cbd5e1',
          color: '#64748b'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🎤</div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b', margin: '0 0 6px 0' }}>
            {busca ? 'Nenhum timbre encontrado para esta busca' : 'Nenhum timbre de cliente cadastrado ainda'}
          </h3>
          <p style={{ fontSize: '0.85rem', margin: 0, maxWidth: '480px', marginInline: 'auto', lineHeight: '1.5' }}>
            {busca
              ? 'Tente buscar por outro termo, telefone ou limpe o campo de busca.'
              : 'Quando os clientes comprarem o Add-on de Voz (R$ 24,90) e gravarem suas amostras na página de entrega (/entrega), seus timbres serão vinculados ao WhatsApp e aparecerão aqui automaticamente.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtrados.map((item, idx) => {
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
                {/* Linha Superior: Nome, WhatsApp e Status */}
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
                  </div>

                  {sampleUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: '700', color: '#475569' }}>
                        Áudio Amostra:
                      </span>
                      <audio controls src={sampleUrl} style={{ height: '32px', maxWidth: '240px' }} />
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                      Sem áudio de amostra registrado
                    </span>
                  )}
                </div>

                {/* Ações */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '8px',
                  paddingTop: '4px'
                }}>
                  <Link
                    href={`/admin/voz?voiceId=${encodeURIComponent(voiceIdItem)}`}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#0284c7',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🎧 Testar no Lab de Voz
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleResetarTimbre(item)}
                    disabled={isResetando || !isAtivo}
                    style={{
                      background: isAtivo ? '#fee2e2' : '#f8fafc',
                      border: isAtivo ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                      color: isAtivo ? '#b91c1c' : '#94a3b8',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: (isAtivo && !isResetando) ? 'pointer' : 'default',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isResetando ? 'Redefinindo...' : isAtivo ? '🔄 Redefinir Timbre' : 'Já Redefinido'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
