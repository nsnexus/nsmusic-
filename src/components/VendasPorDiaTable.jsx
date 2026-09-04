'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Tabela "vendas por dia" do dashboard admin (pedido 04/09/2026) — quantidade vendida por produto,
// por dia do mês, com total no fim. Consulta própria (não reaproveita o `orders` já carregado na
// tela, que por padrão só cobre "hoje" — ver comentário de `dateFrom` em admin/page.jsx) pra sempre
// mostrar o mês inteiro sem depender do filtro de data da lista de pedidos.
//
// Contagem por PRODUTO usa o campo `*PaidAt` de cada um (gravado por src/lib/payments.js na mesma
// transação que concede o acesso, tanto pra add-on isolado quanto pra combo — ver skuGrants*Access)
// — assim um vídeo/carta/retrospectiva vendido junto da música no mesmo checkout (combo) conta no
// dia certo sem precisar de lógica separada pra "veio de combo ou avulso".

function paraData(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === 'function') return valor.toDate();
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mesAtualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PRODUTOS = [
  { chave: 'musicas', label: '🎵 Músicas', icone: '🎵' },
  { chave: 'videos', label: '🎬 Vídeos', icone: '🎬' },
  { chave: 'playbacks', label: '🎧 Playback', icone: '🎧' },
  { chave: 'cartas', label: '💌 Cartas', icone: '💌' },
  { chave: 'retrospectivas', label: '📖 Retrospectivas', icone: '📖' },
];

export default function VendasPorDiaTable() {
  const [mes, setMes] = useState(mesAtualStr);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      setErro('');
      try {
        const [ano, mesNum] = mes.split('-').map(Number);
        const inicio = new Date(ano, mesNum - 1, 1, 0, 0, 0, 0).toISOString();
        const fim = new Date(ano, mesNum, 1, 0, 0, 0, 0).toISOString();

        const q = query(
          collection(db, 'orders'),
          where('createdAt', '>=', inicio),
          where('createdAt', '<', fim),
          orderBy('createdAt'),
          limit(2000)
        );
        const snap = await getDocs(q);
        if (!ativo) return;
        // Mesma exclusão da listagem principal (admin/page.jsx) — configs/sessões não são pedidos.
        const validos = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((o) => !o.deletedAt && !o.id.startsWith('config_') && !o.id.startsWith('session_')
            && o.productionStatus !== 'CONFIG' && o.productionStatus !== 'RASCUNHO');
        setPedidos(validos);
      } catch (e) {
        console.error('[VendasPorDiaTable] Erro ao buscar pedidos do mês:', e.message);
        if (ativo) setErro('Não foi possível carregar as vendas deste mês.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [mes]);

  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();

  // Uma linha por dia do mês, zerada — preenchida abaixo com o que foi vendido em cada uma.
  const porDia = Array.from({ length: diasNoMes }, (_, i) => ({
    dia: i + 1,
    musicas: 0, videos: 0, playbacks: 0, cartas: 0, retrospectivas: 0,
  }));

  const somar = (campo, dataVal) => {
    const d = paraData(dataVal);
    if (!d) return;
    if (d.getFullYear() !== ano || d.getMonth() !== mesNum - 1) return; // pago em outro mês, não conta aqui
    const linha = porDia[d.getDate() - 1];
    if (linha) linha[campo] += 1;
  };

  for (const o of pedidos) {
    const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
    if (musicaPaga) somar('musicas', o.paidAt || o.createdAt);
    if (o.hasVideoAccess || o.videoAddonPaid) somar('videos', o.videoPaidAt);
    if (o.hasPlaybackAccess || o.playbackAddonPaid) somar('playbacks', o.playbackPaidAt);
    if (o.hasCartaAccess || o.cartaAddonPaid) somar('cartas', o.cartaPaidAt);
    if (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid) somar('retrospectivas', o.retrospectivaPaidAt);
  }

  const totais = porDia.reduce((acc, linha) => {
    for (const { chave } of PRODUTOS) acc[chave] += linha[chave];
    return acc;
  }, { musicas: 0, videos: 0, playbacks: 0, cartas: 0, retrospectivas: 0 });

  const hoje = new Date();
  const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === mesNum - 1;
  const linhasVisiveis = ehMesAtual ? porDia.filter((l) => l.dia <= hoje.getDate()) : porDia;

  return (
    <div style={{ marginTop: '32px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
          📊 Vendas por dia
        </h3>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
          aria-label="Mês das vendas"
        />
      </div>

      {loading ? (
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Carregando...</p>
      ) : erro ? (
        <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{erro}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#475569', fontWeight: '700' }}>Dia</th>
                {PRODUTOS.map((p) => (
                  <th key={p.chave} style={{ textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '700', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </th>
                ))}
                <th style={{ textAlign: 'right', padding: '8px 10px', color: '#475569', fontWeight: '800' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((linha) => {
                const totalDia = PRODUTOS.reduce((s, p) => s + linha[p.chave], 0);
                return (
                  <tr key={linha.dia} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', color: '#0f172a', fontWeight: '600' }}>{String(linha.dia).padStart(2, '0')}</td>
                    {PRODUTOS.map((p) => (
                      <td key={p.chave} style={{ textAlign: 'right', padding: '7px 10px', color: linha[p.chave] ? '#0f172a' : '#cbd5e1' }}>
                        {linha[p.chave] || '—'}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: '700', color: totalDia ? '#059669' : '#cbd5e1' }}>
                      {totalDia || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                <td style={{ padding: '9px 10px', fontWeight: '800', color: '#0f172a' }}>Total</td>
                {PRODUTOS.map((p) => (
                  <td key={p.chave} style={{ textAlign: 'right', padding: '9px 10px', fontWeight: '800', color: '#0f172a' }}>
                    {totais[p.chave]}
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: '800', color: '#059669' }}>
                  {Object.values(totais).reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
