import { NextResponse } from 'next/server';
import { generateStaticPixPayload } from '@/lib/pixStatic';

export const runtime = 'edge';

// Gera um PIX estático (copia-e-cola) pra página de apoio/gorjeta (/apoie) — mesma função usada
// como fallback paliativo no checkout normal (src/lib/pixStatic.js), sem nenhuma dependência da
// Efí: é a própria chave PIX do dono do estúdio, sem txid real embutido no QR (ver comentário em
// generateStaticPixPayload). Por não ser uma cobrança na Efí, não há como confirmar
// automaticamente o pagamento — a página só mostra o QR/copia-e-cola, sem polling de status.
//
// Valor SEMPRE vem do corpo da requisição aqui (ao contrário de /api/payments/create): não é
// preço de produto derivado de catálogo, é o valor que a pessoa quer doar — não faz sentido travar
// num SKU fixo. Só valida limites razoáveis pra não gerar um payload absurdo por erro de digitação.
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 5000;

// Chave própria pra essa página — diferente da chave (telefone) usada no checkout normal, a pedido
// do dono do estúdio. Mesmo titular/cidade das duas chaves (ver comentário em pixStatic.js).
const SUPPORT_PIX_KEY = 'nsnexustech@gmail.com';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    // /pagar sem orderId (música feita fora da plataforma, pedido do dono do estúdio 02/09/2026)
    // usa a MESMA rota mas com a chave PRINCIPAL do estúdio (telefone, a de pixStatic.js), não a
    // de doação de /apoie — é venda de produto de verdade, não gorjeta avulsa.
    const useMainKey = Boolean(body?.useMainKey);

    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `Valor inválido. Use um valor entre R$ ${MIN_AMOUNT} e R$ ${MAX_AMOUNT}.` },
        { status: 400 }
      );
    }

    // Arredonda pra 2 casas — generateStaticPixPayload espera amount.toFixed(2) e um valor tipo
    // 12.999999 quebraria o campo 54 (valor) do payload EMV.
    const roundedAmount = Math.round(amount * 100) / 100;

    const { txid, pixCopiaECola } = useMainKey
      ? generateStaticPixPayload(roundedAmount, 'IMPACTO')
      : generateStaticPixPayload(roundedAmount, 'APOIE', SUPPORT_PIX_KEY);

    return NextResponse.json({ txid, pixCopiaECola, amount: roundedAmount });
  } catch (error) {
    console.error('[api/support/pix] Erro ao gerar PIX de apoio:', error.message);
    return NextResponse.json({ error: 'Falha ao gerar o PIX. Tente novamente.' }, { status: 500 });
  }
}
