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

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // Handle redirect result on mount
  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          router.push('/admin');
          return;
        }
      } catch (err) {
        console.error("Erro ao obter resultado do redirecionamento:", err);
        setError('Falha ao autenticar via redirecionamento do Google.');
      }
    };
    handleRedirect();
  }, [router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/admin');
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
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

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    
    try {
      // Use redirect instead of popup to bypass browser popup blockers
      await signInWithRedirect(auth, provider);
    } catch (err) {
      console.error("Erro ao redirecionar para login do Google:", err);
      setError('Falha ao iniciar login com o Google.');
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
          <img src="/logo.png" alt="NSMusic" style={{ height: '60px', width: 'auto', marginBottom: '16px' }} />
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

        <div style={styles.dividerContainer}>
          <hr style={styles.dividerLine} />
          <span style={styles.dividerText}>ou</span>
          <hr style={styles.dividerLine} />
        </div>

        <button 
          onClick={handleGoogleLogin}
          disabled={loading}
          className="btn btn-secondary"
          style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Entrar com o Google
        </button>
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
    backgroundColor: '#0a0a0c',
    padding: '24px',
    position: 'relative',
  },
  loadingWrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0c',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255,255,255,0.06)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  backBtn: {
    position: 'absolute',
    top: '24px',
    left: '24px',
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    fontWeight: '500',
    transition: 'color 0.2s',
    textDecoration: 'none',
    ':hover': {
      color: '#fff',
    },
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logoIcon: {
    fontSize: '2rem',
    display: 'inline-block',
    marginBottom: '12px',
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: '800',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
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
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    color: '#fff',
    fontSize: '0.95rem',
    outline: 'none',
  },
  errorAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '12px 16px',
    fontSize: '0.85rem',
    color: 'var(--danger)',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dividerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '20px 0',
    gap: '10px',
  },
  dividerLine: {
    flex: 1,
    border: 'none',
    borderTop: '1px solid var(--border-color)',
  },
  dividerText: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
};
