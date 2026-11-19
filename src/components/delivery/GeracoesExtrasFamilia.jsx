'use client';

import Link from 'next/link';
import { totalGeracoesExtras, pedidosQueUsaram } from '@/lib/geracoesExtrasRegras';

// Saldo das gerações extras do Pacote Família na página de entrega. Cada geração extra é um pedido
// novo, feito em /criar com o MESMO WhatsApp do pacote: na hora de gerar, o servidor reconhece o
// pacote e a música já sai liberada (src/lib/geracoesExtras.js).
export default function GeracoesExtrasFamilia({ order }) {
  const total = totalGeracoesExtras(order);
  if (total === 0) return null;
  const usadas = Math.min(pedidosQueUsaram(order).length, total);
  const restantes = total - usadas;

  return (
    <section
      aria-label="Gerações extras do Pacote Família"
      style={{ margin: '18px 0', padding: '18px', borderRadius: '18px', background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)', border: '1.5px solid #fbbf24', color: '#422006' }}
    >
      <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b45309' }}>
        👨‍👩‍👧 Pacote Família
      </p>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800 }}>
        {restantes > 0 ? `Você ainda tem ${restantes} ${restantes === 1 ? 'música extra' : 'músicas extras'} para criar` : 'Você já usou todas as suas músicas extras'}
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: '0.88rem', lineHeight: 1.45 }}>
        {usadas} de {total} usadas. Cada uma é uma música nova, com outra letra e outro estilo, para quem você quiser.
        {restantes > 0 && <> Use o <strong>mesmo WhatsApp</strong> deste pedido: a música sai liberada, sem pagar de novo.</>}
      </p>
      {restantes > 0 && (
        <Link
          href="/criar?reset=1"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '46px', padding: '10px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff', fontWeight: 800, textDecoration: 'none' }}
        >
          Criar nova música →
        </Link>
      )}
    </section>
  );
}
