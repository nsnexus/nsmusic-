'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, limit as fbLimit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getPriceForSku } from '@/lib/pricing';
import { buildSunoPayload } from '@/lib/sunoPayload';
import Link from 'next/link';
import Image from 'next/image';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'NEW', 'PRODUCTION', 'FINISHED'
  const [purchaseTypeTab, setPurchaseTypeTab] = useState('ALL'); // 'ALL', 'MUSIC', 'VIDEO'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Paginação — carrega 500 de início para cobrir o histórico típico do admin.
  // "Carregar todos" remove o limite completamente (útil para busca/filtro em toda a base).
  const PAGE_SIZE = 200;
  const [pageSize, setPageSize] = useState(500);
  const [loadAll, setLoadAll] = useState(false);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Exclusão em massa
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [deletingOrders, setDeletingOrders] = useState(false);

  const [activeTab, setActiveTab] = useState('ORDERS'); // 'ORDERS', 'STUCK'

  // Reprocessamento de pedidos travados antes da Suno (letra pronta mas geração nunca confirmada).
  const [retryDeselected, setRetryDeselected] = useState(new Set());
  const [retryingGeneration, setRetryingGeneration] = useState(false);
  const [retryResult, setRetryResult] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);

  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser || auth.currentUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      }
    }, 1500);

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      clearTimeout(timeout);
      if (!authUser || authUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      } else {
        setUser(authUser);
        setCheckingAuth(false);
      }
    }, (error) => {
      clearTimeout(timeout);
      router.push('/admin/login');
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  // Load orders — sem limite quando loadAll=true, senão usa pageSize.
  useEffect(() => {
    if (!user) return;

    const q = loadAll
      ? query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'orders'), orderBy('createdAt', 'desc'), fbLimit(pageSize + 1));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Exclusão lógica (M-07 no AUDIT_REPORT.md) — pedidos excluídos não aparecem na listagem.
        if (data.deletedAt) return;
        ordersData.push({ id: doc.id, ...data });
      });
      if (loadAll) {
        setHasMoreOrders(false);
        setOrders(ordersData);
      } else {
        setHasMoreOrders(ordersData.length > pageSize);
        setOrders(ordersData.slice(0, pageSize));
      }
      setLoadingOrders(false);
      setLoadingMore(false);
    }, (error) => {
      console.error("Erro ao escutar pedidos:", error);
      setLoadingOrders(false);
      setLoadingMore(false);
    });

    return () => unsubscribe();
  }, [user, pageSize, loadAll]);

  const handleLoadMoreOrders = () => {
    setLoadingMore(true);
    setPageSize(prev => prev + PAGE_SIZE);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/admin/login');
    } catch (err) {
      console.error(err);
    }
  };

  // Normaliza createdAt para string ISO independente do formato salvo no Firestore
  // (string ISO, Firestore Timestamp ou número epoch).
  const toISOStr = (createdAt) => {
    if (!createdAt) return null;
    if (typeof createdAt?.toDate === 'function') return createdAt.toDate().toISOString();
    if (typeof createdAt === 'string') return createdAt;
    if (typeof createdAt === 'number') return new Date(createdAt).toISOString();
    return null;
  };

  // O <input type="date"> devolve "AAAA-MM-DD" no calendário LOCAL do navegador (fuso do Brasil,
  // UTC-3), mas createdAt é gravado sempre em UTC (new Date().toISOString(), convenção do projeto —
  // ver CLAUDE.md). Comparar a string bruta do input contra createdAt tratava "AAAA-MM-DD" como se
  // já fosse meia-noite UTC — 3 horas ANTES da meia-noite local de verdade. Resultado: filtrar "dia
  // 12" incluía pedidos feitos às 21h do dia 11 no horário do Brasil. `new Date("...T00:00:00")` sem
  // sufixo de fuso é interpretado como horário LOCAL pelo motor JS — é isso que corrige o deslocamento.
  const localDayStartIso = (dateStr) => (dateStr ? new Date(`${dateStr}T00:00:00`).toISOString() : null);
  const localDayEndIso = (dateStr) => (dateStr ? new Date(`${dateStr}T23:59:59.999`).toISOString() : null);

  const getFilteredOrders = () => {
    let result = orders;

    switch (filter) {
      case 'NEW':
        result = result.filter(o => o.paymentStatus === 'PAGAMENTO_APROVADO' && o.productionStatus === 'LETRA_APROVADA');
        break;
      case 'PRODUCTION':
        result = result.filter(o => o.productionStatus === 'EM_PRODUCAO' || o.productionStatus === 'VERSOES_EM_PRODUCAO');
        break;
      case 'FINISHED':
        result = result.filter(o => o.productionStatus === 'FINALIZADO' || o.productionStatus === 'ENTREGUE');
        break;
      default:
        break;
    }

    // Combo entra nas duas abas — é venda de música E de vídeo ao mesmo tempo.
    // "MUSIC" filtra pedidos sem add-on de vídeo; "VIDEO" filtra os que têm vídeo pago.
    if (purchaseTypeTab === 'MUSIC') {
      result = result.filter(o => !o.videoAddonPaid);
    } else if (purchaseTypeTab === 'VIDEO') {
      result = result.filter(o => o.videoAddonPaid);
    }

    // toISOStr normaliza Timestamp/string/number para ISO; localDayStartIso/localDayEndIso convertem
    // o "YYYY-MM-DD" do <input type="date"> (calendário local) para o instante UTC correto — ver o
    // comentário ao lado da definição, mais acima.
    if (dateFrom) {
      const from = localDayStartIso(dateFrom);
      result = result.filter(o => {
        const d = toISOStr(o.createdAt);
        return d !== null && d >= from;
      });
    }
    if (dateTo) {
      const to = localDayEndIso(dateTo);
      result = result.filter(o => {
        const d = toISOStr(o.createdAt);
        return d !== null && d <= to;
      });
    }

    // Busca por texto: telefone, nome do cliente, homenageado ou código do pedido.
    // String() garante que customerPhone numérico não quebre o .replace().
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      result = result.filter(o => {
        const nameMatch = (o.customerName || '').toLowerCase().includes(q);
        const honoreeMatch = (o.honoreeName || '').toLowerCase().includes(q);
        const codeMatch = (o.orderNumber || o.id || '').toLowerCase().includes(q);
        const rawPhone = String(o.customerPhone || '').replace(/\D/g, '');
        const phoneMatch = qDigits.length >= 3 && rawPhone.includes(qDigits);
        return nameMatch || honoreeMatch || codeMatch || phoneMatch;
      });
    }

    return result;
  };

  // Quantas vezes o mesmo telefone aparece nos pedidos já CARREGADOS (não só nos filtrados) — é uma
  // noção de "cliente recorrente", não uma contagem oficial: se a paginação ainda não carregou tudo
  // (ver hasMoreOrders/"Carregar todos"), pedidos antigos desse telefone fora da página não entram
  // na conta. useMemo para não escanear todos os pedidos de novo a cada linha da tabela.
  const phoneOrderCounts = useMemo(() => {
    const counts = {};
    for (const o of orders) {
      const phone = String(o.customerPhone || '').replace(/\D/g, '');
      if (!phone) continue;
      counts[phone] = (counts[phone] || 0) + 1;
    }
    return counts;
  }, [orders]);

  // Faturamento respeita o filtro de data (quando definido), mas não as abas de status/tipo — os
  // cartões de topo mostram sempre "quanto entrou no período", independente de qual lista o admin
  // está navegando no momento.
  const getOrdersInDateRange = () => {
    let result = orders;
    // toISOStr normaliza Timestamp/string/number antes de comparar — sem isso, um createdAt salvo
    // como Firestore Timestamp (em vez de string ISO) comparava objeto contra string e nunca batia.
    // localDayStartIso/localDayEndIso corrigem o mesmo deslocamento de fuso de getFilteredOrders.
    if (dateFrom) {
      const from = localDayStartIso(dateFrom);
      result = result.filter(o => {
        const d = toISOStr(o.createdAt);
        return d !== null && d >= from;
      });
    }
    if (dateTo) {
      const to = localDayEndIso(dateTo);
      result = result.filter(o => {
        const d = toISOStr(o.createdAt);
        return d !== null && d <= to;
      });
    }
    return result;
  };

  const parseAmount = (val, fallback = null) => {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace(',', '.'));
      if (!isNaN(parsed)) return parsed;
    }
    return fallback;
  };

  // O valor exibido soma expectedAmount (calculado pelo SERVIDOR a partir do catálogo em
  // src/lib/pricing.js, ver C-05 no AUDIT_REPORT.md) — nunca o campo `total`, que é escrito pelo
  // navegador do cliente e pode ficar ausente se essa escrita falhar silenciosamente, subestimando
  // o faturamento real. `total` só entra como fallback em pedidos antigos sem `expectedAmount`.
  // As condições contra 'FINALIZADO'/'ENTREGUE' foram removidas: são valores de `productionStatus`,
  // nunca de `paymentStatus` — nunca bateram, é código morto de uma confusão entre os dois campos.
  const AUDIO_PRICE = getPriceForSku('audio_only'); // 9.99, preço base sem variação por pedido
  const VIDEO_PRICE = getPriceForSku('video_addon'); // 6.90

  // Divide o valor pago entre os dois cards abaixo em vez de jogar tudo em "Músicas": um combo
  // (música + vídeo comprados juntos, sku 'combo', R$16,89) tem o vídeo embutido no mesmo
  // expectedAmount — sem separar, "Vídeos" ficava zerado para todo combo vendido, mesmo quando
  // eram "várias vendas de vídeo" de verdade (achado do admin em 2026-08-12).
  const getFaturamentoMusicas = () => {
    return getOrdersInDateRange()
      .filter(o => o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO')
      .reduce((sum, o) => {
        // Vídeo cobrado numa intenção de pagamento SEPARADA (videoPaymentId): expectedAmount reflete
        // a cobrança mais recente do pedido (a do vídeo, sobrescrita depois da música em
        // /api/payments/create), não a da música — usar o valor base evita contar o preço do vídeo
        // como se fosse música.
        if (o.videoPaymentId) return sum + AUDIO_PRICE;

        let val = parseAmount(o.expectedAmount, null);
        if (val === null) val = parseAmount(o.total, null);

        // Fallback: se o pedido está pago mas não tem valor salvo (ou está como 0), assume o valor base.
        if (val === null || val === 0) val = AUDIO_PRICE;

        // Combo: conta só a parte da música aqui — a diferença vai para getFaturamentoVideos.
        return sum + (val > AUDIO_PRICE ? AUDIO_PRICE : val);
      }, 0);
  };

  const getFaturamentoVideos = () => {
    // Add-on vendido SEPARADAMENTE (videoPaymentId só existe nesse caso — ver src/lib/payments.js).
    const standalone = getOrdersInDateRange()
      .filter(o => o.videoAddonPaid && o.videoPaymentId)
      .reduce((sum) => sum + VIDEO_PRICE, 0);

    // Vídeo vendido junto com a música no MESMO checkout (combo): a parte do valor pago que excede
    // o preço da música sozinha. Exclui pedidos com videoPaymentId próprio para não contar duas
    // vezes o mesmo vídeo comprado depois, em separado.
    const comboPortion = getOrdersInDateRange()
      .filter(o => (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') && !o.videoPaymentId)
      .reduce((sum, o) => {
        let val = parseAmount(o.expectedAmount, null);
        if (val === null) val = parseAmount(o.total, null);
        if (val === null) return sum;
        const excess = val - AUDIO_PRICE;
        return sum + (excess > 0 ? excess : 0);
      }, 0);

    return standalone + comboPortion;
  };

  const getFaturamentoTotal = () => {
    return getFaturamentoMusicas() + getFaturamentoVideos();
  };

  // "Pedidos" conta TODO pedido criado (inclusive quem nunca pagou — abandonou no meio do wizard ou
  // nunca chegou a gerar PIX). Venda é outra coisa: pagamento de música aprovado OU add-on de vídeo
  // liberado, o que vier primeiro (um pedido não conta duas vezes se vendeu os dois).
  const getVendasCount = () => {
    return getOrdersInDateRange().filter(o =>
      o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO' || o.videoAddonPaid
    ).length;
  };

  // Custo por chamada aceita pela Kie.ai — não por pedido: um pedido retentado (manual ou pela
  // retentativa automática, ver src/lib/suno.js) custa uma vez por tentativa, nunca só uma vez no
  // total. sunoGenerationCount conta exatamente essas chamadas (ver requestSunoGeneration).
  // Pedidos de antes desse campo existir não têm o contador — para não subestimar o gasto real
  // desses pedidos antigos, qualquer um que tenha ao menos chegado a solicitar geração
  // (sunoRequestedAt) conta como 1, o mínimo que com certeza aconteceu.
  const KIE_COST_PER_GENERATION = 0.30;
  const getGastoGeracaoMusicas = () => {
    return getOrdersInDateRange().reduce((sum, o) => {
      const count = Number(o.sunoGenerationCount) || (o.sunoRequestedAt ? 1 : 0);
      return sum + count * KIE_COST_PER_GENERATION;
    }, 0);
  };

  // Pedidos com a letra pronta cujo pedido à Kie.ai nunca foi confirmado (EM_PRODUCAO é o estado
  // inicial genérico; LETRA_CRIADA é gravado quando a letra fica pronta — ver criar/page.jsx). Sem
  // audioUrl significa que a geração de fato não chegou a completar.
  const getStuckGenerationCandidates = () => orders.filter(o =>
    !o.deletedAt &&
    (o.productionStatus === 'EM_PRODUCAO' || o.productionStatus === 'LETRA_CRIADA') &&
    (o.lyrics || '').trim().length > 0 &&
    !o.audioUrl
  );

  const toggleRetrySelection = (orderId) => {
    setRetryDeselected(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  // Reenvia cada pedido selecionado para /api/suno/generate, sequencialmente — em lote e em paralelo
  // multiplicaria o risco do mesmo erro de limite de taxa da Kie.ai que provavelmente travou os
  // pedidos em primeiro lugar.
  const handleRetryStuckGeneration = async (candidates) => {
    const selected = candidates.filter(o => !retryDeselected.has(o.id));
    if (selected.length === 0) return;
    if (!confirm(`Reenviar ${selected.length} pedido(s) para geração de música na Kie.ai agora?`)) return;

    setRetryingGeneration(true);
    setRetryResult(null);
    let success = 0, failed = 0;
    for (const order of selected) {
      try {
        const res = await fetch('/api/suno/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...buildSunoPayload(order), orderId: order.id })
        });
        if (res.ok) success++; else failed++;
      } catch (e) {
        failed++;
      }
    }
    setRetryResult({ success, failed, total: selected.length });
    setRetryingGeneration(false);
  };

  // Reconciliação no servidor: varre pedidos presos em GERANDO_AUDIO e pagamentos ainda em
  // AGUARDANDO_PAGAMENTO, confirmando cada um direto na Kie.ai e na Efí. Existe porque a via normal
  // (webhook + polling do navegador do cliente) morre junto com a aba do cliente — ver o comentário
  // de topo de src/app/api/orders/reconcile/route.js.
  const handleReconcile = async () => {
    if (!confirm('Verificar agora, direto na Kie.ai e na Efí, os pedidos presos em geração e os pagamentos pendentes?')) return;

    setReconciling(true);
    setReconcileResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/orders/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // A listagem é um onSnapshot vivo — os pedidos corrigidos aparecem sozinhos, sem recarregar.
        setReconcileResult(data);
      } else {
        setReconcileResult({ error: data.error || 'Falha ao reconciliar os pedidos.' });
      }
    } catch (e) {
      setReconcileResult({ error: 'Falha de conexão ao reconciliar os pedidos.' });
    } finally {
      setReconciling(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'PAGAMENTO_APROVADO':
      case 'FINALIZADO':
      case 'ENTREGUE':
        return '#059669'; // verde escuro
      case 'EM_PRODUCAO':
      case 'VERSOES_EM_PRODUCAO':
        return '#7c3aed'; // roxo
      case 'LETRA_GERADA':
      case 'AGUARDANDO_APROVACAO':
        return '#d97706'; // laranja
      default:
        return '#64748b'; // cinza
    }
  };

  const formatDateWithTime = (createdAt) => {
    if (!createdAt) return 'N/A';
    try {
      let dateObj;
      if (createdAt?.toDate) {
        dateObj = createdAt.toDate();
      } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
        dateObj = new Date(createdAt);
      }
      if (!dateObj || isNaN(dateObj.getTime())) return 'N/A';

      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');

      return `${day}/${month}/${year} às ${hours}:${minutes}`;
    } catch {
      return 'N/A';
    }
  };

  // Funções de Exclusão conectadas à API resiliente
  const handleDeleteSingleOrder = async (id, orderNumber) => {
    if (!confirm(`Deseja realmente excluir permanentemente a solicitação ${orderNumber || id}?`)) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ orderId: id })
      });
      if (res.ok) {
        setSelectedOrderIds(prev => prev.filter(item => item !== id));
        setOrders(prev => prev.filter(item => item.id !== id));
      } else {
        alert("Falha ao excluir a solicitação.");
      }
    } catch (err) {
      console.error("Erro ao excluir solicitação:", err);
      alert("Falha ao excluir a solicitação.");
    }
  };

  const handleDeleteSelectedOrders = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!confirm(`Deseja realmente excluir permanentemente as ${selectedOrderIds.length} solicitações selecionadas?`)) return;

    setDeletingOrders(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ orderIds: selectedOrderIds })
      });

      if (res.ok) {
        const idsToRemove = [...selectedOrderIds];
        setSelectedOrderIds([]);
        setOrders(prev => prev.filter(item => !idsToRemove.includes(item.id)));
        alert("Solicitações excluídas com sucesso!");
      } else {
        alert("Falha ao excluir solicitações.");
      }
    } catch (err) {
      console.error("Erro ao excluir em massa:", err);
      alert("Ocorreu um erro ao excluir as solicitações.");
    } finally {
      setDeletingOrders(false);
    }
  };

  const toggleSelectAll = (filteredList) => {
    if (selectedOrderIds.length === filteredList.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredList.map(o => o.id));
    }
  };

  const toggleSelectOrder = (id) => {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  if (checkingAuth) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
      </div>
    );
  }

  const filteredOrders = getFilteredOrders();

  return (
    <div style={styles.wrapper}>
      {/* Header com Tema Claro */}
      <header style={styles.header}>
        <div style={styles.headerContainer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              <Image src="/logo.png" alt="NSMusic" width={36} height={36} style={{ height: '36px', width: 'auto' }} priority />
              <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Painel Admin</span>
            </Link>
            
            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '8px', marginLeft: '24px' }}>
              <button 
                onClick={() => setActiveTab('ORDERS')}
                style={{
                  ...styles.tabBtn,
                  backgroundColor: activeTab === 'ORDERS' ? '#7c3aed' : '#e2e8f0',
                  color: activeTab === 'ORDERS' ? '#ffffff' : '#334155',
                }}
              >
                📦 Pedidos ({orders.length})
              </button>
              <button
                onClick={() => setActiveTab('STUCK')}
                style={{
                  ...styles.tabBtn,
                  backgroundColor: activeTab === 'STUCK' ? '#7c3aed' : '#e2e8f0',
                  color: activeTab === 'STUCK' ? '#ffffff' : '#334155',
                }}
              >
                🔧 Travados ({getStuckGenerationCandidates().length})
              </button>
            </div>
          </div>

          <div style={styles.userInfo}>
            <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: '600' }}>{user.email}</span>
            <button onClick={handleLogout} style={styles.logoutBtn}>Sair ➔</button>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px 0' }}>
        <div className="container" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 20px' }}>
          
          {activeTab === 'ORDERS' ? (
            <div>
              {/* Cards de Métricas em Tema Claro */}
              <div style={styles.metricsGrid}>
                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Total (Músicas + Vídeos)</span>
                  <h2 style={{ ...styles.metricValue, color: '#059669' }}>R$ {getFaturamentoTotal().toFixed(2).replace('.', ',')}</h2>
                </div>
                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Músicas (R$ 9,99)</span>
                  <h2 style={{ ...styles.metricValue, color: '#0f172a' }}>R$ {getFaturamentoMusicas().toFixed(2).replace('.', ',')}</h2>
                </div>
                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Vídeos (R$ 6,90)</span>
                  <h2 style={{ ...styles.metricValue, color: '#7c3aed' }}>R$ {getFaturamentoVideos().toFixed(2).replace('.', ',')}</h2>
                </div>
                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Pedidos</span>
                  <h2 style={{ ...styles.metricValue, color: '#d97706' }}>{getOrdersInDateRange().length}</h2>
                </div>
                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Vendas (pagas)</span>
                  <h2 style={{ ...styles.metricValue, color: '#059669' }}>{getVendasCount()}</h2>
                </div>
                <div style={styles.metricCard}>
                  <span style={styles.metricLabel}>Gasto em Geração (Kie.ai)</span>
                  <h2 style={{ ...styles.metricValue, color: '#dc2626' }}>R$ {getGastoGeracaoMusicas().toFixed(2).replace('.', ',')}</h2>
                </div>
              </div>

              {/* Filtros e Barra de Ações em Massa */}
              <div style={{ marginTop: '32px' }}>
                {/* Abas: tipo de compra (música/vídeo) */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {[
                    { id: 'ALL', label: 'Todas as vendas' },
                    { id: 'MUSIC', label: '🎵 Vendas de música' },
                    { id: 'VIDEO', label: '🎬 Vendas de vídeo' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPurchaseTypeTab(tab.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid ' + (purchaseTypeTab === tab.id ? '#7c3aed' : '#e2e8f0'),
                        background: purchaseTypeTab === tab.id ? '#7c3aed' : '#ffffff',
                        color: purchaseTypeTab === tab.id ? '#ffffff' : '#334155',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Busca por texto (telefone, nome, código, homenageado) */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ position: 'relative', maxWidth: '420px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
                    <input
                      id="admin-search"
                      type="text"
                      placeholder="Buscar por telefone, nome, homenageado ou código..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 36px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.88rem',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8', lineHeight: 1 }}
                        title="Limpar busca"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Filtro de data */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <label htmlFor="admin-date-from" style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px' }}>De</label>
                    <input
                      id="admin-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-date-to" style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px' }}>Até</label>
                    <input
                      id="admin-date-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                    />
                  </div>
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      onClick={() => { setDateFrom(''); setDateTo(''); }}
                      style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Limpar datas
                    </button>
                  )}
                </div>

                <div style={styles.filterBar}>
                  <div style={styles.filterTitle}>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a' }}>Gerenciamento de Solicitações</h3>
                  </div>

                  {/* Ações em Massa */}
                  {selectedOrderIds.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fef2f2', border: '1px solid #fca5a5', padding: '8px 16px', borderRadius: '10px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 'bold' }}>
                        {selectedOrderIds.length} selecionado(s)
                      </span>
                      <button
                        onClick={handleDeleteSelectedOrders}
                        disabled={deletingOrders}
                        style={{
                          padding: '8px 14px',
                          background: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        {deletingOrders ? 'Excluindo...' : '🗑️ Excluir Selecionados'}
                      </button>
                    </div>
                  )}

                  <div style={styles.filterBtns}>
                    <button 
                      onClick={() => setFilter('ALL')} 
                      style={{ ...styles.filterBtn, borderBottom: filter === 'ALL' ? '3px solid #7c3aed' : 'none', color: filter === 'ALL' ? '#7c3aed' : '#64748b', fontWeight: filter === 'ALL' ? 'bold' : '600' }}
                    >
                      Todos ({orders.length})
                    </button>
                    <button 
                      onClick={() => setFilter('NEW')} 
                      style={{ ...styles.filterBtn, borderBottom: filter === 'NEW' ? '3px solid #7c3aed' : 'none', color: filter === 'NEW' ? '#7c3aed' : '#64748b', fontWeight: filter === 'NEW' ? 'bold' : '600' }}
                    >
                      Novos ({orders.filter(o => o.paymentStatus === 'PAGAMENTO_APROVADO' && o.productionStatus === 'LETRA_APROVADA').length})
                    </button>
                    <button 
                      onClick={() => setFilter('PRODUCTION')} 
                      style={{ ...styles.filterBtn, borderBottom: filter === 'PRODUCTION' ? '3px solid #7c3aed' : 'none', color: filter === 'PRODUCTION' ? '#7c3aed' : '#64748b', fontWeight: filter === 'PRODUCTION' ? 'bold' : '600' }}
                    >
                      Em Produção ({orders.filter(o => o.productionStatus === 'EM_PRODUCAO' || o.productionStatus === 'VERSOES_EM_PRODUCAO').length})
                    </button>
                    <button 
                      onClick={() => setFilter('FINISHED')} 
                      style={{ ...styles.filterBtn, borderBottom: filter === 'FINISHED' ? '3px solid #7c3aed' : 'none', color: filter === 'FINISHED' ? '#7c3aed' : '#64748b', fontWeight: filter === 'FINISHED' ? 'bold' : '600' }}
                    >
                      Finalizados ({orders.filter(o => o.productionStatus === 'FINALIZADO' || o.productionStatus === 'ENTREGUE').length})
                    </button>
                  </div>
                </div>

                {loadingOrders ? (
                  <div style={styles.loadingOrders}>
                    <div style={styles.spinner} />
                    <p style={{ marginTop: '16px', color: '#475569' }}>Carregando listagem de solicitações...</p>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div style={styles.emptyState}>
                    <span style={{ fontSize: '2.5rem' }}>📭</span>
                    <h4 style={{ color: '#0f172a', fontSize: '1.2rem', marginTop: '8px' }}>Nenhuma solicitação encontrada</h4>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Nenhum registro se enquadra no filtro selecionado.</p>
                  </div>
                ) : (
                  <div style={styles.tableCard}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.thRow}>
                          <th style={{ ...styles.th, width: '40px' }}>
                            <input
                              type="checkbox"
                              checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                              onChange={() => toggleSelectAll(filteredOrders)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </th>
                          <th style={styles.th}>Código</th>
                          <th style={styles.th}>Cliente / Zap</th>
                          <th style={styles.th}>Valor</th>
                          <th style={styles.th}>Pagamento</th>
                          <th style={styles.th}>Produção</th>
                          <th style={styles.th}>Data & Hora</th>
                          <th style={styles.th}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((o) => {
                          const isSelected = selectedOrderIds.includes(o.id);
                          return (
                            <tr key={o.id} style={{ ...styles.tr, backgroundColor: isSelected ? '#f1f5f9' : '#ffffff' }}>
                              <td style={styles.td}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectOrder(o.id)}
                                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                />
                              </td>
                              <td style={{ ...styles.td, fontWeight: '700', color: '#0f172a' }}>
                                {o.orderNumber || o.id.substring(0, 8)}
                              </td>
                              <td style={styles.td}>
                                <div style={{ fontWeight: '600', color: '#0f172a' }}>{o.customerName || 'Cliente'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: '500' }}>{o.customerPhone || 'N/A'}</span>
                                  {(() => {
                                    const digits = String(o.customerPhone || '').replace(/\D/g, '');
                                    const count = digits ? phoneOrderCounts[digits] : 0;
                                    // Só aparece a partir da 2ª música — na 1ª seria ruído visual sem informação nova.
                                    // Total de pedidos deste telefone entre os já carregados — o
                                    // mesmo número aparece em todas as linhas dele, não é a posição
                                    // desta linha na sequência.
                                    return count > 1 ? (
                                      <span title="Total de pedidos carregados com este telefone" style={{ fontSize: '0.68rem', fontWeight: '700', color: '#7c3aed', backgroundColor: '#f3e8ff', padding: '1px 6px', borderRadius: '999px' }}>
                                        {count}x cliente
                                      </span>
                                    ) : null;
                                  })()}
                                </div>
                              </td>
                              <td style={{ ...styles.td, fontWeight: '700' }}>
                                {(() => {
                                  const isPaidOrder = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
                                  // Mesma resolução da soma do topo (expectedAmount do servidor, com
                                  // fallback pro total antigo) — nunca um valor fixo de 9,99 quando o
                                  // real é desconhecido, isso mascarava pedidos sem valor gravado e
                                  // fazia a lista "parecer" ter mais faturamento do que a soma real.
                                  const amount = Number(o.expectedAmount) || Number(o.total) || null;
                                  if (!isPaidOrder) return <span style={{ color: '#94a3b8' }}>Não pago</span>;
                                  if (amount === null) return <span style={{ color: '#d97706' }}>Valor desconhecido</span>;
                                  return <span style={{ color: '#059669' }}>R$ {amount.toFixed(2).replace('.', ',')}</span>;
                                })()}
                              </td>
                              <td style={styles.td}>
                                <span style={{ ...styles.statusBadge, border: `1px solid ${getStatusBadgeColor(o.paymentStatus)}44`, color: getStatusBadgeColor(o.paymentStatus), backgroundColor: `${getStatusBadgeColor(o.paymentStatus)}10` }}>
                                  {o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO' ? 'Aprovado' : 'Aguardando'}
                                </span>
                              </td>
                              <td style={styles.td}>
                                <span style={{ ...styles.statusBadge, border: `1px solid ${getStatusBadgeColor(o.productionStatus)}44`, color: getStatusBadgeColor(o.productionStatus), backgroundColor: `${getStatusBadgeColor(o.productionStatus)}10` }}>
                                  {o.productionStatus || 'PENDENTE'}
                                </span>
                              </td>
                              <td style={{ ...styles.td, fontSize: '0.85rem', color: '#0f172a', fontWeight: '600', whitespace: 'nowrap' }}>
                                🕒 {formatDateWithTime(o.createdAt)}
                              </td>
                              <td style={styles.td}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <Link href={`/admin/pedidos/${o.id}`} title="Gerenciar Pedido" aria-label="Gerenciar Pedido" style={{ ...styles.manageBtn, padding: '6px 10px' }}>
                                    ⚙️
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSingleOrder(o.id, o.orderNumber)}
                                    title="Excluir Solicitação"
                                    style={styles.deleteSingleBtn}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {hasMoreOrders && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '20px 0' }}>
                    <button
                      type="button"
                      onClick={handleLoadMoreOrders}
                      disabled={loadingMore}
                      style={{ padding: '10px 24px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontWeight: '600', cursor: 'pointer' }}
                    >
                      {loadingMore ? 'Carregando...' : '⬇️ Carregar mais 200'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLoadingMore(true); setLoadAll(true); }}
                      disabled={loadingMore}
                      style={{ padding: '10px 24px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid #7c3aed', background: '#7c3aed', color: '#ffffff', fontWeight: '600', cursor: 'pointer' }}
                    >
                      {loadingMore ? 'Carregando...' : '📋 Carregar todos'}
                    </button>
                  </div>
                )}

              </div>
            </div>
          ) : (
            // Pedidos travados — letra pronta mas a geração na Kie.ai nunca foi confirmada (ver
            // sunoError/productionStatus, gravados em api/suno/generate/route.js).
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>Pedidos Travados na Geração</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>
                Letra pronta, mas a geração de música nunca chegou a completar. Revise e reenvie para a Kie.ai.
              </p>

              {/* Reconciliação: primeiro passo antes de reenviar qualquer coisa para a Kie.ai.
                  Boa parte dos pedidos "travados" na verdade já tem a música pronta lá e/ou o
                  pagamento confirmado na Efí — o que faltou foi alguém no servidor perguntar, já
                  que o polling morre quando o cliente fecha a aba. Reenviar sem checar antes
                  gastaria crédito à toa e geraria uma segunda música. */}
              <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>
                  1. Verificar na fonte antes de reenviar
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '14px' }}>
                  Consulta a Kie.ai e a Efí direto do servidor: recupera música já pronta que nunca
                  chegou ao pedido, libera pagamento já confirmado que ficou preso — inclusive de
                  add-on de vídeo comprado em separado, que fica preso de um jeito que os outros
                  pedidos travados não ficam (não é revisado pela mesma checagem) — e reenvia
                  automaticamente (até 3 vezes) quem a Kie.ai reportou como falha real. Nunca cobra o
                  cliente de novo — mas cada reenvio consome um crédito de geração na Kie.ai.
                </p>
                <button
                  type="button"
                  onClick={handleReconcile}
                  disabled={reconciling}
                  className="btn btn-primary"
                  style={{ padding: '11px 20px', fontSize: '0.9rem', fontWeight: '700', opacity: reconciling ? 0.6 : 1, cursor: reconciling ? 'wait' : 'pointer' }}
                >
                  {reconciling ? '⏳ Verificando...' : '🔄 Verificar pedidos travados e pagamentos'}
                </button>

                {reconcileResult && (() => {
                  // Erro pode vir em quatro lugares: na rota inteira, ou em cada uma das três fases
                  // (elas falham de forma independente). Sem mostrar todos, uma consulta recusada
                  // pelo Firestore aparecia como "0 verificados", indistinguível de base limpa.
                  const phaseErrors = [
                    reconcileResult.audio?.error ? `Música: ${reconcileResult.audio.error}` : null,
                    reconcileResult.payments?.error ? `Pagamento: ${reconcileResult.payments.error}` : null,
                    reconcileResult.videoAddon?.error ? `Add-on de vídeo: ${reconcileResult.videoAddon.error}` : null,
                  ].filter(Boolean);
                  const hasError = !!reconcileResult.error || phaseErrors.length > 0;

                  return (
                    <div style={{ marginTop: '14px', padding: '12px 16px', backgroundColor: hasError ? '#fee2e2' : '#d1fae5', border: `1px solid ${hasError ? '#ef4444' : '#10b981'}`, borderRadius: '8px', color: hasError ? '#991b1b' : '#065f46', fontWeight: '600', fontSize: '0.85rem' }}>
                      {reconcileResult.error ? reconcileResult.error : (
                        <>
                          Música: {reconcileResult.audio?.checked || 0} verificado(s) —{' '}
                          {reconcileResult.audio?.completed || 0} recuperado(s),{' '}
                          {reconcileResult.audio?.retried || 0} reenviado(s) automaticamente,{' '}
                          {reconcileResult.audio?.stillProcessing || 0} ainda em produção,{' '}
                          {reconcileResult.audio?.failed || 0} com falha.
                          <br />
                          Pagamento: {reconcileResult.payments?.checked || 0} verificado(s) —{' '}
                          {reconcileResult.payments?.approved || 0} liberado(s),{' '}
                          {reconcileResult.payments?.stillPending || 0} ainda pendente(s).
                          <br />
                          Add-on de vídeo avulso: {reconcileResult.videoAddon?.checked || 0} verificado(s) —{' '}
                          {reconcileResult.videoAddon?.approved || 0} liberado(s),{' '}
                          {reconcileResult.videoAddon?.stillPending || 0} ainda pendente(s).
                          {phaseErrors.length > 0 && (
                            <>
                              <br /><br />
                              Falhas: {phaseErrors.join(' · ')}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              {retryResult && (
                <div style={{ padding: '14px 18px', backgroundColor: retryResult.failed > 0 ? '#fef3c7' : '#d1fae5', border: `1px solid ${retryResult.failed > 0 ? '#f59e0b' : '#10b981'}`, borderRadius: '8px', marginBottom: '20px', color: '#065f46', fontWeight: '600', fontSize: '0.9rem' }}>
                  Reprocessamento concluído: {retryResult.success} enviado(s) com sucesso, {retryResult.failed} falharam de {retryResult.total} pedido(s).
                </div>
              )}

              {(() => {
                const stuckCandidates = getStuckGenerationCandidates();
                const selectedCount = stuckCandidates.filter(o => !retryDeselected.has(o.id)).length;
                return (
                  <div className="glass-card" style={{ padding: '24px', borderRadius: '16px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                    {stuckCandidates.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Nenhum pedido travado no momento.</p>
                    ) : (
                      <>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '16px' }}>
                          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', width: '36px' }}></th>
                                <th style={{ padding: '10px 12px' }}>Cliente</th>
                                <th style={{ padding: '10px 12px' }}>Homenageado</th>
                                <th style={{ padding: '10px 12px' }}>Criado em</th>
                                <th style={{ padding: '10px 12px' }}>Motivo registrado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stuckCandidates.map((o) => (
                                <tr key={o.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 12px' }}>
                                    <input
                                      type="checkbox"
                                      checked={!retryDeselected.has(o.id)}
                                      onChange={() => toggleRetrySelection(o.id)}
                                      aria-label={`Incluir pedido de ${o.customerName || o.id} no reprocessamento`}
                                    />
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>{o.customerName || '—'}</td>
                                  <td style={{ padding: '8px 12px' }}>{o.honoreeName || '—'}</td>
                                  <td style={{ padding: '8px 12px' }}>{formatDateWithTime(o.createdAt)}</td>
                                  <td style={{ padding: '8px 12px', color: o.sunoError ? '#dc2626' : '#94a3b8' }}>
                                    {o.sunoError ? `${o.sunoError}${o.sunoErrorCount ? ` (${o.sunoErrorCount}x)` : ''}` : 'sem registro (desistiu antes de aprovar)'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRetryStuckGeneration(stuckCandidates)}
                          disabled={selectedCount === 0 || retryingGeneration}
                          className="btn btn-primary"
                          style={{ padding: '10px 22px', fontSize: '0.9rem' }}
                        >
                          {retryingGeneration ? 'Reenviando...' : `Reenviar ${selectedCount} pedido(s) 🔄`}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  loadingWrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #e2e8f0',
    borderTopColor: '#7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  headerContainer: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: '#dc2626',
    fontSize: '0.9rem',
    fontWeight: '700',
    cursor: 'pointer',
    outline: 'none',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
  },
  metricCard: {
    padding: '24px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  metricLabel: {
    fontSize: '0.85rem',
    color: '#64748b',
    fontWeight: '700',
  },
  metricValue: {
    fontSize: '1.8rem',
    fontWeight: '800',
  },
  filterBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '16px',
    marginBottom: '20px',
  },
  filterTitle: {
    flex: 1,
  },
  filterBtns: {
    display: 'flex',
    gap: '8px',
  },
  filterBtn: {
    background: 'none',
    border: 'none',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'all 0.2s',
  },
  loadingOrders: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 0',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 20px',
    textAlign: 'center',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
  },
  tableCard: {
    overflowX: 'auto',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  thRow: {
    backgroundColor: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
  },
  th: {
    padding: '16px 20px',
    fontSize: '0.82rem',
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '16px 20px',
    fontSize: '0.92rem',
    verticalAlign: 'middle',
    color: '#1e293b',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '100px',
    fontSize: '0.75rem',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  formLabel: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: '#475569',
    marginBottom: '4px',
    display: 'block',
  },
  adminInput: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    color: '#0f172a',
    fontSize: '0.9rem',
    outline: 'none',
  },
  whiteCard: {
    backgroundColor: '#ffffff',
    padding: '24px',
    borderRadius: '14px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
  },
  manageBtn: {
    padding: '6px 12px',
    fontSize: '0.8rem',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontWeight: 'bold',
    textDecoration: 'none',
    display: 'inline-block'
  },
  deleteSingleBtn: {
    padding: '6px 10px',
    fontSize: '0.8rem',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fca5a5',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  addBtn: {
    padding: '6px 14px',
    fontSize: '0.85rem',
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
};
