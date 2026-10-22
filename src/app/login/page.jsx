'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithGoogle,
  auth,
} from '@/lib/authClient';
import { getFriendlyAuthErrorMessage } from '@/lib/authErrors';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
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
  const [focusedField, setFocusedField] = useState(null);

  // Permite abrir diretamente na aba de cadastro se passado na URL (?modo=cadastro ou ?signup=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('modo') === 'cadastro' || params.get('signup') === '1' || params.get('criar') === '1') {
      setIsSignUp(true);
    }
  }, []);

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

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Por favor, digite um e-mail válido.');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError('As senhas não coincidem. Digite a mesma senha nos dois campos.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve conter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
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
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Digite o seu e-mail no campo acima para receber o link de redefinição de senha.');
      return;
    }
    setError('');
    setResetSuccess('');
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetSuccess(`✅ Enviamos um e-mail de redefinição para ${trimmedEmail}. Verifique sua caixa de entrada e de spam!`);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setError('Nenhuma conta encontrada com este e-mail.');
      } else {
        setError(getFriendlyAuthErrorMessage(err));
      }
    }
  };

  const getInputStyle = (fieldName) => ({
    ...styles.input,
    borderColor: focusedField === fieldName ? 'var(--primary, #4F46E5)' : '#cbd5e1',
    boxShadow: focusedField === fieldName ? '0 0 0 3px rgba(79, 70, 229, 0.15)' : '0 1px 2px rgba(0,0,0,0.02)',
  });

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <Image src="/logo.png" alt="NSMusic" width={38} height={38} style={{ height: '38px', width: 'auto' }} priority />
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#14132B' }}>NSMusic</span>
          </Link>
          <Link href="/criar" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '0.88rem', fontWeight: '700' }}>
            Criar Música R$ 9,99
          </Link>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span style={{ fontSize: '2.4rem', display: 'inline-block' }}>{isSignUp ? '✨' : '🔐'}</span>
            <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#14132B', marginTop: '8px', letterSpacing: '-0.02em' }}>
              {isSignUp ? 'Criar Conta no NSMusic' : 'Entrar no Seu Painel'}
            </h1>
            <p style={{ color: '#454467', fontSize: '0.92rem', marginTop: '6px', lineHeight: '1.45' }}>
              {isSignUp 
                ? 'Crie sua senha para salvar e ouvir todas as suas músicas personalizadas em qualquer aparelho.' 
                : 'Acesse suas músicas gravadas, saldo de créditos e pedidos anteriores.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={styles.googleBtn}
          >
            <GoogleIcon />
            <span>Continuar com o Google</span>
          </button>

          <div style={styles.dividerContainer}>
            <div style={styles.dividerLine} />
            <span>ou continue com e-mail</span>
            <div style={styles.dividerLine} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label htmlFor="login-email" style={styles.label}>
                {isSignUp ? 'Seu melhor e-mail:' : 'Seu e-mail:'}
              </label>
              <input 
                id="login-email"
                name="email"
                type="email"
                placeholder="exemplo@email.com"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('email')}
              />
            </div>

            <div>
              <label htmlFor="login-password" style={styles.label}>
                {isSignUp ? 'Crie uma senha de acesso:' : 'Sua senha:'}
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <input 
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  style={{ ...getInputStyle('password'), paddingRight: '48px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div>
                <label htmlFor="login-confirm-password" style={styles.label}>
                  Confirme sua senha:
                </label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input 
                    id="login-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repita a mesma senha"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    style={{ ...getInputStyle('confirmPassword'), paddingRight: '48px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeBtn}
                    title={showConfirmPassword ? 'Ocultar senha' : 'Ver senha'}
                    aria-label={showConfirmPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showConfirmPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={styles.errorAlert} role="alert">
                ⚠️ {error}
              </div>
            )}

            {resetSuccess && (
              <div style={styles.successAlert} role="status">
                {resetSuccess}
              </div>
            )}

            {!isSignUp && (
              <div style={{ textAlign: 'right', marginTop: '-4px' }}>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  style={styles.forgotBtn}
                >
                  Esqueceu sua senha?
                </button>
              </div>
            )}

            <button 
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={styles.submitBtn}
            >
              {submitting ? '⏳ Processando...' : isSignUp ? 'Criar Minha Conta & Acessar' : 'Entrar no Meu Painel'}
            </button>
          </form>

          <div style={styles.cardFooter}>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setResetSuccess('');
              }}
              style={styles.switchBtn}
            >
              {isSignUp 
                ? 'Já possui uma conta? Clique aqui para entrar' 
                : 'Primeiro acesso? Clique aqui para criar sua conta'}
            </button>
          </div>
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
    backgroundColor: '#faf8f5',
    fontFamily: 'var(--font-family-body, -apple-system, sans-serif)',
  },
  header: {
    padding: '16px 24px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #E2E5F5',
  },
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '36px 20px',
  },
  card: {
    maxWidth: '460px',
    width: '100%',
    padding: '36px 32px',
    borderRadius: '20px',
    backgroundColor: '#ffffff',
    border: '1px solid #E2E5F5',
    boxShadow: '0 12px 32px -4px rgba(79, 70, 229, 0.08), 0 4px 12px -2px rgba(20, 19, 43, 0.04)',
  },
  label: {
    fontSize: '0.88rem',
    fontWeight: '700',
    color: '#14132B',
    display: 'block',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    minHeight: '48px',
    backgroundColor: '#ffffff',
    border: '1.5px solid #cbd5e1',
    borderRadius: '10px',
    color: '#14132B',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  eyeBtn: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    fontSize: '1.15rem',
    cursor: 'pointer',
    color: '#64748b',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    padding: '13px 18px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    border: '1.5px solid #E2E5F5',
    borderRadius: '10px',
    fontWeight: '700',
    fontSize: '0.95rem',
    cursor: 'pointer',
    marginBottom: '20px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
    transition: 'all 0.15s ease',
  },
  dividerContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    color: '#78778E',
    fontSize: '0.84rem',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#E2E5F5',
  },
  submitBtn: {
    width: '100%',
    padding: '15px',
    fontSize: '1rem',
    fontWeight: '800',
    marginTop: '8px',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  forgotBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--secondary, #EC4899)',
    fontSize: '0.84rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontWeight: '600',
  },
  cardFooter: {
    marginTop: '22px',
    textAlign: 'center',
    borderTop: '1px solid #E2E5F5',
    paddingTop: '18px',
  },
  switchBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--primary, #4F46E5)',
    fontSize: '0.92rem',
    cursor: 'pointer',
    fontWeight: '700',
    lineHeight: '1.4',
  },
  errorAlert: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#dc2626',
    borderRadius: '10px',
    padding: '12px 14px',
    fontSize: '0.88rem',
    lineHeight: '1.4',
    fontWeight: '600',
    textAlign: 'center',
  },
  successAlert: {
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    color: '#059669',
    borderRadius: '10px',
    padding: '12px 14px',
    fontSize: '0.88rem',
    lineHeight: '1.4',
    fontWeight: '600',
    textAlign: 'center',
  },
};
