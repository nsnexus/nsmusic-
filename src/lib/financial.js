import { getSupabaseEdge } from './supabase-edge';

/**
 * Categorias sugeridas para receitas e despesas
 */
export const CATEGORIAS_RECEITA = [
  'Venda Direta / PIX',
  'Parceria Comercial',
  'Adicional / Gorjeta',
  'Reembolso Recebido',
  'Outros'
];

export const CATEGORIAS_DESPESA = [
  'Imposto Facebook Ads (13,8%)',
  'Tráfego / Ads (Meta, TikTok, Google)',
  'Servidor / VPS / Hospedagem',
  'Ferramentas & IA (Kie, OpenAI, etc)',
  'Operacional & Suporte',
  'Equipe & Freelancer',
  'Impostos & Taxas Bancárias',
  'Outros'
];

/**
 * Valida um lançamento antes de persistir
 */
export function validateFinancialEntry({ tipo, data, valor, descricao }) {
  if (!tipo || !['receita', 'despesa'].includes(tipo)) {
    return { ok: false, error: 'Tipo inválido. Deve ser "receita" ou "despesa".' };
  }
  const numValor = Number(valor);
  if (Number.isNaN(numValor) || numValor <= 0) {
    return { ok: false, error: 'Valor deve ser um número maior que zero.' };
  }
  if (!descricao || typeof descricao !== 'string' || !descricao.trim()) {
    return { ok: false, error: 'Descrição é obrigatória.' };
  }
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, error: 'Data inválida. Use o formato YYYY-MM-DD.' };
  }
  return { ok: true, valor: Math.round(numValor * 100) / 100 };
}

/**
 * Calcula o resumo consolidado de um conjunto de lançamentos
 */
export function calculateFinancialSummary(entries = []) {
  let totalReceitas = 0;
  let totalDespesas = 0;
  let countReceitas = 0;
  let countDespesas = 0;

  for (const item of entries) {
    const val = Number(item.valor) || 0;
    if (item.tipo === 'receita') {
      totalReceitas += val;
      countReceitas++;
    } else if (item.tipo === 'despesa') {
      totalDespesas += val;
      countDespesas++;
    }
  }

  totalReceitas = Math.round(totalReceitas * 100) / 100;
  totalDespesas = Math.round(totalDespesas * 100) / 100;
  const saldoLiquido = Math.round((totalReceitas - totalDespesas) * 100) / 100;

  return {
    totalReceitas,
    totalDespesas,
    saldoLiquido,
    countReceitas,
    countDespesas,
    totalLancamentos: entries.length
  };
}

/**
 * Lista lançamentos financeiros com filtro opcional por mês (YYYY-MM) e tipo.
 * Suporta tabela Postgres `financial_entries` com fallback resiliente para tabela `config`.
 */
export async function getFinancialEntries(env = {}, { mes = null, tipo = null } = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    throw new Error('Supabase client não configurado');
  }

  // 1. Tenta buscar direto na tabela dedicada `financial_entries`
  try {
    let query = supabase.from('financial_entries').select('*');

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      query = query.gte('data', `${mes}-01`).lte('data', `${mes}-31`);
    }
    if (tipo && ['receita', 'despesa'].includes(tipo)) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query.order('data', { ascending: false }).order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const normalized = data.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        data: typeof d.data === 'string' ? d.data.slice(0, 10) : new Date(d.data).toISOString().slice(0, 10),
        valor: Number(d.valor) || 0,
        categoria: d.categoria || 'Outros',
        descricao: d.descricao || '',
        observacoes: d.observacoes || '',
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));

      return {
        entries: normalized,
        resumo: calculateFinancialSummary(normalized)
      };
    }
  } catch (err) {
    // Tabela pode não existir ainda; cai no fallback
  }

  // 2. Fallback resiliente na tabela config (chave 'financial_entries')
  try {
    const { data: cfgData } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'financial_entries')
      .maybeSingle();

    let rawList = Array.isArray(cfgData?.valor) ? cfgData.valor : [];

    // Filtros em memória
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      rawList = rawList.filter((item) => (item.data || '').startsWith(mes));
    }
    if (tipo && ['receita', 'despesa'].includes(tipo)) {
      rawList = rawList.filter((item) => item.tipo === tipo);
    }

    // Ordenação decrescente por data e createdAt
    rawList.sort((a, b) => {
      const cmpDate = (b.data || '').localeCompare(a.data || '');
      if (cmpDate !== 0) return cmpDate;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return {
      entries: rawList,
      resumo: calculateFinancialSummary(rawList)
    };
  } catch (err) {
    console.warn('[financial] Erro ao ler fallback de lançamentos:', err.message);
    return {
      entries: [],
      resumo: calculateFinancialSummary([])
    };
  }
}

/**
 * Cria um novo lançamento financeiro (Receita ou Despesa).
 */
export async function createFinancialEntry(env = {}, { tipo, data, valor, categoria, descricao, observacoes }) {
  const valid = validateFinancialEntry({ tipo, data, valor, descricao });
  if (!valid.ok) {
    throw new Error(valid.error);
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    throw new Error('Supabase client não configurado');
  }

  const id = `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const entryPayload = {
    id,
    tipo,
    data: data.slice(0, 10),
    valor: valid.valor,
    categoria: categoria && typeof categoria === 'string' ? categoria.trim() : 'Outros',
    descricao: descricao.trim(),
    observacoes: observacoes && typeof observacoes === 'string' ? observacoes.trim() : '',
    created_at: now,
    updated_at: now
  };

  // 1. Tenta salvar na tabela `financial_entries`
  try {
    const { data: inserted, error } = await supabase
      .from('financial_entries')
      .insert(entryPayload)
      .select()
      .maybeSingle();

    if (!error && inserted) {
      return {
        id: inserted.id,
        tipo: inserted.tipo,
        data: inserted.data,
        valor: Number(inserted.valor),
        categoria: inserted.categoria,
        descricao: inserted.descricao,
        observacoes: inserted.observacoes || '',
        createdAt: inserted.created_at,
        updatedAt: inserted.updated_at
      };
    }
  } catch (err) {
    // Tabela pode não existir; tenta fallback
  }

  // 2. Fallback na tabela `config`
  const { data: cfgData } = await supabase
    .from('config')
    .select('valor')
    .eq('chave', 'financial_entries')
    .maybeSingle();

  const currentList = Array.isArray(cfgData?.valor) ? cfgData.valor : [];
  const normalizedEntry = {
    id,
    tipo,
    data: entryPayload.data,
    valor: valid.valor,
    categoria: entryPayload.categoria,
    descricao: entryPayload.descricao,
    observacoes: entryPayload.observacoes,
    createdAt: now,
    updatedAt: now
  };

  const updatedList = [normalizedEntry, ...currentList];

  await supabase.from('config').upsert({
    chave: 'financial_entries',
    valor: updatedList,
    updated_at: now
  });

  return normalizedEntry;
}

/**
 * Remove um lançamento financeiro pelo ID.
 */
export async function deleteFinancialEntry(env = {}, id) {
  if (!id || typeof id !== 'string') {
    throw new Error('ID do lançamento é obrigatório.');
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    throw new Error('Supabase client não configurado');
  }

  let deleted = false;

  // 1. Tenta deletar da tabela dedicada
  try {
    const { error } = await supabase.from('financial_entries').delete().eq('id', id);
    if (!error) {
      deleted = true;
    }
  } catch (err) {}

  // 2. Garante remoção também no fallback config se presente
  try {
    const { data: cfgData } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'financial_entries')
      .maybeSingle();

    if (Array.isArray(cfgData?.valor)) {
      const filtered = cfgData.valor.filter((item) => item.id !== id);
      if (filtered.length !== cfgData.valor.length) {
        await supabase.from('config').upsert({
          chave: 'financial_entries',
          valor: filtered,
          updated_at: new Date().toISOString()
        });
        deleted = true;
      }
    }
  } catch (err) {}

  return { ok: deleted };
}
