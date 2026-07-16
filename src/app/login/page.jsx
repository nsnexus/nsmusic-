'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
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
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError("E-mail ou senha incorretos.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Este e-mail já está cadastrado. Alterne para Entrar.");
      } else {
        setError(err.message || "Erro de autenticação.");
      }
    } finally {
      setSubmitting(false);
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
              <input 
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styleInput}
              />
            </div>

            {error && (
              <span style={{ color: '#fca5a5', fontSize: '0.82rem', textAlign: 'center' }}>{error}</span>
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
              onClick={() => setIsSignUp(!isSignUp)}
              style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.88rem', cursor: 'pointer' }}
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
