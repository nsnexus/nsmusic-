'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, limit as fbLimit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getPriceForSku } from '@/lib/pricing';
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

  // Paginação (M-09 no AUDIT_REPORT.md) — antes o painel baixava a coleção inteira via onSnapshot,
  // sem limite. pageSize cresce a cada "Carregar mais" em vez de ler tudo de uma vez.
  const PAGE_SIZE = 50;
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Exclusão em massa
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [deletingOrders, setDeletingOrders] = useState(false);

  // Pricing tab state
  const [activeTab, setActiveTab] = useState('ORDERS'); // 'ORDERS', 'PRICING', 'CAMPAIGNS'

  // Campanhas de WhatsApp em lote (recuperação e upsell de vídeo) — só a lista de quem foi
  // deliberadamente desmarcado antes do envio; por padrão todo mundo elegível vem selecionado.
  const [recoveryDeselected, setRecoveryDeselected] = useState(new Set());
  const [videoUpsellDeselected, setVideoUpsellDeselected] = useState(new Set());
  const [sendingCampaign, setSendingCampaign] = useState(null); // null | 'recovery' | 'video_upsell'
  const [campaignResult, setCampaignResult] = useState(null);
  const [packages, setPackages] = useState([]);
  const [addons, setAddons] = useState([]);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState('');

  const router = useRouter();

  // Default values to initialize or fallback
  const defaultPackages = [
    { id: 'essencial', name: 'Essencial', price: 9.99, desc: '1 Música + MP3 + Capa Simples' },
    { id: 'presente', name: 'Presente Completo', price: 9.99, desc: '1 Música + MP3/WAV + Capa Personalizada + QR Code' },
    { id: 'tres_versoes', name: 'Multi-Estilos (3 Versões)', price: 9.99, desc: '3 Versões com ritmos diferentes + Capa + QR Code' }
  ];

  const defaultAddons = [
    { id: 'extraSongs2', name: '➕ 2 Músicas adicionais (mesma letra, estilos diferentes)', price: 9.99 },
    { id: 'extraSongs3', name: '➕ 3 Músicas adicionais (mesma letra, estilos diferentes)', price: 9.99 },
    { id: 'photoVideo', name: '🎥 Vídeo com fotos (sincronizado com a música)', price: 9.99 },
    { id: 'spotifyDistribution', name: '🎧 Publicação no Spotify e plataformas de streaming', price: 9.99 },
    { id: 'premiumCover', name: '🖼️ Capa Premium personalizada profissional', price: 9.99 },
    { id: 'qrCode', name: '📱 QR Code da música para cartões e presentes', price: 9.99 },
    { id: 'instrumentalVersion', name: '🎤 Versão Instrumental (Sem voz - para karaokê)', price: 9.99 },
    { id: 'wavFormat', name: '💿 Áudio em formato WAV (Qualidade de estúdio)', price: 9.99 },
    { id: 'priorityDelivery', name: '🚀 Entrega Prioritária em até 24 horas', price: 9.99 },
  ];

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

  // Load orders (paginado — ver PAGE_SIZE acima)
  useEffect(() => {
    if (!user) return;

    // Busca um a mais que o pageSize só para saber se existe uma próxima página, sem exibi-lo.
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), fbLimit(pageSize + 1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Exclusão lógica (M-07 no AUDIT_REPORT.md) — pedidos excluídos não aparecem na listagem.
        if (data.deletedAt) return;
        ordersData.push({ id: doc.id, ...data });
      });
      setHasMoreOrders(ordersData.length > pageSize);
      setOrders(ordersData.slice(0, pageSize));
      setLoadingOrders(false);
      setLoadingMore(false);
    }, (error) => {
      console.error("Erro ao escutar pedidos:", error);
      setLoadingOrders(false);
      setLoadingMore(false);
    });

    return () => unsubscribe();
  }, [user, pageSize]);

  const handleLoadMoreOrders = () => {
    setLoadingMore(true);
    setPageSize(prev => prev + PAGE_SIZE);
  };

  // Load pricing
  useEffect(() => {
    if (!user) return;

    const loadPricing = async () => {
      setLoadingPricing(true);
      try {
        const docSnap = await getDoc(doc(db, 'config', 'pricing'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPackages(data.packages || defaultPackages);
          setAddons(data.addons || defaultAddons);
        } else {
          setPackages(defaultPackages);
          setAddons(defaultAddons);
        }
      } catch (err) {
        console.error("Erro ao carregar preços:", err);
        setPackages(defaultPackages);
        setAddons(defaultAddons);
      }
      setLoadingPricing(false);
    };

    loadPricing();
  }, [user]);

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
    }

    // toISOStr normaliza Timestamp/string/number para ISO antes de comparar
    // lexicograficamente com o "YYYY-MM-DD" do <input type="date">.
    if (dateFrom) {
      result = result.filter(o => {
        const d = toISOStr(o.createdAt);
        return d !== null && d >= dateFrom;
      });
    }
    if (dateTo) {
      result = result.filter(o => {
        const d = toISOStr(o.createdAt);
        return d !== null && d <= `${dateTo}T23:59:59.999`;
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

  // Faturamento respeita o filtro de data (quando definido), mas não as abas de status/tipo — os
  // cartões de topo mostram sempre "quanto entrou no período", independente de qual lista o admin
  // está navegando no momento.
  const getOrdersInDateRange = () => {
    let result = orders;
    if (dateFrom) result = result.filter(o => o.createdAt && o.createdAt >= dateFrom);
    if (dateTo) result = result.filter(o => o.createdAt && o.createdAt <= `${dateTo}T23:59:59.999`);
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
  const getFaturamentoMusicas = () => {
    return getOrdersInDateRange()
      .filter(o => o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO')
      .reduce((sum, o) => {
        let val = parseAmount(o.expectedAmount, null);
        if (val === null) val = parseAmount(o.total, null);
        
        // Fallback: se o pedido está pago mas não tem valor salvo (ou está como 0), assume o valor base de 9.99
        if (val === null || val === 0) val = 9.99;
        
        return sum + val;
      }, 0);
  };

  // Conta só o add-on de vídeo vendido SEPARADAMENTE (videoPaymentId só existe nesse caso — ver
  // src/lib/payments.js). Pedidos do pacote combo também têm videoAddonPaid=true (o vídeo vem
  // incluído), mas o valor do vídeo já está dentro do expectedAmount do combo, somado em
  // getFaturamentoMusicas — contar de novo aqui duplicava a receita do vídeo em todo combo vendido.
  const getFaturamentoVideos = () => {
    const videoPrice = getPriceForSku('video_addon'); // preço fixo do add-on, sem variação por pedido
    return getOrdersInDateRange()
      .filter(o => o.videoAddonPaid && o.videoPaymentId)
      .reduce((sum, o) => sum + videoPrice, 0);
  };

  const getFaturamentoTotal = () => {
    return getFaturamentoMusicas() + getFaturamentoVideos();
  };

  // Candidatos das campanhas — a rota /api/whatsapp/campaign reconfirma o mesmo critério no
  // servidor antes de enviar, então esta lista é só para revisão, nunca a autorização em si.
  const getRecoveryCandidates = () => orders.filter(o =>
    o.productionStatus === 'AUDIO_GERADO' &&
    o.paymentStatus !== 'PAGAMENTO_APROVADO' &&
    o.paymentStatus !== 'PAGO' &&
    !o.recoveryMessageSentAt &&
    o.customerPhone
  );

  const getVideoUpsellCandidates = () => orders.filter(o =>
    (o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO') &&
    !o.hasVideoAccess &&
    !o.videoAddonPaid &&
    !o.videoUpsellMessageSentAt &&
    o.customerPhone
  );

  const toggleCampaignSelection = (type, orderId) => {
    const setFn = type === 'recovery' ? setRecoveryDeselected : setVideoUpsellDeselected;
    setFn(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  const handleSendCampaign = async (type, candidates) => {
    const deselected = type === 'recovery' ? recoveryDeselected : videoUpsellDeselected;
    const orderIds = candidates.filter(o => !deselected.has(o.id)).map(o => o.id);
    if (orderIds.length === 0) return;

    const label = type === 'recovery' ? 'recuperação (última chance)' : 'upsell de vídeo';
    if (!confirm(`Enviar mensagem de ${label} para ${orderIds.length} cliente(s)? Isso envia WhatsApp de verdade, agora.`)) return;

    setSendingCampaign(type);
    setCampaignResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/whatsapp/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ orderIds, type })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCampaignResult({ type, ...data });
      } else {
        alert(data.error || 'Falha ao enviar a campanha.');
      }
    } catch (err) {
      console.error('Erro ao enviar campanha:', err);
      alert('Falha ao enviar a campanha.');
    }
    setSendingCampaign(null);
  };

  const getOccasionEmoji = (occ) => {
    switch (occ) {
      case 'Aniversário': return '🎂';
      case 'Aniv. de Casamento': return '💎';
      case 'Dia dos Namorados': return '💝';
      case 'Dia das Mães': return '🌷';
      default: return '✨';
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

  // Pricing edit handlers
  const handleUpdatePackage = (index, field, value) => {
    const updated = [...packages];
    updated[index][field] = field === 'price' ? parseFloat(value) || 0 : value;
    setPackages(updated);
  };

  const handleUpdateAddon = (index, field, value) => {
    const updated = [...addons];
    updated[index][field] = field === 'price' ? parseFloat(value) || 0 : value;
    setAddons(updated);
  };

  const handleAddPackage = () => {
    const newId = `pacote_${Date.now()}`;
    setPackages([...packages, { id: newId, name: 'Novo Pacote', price: 9.99, desc: 'Descrição do pacote...' }]);
  };

  const handleRemovePackage = (index) => {
    setPackages(packages.filter((_, i) => i !== index));
  };

  const handleAddAddon = () => {
    const newId = `addon_${Date.now()}`;
    setAddons([...addons, { id: newId, name: 'Novo Adicional', price: 9.99 }]);
  };

  const handleRemoveAddon = (index) => {
    setAddons(addons.filter((_, i) => i !== index));
  };

  const handleSavePricing = async () => {
    setSavingPricing(true);
    setPricingMessage('');
    try {
      await setDoc(doc(db, 'config', 'pricing'), {
        packages,
        addons
      });
      setPricingMessage('✅ Configurações de preços salvas com sucesso!');
      setTimeout(() => setPricingMessage(''), 4000);
    } catch (err) {
      console.error(err);
      setPricingMessage('❌ Erro ao salvar preços no Firestore.');
    }
    setSavingPricing(false);
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
                onClick={() => setActiveTab('PRICING')}
                style={{
                  ...styles.tabBtn,
                  backgroundColor: activeTab === 'PRICING' ? '#7c3aed' : '#e2e8f0',
                  color: activeTab === 'PRICING' ? '#ffffff' : '#334155',
                }}
              >
                💵 Preços & Pacotes
              </button>
              <button
                onClick={() => setActiveTab('CAMPAIGNS')}
                style={{
                  ...styles.tabBtn,
                  backgroundColor: activeTab === 'CAMPAIGNS' ? '#7c3aed' : '#e2e8f0',
                  color: activeTab === 'CAMPAIGNS' ? '#ffffff' : '#334155',
                }}
              >
                📣 Campanhas
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
                  <span style={styles.metricLabel}>Pedidos (Total)</span>
                  <h2 style={{ ...styles.metricValue, color: '#d97706' }}>{orders.length}</h2>
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
                          <th style={styles.th}>Homenageado</th>
                          <th style={styles.th}>Estilo/Voz</th>
                          <th style={styles.th}>Pacote</th>
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
                                <div style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: '500' }}>{o.customerPhone || 'N/A'}</div>
                              </td>
                              <td style={styles.td}>
                                <span style={{ color: '#0f172a', fontWeight: '600' }}>
                                  {getOccasionEmoji(o.occasion)} {o.honoreeName || 'N/A'}
                                </span>
                              </td>
                              <td style={{ ...styles.td, fontSize: '0.85rem', color: '#334155' }}>
                                <div style={{ fontWeight: '600' }}>{o.musicStyle || 'Pop'}</div>
                                <div style={{ color: '#64748b' }}>{o.voiceType || 'Masculina'}</div>
                              </td>
                              <td style={{ ...styles.td, textTransform: 'capitalize', color: '#334155' }}>
                                {o.package || 'Promo 2 Músicas'}
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
                                  <Link href={`/admin/pedidos/${o.id}`} style={styles.manageBtn}>
                                    Gerenciar ⚙️
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
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                    <button
                      type="button"
                      onClick={handleLoadMoreOrders}
                      disabled={loadingMore}
                      className="btn btn-secondary"
                      style={{ padding: '10px 24px', fontSize: '0.9rem' }}
                    >
                      {loadingMore ? 'Carregando...' : 'Carregar mais pedidos'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'PRICING' ? (
            // Pricing management tab
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>Configurações de Preços e Pacotes</h2>
                <button 
                  onClick={handleSavePricing}
                  disabled={savingPricing}
                  style={{
                    padding: '12px 28px',
                    fontSize: '0.95rem',
                    backgroundColor: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {savingPricing ? 'Salvando...' : 'Salvar Alterações 💾'}
                </button>
              </div>

              {pricingMessage && (
                <div style={{ padding: '16px 20px', backgroundColor: '#d1fae5', border: '1px solid #10b981', color: '#065f46', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold' }}>
                  {pricingMessage}
                </div>
              )}

              {loadingPricing ? (
                <div style={styles.loadingOrders}>
                  <div style={styles.spinner} />
                  <p style={{ marginTop: '16px', color: '#475569' }}>Carregando dados de preços...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  
                  {/* Pacotes section */}
                  <div style={styles.whiteCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '1.2rem', color: '#7c3aed', fontWeight: '800' }}>Pacotes de Áudio</h3>
                      <button onClick={handleAddPackage} style={styles.addBtn}>
                        ➕ Adicionar Pacote
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {packages.map((pkg, idx) => (
                        <div key={pkg.id || idx} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ flex: 2 }}>
                              <label style={styles.formLabel}>Nome do Pacote</label>
                              <input 
                                type="text" 
                                value={pkg.name}
                                onChange={(e) => handleUpdatePackage(idx, 'name', e.target.value)}
                                style={styles.adminInput}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={styles.formLabel}>Preço (R$)</label>
                              <input 
                                type="number" 
                                step="0.01"
                                value={pkg.price}
                                onChange={(e) => handleUpdatePackage(idx, 'price', e.target.value)}
                                style={styles.adminInput}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                              <button onClick={() => handleRemovePackage(idx)} style={{ ...styles.deleteSingleBtn, padding: '10px 14px' }}>
                                🗑️ Excluir
                              </button>
                            </div>
                          </div>
                          <div>
                            <label style={styles.formLabel}>Descrição / Benefícios</label>
                            <input 
                              type="text" 
                              value={pkg.desc}
                              onChange={(e) => handleUpdatePackage(idx, 'desc', e.target.value)}
                              style={styles.adminInput}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Adicionais section */}
                  <div style={styles.whiteCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '1.2rem', color: '#2563eb', fontWeight: '800' }}>Produtos Adicionais (Addons)</h3>
                      <button onClick={handleAddAddon} style={styles.addBtn}>
                        ➕ Adicionar Opcional
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {addons.map((addon, idx) => (
                        <div key={addon.id || idx} style={{ display: 'flex', gap: '16px', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                          <div style={{ flex: 3 }}>
                            <label style={styles.formLabel}>Nome do Adicional</label>
                            <input 
                              type="text" 
                              value={addon.name}
                              onChange={(e) => handleUpdateAddon(idx, 'name', e.target.value)}
                              style={styles.adminInput}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={styles.formLabel}>Preço (R$)</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={addon.price}
                              onChange={(e) => handleUpdateAddon(idx, 'price', e.target.value)}
                              style={styles.adminInput}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: '22px' }}>
                            <button onClick={() => handleRemoveAddon(idx)} style={{ ...styles.deleteSingleBtn, padding: '10px 14px' }}>
                              🗑️ Excluir
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          ) : (
            // Campanhas de WhatsApp em lote
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>Campanhas de WhatsApp</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>
                Envios manuais em lote. Revise a lista antes de confirmar — cada cliente recebe a mensagem no máximo uma vez por campanha.
              </p>

              {campaignResult && (
                <div style={{ padding: '14px 18px', backgroundColor: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', marginBottom: '20px', color: '#065f46', fontWeight: '600', fontSize: '0.9rem' }}>
                  {campaignResult.type === 'recovery' ? 'Campanha de recuperação' : 'Campanha de upsell de vídeo'} enviada: {campaignResult.sent} enviada(s), {campaignResult.skipped} pulada(s), {campaignResult.failed} falhou(aram).
                </div>
              )}

              {[
                {
                  type: 'recovery',
                  title: '🎵 Última chance — gerou a música e não comprou',
                  subtitle: 'Convite para voltar e liberar as 2 versões por R$ 9,99, com a prévia já pronta.',
                  candidates: getRecoveryCandidates(),
                  deselected: recoveryDeselected,
                },
                {
                  type: 'video_upsell',
                  title: '🎬 Oferta do vídeo — comprou a música, ainda não tem o vídeo',
                  subtitle: 'Convite para completar a homenagem com o Vídeo Homenagem por +R$ 6,90.',
                  candidates: getVideoUpsellCandidates(),
                  deselected: videoUpsellDeselected,
                },
              ].map((campaign) => {
                const selectedCount = campaign.candidates.filter(o => !campaign.deselected.has(o.id)).length;
                return (
                  <div key={campaign.type} className="glass-card" style={{ padding: '24px', borderRadius: '16px', marginBottom: '24px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>{campaign.title}</h3>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>{campaign.subtitle}</p>

                    {campaign.candidates.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Nenhum pedido se encaixa nesse critério agora.</p>
                    ) : (
                      <>
                        <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '16px' }}>
                          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', width: '36px' }}></th>
                                <th style={{ padding: '10px 12px' }}>Cliente</th>
                                <th style={{ padding: '10px 12px' }}>Homenageado</th>
                                <th style={{ padding: '10px 12px' }}>Criado em</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campaign.candidates.map((o) => (
                                <tr key={o.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 12px' }}>
                                    <input
                                      type="checkbox"
                                      checked={!campaign.deselected.has(o.id)}
                                      onChange={() => toggleCampaignSelection(campaign.type, o.id)}
                                      aria-label={`Incluir pedido de ${o.customerName || o.id} na campanha`}
                                    />
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>{o.customerName || '—'}</td>
                                  <td style={{ padding: '8px 12px' }}>{o.honoreeName || '—'}</td>
                                  <td style={{ padding: '8px 12px' }}>{formatDateWithTime(o.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSendCampaign(campaign.type, campaign.candidates)}
                          disabled={selectedCount === 0 || sendingCampaign === campaign.type}
                          className="btn btn-primary"
                          style={{ padding: '10px 22px', fontSize: '0.9rem' }}
                        >
                          {sendingCampaign === campaign.type ? 'Enviando...' : `Enviar para ${selectedCount} cliente(s)`}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
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
