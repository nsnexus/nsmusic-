'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { buildAudioProxySrc } from '@/lib/audioProxy';

// Página PÚBLICA da Carta Virtual (add-on, ver src/lib/pricing.js:carta_addon) — link próprio que o
// cliente compartilha com o homenageado, separado da página da música/vídeo (/homenagem) e da
// Retrospectiva (/retrospectiva). Pedido 04/09/2026: antes a carta só aparecia embutida dentro de
// /homenagem, sem link/experiência própria, e sem música nenhuma tocando.
//
// Sem segmento dinâmico ([id]) — usa `?orderId=` em query string, então não precisa de
// `export const runtime = 'edge'` (ver .claude/rules/frontend.md).
//
// SEGURANÇA: só exibe quando o add-on está pago (hasCartaAccess/cartaAddonPaid). Conteúdo é público
// por natureza (é pra ser compartilhado), mas nunca expõe dado de pagamento nem contato do cliente.

function CartaContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || searchParams.get('id') || '';

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(false);
  const [tocando, setTocando] = useState(false);
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
          setErro('Carta não encontrada.');
        } else {
          const data = snap.data();
          if (!data.hasCartaAccess && !data.cartaAddonPaid) {
            setErro('Esta carta ainda não foi liberada.');
          } else if (!data.cartaTexto) {
            setErro('Esta carta ainda está sendo escrita — volte em instantes.');
          } else {
            setOrder(data);
          }
        }
      } catch (e) {
        console.error('Erro ao carregar carta:', e);
        if (ativo) setErro('Não foi possível carregar agora.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [orderId]);

  if (loading) {
    return <div style={estilos.centro}><p style={{ color: 'var(--text-secondary)' }}>Carregando...</p></div>;
  }

  if (erro || !order) {
    return (
      <div style={estilos.centro}>
        <div className="glass-card" style={{ padding: '28px', borderRadius: '16px', maxWidth: '420px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{erro || 'Carta não encontrada.'}</p>
        </div>
      </div>
    );
  }

  const honoree = order.honoreeName || '';
  const remetente = order.customerName || '';
  const texto = order.cartaTexto || '';

  // Faixa escolhida no editor (ver CartaAddonCard) — sem escolha salva, cai na faixa 0.
  const audioSrc = buildAudioProxySrc(order.cartaMusicaUrl || order.audioFiles?.[0] || order.audioUrl || '');

  // Um único toque abre o envelope E já dispara a música — navegador de celular exige gesto do
  // usuário pra tocar áudio, então isso é o mais perto de "abre e já toca sozinho" que dá pra
  // fazer sem o navegador bloquear (achado já documentado em /retrospectiva).
  const abrirCarta = () => {
    setAberta(true);
    const el = audioRef.current;
    if (el) {
      el.play().then(() => setTocando(true)).catch(() => setTocando(false));
    }
  };

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

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fffdf7 0%, #fdf2f8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      {audioSrc && <audio ref={audioRef} src={audioSrc} loop onEnded={() => setTocando(false)} />}

      {!aberta ? (
        <button
          type="button"
          onClick={abrirCarta}
          style={{
            width: '100%',
            maxWidth: '360px',
            background: 'linear-gradient(160deg, #fdf2f8 0%, #fce7f3 100%)',
            border: '1.5px solid rgba(236, 72, 153, 0.35)',
            borderRadius: '20px',
            padding: '48px 24px',
            cursor: 'pointer',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(157, 23, 77, 0.18)',
          }}
          aria-label="Abrir a carta"
        >
          <div style={{ fontSize: '3.4rem', lineHeight: 1 }}>✉️</div>
          <div
            style={{
              width: '46px',
              height: '46px',
              margin: '-23px auto 0',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #f472b6, #9d174d)',
              boxShadow: '0 3px 10px rgba(157, 23, 77, 0.5), inset 0 1px 2px rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 1,
            }}
            aria-hidden="true"
          >
            <span style={{ fontSize: '1.15rem', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>💗</span>
          </div>
          <div style={{ marginTop: '18px', fontFamily: 'var(--font-family-title)', fontSize: '1.15rem', color: '#9d174d' }}>
            {honoree ? `Uma carta para ${honoree}` : 'Sua carta chegou'}
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#be185d' }}>toque no lacre para abrir</div>
        </button>
      ) : (
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <div
            style={{
              background: '#fffdf7',
              border: '1px solid #f1e6cf',
              borderRadius: '20px',
              padding: '32px 26px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.12), inset 0 0 40px rgba(180, 150, 90, 0.08)',
            }}
          >
            {order.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.coverUrl}
                alt={honoree ? `Foto de ${honoree}` : 'Foto da homenagem'}
                style={{ width: '120px', height: '120px', objectFit: 'cover', float: 'right', marginLeft: '16px', marginBottom: '12px', border: '6px solid #fff', boxShadow: '0 6px 16px rgba(0,0,0,0.2)', transform: 'rotate(3deg)', borderRadius: '2px' }}
              />
            )}
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '1rem', lineHeight: '1.9', color: '#3f3a2f', margin: 0 }}>
              {texto}
            </p>
            {remetente && (
              <p style={{ clear: 'both', marginTop: '22px', textAlign: 'right', fontFamily: 'cursive', fontSize: '1.35rem', color: '#8a6d3b' }}>
                {remetente}
              </p>
            )}
          </div>

          {audioSrc && (
            <div style={{ textAlign: 'center', marginTop: '18px' }}>
              <button type="button" onClick={togglePlay} className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: '0.82rem', cursor: 'pointer' }}>
                {tocando ? '⏸ Pausar a música' : '▶️ Tocar a música'}
              </button>
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Feito com 💜 no <a href="/" style={{ color: '#9d174d', fontWeight: '600' }}>NS Music</a>
          </p>
        </div>
      )}
    </div>
  );
}

const estilos = {
  centro: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'linear-gradient(180deg, #fffdf7 0%, #fdf2f8 100%)' },
};

export default function CartaPage() {
  return (
    <Suspense fallback={<div style={estilos.centro}><p style={{ color: 'var(--text-secondary)' }}>Carregando...</p></div>}>
      <CartaContent />
    </Suspense>
  );
}
