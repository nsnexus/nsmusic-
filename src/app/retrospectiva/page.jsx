'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';
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

  const audioBruto = order.audioFiles?.[0] || order.audioUrl || '';
  const audioSrc = audioBruto
    ? (audioBruto.startsWith('/api/') ? audioBruto : `/api/audio/proxy?url=${encodeURIComponent(audioBruto)}&v=${AUDIO_CACHE_VERSION}`)
    : '';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #faf5ff 0%, #fff1f2 100%)' }}>
      {/* Capa */}
      <div style={{ padding: '56px 20px 36px', textAlign: 'center' }}>
        {order.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={order.coverUrl}
            alt={honoree ? `Foto de ${honoree}` : 'Foto da homenagem'}
            style={{ width: '128px', height: '128px', objectFit: 'cover', borderRadius: '50%', border: '5px solid #fff', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', marginBottom: '18px' }}
          />
        )}
        <h1 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.75rem', color: '#581c87', margin: '0 0 10px', lineHeight: 1.25 }}>
          {titulo}
        </h1>

        {audioSrc && (
          <>
            {/* Tocar exige um toque do usuário: navegador de celular bloqueia áudio automático. */}
            <audio ref={audioRef} src={audioSrc} loop onEnded={() => setTocando(false)} />
            <button
              type="button"
              onClick={togglePlay}
              className="btn btn-primary"
              style={{ marginTop: '8px', padding: '12px 24px', borderRadius: '999px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {tocando ? '⏸ Pausar a música' : '▶️ Tocar nossa música'}
            </button>
          </>
        )}
      </div>

      {/* Contador ao vivo */}
      {contador && (
        <div style={{ maxWidth: '560px', margin: '0 auto 34px', padding: '0 20px' }}>
          <div className="glass-card" style={{ padding: '22px', borderRadius: '16px', textAlign: 'center', background: 'rgba(255,255,255,0.75)' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {retro.contadorLabel || 'Juntos há'}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: '800', color: '#7e22ce', margin: 0, fontFamily: 'var(--font-family-title)' }}>
              {contador.anos > 0 && `${contador.anos} ${contador.anos === 1 ? 'ano' : 'anos'}, `}
              {contador.meses} {contador.meses === 1 ? 'mês' : 'meses'} e {contador.dias} {contador.dias === 1 ? 'dia' : 'dias'}
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
              {String(agora.getHours()).padStart(2, '0')}:{String(agora.getMinutes()).padStart(2, '0')}:{String(agora.getSeconds()).padStart(2, '0')} — e contando 💜
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>
              desde {formatarDataBr(retro.dataInicio)}
            </p>
          </div>
        </div>
      )}

      {/* Linha do tempo — réplica fiel do projeto de referência (Capivarinha Love, projeto do próprio
          dono do estúdio, autorizado a reusar o design direto, 03/09/2026): fio central com marcador
          de coração, foto Polaroid alternando de lado a cada momento, legenda em Grand Hotel (cursiva)
          colada na própria foto, data em caixa alta do lado oposto. Seção com fundo escuro próprio
          (igual ao original) — contraste de propósito com o resto da página, que é clara. */}
      {momentos.length > 0 && (
        <div style={{ background: '#120A0F', padding: '40px 0 44px', margin: '0 0 34px' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 20px' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FF7FAB', textAlign: 'center', margin: '0 0 6px' }}>
              Linha do tempo
            </p>
            <h2 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.3rem', color: '#fff', textAlign: 'center', margin: '0 0 34px' }}>
              A jornada de vocês
            </h2>
            <div style={{ position: 'relative' }}>
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', transform: 'translateX(-50%)',
                  background: 'linear-gradient(180deg, rgba(227,43,109,0.15), #E32B6D 12%, #E32B6D 88%, rgba(227,43,109,0.15))',
                }}
              />
              {momentos.map((m, i) => {
                const invertido = i % 2 === 1;
                return (
                  <div key={`${m.titulo}-${i}`} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center', marginBottom: '30px' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                        width: '17px', height: '17px', borderRadius: '50%', background: '#E32B6D', border: '3px solid #120A0F',
                        boxShadow: '0 0 0 4px rgba(227,43,109,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '9px', lineHeight: 1, zIndex: 3,
                      }}
                    >
                      ♥
                    </span>

                    <div style={{ gridColumn: invertido ? 2 : 1, gridRow: 1 }}>
                      {m.fotoUrl && (
                        <div style={{ background: '#FFFDF9', padding: '9px 9px 0', borderRadius: '3px', boxShadow: '0 12px 30px rgba(0,0,0,0.45)', transform: `rotate(${invertido ? 2.2 : -2.2}deg)` }}>
                          <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#EDE3E6' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={m.fotoUrl} alt={m.titulo || 'Momento'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          </div>
                          <p style={{ fontFamily: "'Grand Hotel', cursive", fontSize: '1rem', color: '#4A3A40', lineHeight: 1.25, textAlign: 'center', padding: '8px 5px 11px', minHeight: '2.4em', margin: 0 }}>
                            {m.titulo || 'nós dois'}
                          </p>
                        </div>
                      )}
                      {!m.fotoUrl && m.titulo && (
                        <p style={{ fontFamily: "'Grand Hotel', cursive", fontSize: '1.4rem', color: '#FF7FAB', textAlign: invertido ? 'left' : 'right', margin: 0 }}>
                          {m.titulo}
                        </p>
                      )}
                    </div>

                    <div style={{ gridColumn: invertido ? 1 : 2, gridRow: 1, textAlign: invertido ? 'right' : 'left' }}>
                      {m.data && (
                        <div style={{ fontSize: '0.74rem', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E32B6D', marginBottom: '6px' }}>
                          {formatarMesAno(m.data)}
                        </div>
                      )}
                      {m.data && (
                        <div style={{ fontSize: '0.93rem', color: '#E6D6DD', lineHeight: 1.6 }}>{formatarDataExtenso(m.data)}</div>
                      )}
                      {m.texto && (
                        <div style={{ fontSize: '0.82rem', color: '#B99BA8', lineHeight: 1.6, marginTop: '8px' }}>{m.texto}</div>
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
        <div style={{ maxWidth: '560px', margin: '0 auto 34px', padding: '0 20px' }}>
          <h2 style={estilos.secaoTitulo}>Nossas fotos 📸</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '18px 14px' }}>
            {fotos.map((url, i) => (
              <div
                key={url}
                style={{
                  background: '#fff',
                  padding: '8px 8px 22px',
                  borderRadius: '3px',
                  boxShadow: '0 8px 18px rgba(131, 24, 67, 0.2)',
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medidor de Amor — bônus fixo de toda retrospectiva, sem precisar de configuração
          (réplica do conceito do projeto de referência). Cartão escuro/rosa igual ao resto da
          página desde o ajuste 03/09/2026 — antes ficava lilás claro, destoando da timeline. */}
      <div style={{ background: '#120A0F', padding: '30px 0' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 20px' }}>
          <button
            type="button"
            onClick={() => setMedidorAberto(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '18px',
              borderRadius: '18px',
              border: '1px solid rgba(255,255,255,0.09)',
              background: 'linear-gradient(160deg, #2A1620, #1A0D14)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '42px', height: '42px', borderRadius: '50%', background: '#E32B6D', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: '#fff',
                boxShadow: '0 0 0 4px rgba(227,43,109,0.18)',
              }}
            >
              ♥
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: '700', fontSize: '1rem', color: '#fff', fontFamily: 'var(--font-family-title)' }}>
                Vamos medir o tamanho do nosso amor?
              </span>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#C6A9B6', marginTop: '3px', lineHeight: 1.5 }}>
                Do T-Rex ao Sol, uma coisa maior que a outra — até chegar na maior de todas
              </span>
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
};

export default function RetrospectivaPage() {
  return (
    <Suspense fallback={<div style={estilos.centro}><p style={{ color: 'var(--text-secondary)' }}>Carregando...</p></div>}>
      <RetrospectivaContent />
    </Suspense>
  );
}
