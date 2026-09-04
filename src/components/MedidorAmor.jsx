'use client';

import { useState, useEffect, useRef } from 'react';
import { MEDIDOR_ITENS, calcularVezesMaior, formatarVezes } from '@/lib/medidorAmorData';

// "Medidor de Amor" — modo tela cheia estilo stories, comparando tamanho do T-Rex até o coração.
// Réplica do conceito de src/components/RetrospectivaAddonCard.jsx (pedido do dono do estúdio,
// projeto de referência Capivarinha Love, 03/09/2026) — mesmos dados/mesma ideia, ícones próprios.
//
// N slides = MEDIDOR_ITENS.length - 1 (compara item[k] com item[k+1]). Cada slide avança sozinho
// depois de DURACAO_MS, com barra de progresso tipo Instagram Stories; toque na metade
// esquerda/direita da tela volta/avança na hora.
const DURACAO_MS = 5200;

function useContagem(alvo, ativo) {
  const [valor, setValor] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!ativo || alvo === null) return;
    let inicio = null;
    const DURACAO_CONTAGEM = 1400;

    const passo = (agora) => {
      if (!inicio) inicio = agora;
      const p = Math.min((agora - inicio) / DURACAO_CONTAGEM, 1);
      const suavizado = 1 - Math.pow(1 - p, 3);
      setValor(alvo * suavizado);
      if (p < 1) frameRef.current = requestAnimationFrame(passo);
    };
    setValor(0);
    frameRef.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(frameRef.current);
  }, [alvo, ativo]);

  return valor;
}

// Barra de progresso individual (estilo Stories). CSS transition não anima se o elemento já nasce
// com a largura final — por isso ela nasce em 0% e só na PRÓXIMA pintura (requestAnimationFrame)
// pede 100%, o que dá ao navegador um estado "de" real pra animar a partir dele.
function ProgressoBarra({ ativo, concluido, duracaoMs }) {
  const [cheio, setCheio] = useState(false);

  useEffect(() => {
    if (!ativo) { setCheio(false); return; }
    setCheio(false);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setCheio(true)));
    return () => cancelAnimationFrame(raf);
  }, [ativo]);

  const largura = concluido ? '100%' : ativo && cheio ? '100%' : '0%';

  return (
    <div style={{ flex: 1, height: '3px', borderRadius: '3px', background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          background: '#fff',
          width: largura,
          transition: ativo ? `width ${duracaoMs}ms linear` : 'none',
        }}
      />
    </div>
  );
}

function Slide({ item, proximo, ativo, honoreeName, customerName, alturaGrande }) {
  const alvo = calcularVezesMaior(item.metros, proximo.metros);
  const valorAnimado = useContagem(alvo, ativo);
  const ehFinal = proximo.chave === 'coracao';

  // O item pequeno encolhe na proporção real (com um piso, pra nunca sumir de vez da tela) — mesma
  // fórmula do projeto de referência (`altP`). `alturaGrande` vem do componente pai, calculado a
  // partir da altura real da tela (até 320px / 38vh) — fixo em 150px ficava minúsculo demais
  // (achado/pedido 03/09/2026, segunda rodada: "olha o tamanho disso").
  const razao = proximo.metros / item.metros;
  const alturaPequeno = Math.max(24, Math.min(alturaGrande * 0.55, alturaGrande / razao));
  const larguraGrande = Math.round(alturaGrande * (proximo.proporcao || 1));
  const larguraPequena = Math.round(alturaPequeno * (item.proporcao || 1));

  return (
    // `paddingTop` reserva a faixa do cabeçalho fixo: sem ele a figura grande subia por cima da
    // pergunta, que fica ancorada no topo (achado no teste visual, 04/09/2026).
    <div style={{ position: 'absolute', inset: 0, display: ativo ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '150px 24px 60px', textAlign: 'center' }}>
      {/* Cabeçalho fixo do mockup (04/09/2026) — a pergunta acompanha todos os slides. */}
      <div style={{ position: 'absolute', top: '54px', left: 0, right: 0, padding: '0 20px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: '700', color: '#fff', margin: 0, lineHeight: 1.25 }}>
          Vamos medir<br /><span style={{ color: '#f9a8d4' }}>o tamanho do nosso amor?</span>
        </h2>
        <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '10px' }}>
          <span style={{ height: '1px', width: '54px', background: 'linear-gradient(90deg, transparent, rgba(249,168,212,0.5))' }} />
          <span style={{ color: '#f9a8d4', fontSize: '0.85rem' }}>♥</span>
          <span style={{ height: '1px', width: '54px', background: 'linear-gradient(90deg, rgba(249,168,212,0.5), transparent)' }} />
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '1rem', color: '#e9d5ff', fontWeight: '700', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 10px' }}>
          <span style={{ color: '#f9a8d4', opacity: 0.8 }}>— ♥ </span>{proximo.nome}<span style={{ color: '#f9a8d4', opacity: 0.8 }}> ♥ —</span>
        </p>
        <div
          style={{
            width: `${larguraGrande}px`,
            height: `${alturaGrande}px`,
            margin: '0 auto',
            filter: ehFinal
              ? 'drop-shadow(0 0 44px rgba(255,60,120,0.75))'
              : 'drop-shadow(0 18px 34px rgba(0,0,0,0.5)) drop-shadow(0 0 26px rgba(255,255,255,0.3))',
            animation: ativo ? 'medidorFlutua 6s ease-in-out infinite' : 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proximo.imagem} alt={proximo.nome} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        {/* Medida em serifa roxa com setas decorativas, como no mockup — a primeira parte
            (número + unidade) ganha destaque; o resto vira legenda embaixo. */}
        {(() => {
          const [destaque, ...resto] = String(proximo.medida).split(' — ');
          return (
            <>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.35rem', fontWeight: '700', color: '#d8b4fe', margin: '14px 0 0' }}>
                <span style={{ color: '#c084fc', opacity: 0.65, fontSize: '0.85rem' }}>❯❯&nbsp;&nbsp;</span>
                {destaque}
                <span style={{ color: '#c084fc', opacity: 0.65, fontSize: '0.85rem' }}>&nbsp;&nbsp;❮❮</span>
              </p>
              {resto.length > 0 && (
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '0.92rem', color: 'rgba(255,255,255,0.82)', margin: '4px auto 0', maxWidth: '20rem' }}>
                  {resto.join(' — ')}
                </p>
              )}
            </>
          );
        })()}
        {ehFinal && (honoreeName || customerName) && (
          <p style={{ marginTop: '18px', fontFamily: "'Grand Hotel', cursive", fontSize: '1.6rem', color: '#fff', textShadow: '0 0 26px rgba(255,127,171,0.7)' }}>
            {customerName}{customerName && honoreeName ? ' & ' : ''}{honoreeName}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.85, marginTop: '4px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: `${larguraPequena}px`, height: `${alturaPequeno}px`, margin: '0 auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imagem} alt={item.nome} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', margin: '6px 0 0' }}>
            <span style={{ color: '#f9a8d4', opacity: 0.7 }}>— ♥ </span>{item.nome}<span style={{ color: '#f9a8d4', opacity: 0.7 }}> ♥ —</span>
          </p>
        </div>
      </div>

      <div style={{ marginTop: '24px', position: 'relative' }}>
        <span aria-hidden="true" style={{ position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.95rem' }}>💛</span>
        {alvo === null ? (
          <span style={estilos.pill}>∞ <span style={{ fontSize: '0.85rem', fontWeight: '600', opacity: 0.8, marginLeft: '4px' }}>não dá pra medir</span></span>
        ) : (
          <span style={estilos.pill}>
            {formatarVezes(alvo >= 100 ? Math.round(valorAnimado) : Math.round(valorAnimado * 10) / 10)}
            <span style={{ fontSize: '0.9rem', fontWeight: '700', opacity: 0.9, marginLeft: '7px' }}>× maior</span>
          </span>
        )}
      </div>

      <p style={{ position: 'absolute', bottom: '30px', left: 0, right: 0, textAlign: 'center', fontFamily: "'Playfair Display', serif", fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
        👆 <span style={{ opacity: 0.7 }}>—</span> Toque para continuar <span style={{ opacity: 0.7 }}>—</span>
      </p>
    </div>
  );
}

export default function MedidorAmor({ honoreeName, customerName, onClose }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  // Altura do item grande — até 320px ou 38% da tela, igual ao projeto de referência (`ALT_G`).
  // Calculado uma vez, na abertura; não precisa reagir a resize (modal fica aberto pouco tempo).
  const [alturaGrande, setAlturaGrande] = useState(280);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 0.30 (não 0.38): o cabeçalho fixo com a pergunta passou a ocupar a faixa de cima, então a
    // figura grande precisa caber no que sobra sem empurrar o selo pra fora da tela.
    setAlturaGrande(Math.min(Math.round(window.innerHeight * 0.30), 300));
  }, []);
  const totalSlides = MEDIDOR_ITENS.length - 1;
  const ehUltimo = indice === totalSlides - 1;
  const mostraCosmos = indice >= 2; // a partir da transição pra Lua, o fundo vira espaço

  // Avanço automático — cleanup obrigatório (ver .claude/rules/frontend.md). Reinicia sempre que o
  // slide muda (navegação manual ou automática), como nos Stories reais.
  useEffect(() => {
    if (pausado) return;
    if (indice >= totalSlides) {
      onClose?.();
      return;
    }
    const t = setTimeout(() => setIndice((i) => i + 1), DURACAO_MS);
    return () => clearTimeout(t);
  }, [indice, pausado, totalSlides, onClose]);

  // Fecha com Esc — conveniência de teclado pra quem está num desktop.
  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  const irPara = (novoIndice) => {
    if (novoIndice < 0) return;
    if (novoIndice >= totalSlides) { onClose?.(); return; }
    setIndice(novoIndice);
  };

  const aoTocar = (e) => {
    const largura = e.currentTarget.clientWidth;
    const x = e.clientX;
    irPara(x < largura * 0.32 ? indice - 1 : indice + 1);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: mostraCosmos
          ? 'radial-gradient(ellipse at 50% 20%, #1e1b4b 0%, #0a0618 65%)'
          : 'radial-gradient(ellipse at 50% 20%, #451a5c 0%, #1a0b24 70%)',
        overflow: 'hidden',
        transition: 'background 1.2s ease',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Medidor de amor"
    >
      {/* Céu estrelado — só entra a partir da Lua, mesmo gatilho do projeto de referência. */}
      {mostraCosmos && (
        <div style={{ position: 'absolute', inset: 0, opacity: 0.8 }} aria-hidden="true">
          {Array.from({ length: 46 }).map((_, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${1 + Math.random() * 2}px`,
                height: `${1 + Math.random() * 2}px`,
                borderRadius: '50%',
                background: '#fff',
                opacity: 0.3 + Math.random() * 0.7,
              }}
            />
          ))}
        </div>
      )}

      {/* Barras de progresso (uma por slide), como Stories. */}
      <div style={{ position: 'absolute', top: '14px', left: '14px', right: '14px', display: 'flex', gap: '5px', zIndex: 3 }}>
        {Array.from({ length: totalSlides }).map((_, i) => (
          <ProgressoBarra key={i} ativo={i === indice} concluido={i < indice} duracaoMs={DURACAO_MS} />
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        style={{ position: 'absolute', top: '26px', right: '14px', zIndex: 3, width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '1.1rem', cursor: 'pointer' }}
      >
        ✕
      </button>

      {/* Área de toque (esquerda volta, direita avança) — cobre a tela inteira atrás dos slides. */}
      <div
        onClick={aoTocar}
        onMouseDown={() => setPausado(true)}
        onMouseUp={() => setPausado(false)}
        onTouchStart={() => setPausado(true)}
        onTouchEnd={() => setPausado(false)}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
      >
        {MEDIDOR_ITENS.slice(0, -1).map((item, i) => (
          <Slide
            key={item.chave}
            item={item}
            proximo={MEDIDOR_ITENS[i + 1]}
            ativo={i === indice}
            honoreeName={honoreeName}
            customerName={customerName}
            alturaGrande={alturaGrande}
          />
        ))}
      </div>

      {/* No último slide o rodapé do Slide já diz "Toque para continuar" — aqui a mensagem muda
          pra deixar claro que o próximo toque fecha. */}
      {ehUltimo && (
        <p style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center', fontFamily: "'Playfair Display', serif", fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', zIndex: 3 }}>
          toque pra fechar
        </p>
      )}
    </div>
  );
}

// Selo dourado "X vezes maior" — mesmo estilo do projeto de referência (`.md-vezes`).
const estilos = {
  pill: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '5px',
    padding: '0.7rem 2rem',
    borderRadius: '100px',
    background: 'radial-gradient(ellipse at 50% 50%, rgba(232,180,74,0.18), rgba(232,180,74,0.06))',
    border: '1.5px solid rgba(232, 180, 74, 0.6)',
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.9rem',
    fontWeight: '700',
    color: '#F2C97A',
    boxShadow: '0 0 26px rgba(232,180,74,0.35), inset 0 0 20px rgba(232,180,74,0.12)',
    textShadow: '0 0 18px rgba(232,180,74,0.5)',
  },
};
