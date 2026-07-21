'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const getFriendlyAuthErrorMessage = (err) => {
  const code = err?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
    return "E-mail ou senha incorretos. Por favor, verifique se digitou corretamente.";
  }
  if (code === 'auth/email-already-in-use') {
    return "Este e-mail já possui uma conta cadastrada. Alterne para Entrar abaixo ou redefina sua senha.";
  }
  if (code === 'auth/weak-password') {
    return "A senha é muito fraca. Digite uma senha com no mínimo 6 caracteres.";
  }
  if (code === 'auth/too-many-requests') {
    return "Muitas tentativas incorretas. Por favor, aguarde alguns instantes ou clique em esqueci minha senha.";
  }
  return err?.message || "Não foi possível concluir o acesso. Verifique seus dados e tente novamente.";
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResetSuccess('');

    if (isSignUp && password !== confirmPassword) {
      setError("As senhas não coincidem. Digite a mesma senha nos dois campos.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve conter pelo menos 6 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push('/minhas-musicas');
    } catch (err) {
      console.error(err);
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email || !email.includes('@')) {
      setError("Digite o seu e-mail no campo acima para receber o link de redefinição de senha.");
      return;
    }
    setError('');
    setResetSuccess('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess(`✅ Enviamos um e-mail de redefinição para ${email}. Verifique sua caixa de entrada e de spam!`);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setError("Nenhuma conta encontrada com este e-mail.");
      } else {
        setError(getFriendlyAuthErrorMessage(err));
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0c' }}>
      <header style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <img src="/logo.png" alt="NSMusic" style={{ height: '38px', width: 'auto' }} />
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#fff' }}>NSMusic</span>
          </Link>
          <Link href="/criar" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            Criar Música R$ 19,90
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="glass-card" style={{ maxWidth: '440px', width: '100%', padding: '36px', borderRadius: '20px', border: '1px solid rgba(124, 58, 237, 0.3)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span style={{ fontSize: '2.5rem' }}>🔐</span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '10px' }}>
              {isSignUp ? 'Criar Conta NSMusic' : 'Entrar no Seu Painel'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
              {isSignUp 
                ? 'Crie sua senha para salvar e ouvir todas as suas músicas personalizadas.' 
                : 'Acesse o acervo com todas as suas canções gravadas no estúdio.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Seu E-mail do Pedido:</label>
              <input 
                type="email"
                placeholder="exemplo@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styleInput}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Sua Senha:</label>
              <div style={{ position: 'relative', width: '100%' }}>
                <input 
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...styleInput, paddingRight: '45px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                  title={showPassword ? "Ocultar senha" : "Ver senha"}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Confirme sua Senha:</label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input 
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ ...styleInput, paddingRight: '45px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      color: 'var(--text-muted)'
                    }}
                    title={showConfirmPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showConfirmPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <span style={{ color: '#fca5a5', fontSize: '0.84rem', textAlign: 'center', lineHeight: '1.4', fontWeight: '600' }}>{error}</span>
            )}

            {resetSuccess && (
              <span style={{ color: '#34d399', fontSize: '0.84rem', textAlign: 'center', lineHeight: '1.4', fontWeight: '600' }}>{resetSuccess}</span>
            )}

            {!isSignUp && (
              <div style={{ textAlign: 'right', marginTop: '-4px' }}>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Esqueceu sua senha?
                </button>
              </div>
            )}

            <button 
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ width: '100%', padding: '16px', fontSize: '1rem', marginTop: '8px' }}
            >
              {submitting ? '⏳ Processando...' : isSignUp ? 'Criar Conta & Ver Músicas' : 'Entrar'}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setResetSuccess('');
              }}
              style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.88rem', cursor: 'pointer', fontWeight: '700' }}
            >
              {isSignUp ? 'Já possui conta? Faça Login' : 'Primeiro acesso? Crie sua conta'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

const styleInput = {
  width: '100%',
  padding: '14px 18px',
  backgroundColor: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius-sm)',
  color: '#fff',
  fontSize: '0.95rem',
  outline: 'none',
};
