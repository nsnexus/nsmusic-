'use client';

import { useState } from 'react';
import { auth } from '@/lib/authClient';

export default function OrderClaim({ orderId, onClaim }) {
  const [challengeId, setChallengeId] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async action => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/orders/claim-code', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, orderId, challengeId, code }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível verificar agora.');
      if (action === 'request') { setChallengeId(data.challengeId); setMessage(data.message); }
      else { setMessage('Pedido vinculado à sua conta.'); onClaim(); }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <section className="nx-card" style={{ marginTop: 20 }}><h3>Guarde este presente na sua conta</h3><p className="nx-helper">Está em outro navegador ou aparelho? Confirme o código enviado ao WhatsApp do pedido para comprovar que ele é seu.</p>{challengeId && <label className="nx-field"><span>Código de seis números</span><input inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label>}<div className="nx-checkout-actions"><button type="button" className="nx-button" disabled={busy} onClick={() => submit('request')}>{busy ? 'Aguarde…' : challengeId ? 'Reenviar código' : 'Receber código no WhatsApp'}</button>{challengeId && <button type="button" className="nx-button nx-primary" disabled={busy || code.length !== 6} onClick={() => submit('verify')}>Confirmar e vincular</button>}</div>{message && <p className="nx-message" role="status">{message}</p>}</section>;
}
