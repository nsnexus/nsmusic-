'use client';

import { useEffect, useState } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';
import { FIDELIDADE_VOZ_PADRAO } from '@/lib/vozFidelidade';

// Ajustes de fidelidade da voz clonada, usados em todo pedido "Minha Voz" (ver src/lib/vozFidelidade.js).
const CONTROLES = [
  {
    chave: 'audioWeight', campo: 'vozAudioWeight', titulo: 'Peso da voz',
    ajuda: 'Mais alto = a música fica mais parecida com a voz gravada pelo cliente.',
  },
  {
    chave: 'styleWeight', campo: 'vozStyleWeight', titulo: 'Fidelidade ao estilo',
    ajuda: 'O quanto segue o estilo pedido (sertanejo, pop…). Alto demais pode afastar do timbre.',
  },
  {
    chave: 'weirdness', campo: 'vozWeirdness', titulo: 'Criatividade',
    ajuda: 'Desvio criativo da IA. Mais baixo = resultado mais previsível.',
  },
];

export default function FidelidadeVozCard() {
  const [valores, setValores] = useState({ ...FIDELIDADE_VOZ_PADRAO });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    let ativo = true;
    fetch(`/api/admin/config?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (ativo && j?.vozFidelidade) setValores(j.vozFidelidade); })
      .catch(() => { if (ativo) setMensagem('Não deu para carregar os ajustes salvos; mostrando o padrão.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setMensagem('');
    try {
      const token = await getAdminAuthToken();
      const corpo = Object.fromEntries(CONTROLES.map((c) => [c.campo, valores[c.chave]]));
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(corpo),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Falha ao salvar');
      if (j?.vozFidelidade) setValores(j.vozFidelidade);
      setMensagem('✅ Salvo. Vale para as próximas músicas com voz clonada.');
    } catch (err) {
      setMensagem(`❌ ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(129, 140, 248, 0.35)', borderRadius: '16px', padding: '18px', marginBottom: '22px', color: '#e2e8f0' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800 }}>🎚️ Fidelidade da voz clonada</h2>
      <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
        Vale para todos os pedidos &quot;Minha Voz&quot; e para os testes desta página. Mude um ajuste por vez e compare.
      </p>
      {CONTROLES.map((c) => (
        <div key={c.chave} style={{ marginBottom: '14px' }}>
          <label htmlFor={`fid-${c.chave}`} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.88rem' }}>
            <span>{c.titulo}</span>
            <span style={{ color: '#a5b4fc' }}>{Math.round((valores[c.chave] ?? 0) * 100)}%</span>
          </label>
          <input
            id={`fid-${c.chave}`}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={valores[c.chave] ?? 0}
            disabled={carregando || salvando}
            onChange={(e) => setValores((v) => ({ ...v, [c.chave]: Number(e.target.value) }))}
            style={{ width: '100%', accentColor: '#818cf8' }}
          />
          <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
            {c.ajuda} Padrão: {Math.round(FIDELIDADE_VOZ_PADRAO[c.chave] * 100)}%.
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={salvar} disabled={carregando || salvando} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
          {salvando ? 'Salvando…' : 'Salvar ajustes'}
        </button>
        <button type="button" onClick={() => setValores({ ...FIDELIDADE_VOZ_PADRAO })} disabled={carregando || salvando} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #475569', background: 'transparent', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer' }}>
          Voltar ao padrão
        </button>
      </div>
      {mensagem && <p role="status" style={{ margin: '10px 0 0', fontSize: '0.82rem' }}>{mensagem}</p>}
    </section>
  );
}
