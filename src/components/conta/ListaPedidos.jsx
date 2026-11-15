'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Film, Mail, Images, Music, Mic2, AudioLines, LayoutGrid, List, ChevronRight } from 'lucide-react';

const EXTRAS = [
  { key: 'video', Icone: Film, nome: 'Vídeo' },
  { key: 'carta', Icone: Mail, nome: 'Carta' },
  { key: 'retrospectiva', Icone: Images, nome: 'Retrospectiva' },
  { key: 'voz', Icone: AudioLines, nome: 'Minha voz' },
  { key: 'karaoke', Icone: Mic2, nome: 'Karaokê' },
  { key: 'playback', Icone: Music, nome: 'Playback' },
];
const CAPA_PADRAO = '/experiencia/familia.webp';

function formatarData(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function statusDoPedido(order) {
  if (['PAGO', 'PAGAMENTO_APROVADO'].includes(order.paymentStatus)) return { pago: true, texto: 'Pago', cor: '#047857', fundo: '#ecfdf5' };
  return { pago: false, texto: 'Aguardando pagamento', cor: '#b45309', fundo: '#fffbeb' };
}

function Capa({ src, tamanho }) {
  return (
    <Image
      src={src || CAPA_PADRAO}
      alt=""
      width={tamanho}
      height={tamanho}
      unoptimized={Boolean(src)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onError={(e) => { if (!e.currentTarget.src.endsWith(CAPA_PADRAO)) e.currentTarget.src = CAPA_PADRAO; }}
    />
  );
}

function IconesExtras({ extras }) {
  const lista = EXTRAS.filter((x) => extras?.[x.key]);
  if (lista.length === 0) return null;
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {lista.map(({ key, Icone, nome }) => (
        <span key={key} title={nome} aria-label={nome} style={{ display: 'inline-flex', width: '22px', height: '22px', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: '#f3effb', color: '#6d28d9' }}>
          <Icone size={13} aria-hidden="true" />
        </span>
      ))}
    </span>
  );
}

function Selo({ status }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, color: status.cor, background: status.fundo, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.cor }} />
      {status.texto}
    </span>
  );
}

const CHAVE_MODO = 'nsm_conta_modo';

export default function ListaPedidos({ orders }) {
  const [modo, setModo] = useState('cards');

  useEffect(() => {
    try { const salvo = window.localStorage.getItem(CHAVE_MODO); if (salvo === 'lista' || salvo === 'cards') setModo(salvo); } catch {}
  }, []);

  const trocar = (novo) => {
    setModo(novo);
    try { window.localStorage.setItem(CHAVE_MODO, novo); } catch {}
  };

  const botaoModo = (valor, Icone, rotulo) => (
    <button
      type="button"
      onClick={() => trocar(valor)}
      aria-pressed={modo === valor}
      aria-label={rotulo}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '32px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: modo === valor ? '#ffffff' : 'transparent', color: modo === valor ? '#6d28d9' : '#6c636f', boxShadow: modo === valor ? '0 1px 3px rgba(31,26,36,0.12)' : 'none' }}
    >
      <Icone size={17} aria-hidden="true" />
    </button>
  );

  if (!orders?.length) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px' }}>
        <span style={{ fontSize: '0.82rem', color: '#6c636f' }}>{orders.length} {orders.length === 1 ? 'música' : 'músicas'}</span>
        <div role="group" aria-label="Modo de visualização" style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1eef5' }}>
          {botaoModo('cards', LayoutGrid, 'Ver em cards')}
          {botaoModo('lista', List, 'Ver em lista')}
        </div>
      </div>

      {modo === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
          {orders.map((order) => {
            const status = statusDoPedido(order);
            return (
              <article key={order.id} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: '16px', overflow: 'hidden', background: '#ffffff', border: '1px solid #e7e2ef', boxShadow: '0 1px 2px rgba(31,26,36,0.04)' }}>
                <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#f1f5f9' }}>
                  <Capa src={order.coverUrl} tamanho={320} />
                  <span style={{ position: 'absolute', left: '6px', top: '6px' }}><Selo status={status} /></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', flex: 1 }}>
                  <strong style={{ fontSize: '0.92rem', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Para {order.honoreeName || 'alguém especial'}
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: '#6c636f' }}>{formatarData(order.createdAt)}</span>
                  <IconesExtras extras={order.extras} />
                  <Link
                    href={`/entrega?orderId=${encodeURIComponent(order.id)}`}
                    style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '38px', borderRadius: '10px', background: status.pago ? '#6d28d9' : '#ffffff', color: status.pago ? '#ffffff' : '#6d28d9', border: '1.5px solid #6d28d9', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}
                  >
                    {status.pago ? 'Abrir' : 'Ver prévia'}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderRadius: '16px', overflow: 'hidden', background: '#ffffff', border: '1px solid #e7e2ef' }}>
          {orders.map((order, i) => {
            const status = statusDoPedido(order);
            return (
              <li key={order.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f0edf4' }}>
                <Link
                  href={`/entrega?orderId=${encodeURIComponent(order.id)}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', color: '#1f1a24', textDecoration: 'none' }}
                >
                  <span style={{ flexShrink: 0, width: '52px', height: '52px', borderRadius: '10px', overflow: 'hidden', background: '#f1f5f9' }}>
                    <Capa src={order.coverUrl} tamanho={104} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Para {order.honoreeName || 'alguém especial'}
                    </strong>
                    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                      <Selo status={status} />
                      <span style={{ fontSize: '0.72rem', color: '#6c636f' }}>{formatarData(order.createdAt)}</span>
                    </span>
                    <IconesExtras extras={order.extras} />
                  </span>
                  <ChevronRight size={18} aria-hidden="true" style={{ flexShrink: 0, color: '#a39cab' }} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
