// Base de conhecimento e liga/desliga do atendente com IA do chat de suporte (/suporte).
// Fica na tabela `config` (chave abaixo) e é editada pelo dono no painel (aba Atendimentos).
//
// O conhecimento é TEXTO para a IA ler: preços, prazos, regras, jeito de falar. Ele orienta a
// conversa, mas não decide nada que custe dinheiro — quem cobra, confere e libera são as
// ferramentas do sistema (src/lib/suporteChat.js:executarFerramenta).

import { getSupabaseEdge } from './supabase-edge.js';
import { getPriceForSku } from './pricing.js';

export const CHAVE_ATENDENTE = 'atendente_ia';
const MAX_TEXTO = 12000;

const reais = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

/** Conhecimento inicial (o dono pode reescrever tudo no painel). Preços vêm do catálogo. */
export function conhecimentoPadrao() {
  const p = (sku) => reais(getPriceForSku(sku));
  return `SOBRE A NS MUSIC
- Fazemos músicas personalizadas de homenagem com IA: o cliente conta a história, a gente escreve a letra e grava 2 versões completas.
- Como funciona: conta a história → aprova a letra → a música fica pronta em 1 a 3 minutos → ouve a prévia → paga no Pix → baixa os MP3.
- Site: nsmusic.ia.br · Instagram: @_nsmusic

PREÇOS (Pix)
- Só a música (2 versões): ${p('audio_only')}
- Música + vídeo para status/reels: ${p('combo')}
- Música + carta: ${p('combo_carta')} · Música + retrospectiva: ${p('combo_retrospectiva')}
- Pacote Família (música, carta, vídeo, retrospectiva + 10 músicas extras): ${p('combo_familia')}
- Ajuste de música já paga (trocar o ritmo ou gravar com a letra ajustada): ${p('ajuste_musica')} por ajuste.
- Toda música paga dá direito a 1 música bônus grátis (outra história ou outro estilo).

PAGAMENTO
- Só Pix. A confirmação é automática em segundos, conferida direto no banco.
- Comprovante não libera pedido: quem confirma é o banco. Se o cliente pagou e não liberou, confira o pagamento.
- Reembolso, cobrança em dobro ou qualquer problema de dinheiro: chamar um atendente.

DOWNLOAD E NAVEGADOR
- As músicas ficam na página do pedido e em "Minhas músicas" (busca pelo WhatsApp).
- Quem abre o link pelo WhatsApp fica no navegador do próprio WhatsApp, que às vezes não deixa baixar, ouvir ou enviar fotos. A solução é abrir no navegador de verdade (Chrome no Android, Safari no iPhone).

VÍDEO E FOTOS
- O vídeo é gerado pelo próprio cliente, dentro da plataforma, na página do pedido: ele escolhe as fotos e o vídeo sai lá, já com a música. A equipe não monta nem envia vídeo.
- Para trocar uma foto é o mesmo caminho: escolhe de novo e gera outra vez.

JEITO DE FALAR
- Como gente no WhatsApp: frases curtas, informal, sem textão.
- Uma pergunta por vez. Nada de elogio genérico ("Que lindo!", "Ótima escolha!").
- No máximo 1 emoji por mensagem.
- Nunca invente preço, prazo ou situação de pedido.`;
}

export async function lerConfigAtendente(env = {}) {
  const padrao = { ligado: true, texto: conhecimentoPadrao(), personalizado: false };
  const supabase = getSupabaseEdge(env);
  if (!supabase) return padrao;
  try {
    const { data } = await supabase.from('config').select('valor').eq('chave', CHAVE_ATENDENTE).maybeSingle();
    const v = data?.valor;
    if (!v || typeof v !== 'object') return padrao;
    const texto = typeof v.texto === 'string' && v.texto.trim() ? v.texto.slice(0, MAX_TEXTO) : padrao.texto;
    return { ligado: v.ligado !== false, texto, personalizado: Boolean(v.texto && v.texto.trim()), atualizadoEm: v.atualizadoEm || null };
  } catch (err) {
    console.warn('[atendenteConhecimento] Falha ao ler a configuração:', err?.message);
    return padrao;
  }
}

export async function salvarConfigAtendente({ ligado, texto }, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, motivo: 'sem_banco' };
  const valor = {
    ligado: ligado !== false,
    texto: String(texto || '').slice(0, MAX_TEXTO),
    atualizadoEm: new Date().toISOString(),
  };
  const { error } = await supabase.from('config').upsert({ chave: CHAVE_ATENDENTE, valor, updated_at: valor.atualizadoEm });
  if (error) return { ok: false, motivo: 'falha_ao_salvar' };
  return { ok: true, config: { ...valor, personalizado: Boolean(valor.texto.trim()) } };
}
