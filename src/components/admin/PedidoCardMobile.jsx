'use client';

import { useState } from 'react';
import { Phone, FileText, Clock, Users, CheckCircle2, XCircle, Headphones, Music, MoreVertical, MessageCircle, Trash2, ExternalLink } from 'lucide-react';
import PlatformIcon from './PlatformIcon';
import { formatToWhatsAppNumber } from '@/lib/whatsappTemplates';
import { isUSOrder } from '@/lib/country';
import { isBonusOrder } from '@/lib/trafficSource';
import { isStripePayment } from '@/lib/paymentFees';
import { formatBrl } from '@/lib/deliveryPackages';

// Cartão de pedido para o celular (a tabela continua no PC). Só exibição: as ações chamam o painel.

function dataHora(v) {
  if (!v) return '';
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const chip = { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', fontWeight: 700, padding: '4px 9px', borderRadius: '9px', border: '1px solid', lineHeight: 1.2, whiteSpace: 'nowrap' };
const linha = { display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '0.86rem', minWidth: 0 };

function segundaMusica(o, pago) {
  if (o.secondGeneration?.hasAudio || (o.secondOrderCreated && !o.secondOrderDraft)) return { t: '2ª Música: Gerada', c: '#15803d', b: '#f0fdf4', bd: '#bbf7d0' };
  if (o.secondGeneration?.isGenerating || o.secondOrderGenerating) return { t: '2ª Música: Gerando', c: '#7e22ce', b: '#faf5ff', bd: '#e9d5ff' };
  if (o.secondGeneration?.isDraft || o.secondOrderDraft) return { t: '2ª Música: Rascunho', c: '#0369a1', b: '#f0f9ff', bd: '#bae6fd' };
  if (pago) return { t: '2ª Música: Pendente', c: '#92400e', b: '#fffbeb', bd: '#fde68a' };
  return null;
}

const PROVEDOR = {
  kie: { t: 'Kie.ai', c: '#6d28d9', b: '#f5f3ff', bd: '#ddd6fe', dot: '#7c3aed' },
  suno_local: { t: 'Robô PC', c: '#0369a1', b: '#f0f9ff', bd: '#bae6fd', dot: '#0284c7' },
  unifically: { t: 'Unifically', c: '#0f766e', b: '#f0fdfa', bd: '#99f6e4', dot: '#0d9488' },
};

export default function PedidoCardMobile({ order: o, breakdown, statusColor, clientCount = 0, selected = false, onOpen, onDelete }) {
  const [menu, setMenu] = useState(false);
  const pago = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
  const us = isUSOrder(o);
  const total = breakdown?.items?.length ? breakdown.total : 0;
  const valor = total ? (us || breakdown?.isUS ? `$ ${total.toFixed(2)}` : formatBrl(total)) : '';
  const cartao = (pago || o.paidAt) && isStripePayment(o);
  const segunda = segundaMusica(o, pago);
  const prov = PROVEDOR[o.sunoProvider];
  const status = o.productionStatus || 'PENDENTE';
  const parar = (e) => e.stopPropagation();

  return (
    <article
      className="admin-pedido-card"
      onClick={onOpen}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(); }}
      style={{
        position: 'relative',
        background: selected ? '#f1f5f9' : pago ? 'linear-gradient(180deg, #f0fdf4 0%, #f7fef9 100%)' : '#ffffff',
        border: `1px solid ${pago ? '#bbf7d0' : '#e2e8f0'}`,
        borderRadius: '18px',
        padding: '16px',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
        cursor: 'pointer',
        minWidth: 0,
        display: 'grid',
        gap: '10px',
      }}
    >
      {/* Topo: nome/telefone + selo de pagamento + menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {o.customerName || 'Cliente'}
          </div>
        </div>

        {pago ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#dcfce7', borderRadius: '999px', padding: '6px 12px', flexShrink: 0 }}>
            <CheckCircle2 size={18} color="#fff" fill="#16a34a" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#166534' }}>Pago</span>
            {valor && <span style={{ borderLeft: '1px solid #86efac', paddingLeft: '8px', fontSize: '1rem', fontWeight: 800, color: '#15803d' }}>{valor}</span>}
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fee2e2', borderRadius: '999px', padding: '6px 12px', flexShrink: 0 }}>
            <XCircle size={18} color="#fff" fill="#dc2626" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#b91c1c' }}>Não pago</span>
          </span>
        )}

        <div style={{ position: 'relative', flexShrink: 0 }} onClick={parar}>
          <button type="button" aria-label="Mais ações" aria-expanded={menu} onClick={() => setMenu((m) => !m)}
            style={{ background: 'none', border: 'none', padding: '6px 2px', cursor: 'pointer', color: '#334155' }}>
            <MoreVertical size={20} />
          </button>
          {menu && (
            <div role="menu" style={{ position: 'absolute', right: 0, top: '32px', zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(15,23,42,0.15)', padding: '6px', minWidth: '180px' }}>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onOpen?.(); }} style={itemMenu}><ExternalLink size={16} /> Abrir pedido</button>
              {o.customerPhone && (
                <a role="menuitem" href={`https://wa.me/${formatToWhatsAppNumber(o.customerPhone)}`} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} style={{ ...itemMenu, textDecoration: 'none' }}>
                  <MessageCircle size={16} /> Chamar no WhatsApp
                </a>
              )}
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onDelete?.(); }} style={{ ...itemMenu, color: '#dc2626' }}><Trash2 size={16} /> Excluir</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '-4px' }}>
        {o.customerPhone ? (
          <a href={`https://wa.me/${formatToWhatsAppNumber(o.customerPhone)}`} target="_blank" rel="noopener noreferrer" onClick={parar}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <Phone size={16} fill="#16a34a" strokeWidth={0} /> {o.customerPhone}
          </a>
        ) : <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Sem telefone</span>}
        {clientCount > 1 && (
          <span style={{ ...chip, color: '#7c3aed', background: '#f3e8ff', borderColor: '#f3e8ff', borderRadius: '999px' }}>
            <Users size={13} /> {clientCount}x cliente
          </span>
        )}
      </div>

      {/* Chips: país, origem, forma de pagamento, bônus */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {us
          ? <span style={{ ...chip, color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }}>🇺🇸 EUA</span>
          : <span style={{ ...chip, color: '#166534', background: '#f0fdf4', borderColor: '#bbf7d0' }}>🇧🇷 BR</span>}
        <span style={{ ...chip, background: '#eff6ff', borderColor: '#dbeafe', padding: '3px 7px' }}><PlatformIcon order={o} size={16} /></span>
        {(pago || o.paidAt) && (cartao
          ? <span style={{ ...chip, color: '#7c3aed', background: '#faf5ff', borderColor: '#e9d5ff' }}>💳 Cartão</span>
          : <span style={{ ...chip, color: '#0f766e', background: '#f8fafc', borderColor: '#e2e8f0' }}><span style={{ color: '#14b8a6' }}>❖</span> PIX</span>)}
        {isBonusOrder(o) && <span style={{ ...chip, color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' }}>🎁 Bônus</span>}
      </div>

      {/* Código e datas */}
      <div style={{ ...linha, color: '#0f172a', fontWeight: 700, fontSize: '0.95rem' }}>
        <FileText size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.orderNumber || String(o.id).slice(0, 8)}</span>
      </div>
      <div style={{ ...linha, flexWrap: 'wrap', fontSize: '0.8rem', gap: '6px', rowGap: '4px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }} title="Criou a música">
          <Clock size={16} color="#64748b" /> {dataHora(o.createdAt) || '—'}
        </span>
        {o.paidAt && (
          <>
            <span style={{ width: '1px', height: '18px', background: '#cbd5e1' }} aria-hidden="true" />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#15803d', whiteSpace: 'nowrap' }} title="Pagou">
              <span aria-hidden="true">💰</span> {dataHora(o.paidAt)}
            </span>
          </>
        )}
      </div>

      {/* Produção */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ ...chip, color: statusColor || '#475569', background: '#f8fafc', borderColor: '#e2e8f0' }}>
          <Headphones size={15} /> {status}
        </span>
        {segunda && <span style={{ ...chip, color: segunda.c, background: segunda.b, borderColor: segunda.bd }}><Music size={14} /> {segunda.t}</span>}
        {prov && (
          <span style={{ ...chip, color: prov.c, background: prov.b, borderColor: prov.bd }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: prov.dot }} aria-hidden="true" /> {prov.t}
          </span>
        )}
      </div>
    </article>
  );
}

const itemMenu = { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', background: 'none', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', cursor: 'pointer', textAlign: 'left' };
