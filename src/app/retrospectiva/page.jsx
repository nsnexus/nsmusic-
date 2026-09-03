'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AUDIO_CACHE_VERSION } from '@/lib/audioCacheVersion';

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

function RetrospectivaContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id') || '';

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [tocando, setTocando] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  const [respostas, setRespostas] = useState({});
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
  const fotos = Array.isArray(order.slideshowImages) ? order.slideshowImages : [];
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

      {/* Linha do tempo */}
      {momentos.length > 0 && (
        <div style={{ maxWidth: '560px', margin: '0 auto 34px', padding: '0 20px' }}>
          <h2 style={estilos.secaoTitulo}>Nossa linha do tempo</h2>
          <div style={{ position: 'relative', paddingLeft: '22px', borderLeft: '2px solid rgba(126, 34, 206, 0.25)' }}>
            {momentos.map((m, i) => (
              <div key={`${m.titulo}-${i}`} style={{ position: 'relative', marginBottom: '22px' }}>
                <span style={{ position: 'absolute', left: '-29px', top: '4px', width: '14px', height: '14px', borderRadius: '50%', background: '#a855f7', border: '3px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />
                <div className="glass-card" style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255,255,255,0.8)' }}>
                  {m.data && (
                    <p style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: '700', margin: '0 0 4px' }}>{formatarDataBr(m.data)}</p>
                  )}
                  {m.titulo && (
                    <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 6px', fontFamily: 'var(--font-family-title)' }}>{m.titulo}</p>
                  )}
                  {m.texto && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{m.texto}</p>
                  )}
                  {m.fotoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.fotoUrl} alt={m.titulo || 'Momento'} style={{ width: '100%', borderRadius: '10px', marginTop: '10px', display: 'block' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Álbum de fotos */}
      {fotos.length > 0 && (
        <div style={{ maxWidth: '560px', margin: '0 auto 34px', padding: '0 20px' }}>
          <h2 style={estilos.secaoTitulo}>Nossas fotos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {fotos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`Foto ${i + 1}`}
                loading="lazy"
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
            ))}
          </div>
        </div>
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
