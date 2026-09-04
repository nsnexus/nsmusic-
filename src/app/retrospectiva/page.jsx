'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { buildAudioProxySrc } from '@/lib/audioProxy';
import MedidorAmor from '@/components/MedidorAmor';

// Página PÚBLICA da Retrospectiva (add-on, ver src/lib/pricing.js:retrospectiva_addon) — é o link
// que o cliente manda pra família. Diferente do Vídeo Homenagem, aqui nada é renderizado: abre na
// hora, toca a música de fundo e funciona em qualquer celular, sem depender da aba ficar aberta
// (era esse o ponto fraco do vídeo, que sai mudo se o navegador suspender a aba).
//
// Sem segmento dinâmico ([id]) — usa `?orderId=` em query string, então não precisa de
// `export const runtime = 'edge'` (ver .claude/rules/frontend.md).
//
// SEGURANÇA: só exibe quando o add-on está pago (hasRetrospectivaAccess). O conteúdo é público por
// natureza (é pra ser compartilhado), mas nunca expõe dado de pagamento nem contato do cliente.

// Inclinações alternadas pras fotos em moldura Polaroid — dá o efeito "coladas à mão", não uma
// grade perfeitamente alinhada (visual pedido pra ficar romântico, não corporativo).
const ROTACOES_POLAROID = [-4, 3, -2.5, 4, -3, 2];

function diffDesde(dataInicio) {
  if (!dataInicio) return null;
  const inicio = new Date(`${dataInicio}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return null;

  const agora = new Date();
  if (agora < inicio) return null;

  let anos = agora.getFullYear() - inicio.getFullYear();
  let meses = agora.getMonth() - inicio.getMonth();
  let dias = agora.getDate() - inicio.getDate();

  if (dias < 0) {
    meses -= 1;
    const ultimoDiaMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0).getDate();
    dias += ultimoDiaMesAnterior;
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }

  return {
    anos,
    meses,
    dias,
    horas: agora.getHours(),
    minutos: agora.getMinutes(),
    segundos: agora.getSeconds(),
  };
}

function formatarDataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  if (!ano || !mes || !dia) return '';
  return `${dia}/${mes}/${ano}`;
}

// Tempo DECORRIDO de verdade desde a data de início (dias totais + horas/min/seg corridos), pras
// caixas DIAS/HORAS/MIN/SEG do mockup. Diferente de `diffDesde`, que quebra em anos/meses/dias —
// e diferente do relógio de parede, que era o que estava sendo exibido antes por engano.
function tempoDecorrido(dataInicio, agora) {
  const vazio = { totalDias: 0, horas: 0, minutos: 0, segundos: 0 };
  if (!dataInicio) return vazio;
  const inicio = new Date(`${dataInicio}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return vazio;
  const ms = agora.getTime() - inicio.getTime();
  if (ms < 0) return vazio;
  const segundosTotais = Math.floor(ms / 1000);
  return {
    totalDias: Math.floor(segundosTotais / 86400),
    horas: Math.floor((segundosTotais % 86400) / 3600),
    minutos: Math.floor((segundosTotais % 3600) / 60),
    segundos: segundosTotais % 60,
  };
}

// Corações/estrelas flutuando no fundo — decoração do mockup, puramente visual.
function CoracoesFlutuando() {
  const enfeites = [
    { s: '💗', top: '6%', left: '8%', size: '1.6rem', op: 0.55 },
    { s: '💗', top: '18%', right: '10%', size: '2.1rem', op: 0.4 },
    { s: '🩷', top: '42%', left: '4%', size: '1.2rem', op: 0.5 },
    { s: '💜', top: '58%', right: '6%', size: '1.5rem', op: 0.45 },
    { s: '✨', top: '30%', left: '18%', size: '0.9rem', op: 0.6 },
    { s: '✨', top: '70%', right: '20%', size: '0.9rem', op: 0.5 },
    { s: '💗', top: '80%', left: '12%', size: '1.3rem', op: 0.35 },
  ];
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {enfeites.map((e, i) => (
        <span key={i} style={{ position: 'absolute', top: e.top, left: e.left, right: e.right, fontSize: e.size, opacity: e.op }}>
          {e.s}
        </span>
      ))}
    </div>
  );
}

// Divisor "—— ♥ ——" usado entre título e subtítulo em várias seções do mockup.
function DivisorCoracao({ cor = 'rgba(255,255,255,0.45)', coracao = '#f9a8d4' }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '10px 0 14px' }}>
      <span style={{ height: '1px', width: '64px', background: `linear-gradient(90deg, transparent, ${cor})` }} />
      <span style={{ color: coracao, fontSize: '0.95rem' }}>♥</span>
      <span style={{ height: '1px', width: '64px', background: `linear-gradient(90deg, ${cor}, transparent)` }} />
    </div>
  );
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Legenda em caps ("DEZ 2025") acima da data — mesmo formato do projeto de referência (tl-d).
function formatarMesAno(iso) {
  if (!iso) return '';
  const [ano, mes] = iso.split('-');
  const i = Number(mes) - 1;
  if (!ano || !MESES_ABREV[i]) return '';
  return `${MESES_ABREV[i]} ${ano}`.toUpperCase();
}

// Data por extenso ("12 de dezembro de 2025") — mesmo formato do projeto de referência (tl-c).
function formatarDataExtenso(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  const i = Number(mes) - 1;
  if (!ano || !dia || !MESES_EXTENSO[i]) return '';
  return `${Number(dia)} de ${MESES_EXTENSO[i]} de ${ano}`;
}

function RetrospectivaContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id') || '';

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [tocando, setTocando] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  const [respostas, setRespostas] = useState({});
  const [medidorAberto, setMedidorAberto] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!orderId) {
      setErro('Link inválido.');
      setLoading(false);
      return;
    }
    let ativo = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'orders', orderId));
        if (!ativo) return;
        if (!snap.exists()) {
          setErro('Retrospectiva não encontrada.');
        } else {
          const data = snap.data();
          if (!data.hasRetrospectivaAccess && !data.retrospectivaAddonPaid) {
            setErro('Esta retrospectiva ainda não foi liberada.');
          } else {
            setOrder(data);
          }
        }
      } catch (e) {
        console.error('Erro ao carregar retrospectiva:', e);
        if (ativo) setErro('Não foi possível carregar agora.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [orderId]);

  // Contador ao vivo — 1s, com cleanup obrigatório (ver .claude/rules/frontend.md).
  useEffect(() => {
    if (!order?.retrospectiva?.dataInicio) return;
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, [order?.retrospectiva?.dataInicio]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setTocando(true)).catch(() => setTocando(false));
    } else {
      el.pause();
      setTocando(false);
    }
  };

  if (loading) {
    return <div style={estilos.centro}><p style={{ color: 'var(--text-secondary)' }}>Carregando...</p></div>;
  }

  if (erro || !order) {
    return (
      <div style={estilos.centro}>
        <div className="glass-card" style={{ padding: '28px', borderRadius: '16px', maxWidth: '420px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{erro || 'Retrospectiva não encontrada.'}</p>
        </div>
      </div>
    );
  }

  const retro = order.retrospectiva || {};
  const honoree = order.honoreeName || '';
  const titulo = retro.titulo || (honoree ? `Nossa história com ${honoree}` : 'Nossa história');
  // Fotos do Vídeo Homenagem (quem comprou) + fotos enviadas na própria retrospectiva (quem não
  // comprou vídeo antes só tinha fotos aqui se tivesse usado o vídeo — corrigido 03/09/2026).
  const fotosDoVideo = Array.isArray(order.slideshowImages) ? order.slideshowImages : [];
  const fotosProprias = Array.isArray(retro.fotos) ? retro.fotos : [];
  const fotos = [...fotosDoVideo, ...fotosProprias];
  const momentos = Array.isArray(retro.momentos) ? retro.momentos : [];
  const quiz = Array.isArray(retro.quiz) ? retro.quiz : [];
  const contador = retro.dataInicio ? diffDesde(retro.dataInicio) : null;
  const decorrido = tempoDecorrido(retro.dataInicio, agora);

  const audioSrc = buildAudioProxySrc(order.audioFiles?.[0] || order.audioUrl || '');

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #2b1145 0%, #5b2a72 32%, #b06a9e 62%, #f3d9ea 100%)' }}>
      {/* Capa — vídeo de fundo em loop (public/hero/retrospectiva.mp4, enviado pelo dono do estúdio
          em 04/09/2026 pra substituir o degradê). Os corações decorativos saíram daqui: o vídeo já
          dá o movimento, e eles competiam com a imagem. `muted` + `playsInline` são obrigatórios —
          sem os dois o autoplay é bloqueado no celular. */}
      <div style={{ position: 'relative', padding: '56px 20px 64px', textAlign: 'center', overflow: 'hidden' }}>
        <video
          src="/hero/retrospectiva.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
        {/* Véu escuro por cima: sem ele o texto branco some nos quadros mais claros do vídeo. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(20,8,32,0.55) 0%, rgba(20,8,32,0.35) 45%, rgba(43,17,69,0.75) 100%)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {order.coverUrl && (
            <div style={{ position: 'relative', width: '150px', margin: '0 auto 26px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.coverUrl}
                alt={honoree ? `Foto de ${honoree}` : 'Foto da homenagem'}
                style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.85)', boxShadow: '0 0 0 8px rgba(255,255,255,0.08), 0 0 44px rgba(236,72,153,0.5)', display: 'block' }}
              />
              <span style={{ position: 'absolute', bottom: '-12px', left: '50%', transform: 'translateX(-50%)', fontSize: '1.5rem', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }} aria-hidden="true">🤍</span>
            </div>
          )}

          <h1 style={estilos.tituloSerif}>{titulo}</h1>
          <DivisorCoracao />

          <p style={{ fontSize: '0.98rem', color: 'rgba(255,255,255,0.85)', margin: '0 0 22px' }}>
            Cada detalhe, cada momento, cada nós.
          </p>

          {audioSrc && (
            <>
              {/* Tocar exige um toque do usuário: navegador de celular bloqueia áudio automático. */}
              <audio ref={audioRef} src={audioSrc} loop onEnded={() => setTocando(false)} />
              <button
                type="button"
                onClick={togglePlay}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                  padding: '13px 30px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(90deg, #7c3aed 0%, #ec4899 100%)',
                  color: '#fff', fontWeight: '700', fontSize: '1rem',
                  boxShadow: '0 10px 30px rgba(236,72,153,0.45)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(255,255,255,0.22)', fontSize: '0.75rem' }}>
                  {tocando ? '⏸' : '▶'}
                </span>
                {tocando ? 'Pausar nossa música' : 'Tocar nossa música'}
              </button>
            </>
          )}

      {/* Contador ao vivo — cartão claro com as caixas de DIAS/HORAS/MIN/SEG do mockup. Fica DENTRO
          da capa, por cima do vídeo (achado 04/09/2026: como irmão logo abaixo, o vídeo terminava
          numa linha reta atrás do card e a capa parecia cortada no meio). */}
      {contador && (
        <div style={{ maxWidth: '560px', margin: '30px auto 0', padding: '0 20px' }}>
          <div style={{ padding: '26px 22px', borderRadius: '20px', textAlign: 'center', background: 'rgba(255,255,255,0.92)', boxShadow: '0 20px 50px rgba(43,17,69,0.25)' }}>
            <p style={{ fontSize: '0.8rem', color: '#9333ea', margin: '0 0 10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: '700' }}>
              <span style={{ color: '#f472b6' }}>♥</span>&nbsp; {retro.contadorLabel || 'Juntos há'} &nbsp;<span style={{ color: '#f472b6' }}>♥</span>
            </p>
            <p style={{ fontFamily: 'var(--font-family-gala)', fontSize: '2rem', fontWeight: '700', color: '#6b21a8', margin: 0, lineHeight: 1.2 }}>
              {contador.anos > 0 && `${contador.anos} ${contador.anos === 1 ? 'ano' : 'anos'}, `}
              {contador.meses} {contador.meses === 1 ? 'mês' : 'meses'} e {contador.dias} {contador.dias === 1 ? 'dia' : 'dias'}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '14px 0 12px' }} aria-hidden="true">
              <span style={{ height: '1px', width: '70px', background: 'linear-gradient(90deg, transparent, #e9d5ff)' }} />
              <span style={{ color: '#f472b6', fontSize: '0.9rem' }}>♥</span>
              <span style={{ height: '1px', width: '70px', background: 'linear-gradient(90deg, #e9d5ff, transparent)' }} />
            </div>

            <p style={{ fontFamily: 'var(--font-family-gala)', fontSize: '1.05rem', color: '#4c1d95', margin: '0 0 16px' }}>
              {String(decorrido.horas).padStart(2, '0')}:{String(decorrido.minutos).padStart(2, '0')}:{String(decorrido.segundos).padStart(2, '0')} — e contando 💜
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { valor: decorrido.totalDias, label: 'DIAS' },
                { valor: decorrido.horas, label: 'HORAS' },
                { valor: decorrido.minutos, label: 'MIN' },
                { valor: decorrido.segundos, label: 'SEG' },
              ].map((cx) => (
                <div key={cx.label} style={{ background: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: '12px', padding: '10px 4px' }}>
                  <div style={{ fontFamily: 'var(--font-family-gala)', fontSize: '1.45rem', fontWeight: '700', color: '#9333ea', lineHeight: 1.1 }}>
                    {cx.label === 'DIAS' ? cx.valor : String(cx.valor).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#a78bfa', letterSpacing: '0.1em', fontWeight: '700', marginTop: '2px' }}>{cx.label}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.75rem', color: '#a78bfa', margin: '12px 0 0' }}>
              desde {formatarDataBr(retro.dataInicio)}
            </p>
          </div>
        </div>
      )}
        </div>
      </div>

      {/* Linha do tempo — réplica fiel do projeto de referência (Capivarinha Love):
          fio central com marcador de coração, foto Polaroid alternando de lado a cada momento,
          legenda em Grand Hotel (cursiva) colada na própria foto, data do lado oposto.
          A moldura se ajusta à perspectiva horizontal ou vertical da foto sem cortes. */}
      {momentos.length > 0 && (
        <div style={{ background: 'linear-gradient(180deg, #160714 0%, #11050f 100%)', padding: '48px 0 54px' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 16px' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: '800', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fb7185', textAlign: 'center', margin: '0 0 4px' }}>
              ▼ LINHA DO TEMPO ▼
            </p>
            <h2 style={{ fontFamily: 'var(--font-family-gala)', fontSize: '1.85rem', fontWeight: '700', color: '#fff', textAlign: 'center', margin: '0 0 6px' }}>
              A jornada de vocês
            </h2>
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 28px', lineHeight: 1.4 }}>
              Deslize para baixo e reviva cada momento na ordem em que aconteceu.
            </p>

            <div style={{ position: 'relative' }}>
              {/* Linha vertical central */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: '50%', top: '10px', bottom: '10px', width: '2px', transform: 'translateX(-50%)',
                  background: 'linear-gradient(180deg, rgba(244,63,94,0.2), #f43f5e 12%, #f43f5e 88%, rgba(244,63,94,0.2))',
                  boxShadow: '0 0 10px rgba(244, 63, 94, 0.45)',
                }}
              />

              {momentos.map((m, i) => {
                const invertido = i % 2 === 1;
                return (
                  <div
                    key={`${m.titulo}-${i}`}
                    style={{
                      position: 'relative',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '14px',
                      alignItems: 'center',
                      marginBottom: '36px',
                    }}
                  >
                    {/* Marcador central com coração */}
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                        width: '18px', height: '18px', borderRadius: '50%', background: '#e11d48',
                        border: '2px solid #160714',
                        boxShadow: '0 0 10px rgba(225, 29, 72, 0.85)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '10px', lineHeight: 1, zIndex: 3,
                      }}
                    >
                      ♥
                    </span>

                    {/* Coluna da Foto (gridColumn: invertido ? 2 : 1) */}
                    <div
                      style={{
                        gridColumn: invertido ? 2 : 1,
                        gridRow: 1,
                        display: 'flex',
                        justifyContent: invertido ? 'flex-start' : 'flex-end',
                        padding: invertido ? '0 0 0 10px' : '0 10px 0 0',
                      }}
                    >
                      {m.fotoUrl && (
                        <div
                          style={{
                            background: '#FFFDF9',
                            padding: '7px 7px 0',
                            borderRadius: '3px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                            transform: `rotate(${invertido ? 2 : -2}deg)`,
                            maxWidth: '100%',
                            width: 'fit-content',
                          }}
                        >
                          <div
                            style={{
                              overflow: 'hidden',
                              borderRadius: '2px',
                              background: '#1a0b26',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.fotoUrl}
                              alt={m.titulo || 'Momento'}
                              loading="lazy"
                              style={{
                                display: 'block',
                                maxWidth: '100%',
                                width: 'auto',
                                height: 'auto',
                                maxHeight: '200px',
                                objectFit: 'contain',
                                borderRadius: '2px',
                              }}
                            />
                          </div>
                          <p
                            style={{
                              fontFamily: "'Grand Hotel', cursive",
                              fontSize: '1.05rem',
                              color: '#2d1b22',
                              lineHeight: 1.25,
                              textAlign: 'center',
                              padding: '6px 4px 10px',
                              margin: 0,
                              wordBreak: 'break-word',
                            }}
                          >
                            {m.titulo || 'nós dois'}
                          </p>
                        </div>
                      )}
                      {!m.fotoUrl && m.titulo && (
                        <p
                          style={{
                            fontFamily: "'Grand Hotel', cursive",
                            fontSize: '1.3rem',
                            color: '#fb7185',
                            textAlign: invertido ? 'left' : 'right',
                            margin: 0,
                          }}
                        >
                          {m.titulo}
                        </p>
                      )}
                    </div>

                    {/* Coluna da Data e Detalhes (gridColumn: invertido ? 1 : 2) */}
                    <div
                      style={{
                        gridColumn: invertido ? 1 : 2,
                        gridRow: 1,
                        textAlign: invertido ? 'right' : 'left',
                        padding: invertido ? '0 10px 0 0' : '0 0 0 10px',
                      }}
                    >
                      {m.data && (
                        <div
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: '800',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: '#f43f5e',
                            marginBottom: '4px',
                          }}
                        >
                          {formatarMesAno(m.data)}
                        </div>
                      )}
                      {m.data && (
                        <div
                          style={{
                            fontSize: '0.85rem',
                            color: '#e2e8f0',
                            lineHeight: 1.5,
                          }}
                        >
                          {formatarDataExtenso(m.data)}
                        </div>
                      )}
                      {m.texto && (
                        <div
                          style={{
                            fontSize: '0.78rem',
                            color: '#94a3b8',
                            lineHeight: 1.5,
                            marginTop: '6px',
                          }}
                        >
                          {m.texto}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Álbum de fotos — também em molduras Polaroid, mesma linha romântica da linha do tempo. */}
      {fotos.length > 0 && (
        <div style={{ position: 'relative', background: 'linear-gradient(160deg, #e9d5ff 0%, #f5d0fe 45%, #fbcfe8 100%)', padding: '44px 0 52px', overflow: 'hidden' }}>
          <CoracoesFlutuando />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '620px', margin: '0 auto', padding: '0 20px' }}>
            <h2
              style={{
                ...estilos.tituloSerif,
                fontSize: '2.2rem',
                textAlign: 'center',
                background: 'linear-gradient(100deg, #6d28d9 0%, #a21caf 55%, #db2777 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                textShadow: 'none',
              }}
            >
              Nossas fotos 📸
            </h2>
            <DivisorCoracao cor="rgba(147,51,234,0.35)" coracao="#c026d3" />
            <p style={{ textAlign: 'center', fontSize: '0.92rem', color: '#6b21a8', margin: '0 0 26px' }}>
              Alguns cliques que guardam nossos melhores momentos.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '22px 16px' }}>
              {fotos.map((url, i) => (
                <div
                  key={url}
                  style={{
                    background: '#fff',
                    padding: '10px 10px 30px',
                    borderRadius: '4px',
                    boxShadow: '0 14px 30px rgba(88, 28, 135, 0.28)',
                    transform: `rotate(${ROTACOES_POLAROID[i % ROTACOES_POLAROID.length]}deg)`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Foto ${i + 1}`}
                    loading="lazy"
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '2px', display: 'block' }}
                  />
                  <p style={{ fontFamily: "'Grand Hotel', cursive", fontSize: '1.05rem', color: '#7e22ce', textAlign: 'center', margin: '8px 0 0' }}>
                    nós dois <span style={{ color: '#f472b6' }}>♥</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Medidor de Amor — bônus fixo de toda retrospectiva, sem precisar de configuração.
          Cartão redesenhado 04/09/2026 pra acompanhar o padrão do resto da página: fundo cósmico,
          prévia das figuras do medidor, título em Cinzel e selo dourado de chamada. */}
      <div style={{ position: 'relative', background: 'radial-gradient(ellipse at 50% 0%, #3b1259 0%, #1a0a26 60%, #150a1f 100%)', padding: '46px 0 52px', overflow: 'hidden' }}>
        <CoracoesFlutuando />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '560px', margin: '0 auto', padding: '0 20px' }}>
          <button
            type="button"
            onClick={() => setMedidorAberto(true)}
            style={{
              width: '100%',
              padding: '30px 22px 26px',
              borderRadius: '22px',
              border: '1px solid rgba(232,180,74,0.28)',
              background: 'linear-gradient(165deg, rgba(88,28,135,0.55) 0%, rgba(26,10,38,0.9) 100%)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            {/* Prévia das figuras, em escala crescente — conta a história do medidor num relance. */}
            <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '10px', marginBottom: '18px' }}>
              {[
                { src: '/medidor/trex.webp', h: 26 },
                { src: '/medidor/baleia.webp', h: 38 },
                { src: '/medidor/lua.webp', h: 52 },
                { src: '/medidor/coracao.webp', h: 66 },
              ].map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={f.src}
                  src={f.src}
                  alt=""
                  style={{
                    height: `${f.h}px`, width: 'auto', objectFit: 'contain',
                    filter: f.src.includes('coracao')
                      ? 'drop-shadow(0 0 16px rgba(255,60,120,0.75))'
                      : 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))',
                  }}
                />
              ))}
            </span>

            <span style={{ display: 'block', fontFamily: 'var(--font-family-gala)', fontWeight: '700', fontSize: '1.25rem', color: '#fff', lineHeight: 1.3 }}>
              Vamos medir o tamanho<br /><span style={{ color: '#f9a8d4' }}>do nosso amor?</span>
            </span>

            <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '12px 0' }}>
              <span style={{ height: '1px', width: '54px', background: 'linear-gradient(90deg, transparent, rgba(249,168,212,0.45))' }} />
              <span style={{ color: '#f9a8d4', fontSize: '0.85rem' }}>♥</span>
              <span style={{ height: '1px', width: '54px', background: 'linear-gradient(90deg, rgba(249,168,212,0.45), transparent)' }} />
            </span>

            <span style={{ display: 'block', fontSize: '0.86rem', color: '#c4b5d4', lineHeight: 1.55, maxWidth: '22rem', margin: '0 auto 20px' }}>
              Do T-Rex ao Sol, uma coisa maior que a outra — até chegar na maior de todas.
            </span>

            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '9px',
                padding: '11px 26px', borderRadius: '999px',
                background: 'radial-gradient(ellipse at 50% 50%, rgba(232,180,74,0.2), rgba(232,180,74,0.07))',
                border: '1.5px solid rgba(232,180,74,0.55)',
                boxShadow: '0 0 24px rgba(232,180,74,0.28)',
                fontFamily: 'var(--font-family-gala)', fontWeight: '700', fontSize: '0.95rem',
                color: '#F2C97A', letterSpacing: '0.04em',
              }}
            >
              ✨ Começar a medir
            </span>
          </button>
        </div>
      </div>

      {medidorAberto && (
        <MedidorAmor
          honoreeName={honoree}
          customerName={order.customerName}
          onClose={() => setMedidorAberto(false)}
        />
      )}

      {/* Quiz */}
      {quiz.length > 0 && (
        <div style={{ maxWidth: '560px', margin: '0 auto 34px', padding: '0 20px' }}>
          <h2 style={estilos.secaoTitulo}>Quanto você lembra da gente?</h2>
          {quiz.map((q, qi) => {
            const escolhida = respostas[qi];
            const respondida = escolhida !== undefined;
            return (
              <div key={`${q.pergunta}-${qi}`} className="glass-card" style={{ padding: '16px', borderRadius: '14px', marginBottom: '12px', background: 'rgba(255,255,255,0.8)' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 10px' }}>{q.pergunta}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {q.opcoes.map((opcao, oi) => {
                    const certa = oi === q.correta;
                    const estaEscolhida = escolhida === oi;
                    let fundo = 'var(--bg-primary)';
                    let borda = '1.5px solid var(--border-color)';
                    if (respondida && certa) { fundo = '#dcfce7'; borda = '1.5px solid #16a34a'; }
                    else if (respondida && estaEscolhida) { fundo = '#fee2e2'; borda = '1.5px solid #dc2626'; }
                    return (
                      <button
                        key={opcao}
                        type="button"
                        onClick={() => !respondida && setRespostas((r) => ({ ...r, [qi]: oi }))}
                        disabled={respondida}
                        style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '10px', border: borda, background: fundo, fontSize: '0.88rem', color: 'var(--text-primary)', cursor: respondida ? 'default' : 'pointer' }}
                      >
                        {opcao}{respondida && certa ? '  ✅' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '10px 20px 50px' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Feito com 💜 no <a href="/" style={{ color: '#7e22ce', fontWeight: '600' }}>NS Music</a>
        </p>
      </div>
    </div>
  );
}

const estilos = {
  centro: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  secaoTitulo: { fontFamily: 'var(--font-family-title)', fontSize: '1.1rem', color: '#581c87', marginBottom: '14px', textAlign: 'center' },
  // Título grande em serifa com gradiente — assinatura visual do mockup aprovado (04/09/2026).
  tituloSerif: {
    fontFamily: 'var(--font-family-gala)',
    fontSize: '2.6rem',
    fontWeight: '700',
    lineHeight: 1.1,
    margin: '0 0 2px',
    background: 'linear-gradient(100deg, #c4b5fd 0%, #f0abfc 55%, #f9a8d4 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    textShadow: '0 4px 30px rgba(236,72,153,0.25)',
  },
};

export default function RetrospectivaPage() {
  return (
    <Suspense fallback={<div style={estilos.centro}><p style={{ color: 'var(--text-secondary)' }}>Carregando...</p></div>}>
      <RetrospectivaContent />
    </Suspense>
  );
}
