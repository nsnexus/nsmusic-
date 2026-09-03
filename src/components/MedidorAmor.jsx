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

function Slide({ item, proximo, ativo, honoreeName, customerName }) {
  const alvo = calcularVezesMaior(item.metros, proximo.metros);
  const valorAnimado = useContagem(alvo, ativo);
  const ehFinal = proximo.chave === 'coracao';

  // O item pequeno encolhe na proporção real (com um piso, pra nunca sumir de vez da tela).
  const razao = proximo.metros / item.metros;
  const alturaGrande = 150;
  const alturaPequeno = Math.max(28, Math.min(alturaGrande * 0.55, alturaGrande / razao));

  return (
    <div style={{ position: 'absolute', inset: 0, display: ativo ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          {proximo.nome}
        </p>
        <div style={{ fontSize: `${alturaGrande * 0.72}px`, lineHeight: 1, filter: 'drop-shadow(0 0 24px rgba(255,255,255,0.35))' }}>
          {proximo.emoji}
        </div>
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', margin: '10px 0 0' }}>{proximo.medida}</p>
        {ehFinal && (honoreeName || customerName) && (
          <p style={{ marginTop: '16px', fontFamily: 'cursive', fontSize: '1.3rem', color: '#fff' }}>
            {customerName}{customerName && honoreeName ? ' & ' : ''}{honoreeName}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: 0.85 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: `${alturaPequeno * 0.72}px`, lineHeight: 1 }}>{item.emoji}</div>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', margin: '4px 0 0' }}>{item.nome}</p>
        </div>
      </div>

      <div style={{ marginTop: '22px' }}>
        {alvo === null ? (
          <p style={{ fontSize: '1.6rem', fontWeight: '800', color: '#fff' }}>∞ <span style={{ fontSize: '0.85rem', fontWeight: '600', opacity: 0.75 }}>não dá pra medir</span></p>
        ) : (
          <p style={{ fontSize: '1.6rem', fontWeight: '800', color: '#fff' }}>
            {formatarVezes(alvo >= 100 ? Math.round(valorAnimado) : Math.round(valorAnimado * 10) / 10)}
            <span style={{ fontSize: '0.85rem', fontWeight: '600', opacity: 0.75, marginLeft: '6px' }}>vezes maior</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function MedidorAmor({ honoreeName, customerName, onClose }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
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
          />
        ))}
      </div>

      {ehUltimo && (
        <p style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', zIndex: 3 }}>
          toque pra fechar
        </p>
      )}
    </div>
  );
}
