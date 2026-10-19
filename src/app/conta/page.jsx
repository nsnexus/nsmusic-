'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { auth, onAuthStateChanged, signInWithGoogle, signOut } from '@/lib/authClient';

const packages = [
  { sku: 'creditos_1', credits: 1, price: '9,99', note: 'Para experimentar', popular: false },
  { sku: 'creditos_5', credits: 5, price: '29,90', note: 'Mais escolhido · R$ 5,98/música', popular: true },
  { sku: 'creditos_10', credits: 10, price: '49,90', note: 'Super economia · R$ 4,99/música', popular: false },
];

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

export default function ContaPage() {
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pix, setPix] = useState(null);
  const [buyingSku, setBuyingSku] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function token() { return auth.currentUser?.getIdToken?.() || ''; }

  const loadAccount = useCallback(async () => {
    const accessToken = await token();
    if (!accessToken) { setLoading(false); return; }
    try {
      const res = await fetch('/api/credits/account', { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccount(data);
      } else {
        setError(data.error || 'Não foi possível carregar sua carteira.');
      }
    } catch {
      setError('Falha de conexão ao carregar a carteira.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadAccount();
      } else {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [loadAccount]);

  async function handleGoogleLogin() {
    setError('');
    try {
      const dest = typeof window !== 'undefined' ? `${window.location.origin}/conta` : '';
      await signInWithGoogle(dest);
    } catch (err) {
      console.error(err);
      setError('Não foi possível iniciar o login com o Google.');
    }
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setAccount(null);
  }

  async function buy(packageSku) {
    setError('');
    setBuyingSku(packageSku);
    const accessToken = await token();
    if (!accessToken) { setError('Entre na sua conta para comprar créditos.'); setBuyingSku(null); return; }
    try {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ packageSku })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPix(data);
      } else {
        setError(data.error || 'Não foi possível gerar o PIX.');
      }
    } catch {
      setError('Falha ao conectar com o servidor para gerar o PIX.');
    } finally {
      setBuyingSku(null);
    }
  }

  async function copy(text, type) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Não foi possível copiar agora.');
    }
  }

  // Tela de login quando deslogado
  if (!user && !loading) {
    return (
      <main style={styles.page}>
        <section style={{ ...styles.card, maxWidth: 480, textAlign: 'center', padding: '36px 24px' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>💳</div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, marginBottom: 8 }}>Minha Carteira</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: 28, lineHeight: 1.5 }}>
            Entre para guardar créditos, indicar amigos e liberar músicas personalizadas com apenas 1 clique.
          </p>

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={styles.googleBtn}
          >
            <GoogleIcon />
            <span>Continuar com o Google</span>
          </button>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span>ou</span>
            <div style={styles.dividerLine} />
          </div>

          <Link href="/login?redirect=/conta" className="btn btn-secondary" style={{ width: '100%', padding: '13px', display: 'block', textDecoration: 'none' }}>
            Entrar com E-mail e Senha
          </Link>

          <div style={{ marginTop: 24 }}>
            <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '0.84rem', textDecoration: 'none' }}>
              ← Voltar para o início
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const referralUrl = typeof window !== 'undefined' && account?.referralCode
    ? `${window.location.origin}/criar?ref=${account.referralCode}`
    : '';

  const referrals = account?.referrals || { total: 0, rewarded: 0, pending: 0, earnedCredits: 0, nextBonusProgress: 0, nextBonusTarget: 5, nextBonusRemaining: 5, list: [] };

  return (
    <main style={styles.page}>
      <section style={{ ...styles.card, maxWidth: 880 }}>
        
        {/* Barra superior com navegação */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <Link href="/minhas-musicas" style={styles.back}>← Minhas músicas</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{user?.email}</span>
            <button type="button" onClick={handleSignOut} style={styles.btnSmallGhost}>Sair</button>
          </div>
        </div>

        <h1 style={{ marginBottom: 4, fontSize: '1.75rem', fontWeight: 800 }}>Minha Conta & Carteira</h1>
        <p style={styles.muted}>Créditos válidos por tempo indeterminado — nunca vencem.</p>

        {error && <p style={styles.error}>{error}</p>}

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>Carregando sua carteira…</p>
          </div>
        ) : (
          <>
            {/* Card Saldo em Destaque */}
            <div style={styles.balance}>
              <div>
                <span style={{ fontSize: '0.9rem', opacity: 0.9, display: 'block' }}>Saldo de Créditos</span>
                <strong style={{ fontSize: '2.1rem', fontWeight: 900 }}>
                  {Number(account?.balance || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                </strong>
                <span style={{ fontSize: '1.1rem', marginLeft: 6, opacity: 0.95 }}>
                  {Number(account?.balance || 0) === 1 ? 'música disponível' : 'músicas disponíveis'}
                </span>
              </div>
              <Link href="/criar" className="btn btn-secondary" style={{ backgroundColor: '#fff', color: '#7c3aed', fontWeight: 700, padding: '10px 18px', textDecoration: 'none' }}>
                🎵 Criar Nova Música
              </Link>
            </div>

            {/* Seção Pacotes de Créditos */}
            <h2 style={styles.sectionTitle}>Comprar Pacotes de Créditos</h2>
            <p style={{ ...styles.muted, marginTop: -6, marginBottom: 16 }}>
              Pague menos por música e gere sempre que quiser sem precisar passar pelo checkout todas as vezes.
            </p>

            <div style={styles.grid}>
              {packages.map((item) => (
                <article key={item.sku} style={{ ...styles.pack, ...(item.popular ? styles.packPopular : {}) }}>
                  {item.popular && <span style={styles.badgePopular}>MAIS POPULAR</span>}
                  <strong style={{ fontSize: '1.25rem' }}>{item.credits} {item.credits === 1 ? 'Crédito' : 'Créditos'}</strong>
                  <div style={styles.priceRow}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>R$</span>
                    <span style={styles.price}>{item.price}</span>
                  </div>
                  <small style={{ color: 'var(--text-muted)', minHeight: 36, display: 'block' }}>{item.note}</small>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={buyingSku === item.sku}
                    onClick={() => buy(item.sku)}
                    style={{ width: '100%', padding: '10px 14px', marginTop: 8 }}
                  >
                    {buyingSku === item.sku ? 'Gerando PIX...' : 'Comprar Créditos'}
                  </button>
                </article>
              ))}
            </div>

            {/* Pop-up / Área do PIX gerado */}
            {pix && (
              <div style={styles.pix}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#5b21b6', fontSize: '1.05rem' }}>⚡ PIX Gerado: {pix.package.label}</strong>
                  <span style={{ fontWeight: 800, color: '#5b21b6' }}>R$ {pix.package.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#4c1d95', margin: '4px 0 14px' }}>
                  Copie a chave abaixo e pague no aplicativo do seu banco. Seu saldo é liberado automaticamente após a confirmação.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={() => copy(pix.qrCode, 'pix')} style={{ padding: '10px 16px' }}>
                    {copied === 'pix' ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX Copia e Cola'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setPix(null)} style={{ padding: '10px 14px' }}>
                    Fechar
                  </button>
                </div>
              </div>
            )}

            {/* Seção Indique e Ganhe */}
            <h2 style={styles.sectionTitle}>🎁 Programa Indique e Ganhe</h2>
            <div style={styles.referralCard}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>
                  Compartilhe seu link exclusivo com amigos e familiares. Quando um amigo indicado fizer a <strong>primeira compra confirmada</strong>, você ganha <strong>1 crédito gratuito</strong> (1 música inteira).
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: '#9a3412', fontWeight: 600 }}>
                  ⭐ Bônus especial de volume: a cada 5 amigos que comprarem, você ganha <strong>+1 crédito extra</strong>!
                </p>
              </div>

              {/* Botão de copiar link de indicação */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                <input
                  type="text"
                  readOnly
                  value={referralUrl}
                  style={styles.referralInput}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => copy(referralUrl, 'ref')}
                  style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}
                >
                  {copied === 'ref' ? '✅ Link Copiado!' : '🔗 Copiar Meu Link'}
                </button>
              </div>

              {/* Grid com Estatísticas de Indicação */}
              <div style={styles.statsGrid}>
                <div style={styles.statBox}>
                  <span style={styles.statNumber}>{referrals.total}</span>
                  <span style={styles.statLabel}>👥 Amigos Indicados</span>
                </div>
                <div style={styles.statBox}>
                  <span style={{ ...styles.statNumber, color: '#16a34a' }}>{referrals.rewarded}</span>
                  <span style={styles.statLabel}>✅ Compras Confirmadas</span>
                </div>
                <div style={styles.statBox}>
                  <span style={{ ...styles.statNumber, color: '#7c3aed' }}>+{referrals.earnedCredits}</span>
                  <span style={styles.statLabel}>🎁 Músicas Ganhas</span>
                </div>
              </div>

              {/* Barra de Progresso do Bônus de 5 Indicações */}
              <div style={{ marginTop: 18, padding: 14, background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid rgba(234, 88, 12, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6, fontWeight: 700, color: '#9a3412' }}>
                  <span>Progresso do Próximo Bônus (+1 Música Extra)</span>
                  <span>{referrals.nextBonusProgress} de 5 confirmados</span>
                </div>
                <div style={{ height: 8, background: '#fed7aa', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${(referrals.nextBonusProgress / 5) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #ea580c, #f97316)', transition: 'width 0.3s ease' }} />
                </div>
                <small style={{ display: 'block', marginTop: 6, fontSize: '0.78rem', color: '#c2410c' }}>
                  {referrals.nextBonusRemaining === 5 && referrals.rewarded > 0
                    ? '🎉 Parabéns! Você acabou de atingir um bônus! Continue indicando para o próximo.'
                    : `Faltam apenas ${referrals.nextBonusRemaining} ${referrals.nextBonusRemaining === 1 ? 'compra confirmada' : 'compras confirmadas'} para ganhar seu bônus de volume!`}
                </small>
              </div>

              {/* Lista dos Amigos Indicados */}
              <div style={{ marginTop: 22 }}>
                <strong style={{ fontSize: '0.92rem', display: 'block', marginBottom: 10 }}>Seus Amigos Indicados</strong>
                {referrals.list?.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {referrals.list.map((item, idx) => (
                      <div key={idx} style={styles.referralRow}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                          Amigo #{idx + 1}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(item.createdAt).toLocaleDateString('pt-BR')} às {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={item.status === 'CONFIRMADO' ? styles.badgeSuccess : styles.badgePending}>
                          {item.status === 'CONFIRMADO' ? '✅ Compra Aprovada (+1 crédito)' : '⏳ Aguardando compra'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
                    Nenhum amigo utilizou seu link ainda. Compartilhe seu link pelo WhatsApp para começar a ganhar créditos!
                  </p>
                )}
              </div>
            </div>

            {/* Extrato do Livro-Razão (Ledger) */}
            <h2 style={styles.sectionTitle}>Histórico da Carteira</h2>
            {account?.ledger?.length ? (
              <ul style={styles.history}>
                {account.ledger.map((entry) => (
                  <li key={entry.id} style={styles.historyItem}>
                    <div>
                      <strong style={{ color: Number(entry.amount) > 0 ? '#16a34a' : 'var(--text-primary)', fontSize: '0.95rem' }}>
                        {Number(entry.amount) > 0 ? '+' : ''}
                        {Number(entry.amount).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} crédito(s)
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        Motivo: {entry.reason.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(entry.created_at).toLocaleDateString('pt-BR')} às {new Date(entry.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={styles.muted}>Nenhuma movimentação realizada ainda.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    padding: '40px 16px 80px',
    background: 'var(--bg-primary)'
  },
  card: {
    margin: '0 auto',
    padding: '30px 24px',
    borderRadius: 20,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)'
  },
  back: {
    display: 'inline-block',
    color: 'var(--primary)',
    textDecoration: 'none',
    fontSize: '0.88rem',
    fontWeight: 600
  },
  btnSmallGhost: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    textDecoration: 'underline'
  },
  sectionTitle: {
    fontSize: '1.2rem',
    fontWeight: 800,
    marginTop: 32,
    marginBottom: 8
  },
  muted: {
    color: 'var(--text-muted)',
    fontSize: '0.9rem'
  },
  error: {
    padding: '10px 14px',
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    fontSize: '0.88rem',
    fontWeight: 600,
    marginBottom: 16
  },
  balance: {
    padding: '24px 22px',
    borderRadius: 16,
    margin: '22px 0 10px',
    background: 'linear-gradient(135deg, #7c3aed, #db2777)',
    color: '#fff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    boxShadow: '0 8px 24px rgba(124, 58, 237, 0.25)'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    margin: '16px 0 24px'
  },
  pack: {
    position: 'relative',
    display: 'grid',
    gap: 8,
    padding: '22px 18px',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    background: 'var(--bg-primary)'
  },
  packPopular: {
    border: '2px solid #7c3aed',
    background: 'rgba(124, 58, 237, 0.03)'
  },
  badgePopular: {
    position: 'absolute',
    top: -10,
    right: 14,
    background: '#7c3aed',
    color: '#fff',
    fontSize: '0.68rem',
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: 999,
    letterSpacing: '0.5px'
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4
  },
  price: {
    fontSize: '1.6rem',
    fontWeight: 900
  },
  pix: {
    padding: '18px 20px',
    margin: '12px 0 28px',
    borderRadius: 14,
    background: '#f5f3ff',
    border: '1px solid #ddd6fe'
  },
  referralCard: {
    padding: '22px 20px',
    borderRadius: 16,
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    color: '#431407',
    margin: '12px 0 28px'
  },
  referralInput: {
    flex: 1,
    minWidth: 240,
    padding: '11px 14px',
    borderRadius: 8,
    border: '1px solid #fdba74',
    fontSize: '0.88rem',
    background: '#fff',
    color: '#431407',
    outline: 'none'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 10,
    margin: '14px 0 10px'
  },
  statBox: {
    background: '#fff',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #ffedd5',
    textAlign: 'center'
  },
  statNumber: {
    display: 'block',
    fontSize: '1.4rem',
    fontWeight: 900,
    color: '#431407'
  },
  statLabel: {
    display: 'block',
    fontSize: '0.74rem',
    color: '#78350f',
    marginTop: 2,
    fontWeight: 600
  },
  referralRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '9px 12px',
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #fed7aa',
    fontSize: '0.84rem',
    flexWrap: 'wrap',
    gap: 8
  },
  badgeSuccess: {
    background: '#dcfce7',
    color: '#15803d',
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: '0.74rem',
    fontWeight: 700
  },
  badgePending: {
    background: '#fef3c7',
    color: '#b45309',
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: '0.74rem',
    fontWeight: 700
  },
  history: {
    listStyle: 'none',
    padding: 0,
    margin: '12px 0 0',
    display: 'grid',
    gap: 8
  },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    flexWrap: 'wrap',
    gap: 6
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    padding: '13px 18px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 'var(--border-radius-sm)',
    fontWeight: 700,
    fontSize: '0.95rem',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '16px 0',
    color: 'var(--text-muted)',
    fontSize: '0.82rem'
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--border-color)'
  }
};
