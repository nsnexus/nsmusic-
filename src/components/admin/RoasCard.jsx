'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAdminAuthToken } from '@/lib/authClient';

// ROAS geral: dia a dia no mês (subindo ou caindo?) e, hoje, acumulado hora a hora.
// Dados de /api/admin/roas. ROAS = faturamento ÷ gasto com anúncios (Meta c/ imposto + TikTok + Google).

const COR = '#7c3aed';
const ATUALIZAR_MS = 5 * 60 * 1000;
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const x = (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(2).replace('.', ',')}x`);

function GraficoLinha({ pontos, rotuloX, titulo, descricao }) {
  // pontos: [{ rotulo, valor (ROAS ou null), detalhe: [linhas do tooltip] }]
  const [ativo, setAtivo] = useState(null);
  const W = 640, H = 200, M = { t: 14, r: 14, b: 26, l: 40 };
  const validos = pontos.filter((p) => p.valor !== null);
  const maxV = Math.max(1.5, ...validos.map((p) => p.valor)) * 1.1;
  const px = (i) => M.l + (pontos.length <= 1 ? 0 : (i / (pontos.length - 1)) * (W - M.l - M.r));
  const py = (v) => M.t + (1 - v / maxV) * (H - M.t - M.b);
  const ticks = [0, maxV / 3, (2 * maxV) / 3].map((t) => Math.round(t * 10) / 10);

  // Linha quebrada onde não há dado (dia sem gasto).
  const segmentos = [];
  let atual = [];
  pontos.forEach((p, i) => {
    if (p.valor === null) { if (atual.length) segmentos.push(atual); atual = []; return; }
    atual.push(`${px(i)},${py(p.valor)}`);
  });
  if (atual.length) segmentos.push(atual);

  const ultimoIdx = pontos.map((p) => p.valor !== null).lastIndexOf(true);
  const passo = Math.max(1, Math.ceil(pontos.length / 8));

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>{titulo}</figcaption>
      {descricao && <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '6px' }}>{descricao}</div>}
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={titulo}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={py(t)} y2={py(t)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={M.l - 6} y={py(t) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{t.toFixed(1)}x</text>
            </g>
          ))}
          {/* Referência: ROAS 1x = gastou o mesmo que faturou */}
          <line x1={M.l} x2={W - M.r} y1={py(1)} y2={py(1)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />
          <text x={W - M.r} y={py(1) - 4} textAnchor="end" fontSize="11" fill="#64748b">1x = empate com anúncio</text>
          {segmentos.map((s, i) => (
            <polyline key={i} points={s.join(' ')} fill="none" stroke={COR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {pontos.map((p, i) => p.valor !== null && (
            <circle key={i} cx={px(i)} cy={py(p.valor)} r={ativo === i ? 5 : 4} fill={COR} stroke="#ffffff" strokeWidth="2" />
          ))}
          {ultimoIdx >= 0 && (
            <text x={Math.min(px(ultimoIdx), W - M.r - 4)} y={py(pontos[ultimoIdx].valor) - 10} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">
              {x(pontos[ultimoIdx].valor)}
            </text>
          )}
          {pontos.map((p, i) => (i % passo === 0 || i === pontos.length - 1) && (
            <text key={`l${i}`} x={px(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">{rotuloX(p, i)}</text>
          ))}
          {/* Áreas de toque maiores que o ponto */}
          {pontos.map((p, i) => (
            <rect
              key={`h${i}`}
              x={px(i) - (W - M.l - M.r) / Math.max(1, pontos.length - 1) / 2}
              y={M.t}
              width={(W - M.l - M.r) / Math.max(1, pontos.length - 1)}
              height={H - M.t - M.b}
              fill="transparent"
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
              onClick={() => setAtivo(ativo === i ? null : i)}
            />
          ))}
          {ativo !== null && <line x1={px(ativo)} x2={px(ativo)} y1={M.t} y2={H - M.b} stroke="#cbd5e1" strokeWidth="1" pointerEvents="none" />}
        </svg>
        {ativo !== null && pontos[ativo] && (
          <div style={{
            position: 'absolute', top: 0, pointerEvents: 'none',
            left: `${Math.min(70, Math.max(0, (px(ativo) / W) * 100 - 15))}%`,
            background: '#0f172a', color: '#fff', borderRadius: '8px', padding: '6px 9px', fontSize: '0.75rem', lineHeight: 1.45, whiteSpace: 'nowrap',
          }}>
            <strong>{pontos[ativo].rotulo}</strong> · ROAS {x(pontos[ativo].valor)}
            {pontos[ativo].detalhe.map((l) => <div key={l}>{l}</div>)}
          </div>
        )}
      </div>
    </figure>
  );
}

async function buscar(mes, renovar = false) {
  const token = await getAdminAuthToken(renovar);
  return fetch(`/api/admin/roas?mes=${encodeURIComponent(mes)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(60000),
  });
}

export default function RoasCard({ mes }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!mes) return undefined;
    let ativo = true;
    setCarregando(true);
    const carregar = async () => {
      try {
        let res = await buscar(mes);
        if (res.status === 401) res = await buscar(mes, true);
        const json = await res.json().catch(() => null);
        if (!ativo) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Não foi possível carregar o ROAS.');
        setDados(json);
        setErro('');
      } catch (e) {
        if (ativo) setErro(e?.name === 'TimeoutError' ? 'O ROAS demorou para responder.' : e.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    carregar();
    const intervalo = setInterval(carregar, ATUALIZAR_MS);
    return () => { ativo = false; clearInterval(intervalo); };
  }, [mes]);

  const resumo = useMemo(() => {
    const dias = dados?.dias || [];
    const comDado = dias.filter((d) => d.roas !== null);
    const fat = dias.reduce((a, d) => a + (Number(d.faturamento) || 0), 0);
    const gasto = dias.reduce((a, d) => a + (Number(d.gasto) || 0), 0);
    // Tendência: média dos últimos 3 dias com dado × dos 3 anteriores.
    const ult = comDado.slice(-3);
    const ant = comDado.slice(-6, -3);
    const media = (l) => (l.length ? l.reduce((a, d) => a + d.roas, 0) / l.length : null);
    const mUlt = media(ult);
    const mAnt = media(ant);
    const tendencia = mUlt !== null && mAnt ? Math.round(((mUlt - mAnt) / mAnt) * 100) : null;
    const horas = dados?.horaria?.horas || [];
    const agora = [...horas].reverse().find((h) => h.roas !== null) || null;
    return { roasMes: gasto > 0 ? fat / gasto : null, tendencia, agora };
  }, [dados]);

  return (
    <section aria-label="ROAS" style={{ marginTop: '24px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px' }}>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>ROAS geral</h2>
      <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#64748b' }}>
        Faturamento ÷ gasto com anúncios (Meta com imposto + TikTok + Google). Acima de 1x, os anúncios se pagam.
      </p>

      {carregando && !dados && <div role="status" style={{ fontSize: '0.85rem', color: '#1d4ed8' }}>Calculando o ROAS…</div>}
      {erro && <div role="alert" style={{ fontSize: '0.85rem', color: '#b91c1c', marginBottom: '8px' }}>{erro}</div>}

      {dados && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {dados.horaria && (
              <Tile rotulo="Hoje até agora" valor={x(resumo.agora?.roas ?? null)} sub={resumo.agora ? `${brl(resumo.agora.receita)} ÷ ${brl(resumo.agora.gasto)}` : 'sem gasto ainda'} />
            )}
            <Tile rotulo="Mês" valor={x(resumo.roasMes)} />
            <Tile
              rotulo="Tendência (3 dias)"
              valor={resumo.tendencia === null ? '—' : `${resumo.tendencia >= 0 ? '▲' : '▼'} ${Math.abs(resumo.tendencia)}%`}
              cor={resumo.tendencia === null ? '#0f172a' : resumo.tendencia >= 0 ? '#047857' : '#b91c1c'}
              sub={resumo.tendencia === null ? 'poucos dias' : resumo.tendencia >= 0 ? 'subindo' : 'caindo'}
            />
          </div>

          <GraficoLinha
            titulo="ROAS dia a dia"
            pontos={dados.dias.map((d) => ({
              rotulo: d.dia.split('-').reverse().slice(0, 2).join('/'),
              valor: d.roas,
              detalhe: [`Faturamento ${brl(d.faturamento)}`, `Anúncios ${brl(d.gasto)}`],
            }))}
            rotuloX={(p) => p.rotulo.slice(0, 2)}
          />

          {dados.horaria && (
            <div style={{ marginTop: '18px' }}>
              <GraficoLinha
                titulo="Hoje, hora a hora (acumulado)"
                descricao={[
                  'Faturamento até a hora ÷ gasto até a hora.',
                  !dados.horaria.metaOk && 'Meta sem dado por hora agora.',
                  dados.horaria.googleForaDaCurva && 'Google fica fora (só tem total do dia).',
                ].filter(Boolean).join(' ')}
                pontos={dados.horaria.horas.map((h) => ({
                  rotulo: `${String(h.hora).padStart(2, '0')}h`,
                  valor: h.roas,
                  detalhe: h.receita === null ? [] : [`Faturamento ${brl(h.receita)}`, `Anúncios ${brl(h.gasto)}`],
                }))}
                rotuloX={(p) => p.rotulo}
              />
            </div>
          )}

          <details style={{ marginTop: '12px', fontSize: '0.82rem' }}>
            <summary style={{ cursor: 'pointer', color: '#475569', fontWeight: 600 }}>Ver tabela dia a dia</summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
              <thead>
                <tr style={{ color: '#475569', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Dia</th>
                  <th style={{ padding: '4px 6px' }}>Faturamento</th>
                  <th style={{ padding: '4px 6px' }}>Anúncios</th>
                  <th style={{ padding: '4px 6px' }}>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {[...dados.dias].reverse().map((d) => (
                  <tr key={d.dia} style={{ borderTop: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <td style={{ textAlign: 'left', padding: '4px 6px' }}>{d.dia.split('-').reverse().slice(0, 2).join('/')}</td>
                    <td style={{ padding: '4px 6px' }}>{d.faturamento === null ? '—' : brl(d.faturamento)}</td>
                    <td style={{ padding: '4px 6px' }}>{d.gasto === null ? '—' : brl(d.gasto)}</td>
                    <td style={{ padding: '4px 6px', fontWeight: 700 }}>{x(d.roas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {!dados.anunciosOk && (
            <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#b45309' }}>Gasto com anúncios indisponível agora.</p>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ rotulo, valor, sub, cor = '#0f172a' }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{rotulo}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: cor, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{sub}</div>}
    </div>
  );
}
