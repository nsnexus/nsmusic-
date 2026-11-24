'use client';

import { useEffect, useState } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

// "Como o PIX está saindo": quantas cobranças saíram por cada degrau do checkout.
// InfinitePay ou estático aparecendo = a Efí está falhando. Estático precisa de liberação manual.

async function buscar(renovar = false) {
  const token = await getAdminAuthToken(renovar);
  return fetch('/api/admin/pix-provedores', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(30000),
  });
}

const LINHAS = [
  { chave: 'efi', rotulo: 'Efí (normal)', cor: '#047857' },
  { chave: 'infinitepay', rotulo: 'InfinitePay (Efí falhou)', cor: '#b45309' },
  { chave: 'static', rotulo: 'PIX estático (liberar à mão)', cor: '#b91c1c' },
];

export default function PixProvedoresCard() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        let res = await buscar();
        if (res.status === 401) res = await buscar(true);
        const json = await res.json().catch(() => null);
        if (!ativo) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Não foi possível carregar.');
        setDados(json);
      } catch (e) {
        if (ativo) setErro(e?.name === 'TimeoutError' ? 'Demorou para responder.' : e.message);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const falhas = dados ? dados.semana.infinitepay + dados.semana.static : 0;
  const pct = (n, t) => (t > 0 ? ` (${Math.round((n / t) * 100)}%)` : '');

  return (
    <section aria-label="Como o PIX está saindo" style={{ marginTop: '24px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px' }}>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Como o PIX está saindo</h2>
      <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b' }}>
        Se aparecer InfinitePay ou estático, a Efí falhou naquele momento. O estático não confirma sozinho: libere o pedido no painel.
      </p>
      {!dados && !erro && <div role="status" style={{ fontSize: '0.85rem', color: '#1d4ed8' }}>Carregando…</div>}
      {erro && <div role="alert" style={{ fontSize: '0.85rem', color: '#b91c1c' }}>{erro}</div>}
      {dados && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ color: '#475569', textAlign: 'right' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Degrau</th>
              <th style={{ padding: '4px 6px' }}>Hoje</th>
              <th style={{ padding: '4px 6px' }}>7 dias</th>
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((l) => (
              <tr key={l.chave} style={{ borderTop: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <td style={{ textAlign: 'left', padding: '6px', color: '#0f172a' }}>
                  <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: l.cor, marginRight: 8 }} />
                  {l.rotulo}
                </td>
                <td style={{ padding: '6px', fontWeight: 700 }}>{dados.hoje[l.chave]}{pct(dados.hoje[l.chave], dados.hoje.total)}</td>
                <td style={{ padding: '6px', fontWeight: 700 }}>{dados.semana[l.chave]}{pct(dados.semana[l.chave], dados.semana.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dados && falhas === 0 && dados.semana.total > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#047857' }}>✅ Todos os PIX dos últimos 7 dias saíram pela Efí.</p>
      )}
    </section>
  );
}
