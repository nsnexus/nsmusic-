'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';

// Clientes que estouraram a cota de gerações, com botão para liberar.
//
// "Liberar" aqui NÃO apaga pedido nenhum: grava a data do reset e, a partir dela, os pedidos
// anteriores param de contar para a cota (ver src/lib/cotaReset.js). O histórico do cliente continua
// inteiro no painel e no faturamento.
//
// A lista vem do servidor (api/admin/cotas) porque a conta tem que ser a MESMA da trava em
// api/orders/create — se o painel calculasse por conta própria, um dia os dois discordariam e o
// estúdio liberaria alguém que continuaria bloqueado.
export default function LimitesCota() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [resetando, setResetando] = useState('');
  const [msg, setMsg] = useState('');

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

  useEffect(() => { carregar(); }, [carregar]);

  const resetar = async (telefone) => {
    setResetando(telefone);
    setMsg('');
    try {
      await chamar('POST', { telefone });
      setMsg('✅ Liberado. O cliente já pode gerar de novo.');
      await carregar();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setResetando('');
    }
  };

  if (carregando) return <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Carregando limites...</p>;
  if (erro) return <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{erro}</p>;

  const lista = dados?.bloqueados || [];

  return (
    <div>
      <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px' }}>
        Limites de geração
      </h2>
      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 16px' }}>
        Quem atingiu a cota e não consegue criar música nova. Cada compra paga já soma 5 gerações
        sozinha — libere na mão só quando fizer sentido (cliente que teve problema técnico, por
        exemplo). Liberar não apaga nada: os pedidos antigos apenas deixam de contar.
      </p>

      {msg && (
        <p style={{ fontSize: '0.85rem', marginBottom: '12px', color: msg.startsWith('✅') ? '#059669' : '#dc2626' }}>
          {msg}
        </p>
      )}

      {lista.length === 0 ? (
        <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.9rem' }}>
          Ninguém bloqueado nos últimos {dados?.dias || 45} dias ({dados?.telefonesAnalisados || 0} clientes conferidos).
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: '#fff' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Cliente</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>WhatsApp</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Usadas</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Cota</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Compras</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#334155', fontWeight: '700' }}>Último pedido</th>
                <th style={{ padding: '10px 12px' }} />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.telefone} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', color: '#0f172a' }}>{c.nome || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#475569', fontFamily: 'monospace' }}>{c.telefone}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#b45309' }}>{c.usados}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>{c.cota}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: c.pagos > 0 ? '#059669' : '#94a3b8', fontWeight: c.pagos > 0 ? '700' : '400' }}>{c.pagos}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    {c.ultimoPedidoEm ? new Date(c.ultimoPedidoEm).toLocaleString('pt-BR') : '—'}
                    {c.resetAt && (
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8' }}>
                        liberado em {new Date(c.resetAt).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => resetar(c.telefone)}
                      disabled={resetando === c.telefone}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: resetando === c.telefone ? '#94a3b8' : '#7c3aed',
                        color: '#fff',
                        fontWeight: '700',
                        fontSize: '0.8rem',
                        cursor: resetando === c.telefone ? 'default' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {resetando === c.telefone ? 'Liberando...' : 'Liberar gerações'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
