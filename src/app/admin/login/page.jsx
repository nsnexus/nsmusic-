'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult 
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import Image from 'next/image';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // Check initial authentication status with safety timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCheckingAuth(false);
    }, 1200);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      if (user && user.email === 'narcisofelizardo@gmail.com') {
        router.push('/admin');
      } else {
        setCheckingAuth(false);
      }
    }, (error) => {
      clearTimeout(timeout);
      setCheckingAuth(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/admin');
    } catch (err) {
      console.error(err);
      setError('E-mail ou senha incorretos. Tente novamente.');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div style={styles.loadingWrapper}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <Link href="/" style={styles.backBtn}>
        ← Voltar ao site
      </Link>

      <div style={styles.loginCard} className="glass-card">
        <div style={styles.header}>
          <Image src="/logo.png" alt="NSMusic" width={60} height={60} style={{ height: '60px', width: 'auto', marginBottom: '16px' }} priority />
          <h2 style={styles.title}>Painel Administrativo</h2>
          <p style={styles.subtitle}>Faça login para gerenciar pedidos e produções</p>
        </div>

        {error && (
          <div style={styles.errorAlert}>
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>E-mail institucional</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@nsmusic.com.br" 
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Senha de acesso</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" 
              style={styles.input}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', marginTop: '8px' }}
          >
            {loading ? 'Entrando...' : 'Acessar Painel 🔒'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: '24px',
    position: 'relative',
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
  backBtn: {
    position: 'absolute',
    top: '24px',
    left: '24px',
    color: '#475569',
    fontSize: '0.9rem',
    fontWeight: '600',
    textDecoration: 'none',
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#64748b',
    lineHeight: '1.4',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#475569',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    color: '#0f172a',
    fontSize: '0.95rem',
    outline: 'none',
  },
  errorAlert: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.85rem',
    color: '#dc2626',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
};
