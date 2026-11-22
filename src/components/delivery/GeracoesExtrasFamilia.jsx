'use client';

import Link from 'next/link';
import { CHAVE_WHATSAPP_PACOTE_FAMILIA, totalGeracoesExtras, pedidosQueUsaram } from '@/lib/geracoesExtrasRegras';
import { GERACOES_INCLUIDAS_POR_COMPRA } from '@/lib/pricing';

// Saldo das gerações extras do Pacote Família na página de entrega. Cada geração extra é um pedido
// novo, feito em /criar com o MESMO WhatsApp do pacote: na hora de gerar, o servidor reconhece o
// pacote e a música já sai liberada (src/lib/geracoesExtras.js).
export default function GeracoesExtrasFamilia({ order }) {
  const total = totalGeracoesExtras(order);
  if (total === 0) return null;
  const usadas = Math.min(pedidosQueUsaram(order).length, total);
  const restantes = total - usadas;
  const totalGeracoesPacote = GERACOES_INCLUIDAS_POR_COMPRA + total;

  return (
    <section
      aria-label="Gerações extras do Pacote Família"
      style={{ margin: '18px 0', padding: '18px', borderRadius: '18px', background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)', border: '1.5px solid #fbbf24', color: '#422006' }}
    >
      <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b45309' }}>
        👨‍👩‍👧 Pacote Família
      </p>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 900 }}>
        {totalGeracoesPacote} gerações no total
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: '0.86rem', fontWeight: 700, lineHeight: 1.4 }}>
        {GERACOES_INCLUIDAS_POR_COMPRA} gerações incluídas + {total} gerações extras para novas homenagens.
      </p>
      <p style={{ margin: '0 0 12px', fontSize: '0.88rem', lineHeight: 1.45 }}>
        {restantes > 0 ? `Você ainda pode criar ${restantes} ${restantes === 1 ? 'geração extra' : 'gerações extras'}.` : 'Você já usou todas as gerações extras.'}
        {' '}{usadas} de {total} extras utilizadas. Cada geração permite uma música nova, com outra letra e outro estilo, para quem você quiser.
        {restantes > 0 && <> Use o <strong>mesmo WhatsApp</strong> deste pedido: a música sai liberada, sem pagar de novo.</>}
      </p>
      {restantes > 0 && (
        <Link
          href={`/criar?reset=1&origem=familia&familiaRef=${encodeURIComponent(order.id)}`}
          onClick={() => {
            if (order.customerPhone) {
              try {
                sessionStorage.setItem(CHAVE_WHATSAPP_PACOTE_FAMILIA + order.id, order.customerPhone);
              } catch {
                // Se o navegador bloquear o armazenamento, o formulário pede o WhatsApp.
              }
            }
          }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '46px', padding: '10px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff', fontWeight: 800, textDecoration: 'none' }}
        >
          Criar nova música →
        </Link>
      )}
    </section>
  );
}
