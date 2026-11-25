'use client';

import { useState } from 'react';
import Link from 'next/link';

function formatarTelefone(valor) {
  const d = String(valor || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatarData(iso) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Busca simples das músicas pelo WhatsApp usado no pedido, sem login (24/11/2026).
export default function BuscarPorWhatsApp() {
  const [telefone, setTelefone] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [musicas, setMusicas] = useState(null);

  const buscar = async (e) => {
    e.preventDefault();
    setErro('');
    setMusicas(null);
    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length < 10) {
      setErro('Digite seu WhatsApp com DDD.');
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch('/api/orders/by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digitos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível buscar agora.');
      setMusicas(data.musicas || []);
    } catch (err) {
      setErro(err.message || 'Não foi possível buscar agora.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ marginTop: 24, textAlign: 'left' }}>
      <form onSubmit={buscar}>
        <label htmlFor="busca-whatsapp" style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>
          Procurar minhas músicas pelo WhatsApp
        </label>
        <input
          id="busca-whatsapp"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="(11) 98888-7777"
          value={telefone}
          onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
          style={{ width: '100%', minHeight: 48, padding: '0 14px', fontSize: 16, borderRadius: 12, border: '1px solid #D9D2E9', boxSizing: 'border-box' }}
        />
        <button type="submit" className="nx-button nx-primary" disabled={carregando} style={{ width: '100%', marginTop: 10 }}>
          {carregando ? 'Procurando…' : 'Procurar músicas'}
        </button>
      </form>

      {erro && <p className="nx-message" role="alert" style={{ color: '#B42318', marginTop: 10 }}>{erro}</p>}

      {musicas && musicas.length === 0 && (
        <p className="nx-helper" role="status" style={{ marginTop: 12 }}>
          Não achamos músicas com esse WhatsApp. Confira se é o mesmo número que você usou no pedido.
        </p>
      )}

      {musicas && musicas.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 10 }}>
          {musicas.map((m) => (
            <li key={m.orderId}>
              <Link
                href={`/entrega?orderId=${encodeURIComponent(m.orderId)}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1px solid #E7E1F3', background: '#fff', textDecoration: 'none', color: 'inherit' }}
              >
                <span>
                  <strong style={{ display: 'block' }}>🎵 Para {m.honoreeName || 'alguém especial'}</strong>
                  <span style={{ fontSize: '0.82rem', color: '#857D80' }}>
                    {formatarData(m.createdAt)} · {m.pago ? 'Paga' : 'Prévia'}
                  </span>
                </span>
                <span aria-hidden="true" style={{ fontWeight: 700, color: '#5B3FD6' }}>Abrir →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
