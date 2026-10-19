'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth, onAuthStateChanged } from '@/lib/authClient';

export default function ReferralCard({ detailed = false }) {
  const [account, setAccount] = useState(null);
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async current => {
      if (!active) return;
      setUser(current); setAccount(null);
      if (!current) return;
      try {
        const token = await current.getIdToken();
        const response = await fetch('/api/credits/account', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (active && response.ok) setAccount(data);
      } catch {}
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  const share = async () => {
    if (!account?.referralCode) return;
    const url = `${window.location.origin}/criar?ref=${encodeURIComponent(account.referralCode)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Uma história que vira música', text: 'Você conta a história, ouve uma prévia grátis e decide se quer comprar.', url });
      else { await navigator.clipboard.writeText(url); setMessage('Seu link de indicação foi copiado.'); }
    } catch (error) { if (error.name !== 'AbortError') setMessage('Não foi possível compartilhar. Tente novamente.'); }
  };
  return <section className="nx-card"><div className="nx-referral-card"><div><span className="nx-eyebrow">Compartilhe algo bom</span><h2>Sua indicação também pode virar música.</h2><p>Cada novo comprador indicado com compra elegível confirmada rende 1 crédito. A cada 5, mais 1 de bônus. Créditos não vencem.</p></div>{account ? <button type="button" className="nx-button nx-soft" onClick={share}>Compartilhar meu convite</button> : <Link href={user ? '/conta' : '/login?redirect=%2Fconta'} className="nx-button nx-soft">{user ? 'Ver minhas indicações' : 'Entrar e pegar meu link'}</Link>}</div>{detailed && account && <div><p className="nx-helper">{account.referrals.rewarded} compradores confirmados · {account.referrals.earnedCredits} créditos ganhos</p><progress aria-label="Progresso para o bônus de cinco compradores" value={account.referrals.nextBonusProgress} max={5} style={{ width: '100%', accentColor: 'var(--nx-purple)' }} /><p className="nx-helper">Faltam {account.referrals.nextBonusRemaining} compradores confirmados para o próximo bônus. Cinco compradores = seis créditos.</p></div>}{message && <p className="nx-message" role="status">{message}</p>}</section>;
}
