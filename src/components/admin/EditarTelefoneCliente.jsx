'use client';

import { useState } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';
import { formatarTelefoneBr, telefoneBrCompleto } from '@/lib/telefoneBr';

// Telefone do cliente no cabeçalho do pedido, com edição: o cliente às vezes digita errado e aí
// não recebe a música, o bônus não é vinculado e o robô do WhatsApp não acha o pedido.
export default function EditarTelefoneCliente({ orderId, telefone, onSalvo }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const abrir = () => {
    setValor(telefone || '');
    setErro('');
    setEditando(true);
  };

  const salvar = async () => {
    if (!telefoneBrCompleto(valor)) {
      setErro('Número incompleto. Use DDD + número.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const token = await getAdminAuthToken();
      const res = await fetch('/api/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orderId, customerPhone: valor }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Não foi possível salvar o telefone.');
      onSalvo?.(json?.updated?.customerPhone || formatarTelefoneBr(valor));
      setEditando(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!editando) {
    return (
      <>
        <strong style={{ color: '#2563eb' }}>{telefone || 'Sem telefone'}</strong>{' '}
        <button
          type="button"
          onClick={abrir}
          aria-label="Editar telefone do cliente"
          style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', padding: '1px 7px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
        >
          ✏️ Editar
        </button>
      </>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
      <label htmlFor="editar-telefone-cliente" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Telefone:</label>
      <input
        id="editar-telefone-cliente"
        type="tel"
        inputMode="numeric"
        autoFocus
        value={valor}
        onChange={(e) => setValor(formatarTelefoneBr(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false); }}
        placeholder="(31) 98241-4961"
        disabled={salvando}
        style={{ padding: '5px 8px', borderRadius: '6px', border: `1.5px solid ${erro ? '#ef4444' : '#93c5fd'}`, fontSize: '0.9rem', width: '170px' }}
      />
      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        style={{ border: 'none', background: '#16a34a', color: '#fff', borderRadius: '6px', padding: '5px 10px', fontSize: '0.8rem', fontWeight: 800, cursor: salvando ? 'wait' : 'pointer' }}
      >
        {salvando ? 'Salvando...' : 'Salvar'}
      </button>
      <button
        type="button"
        onClick={() => setEditando(false)}
        disabled={salvando}
        style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: '6px', padding: '5px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
      >
        Cancelar
      </button>
      {erro && <span style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 700 }}>{erro}</span>}
    </span>
  );
}
