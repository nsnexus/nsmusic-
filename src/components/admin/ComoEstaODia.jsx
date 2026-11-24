'use client';

import { useEffect, useState } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

// "Como está o dia": resposta direta para "estou indo bem ou mal hoje?".
// Mesmos números do widget do celular (src/lib/resumoDia.js): faturamento, lucro, vendas,
// gastos e o faturamento até agora comparado com a média dos 7 dias anteriores no mesmo horário.

const ATUALIZAR_MS = 5 * 60 * 1000;
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function buscarResumo(renovar = false) {
  const token = await getAdminAuthToken(renovar);
  return fetch('/api/admin/resumo-dia', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(45000),
  });
}

export default function ComoEstaODia() {
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        let res = await buscarResumo();
        if (res.status === 401) res = await buscarResumo(true);
        const json = await res.json().catch(() => null);
        if (!ativo) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Não foi possível carregar o resumo do dia.');
        setResumo(json);
        setErro('');
      } catch (e) {
        if (ativo) setErro(e?.name === 'TimeoutError' ? 'O resumo do dia demorou para responder.' : e.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    carregar();
    const intervalo = setInterval(carregar, ATUALIZAR_MS);
    return () => { ativo = false; clearInterval(intervalo); };
  }, []);

  if (carregando && !resumo) {
    return <div role="status" style={estilos.caixa}>Calculando como está o dia…</div>;
  }
  if (erro && !resumo) {
    return <div role="alert" style={{ ...estilos.caixa, color: '#b91c1c', background: '#fef2f2' }}>{erro}</div>;
  }
  if (!resumo) return null;

  const pct = Number(resumo.ritmo?.percentualVsMedia) || 0;
  const temMedia = (resumo.ritmo?.diasNaMedia || 0) > 0;
  const bom = pct >= 0;
  const lucroPositivo = (Number(resumo.lucro) || 0) >= 0;
  const cor = !temMedia ? '#334155' : bom ? '#047857' : '#b91c1c';
  const fundo = !temMedia ? '#f8fafc' : bom ? '#ecfdf5' : '#fef2f2';
  const borda = !temMedia ? '#e2e8f0' : bom ? '#a7f3d0' : '#fecaca';

  const veredito = !temMedia
    ? 'Ainda sem dias anteriores para comparar.'
    : bom
      ? `Dia bom: ${pct}% acima da média até agora`
      : `Dia fraco: ${Math.abs(pct)}% abaixo da média até agora`;

  const itens = [
    { label: 'Faturamento', valor: brl(resumo.faturamento) },
    { label: 'Lucro', valor: brl(resumo.lucro), cor: lucroPositivo ? '#047857' : '#b91c1c' },
    { label: 'Vendas', valor: String(resumo.vendas || 0) },
    { label: 'Gastos', valor: brl(resumo.despesas?.total) },
  ];

  return (
    <section aria-label="Como está o dia" style={{ ...estilos.caixa, background: fundo, border: `1.5px solid ${borda}` }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Como está o dia
      </div>
      <div style={{ fontSize: 'clamp(1.05rem, 4.5vw, 1.35rem)', fontWeight: 800, color: cor, margin: '4px 0 12px' }}>
        {temMedia ? (bom ? '📈 ' : '📉 ') : ''}{veredito}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
        {itens.map((i) => (
          <div key={i.label} style={{ background: '#ffffff', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{i.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: i.cor || '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{i.valor}</div>
          </div>
        ))}
      </div>
      {temMedia && (
        <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
          Média dos últimos {resumo.ritmo.diasNaMedia} dias até este horário: <strong>{brl(resumo.ritmo.mediaAteAgora)}</strong>.
          {' '}Nesse ritmo o dia fecha em <strong>{brl(resumo.ritmo.projecaoFaturamento)}</strong>.
        </p>
      )}
      {resumo.despesas && !resumo.despesas.anunciosOk && (
        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#b45309' }}>
          Gasto com anúncios indisponível agora; o lucro está sem os anúncios.
        </p>
      )}
      {erro && <p role="alert" style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{erro}</p>}
    </section>
  );
}

const estilos = {
  caixa: {
    marginBottom: '20px',
    padding: '16px',
    borderRadius: '14px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    fontSize: '0.9rem',
    color: '#334155',
  },
};
