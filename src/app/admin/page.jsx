'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, limit as fbLimit, doc, setDoc, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { lerConfigSite, normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from '@/lib/configSite';
import { getPriceForSku } from '@/lib/pricing';
import { buildSunoPayload } from '@/lib/sunoPayload';
import FaturamentoCards from '@/components/FaturamentoCards';
import { formatToWhatsAppNumber } from '@/lib/whatsappTemplates';
import { hasPreviewTrackingData } from '@/lib/previewTracking';
import Link from 'next/link';
import Image from 'next/image';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'NEW', 'PRODUCTION', 'FINISHED'
  const [purchaseTypeTab, setPurchaseTypeTab] = useState('ALL'); // 'ALL', 'MUSIC', 'VIDEO'
  // Padrão "hoje" — reduz leituras do Firestore no carregamento inicial (ver where() na query de orders).
  const todayLocalStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [dateFrom, setDateFrom] = useState(todayLocalStr);
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [productionStatusFilter, setProductionStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('createdAt_desc'); // 'createdAt_desc'|'createdAt_asc'|'paidAt_desc'|'paidAt_asc'

  // Linhas da tabela com o detalhamento de produtos (Valor) expandido — ver getOrderProductBreakdown.
  const [expandedValueRows, setExpandedValueRows] = useState(() => new Set());
  const toggleValueExpanded = (orderId) => {
    setExpandedValueRows((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  // Controle Master do Agente de IA do WhatsApp
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [togglingAgent, setTogglingAgent] = useState(false);

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

  // 'ORDERS' | 'STUCK' | 'AJUSTES'. Ajustes reúne o que é CONFIGURAÇÃO (robô do WhatsApp, número
  // do suporte) — antes vivia no topo da lista de pedidos, competindo por atenção com o trabalho
  // do dia (pedido do dono do estúdio, 25/09/2026).
  const [activeTab, setActiveTab] = useState('ORDERS');

  // Número de WhatsApp do suporte, editável aqui em vez de hardcoded no código (pedido 21/09/2026:
  // o número principal foi suspenso e o dono vai alternar de volta em dois dias — trocar isso não
  // pode exigir deploy). Ver src/lib/configSite.js.
  // Diagnóstico do webhook da Efí — a via instantânea de confirmação de pagamento. Ver
  // src/app/api/admin/efi-webhook/route.js.

  const [numeroSuporte, setNumeroSuporte] = useState('');
  const [salvandoNumero, setSalvandoNumero] = useState(false);
  const [msgNumero, setMsgNumero] = useState('');

  // Reprocessamento de pedidos travados antes da Suno (letra pronta mas geração nunca confirmada).
  // Varredura de conferência de pagamentos (pedido 20/09/2026) — ver handleAuditPayments.
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [auditDias, setAuditDias] = useState(7);
  const [auditSoCopiaram, setAuditSoCopiaram] = useState(false);

  // Reenvio manual do WhatsApp "música pronta" (incidente 14-19/08/2026 — ver src/lib/db.js:notifyMusicReady).

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

  // O <input type="date"> devolve "AAAA-MM-DD" no calendário LOCAL do navegador (fuso do Brasil,
  // UTC-3), mas createdAt é gravado sempre em UTC (new Date().toISOString(), convenção do projeto —
  // ver CLAUDE.md). Comparar a string bruta do input contra createdAt tratava "AAAA-MM-DD" como se
  // já fosse meia-noite UTC — 3 horas ANTES da meia-noite local de verdade. Resultado: filtrar "dia
  // 12" incluía pedidos feitos às 21h do dia 11 no horário do Brasil. `new Date("...T00:00:00")` sem
  // sufixo de fuso é interpretado como horário LOCAL pelo motor JS — é isso que corrige o deslocamento.
  const localDayStartIso = (dateStr) => (dateStr ? new Date(`${dateStr}T00:00:00`).toISOString() : null);
  const localDayEndIso = (dateStr) => (dateStr ? new Date(`${dateStr}T23:59:59.999`).toISOString() : null);

  // Load orders — sem limite quando loadAll=true, senão usa pageSize.
  useEffect(() => {
    if (!user) return;

    // Filtro de data já entra na query do Firestore (onde() sobre createdAt) — não só no cliente
    // depois do fetch. Padrão é "hoje" (ver todayLocalStr), então o carregamento comum lê poucos
    // documentos em vez da base inteira.
    const constraints = [];
    if (dateFrom) constraints.push(where('createdAt', '>=', localDayStartIso(dateFrom)));
    if (dateTo) constraints.push(where('createdAt', '<=', localDayEndIso(dateTo)));
    constraints.push(orderBy('createdAt', 'desc'));
    if (!loadAll) constraints.push(fbLimit(pageSize + 1));

    const q = query(collection(db, 'orders'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Exclusão lógica e de sistema — pedidos excluídos, sessões e configs não aparecem na listagem.
        if (data.deletedAt || doc.id.startsWith('config_') || doc.id.startsWith('session_') || data.productionStatus === 'CONFIG' || data.productionStatus === 'RASCUNHO') return;
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
  }, [user, loadAll, pageSize, dateFrom, dateTo]);

  // Escuta configurações do WhatsApp (Master Switch do Agente)
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'orders', 'config_whatsapp'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAgentEnabled(data.agentEnabled !== false);
      } else {
        setAgentEnabled(true);
      }
    });
    return () => unsub();
  }, [user]);

  const handleToggleAgent = async () => {
    setTogglingAgent(true);
    try {
      await setDoc(doc(db, 'orders', 'config_whatsapp'), {
        orderNumber: 'CONFIG-WHATSAPP',
        productionStatus: 'CONFIG',
        agentEnabled: !agentEnabled,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      alert('Erro ao alterar status do robô: ' + err.message);
    } finally {
      setTogglingAgent(false);
    }
  };

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
    } else if (purchaseTypeTab === 'PIX_COPIADO') {
      // Copiou o código e ainda não consta pago — é exatamente o perfil dos pagamentos que ficaram
      // sem computar (achado 20/09/2026). Serve pra conferir na mão e pra medir quanta gente copia
      // o Pix e desiste.
      result = result.filter(o =>
        o.pixCopiedAt && o.paymentStatus !== 'PAGAMENTO_APROVADO' && o.paymentStatus !== 'PAGO'
      );
    }

    // Filtro de data já aconteceu na query do Firestore (where() em createdAt) — orders só chega
    // aqui com o intervalo certo, não precisa refiltrar.

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

    if (paymentStatusFilter !== 'ALL') {
      // PAGAMENTO_APROVADO e PAGO são equivalentes (ver CLAUDE.md) — filtro "Pago" cobre os dois.
      result = result.filter(o =>
        paymentStatusFilter === 'PAGAMENTO_APROVADO'
          ? (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO')
          : o.paymentStatus === paymentStatusFilter
      );
    }

    if (productionStatusFilter !== 'ALL') {
      result = result.filter(o => o.productionStatus === productionStatusFilter);
    }

    // Ordenação — client-side porque a lista já está toda carregada em memória (evita depender de
    // índice composto novo no Firestore só pra isso, ver .claude/rules/database.md). paidAt ausente
    // vai sempre para o fim, em qualquer direção de ordenação.
    const sorted = [...result];
    const getTime = (v) => {
      const iso = toISOStr(v);
      return iso ? new Date(iso).getTime() : null;
    };
    sorted.sort((a, b) => {
      const field = sortBy.startsWith('paidAt') ? 'paidAt' : 'createdAt';
      const dir = sortBy.endsWith('_asc') ? 1 : -1;
      const ta = getTime(a[field]);
      const tb = getTime(b[field]);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return (ta - tb) * dir;
    });

    return sorted;
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

  // Os cards de faturamento/vendas/pedidos do topo viraram um componente próprio (pedido 12/09/2026:
  // "os valores não estão batendo" com a tabela Vendas por dia) — ver src/components/FaturamentoCards.jsx
  // pro porquê de precisar de consulta independente desta lista paginada.

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
  const PLAYBACK_PRICE = getPriceForSku('playback_addon'); // 4.99
  const CARTA_PRICE = getPriceForSku('carta_addon'); // 3.99

  // Reconstrói o que o pedido tem CONFIRMADO por produto (música / vídeo / playback), a partir dos
  // flags que applyPaymentApproval grava por aprovação — nunca de `expectedAmount`, que é
  // sobrescrito a cada nova cobrança criada em /api/payments/create. Antes disso, a coluna Valor da
  // tabela "regredia" pro preço do add-on assim que o cliente comprava vídeo/playback depois da
  // música, escondendo o que já tinha sido pago (achado do admin, 31/08/2026).
  const getOrderProductBreakdown = (o) => {
    const amountByTxid = o.paymentIntentAmountByTxid || {};
    const items = [];
    const isPaidMusic = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';

    if (isPaidMusic) {
      let musicAmount = parseAmount(amountByTxid[o.paymentId], null);
      if (musicAmount === null) musicAmount = parseAmount(o.expectedAmount, null);
      if (musicAmount === null || musicAmount === 0) musicAmount = AUDIO_PRICE;
      // Vídeo concedido pelo próprio SKU da música (combo/recovery_combo) tem hasVideoAccess sem
      // videoPaymentId próprio — é a mesma cobrança, uma única cobrança paga por dois produtos.
      // Separa em dois itens (preço base da música + o excedente) pra sempre aparecer a seta de
      // detalhamento quando o cliente levou os dois, mesmo pagando tudo de uma vez só (achado do
      // admin, 31/08/2026: combo não mostrava a seta porque virava um item só).
      const videoIncludedNoCharge = Boolean(o.hasVideoAccess && !o.videoPaymentId);
      if (videoIncludedNoCharge && musicAmount > AUDIO_PRICE) {
        items.push({ label: '🎵 Música (combo)', amount: AUDIO_PRICE });
        items.push({ label: '🎬 Vídeo (combo)', amount: musicAmount - AUDIO_PRICE });
      } else {
        items.push({
          label: videoIncludedNoCharge ? '🎵 Música + 🎬 Vídeo (combo)' : '🎵 Música',
          amount: musicAmount,
        });
      }
    }

    if (o.videoAddonPaid && o.videoPaymentId) {
      let videoAmount = parseAmount(amountByTxid[o.videoPaymentId], null);
      if (videoAmount === null || videoAmount === 0) videoAmount = VIDEO_PRICE;
      items.push({ label: '🎬 Vídeo (add-on)', amount: videoAmount });
    }

    if (o.playbackAddonPaid && o.playbackPaymentId) {
      let playbackAmount = parseAmount(amountByTxid[o.playbackPaymentId], null);
      if (playbackAmount === null || playbackAmount === 0) playbackAmount = PLAYBACK_PRICE;
      items.push({ label: '🎧 Playback (add-on)', amount: playbackAmount });
    }

    if (o.cartaAddonPaid && o.cartaPaymentId) {
      let cartaAmount = parseAmount(amountByTxid[o.cartaPaymentId], null);
      if (cartaAmount === null || cartaAmount === 0) cartaAmount = CARTA_PRICE;
      items.push({ label: '💌 Carta (add-on)', amount: cartaAmount });
    }

    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return { items, total };
  };

  // getFaturamentoMusicas/Videos/Total, getVendasCount e getGastoGeracaoMusicas viraram
  // FaturamentoCards.jsx (pedido 12/09/2026) — a lógica de valor combo/vídeo separado e o custo por
  // geração da Kie.ai continuam do mesmo jeito lá, só a fonte dos pedidos mudou (consulta própria por
  // data de PAGAMENTO em vez de reaproveitar esta lista, filtrada por data de CRIAÇÃO).



  // Reconciliação no servidor: varre pedidos presos em GERANDO_AUDIO e pagamentos ainda em
  // AGUARDANDO_PAGAMENTO, confirmando cada um direto na Kie.ai e na Efí. Existe porque a via normal
  // (webhook + polling do navegador do cliente) morre junto com a aba do cliente — ver o comentário
  // de topo de src/app/api/orders/reconcile/route.js.

  // Varredura de conferência de pagamentos (pedido 20/09/2026): cruza as cobranças geradas com o
  // status REAL na Efí e mostra as que foram pagas e não liberaram nada. Duas etapas de propósito —
  // primeiro o relatório (GET, não muda nada), e só depois de ver a lista é que o admin confirma
  // (POST). Ver src/app/api/orders/audit-payments/route.js.
  // Carrega o número salvo ao abrir o painel. Se nunca foi salvo, mostra o padrão do código, que
  // é o que as páginas do cliente estão usando de fato.
  useEffect(() => {
    lerConfigSite().then((cfg) => {
      setNumeroSuporte(cfg?.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO);
    });
  }, []);


  const handleSalvarNumeroSuporte = async () => {
    const normalizado = normalizarNumeroWhatsapp(numeroSuporte);
    if (!normalizado) {
      setMsgNumero('Número inválido. Use DDD + número, por exemplo 94991064043.');
      return;
    }
    setSalvandoNumero(true);
    setMsgNumero('');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ whatsappSuporte: normalizado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsgNumero(data.error || 'Não foi possível salvar.');
        return;
      }
      setNumeroSuporte(data.whatsappSuporte);
      setMsgNumero('✅ Salvo. Os botões do site já apontam para este número.');
    } catch (err) {
      setMsgNumero('Falha de conexão ao salvar.');
    } finally {
      setSalvandoNumero(false);
    }
  };

  const handleAuditPayments = async (aplicar = false) => {
    if (aplicar && !confirm('Confirmar e liberar TODOS os pagamentos encontrados nesta varredura?')) return;

    setAuditing(true);
    if (!aplicar) setAuditResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const params = new URLSearchParams({ dias: String(auditDias) });
      if (auditSoCopiaram) params.set('pixCopiado', 'true');

      const res = await fetch(`/api/orders/audit-payments?${params}`, {
        method: aplicar ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      setAuditResult(res.ok ? data : { error: data.error || 'Falha na varredura.' });
    } catch (e) {
      setAuditResult({ error: 'Falha de conexão na varredura.' });
    } finally {
      setAuditing(false);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              <Image src="/logo.png" alt="NSMusic" width={36} height={36} style={{ height: '36px', width: 'auto' }} priority />
              <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Painel Admin</span>
            </Link>

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                💰 Conferir Pagamentos
              </button>
              <Link href="/admin/dashboard" style={{ ...styles.tabBtn, backgroundColor: '#e2e8f0', color: '#334155', textDecoration: 'none', display: 'inline-block' }}>
                📊 Dashboard
              </Link>
              <Link href="/admin/cartas" style={{ ...styles.tabBtn, backgroundColor: '#e2e8f0', color: '#334155', textDecoration: 'none', display: 'inline-block' }}>
                💌 Temas da Carta
              </Link>
              <button
                onClick={() => setActiveTab('AJUSTES')}
                style={{
                  ...styles.tabBtn,
                  backgroundColor: activeTab === 'AJUSTES' ? '#7c3aed' : '#e2e8f0',
                  color: activeTab === 'AJUSTES' ? '#ffffff' : '#334155',
                }}
              >
                ⚙️ Ajustes
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
          
          {activeTab === 'AJUSTES' ? (
            <div style={{ maxWidth: '760px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px' }}>Ajustes</h2>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 20px' }}>
                Configurações que valem para o site inteiro. Mudam na hora, sem precisar de deploy.
              </p>
              {/* Barra de Controle Master do Agente WhatsApp */}
              <div className="admin-agent-bar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderRadius: '12px',
                background: agentEnabled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: agentEnabled ? '1.5px solid #10b981' : '1.5px solid #ef4444',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span className="admin-agent-icon" style={{ fontSize: '1.3rem', flexShrink: 0 }}>{agentEnabled ? '🤖' : '🛑'}</span>
                  <div style={{ minWidth: 0 }}>
                    <h4 className="admin-agent-title" style={{ margin: 0, fontSize: '0.92rem', fontWeight: '800', color: agentEnabled ? '#047857' : '#b91c1c' }}>
                      Robô WhatsApp: {agentEnabled ? 'ATIVADO' : 'DESATIVADO (Atendimento 100% Humano)'}
                    </h4>
                    <p className="admin-agent-desc" style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#475569' }}>
                      {agentEnabled
                        ? 'A IA está conversando com clientes no WhatsApp. Se quiser assumir sem interferência, desative aqui.'
                        : 'A IA está 100% em silêncio no WhatsApp. Você pode conversar livremente com os clientes.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="admin-agent-btn"
                  onClick={handleToggleAgent}
                  disabled={togglingAgent}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: '800',
                    borderRadius: '8px',
                    backgroundColor: agentEnabled ? '#ef4444' : '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: agentEnabled ? '0 4px 12px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {togglingAgent ? 'Salvando...' : (agentEnabled ? '🛑 Desativar' : '✅ Ativar')}
                </button>
              </div>

              {/* Número de WhatsApp do suporte. Editável aqui de propósito: é para onde TODOS os
                  botões "Falar no WhatsApp" do site mandam o cliente, e trocar isso no código
                  exigiria deploy (pedido 21/09/2026, número principal suspenso). */}
              <div style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
              }}>
                <label htmlFor="numeroSuporte" style={{ fontSize: '0.82rem', fontWeight: '700', color: '#334155' }}>
                  📱 WhatsApp do suporte
                </label>
                <input
                  id="numeroSuporte"
                  type="tel"
                  value={numeroSuporte}
                  onChange={(e) => { setNumeroSuporte(e.target.value); setMsgNumero(''); }}
                  placeholder="94991064043"
                  style={{
                    flex: '1 1 160px',
                    minWidth: '140px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSalvarNumeroSuporte}
                  disabled={salvandoNumero}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: salvandoNumero ? '#94a3b8' : '#7c3aed',
                    color: '#fff',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    cursor: salvandoNumero ? 'default' : 'pointer',
                  }}
                >
                  {salvandoNumero ? 'Salvando...' : 'Salvar'}
                </button>
                {msgNumero && (
                  <span style={{ fontSize: '0.8rem', color: msgNumero.startsWith('✅') ? '#059669' : '#dc2626', flexBasis: '100%' }}>
                    {msgNumero}
                  </span>
                )}
              </div>

            </div>
          ) : activeTab === 'ORDERS' ? (
            <div>
              {/* Cards de faturamento/vendas/pedidos do período — pedido 12/09/2026, ver comentário
                  em src/components/FaturamentoCards.jsx pro porquê de ser consulta própria. */}
              <FaturamentoCards dateFrom={dateFrom} dateTo={dateTo} />

              {/* Tabela por dia, mapa de calor por horário e mapa por estado moraram aqui até
                  12/09/2026 — pedido do dono pra ficarem em /admin/dashboard junto do resto da
                  análise (esta página é pra navegar PEDIDOS, não pra ser o painel de métricas). */}

              {/* Filtros e Barra de Ações em Massa */}
              <div style={{ marginTop: '32px' }}>
                {/* Abas: tipo de compra (música/vídeo) */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'ALL', label: 'Todas as vendas' },
                    { id: 'MUSIC', label: '🎵 Vendas de música' },
                    { id: 'VIDEO', label: '🎬 Vendas de vídeo' },
                    // Copiou o código Pix e não consta como pago: é onde mora um pagamento não
                    // computado, se houver (pedido 20/09/2026).
                    { id: 'PIX_COPIADO', label: '📋 Copiou PIX e não pagou' },
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

                  <div>
                    <label htmlFor="admin-payment-status" style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px' }}>Status pagamento</label>
                    <select
                      id="admin-payment-status"
                      value={paymentStatusFilter}
                      onChange={(e) => setPaymentStatusFilter(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a' }}
                    >
                      <option value="ALL">Todos</option>
                      <option value="AGUARDANDO_PAGAMENTO">Aguardando pagamento</option>
                      <option value="PAGAMENTO_APROVADO">Pago</option>
                      <option value="RECUSADO">Recusado</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="admin-production-status" style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px' }}>Status produção</label>
                    <select
                      id="admin-production-status"
                      value={productionStatusFilter}
                      onChange={(e) => setProductionStatusFilter(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a' }}
                    >
                      <option value="ALL">Todos</option>
                      <option value="LETRA_APROVADA">Letra aprovada</option>
                      <option value="EM_PRODUCAO">Em produção</option>
                      <option value="VERSOES_EM_PRODUCAO">Versões em produção</option>
                      <option value="AUDIO_GERADO">Áudio gerado</option>
                      <option value="FINALIZADO">Finalizado</option>
                      <option value="ENTREGUE">Entregue</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="admin-sort-by" style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px' }}>Ordenar por</label>
                    <select
                      id="admin-sort-by"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a' }}
                    >
                      <option value="createdAt_desc">Criação (mais recente)</option>
                      <option value="createdAt_asc">Criação (mais antigo)</option>
                      <option value="paidAt_desc">Pagamento (mais recente)</option>
                      <option value="paidAt_asc">Pagamento (mais antigo)</option>
                    </select>
                  </div>
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
                          <th style={styles.th}>Pago em</th>
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
                                  {o.customerPhone ? (
                                    <a
                                      href={`https://wa.me/${formatToWhatsAppNumber(o.customerPhone)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Abrir conversa no WhatsApp"
                                      style={{ fontSize: '0.8rem', color: '#25D366', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                    >
                                      📲 {o.customerPhone}
                                    </a>
                                  ) : (
                                    <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: '500' }}>N/A</span>
                                  )}
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
                                  {/* Achado 09/09/2026: mostra de relance se o cliente já deu play na
                                      prévia (ver src/lib/previewTracking.js) — ajuda a separar "não
                                      gostou" de "nunca conseguiu ouvir" sem abrir o pedido. */}
                                  {/* Pedido de antes do rastreamento (09/09/2026) não tem esse dado —
                                      mostrar apagado (não "não ouviu") seria enganoso, então some. */}
                                  {(o.previewListenedAt || hasPreviewTrackingData(o)) && (
                                    <span
                                      title={o.previewListenedAt ? `Ouviu a prévia em ${new Date(o.previewListenedAt).toLocaleString('pt-BR')}` : 'Ainda não deu play na prévia'}
                                      style={{ fontSize: '0.85rem', opacity: o.previewListenedAt ? 1 : 0.25 }}
                                    >
                                      🎧
                                    </span>
                                  )}
                                  {/* Copiou o código Pix = intenção declarada de pagar (pedido
                                      20/09/2026). Quem copiou e não consta como pago é o primeiro
                                      lugar pra procurar pagamento não computado. Só aparece quando
                                      houve a cópia: um ícone apagado em pedido antigo (de antes
                                      deste rastreio) seria lido como "não copiou", que é falso. */}
                                  {o.pixCopiedAt && (
                                    <span
                                      title={`Copiou o código Pix em ${new Date(o.pixCopiedAt).toLocaleString('pt-BR')}`}
                                      style={{ fontSize: '0.85rem' }}
                                    >
                                      📋
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ ...styles.td, fontWeight: '700' }}>
                                {(() => {
                                  const { items, total } = getOrderProductBreakdown(o);
                                  if (items.length === 0) return <span style={{ color: '#94a3b8', fontWeight: '500' }}>Não pago</span>;
                                  const isExpanded = expandedValueRows.has(o.id);
                                  return (
                                    <div>
                                      <button
                                        type="button"
                                        onClick={() => toggleValueExpanded(o.id)}
                                        title={isExpanded ? 'Ocultar produtos confirmados' : 'Ver produtos confirmados'}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#059669', fontWeight: '700', fontSize: 'inherit', fontFamily: 'inherit' }}
                                      >
                                        R$ {total.toFixed(2).replace('.', ',')}
                                        {items.length > 1 && (
                                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{isExpanded ? '▲' : '▼'}</span>
                                        )}
                                      </button>
                                      {isExpanded && items.length > 1 && (
                                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                          {items.map((item) => (
                                            <span key={item.label} style={{ fontSize: '0.7rem', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>
                                              {item.label}: R$ {item.amount.toFixed(2).replace('.', ',')}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
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
                              <td style={{ ...styles.td, fontSize: '0.85rem', color: o.paidAt ? '#059669' : '#94a3b8', fontWeight: '600', whitespace: 'nowrap' }}>
                                {o.paidAt ? `💰 ${formatDateWithTime(o.paidAt)}` : '—'}
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
            // Conferência de pagamento. Esta aba já teve mutirões de reenvio (música presa e
            // WhatsApp de "música pronta"), removidos em 20/09/2026 por serem de incidentes
            // encerrados ou falso positivo — sobrou o que é útil no dia a dia.
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>Conferência de Pagamentos</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>
                Pergunta à Efí quais cobranças foram realmente pagas e não liberaram o produto.
              </p>

              {/* Duas etapas de propósito: o admin primeiro VÊ a lista do que a Efí diz que foi
                  pago e não liberou, e só então decide confirmar. Cobre também add-on avulso, que
                  nunca mexe em paymentStatus e some de qualquer conferência que só olhe esse campo. */}
              <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>
                  Conferir pagamentos contra a Efí
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '14px' }}>
                  Pergunta à Efí, cobrança por cobrança, quais foram realmente pagas e não liberaram
                  o produto — música ou add-on. A conferência não altera nada; depois de ver a lista
                  você decide se confirma.
                </p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <label style={{ fontSize: '0.85rem', color: '#334155', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Período:
                    <select
                      value={auditDias}
                      onChange={(e) => setAuditDias(Number(e.target.value))}
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    >
                      <option value={1}>24 horas</option>
                      <option value={3}>3 dias</option>
                      <option value={7}>7 dias</option>
                      <option value={15}>15 dias</option>
                      <option value={30}>30 dias</option>
                    </select>
                  </label>

                  <label style={{ fontSize: '0.85rem', color: '#334155', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={auditSoCopiaram} onChange={(e) => setAuditSoCopiaram(e.target.checked)} />
                    📋 Só quem copiou o PIX
                  </label>

                  <button
                    type="button"
                    onClick={() => handleAuditPayments(false)}
                    disabled={auditing}
                    className="btn btn-primary"
                    style={{ padding: '11px 20px', fontSize: '0.9rem', fontWeight: '700', opacity: auditing ? 0.6 : 1, cursor: auditing ? 'wait' : 'pointer' }}
                  >
                    {auditing ? '⏳ Conferindo...' : '🔎 Conferir pagamentos'}
                  </button>
                </div>

                {auditResult && (
                  auditResult.error ? (
                    <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', color: '#991b1b', fontWeight: '600', fontSize: '0.85rem' }}>
                      {auditResult.error}
                    </div>
                  ) : (
                    <div style={{ padding: '12px 16px', backgroundColor: auditResult.pagosNaoLiberados > 0 ? '#fef3c7' : '#d1fae5', border: `1px solid ${auditResult.pagosNaoLiberados > 0 ? '#f59e0b' : '#10b981'}`, borderRadius: '8px', color: auditResult.pagosNaoLiberados > 0 ? '#92400e' : '#065f46', fontSize: '0.85rem' }}>
                      <strong>
                        {auditResult.verificados} cobrança(s) conferida(s) em {auditResult.dias} dia(s) —{' '}
                        {auditResult.pagosNaoLiberados} paga(s) e não liberada(s)
                        {auditResult.pagosNaoLiberados > 0 ? ` (R$ ${auditResult.valorTotal.toFixed(2).replace('.', ',')})` : ''}.
                      </strong>
                      {auditResult.naoVerificados > 0 && (
                        <div style={{ marginTop: '4px', fontWeight: '500' }}>
                          {auditResult.naoVerificados} ficaram fora do limite desta execução — rode de novo para conferir o restante.
                        </div>
                      )}

                      {auditResult.itens?.length > 0 && (
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {auditResult.itens.map((it) => (
                            <div key={it.txid} style={{ padding: '8px 10px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#0f172a' }}>
                              <strong>{it.orderNumber || it.orderId}</strong> · {it.customerName || 'Cliente'} · {it.customerPhone || 'sem telefone'}
                              <br />
                              {it.tipo === 'addon' ? `Add-on (${it.sku})` : 'Música'} · R$ {Number(it.valor || 0).toFixed(2).replace('.', ',')} · pago em {it.pagoEm ? new Date(it.pagoEm).toLocaleString('pt-BR') : '—'}
                              {it.aprovado && <span style={{ color: '#059669', fontWeight: '700' }}> · ✅ liberado agora</span>}
                              {it.erroAprovacao && <span style={{ color: '#b91c1c', fontWeight: '700' }}> · ❌ falhou ao liberar</span>}
                            </div>
                          ))}

                          {!auditResult.aplicado && (
                            <button
                              type="button"
                              onClick={() => handleAuditPayments(true)}
                              disabled={auditing}
                              style={{ marginTop: '6px', padding: '11px 20px', fontSize: '0.88rem', fontWeight: '800', borderRadius: '8px', border: 'none', background: '#059669', color: '#fff', cursor: auditing ? 'wait' : 'pointer' }}
                            >
                              ✅ Confirmar e liberar {auditResult.pagosNaoLiberados} pagamento(s)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>


              {/* Removidos em 20/09/2026 a pedido do dono: o mutirão de reenvio do WhatsApp
                  "música pronta" (incidente de 14/08, já encerrado) e a lista de "pedidos travados
                  na geração", que na prática só juntava quem desistiu antes de aprovar a letra —
                  falso positivo, sem motivo registrado. Conferência de pagamento vive no card 2. */}
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
    flexWrap: 'wrap',
    gap: '12px',
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
    flexWrap: 'wrap',
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
