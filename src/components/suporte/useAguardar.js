'use client';

import { useEffect } from 'react';

// Acompanha o que o chat de suporte está esperando: o Pix cair (do pedido ou de um ajuste, pelo
// mesmo /api/payments/status do checkout) e a música ficar pronta (nova versão de um ajuste pago
// ou música nova criada no chat). Tem limite de tentativas e limpa os timers ao sair.

const INTERVALO_PAGAMENTO_MS = 5000;
const TENTATIVAS_PAGAMENTO = 72; // 6 minutos
const INTERVALO_MUSICA_MS = 10000;
const TENTATIVAS_MUSICA = 48; // 8 minutos

export function useAguardar({ aguardar, setAguardar, orderId, chamar, mostrarRespostas, historico }) {
  useEffect(() => {
    if (!aguardar || !orderId) return undefined;
    let ativo = true;
    let tentativas = 0;
    let timer = null;

    const passo = async () => {
      if (!ativo) return;
      tentativas++;
      try {
        if (aguardar.tipo === 'pagamento') {
          const qs = new URLSearchParams({ orderId });
          if (aguardar.txid) qs.set('paymentId', aguardar.txid);
          const r = await fetch(`/api/payments/status?${qs}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => ({}));
          if (!ativo) return;
          if (r.status === 'approved') {
            setAguardar(null);
            historico.marcar(aguardar.kind === 'ajuste' ? 'ajuste_pago' : 'pedido_pago');
            chamar(aguardar.kind === 'ajuste' ? { acao: 'ajuste_pago', txid: aguardar.txid } : { acao: 'pago' });
            return;
          }
          if (tentativas >= TENTATIVAS_PAGAMENTO) {
            setAguardar(null);
            mostrarRespostas([{ tipo: 'texto', texto: 'Ainda não vi o pagamento cair. Se você já pagou, toca em "Já paguei" que eu confiro de novo no banco.', opcoes: [{ id: aguardar.kind === 'ajuste' ? 'menu' : 'ja_paguei', label: aguardar.kind === 'ajuste' ? 'Voltar ao menu' : 'Já paguei' }, { id: 'humano', label: 'Falar com atendente' }] }]);
            return;
          }
          timer = setTimeout(passo, INTERVALO_PAGAMENTO_MS);
        } else if (aguardar.tipo === 'musica' || aguardar.tipo === 'musica_nova') {
          const corpo = aguardar.tipo === 'musica' ? { acao: 'nova_versao', orderId, assinatura: aguardar.assinatura } : { acao: 'musica_pronta', orderId };
          const res = await fetch('/api/suporte/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
          const r = await res.json().catch(() => ({}));
          if (!ativo) return;
          if (r.pronto) {
            setAguardar(null);
            mostrarRespostas(r.mensagens || []);
            return;
          }
          if (tentativas >= TENTATIVAS_MUSICA) {
            setAguardar(null);
            mostrarRespostas([
              { tipo: 'texto', texto: 'Está demorando um pouquinho mais que o normal. Assim que ficar pronta, ela aparece na página da sua música:' },
              { tipo: 'link', url: `/entrega?orderId=${encodeURIComponent(orderId)}`, titulo: 'Abrir a página da minha música' },
            ]);
            return;
          }
          timer = setTimeout(passo, INTERVALO_MUSICA_MS);
        }
      } catch (_) {
        if (ativo) timer = setTimeout(passo, INTERVALO_PAGAMENTO_MS * 2);
      }
    };
    timer = setTimeout(passo, aguardar.tipo === 'musica' ? INTERVALO_MUSICA_MS : INTERVALO_PAGAMENTO_MS);
    return () => { ativo = false; clearTimeout(timer); };
  }, [aguardar, setAguardar, orderId, chamar, mostrarRespostas, historico]);
}
