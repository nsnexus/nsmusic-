import ChatSuporte from '@/components/suporte/ChatSuporte';

// /suporte: chat de suporte com cara de WhatsApp (ideia do dono do estúdio, 25/11/2026). Antes este
// endereço só redirecionava para o WhatsApp — esse redirect continua em /suporte/whatsapp.
//
// Aceita ?pedido=<id do pedido> (também ?id= e ?orderId=). Número "NS-…" não identifica sozinho
// (é adivinhável): nesse caso o chat pede o WhatsApp do cliente.

// Lê searchParams no servidor → rota dinâmica → precisa do Edge no build da Cloudflare.
export const runtime = 'edge';

export const metadata = {
  title: 'Suporte | NS Music',
  description: 'Fale com o suporte da NS Music: baixe sua música, ajuste a letra ou o ritmo e resolva o pagamento.',
  robots: { index: false, follow: false },
};

export default function SuportePage({ searchParams }) {
  const bruto = searchParams?.pedido || searchParams?.id || searchParams?.orderId || '';
  const pedido = Array.isArray(bruto) ? bruto[0] : String(bruto || '');
  return <ChatSuporte pedidoInicial={pedido.slice(0, 64)} />;
}
