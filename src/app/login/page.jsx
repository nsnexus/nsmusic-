'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithGoogle, auth } from '@/lib/authClient';
import { getFriendlyAuthErrorMessage } from '@/lib/authErrors';

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

  const getTargetUrl = () => {
    if (typeof window === 'undefined') return '/conta';
    const params = new URLSearchParams(window.location.search);
    const red = params.get('redirect');
    return (red && red.startsWith('/') && !red.startsWith('//') && !red.includes('\\')) ? red : '/conta';
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      const dest = `${window.location.origin}${getTargetUrl()}`;
      await signInWithGoogle(dest);
    } catch (err) {
      console.error(err);
      setError('Não foi possível iniciar o login com o Google. Tente com e-mail e senha.');
    }
  };

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
      router.push(getTargetUrl());
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
            <Image src="/logo.png" alt="NSMusic" width={38} height={38} style={{ height: '38px', width: 'auto' }} priority />
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#fff' }}>NSMusic</span>
          </Link>
          <Link href="/criar" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            Criar Música R$ 9,99
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

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
              padding: '13px 18px',
              backgroundColor: '#ffffff',
              color: '#1f2937',
              border: 'none',
              borderRadius: 'var(--border-radius-sm)',
              fontWeight: '700',
              fontSize: '0.95rem',
              cursor: 'pointer',
              marginBottom: '18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              transition: 'transform 0.15s ease'
            }}
          >
            <GoogleIcon />
            <span>Continuar com o Google</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <span>ou continue com e-mail</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
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
