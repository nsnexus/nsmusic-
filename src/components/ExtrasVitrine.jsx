'use client';

import { getPriceForSku } from '@/lib/pricing';

// Vitrine dos extras exibida ao lado/abaixo do PIX da MÚSICA, enquanto o cliente ainda não pagou.
//
// DE PROPÓSITO NÃO TEM BOTÃO DE COMPRA (pedido de aproveitar o espaço vazio, 03/09/2026): todos os
// extras são pós-pagamento e, pela regra C-09, add-on isolado NUNCA aprova a música. Um botão aqui
// deixaria o cliente pagar a carta e continuar sem a música que ele veio buscar — o pior resultado
// possível pra ele e pro suporte. Aqui a função é criar desejo enquanto ele decide o pagamento
// principal; a compra acontece nos cards próprios, depois da música liberada.
//
// Preços sempre do catálogo do servidor (getPriceForSku), nunca escritos à mão.
const EXTRAS = [
  { sku: 'video_addon', icone: '🎬', titulo: 'Vídeo Homenagem', desc: 'Suas fotos sincronizadas com a música.' },
  { sku: 'retrospectiva_addon', icone: '📖', titulo: 'Retrospectiva', desc: 'Uma página só de vocês, com a música tocando, linha do tempo e contador ao vivo.' },
  { sku: 'carta_addon', icone: '💌', titulo: 'Carta Virtual', desc: 'Escrita a partir da mesma história, com envelope e assinatura.' },
  { sku: 'playback_addon', icone: '🎧', titulo: 'Playback', desc: 'A versão instrumental, sem voz, pra cantar junto.' },
];

export default function ExtrasVitrine() {
  return (
    <div
      className="glass-card"
      style={{
        padding: '20px',
        borderRadius: '16px',
        marginTop: '16px',
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, rgba(236, 72, 153, 0.06) 100%)',
        border: '1.5px solid rgba(168, 85, 247, 0.2)',
      }}
    >
      <p style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 4px', textAlign: 'center' }}>
        Depois de liberar sua música, você ainda pode:
      </p>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 14px', textAlign: 'center' }}>
        Todos usam a mesma história que você já contou.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {EXTRAS.map((extra) => {
          const preco = getPriceForSku(extra.sku);
          return (
            <div key={extra.sku} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
              <span style={{ fontSize: '1.3rem', lineHeight: 1.1 }}>{extra.icone}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.86rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  {extra.titulo}
                  {preco !== null && (
                    <span style={{ marginLeft: '6px', fontWeight: '700', color: 'var(--success)', fontSize: '0.82rem' }}>
                      R$ {preco.toFixed(2).replace('.', ',')}
                    </span>
                  )}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>
                  {extra.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '14px 0 0', textAlign: 'center', lineHeight: 1.4 }}>
        Aparecem aqui nesta página assim que o pagamento da música for confirmado.
      </p>
    </div>
  );
}
