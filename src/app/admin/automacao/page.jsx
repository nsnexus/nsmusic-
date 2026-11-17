'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, onAuthStateChanged } from '@/lib/authClient';
import AbaComentarios from '@/components/admin/automacao/AbaComentarios';
import AbaAutomacao from '@/components/admin/automacao/AbaAutomacao';
import AbaConexao from '@/components/admin/automacao/AbaConexao';
import AbaPublicacoes from '@/components/admin/automacao/AbaPublicacoes';
import AbaWhatsappAdm from '@/components/admin/automacao/AbaWhatsappAdm';

const ABAS = [
  { id: 'comentarios', rotulo: 'Posts e comentários' },
  { id: 'automacao', rotulo: 'Automação com IA' },
  { id: 'publicacoes', rotulo: 'Publicações' },
  { id: 'whatsapp', rotulo: 'WhatsApp ADM' },
  { id: 'conexao', rotulo: 'Conexão' },
];

export default function AdminAutomacaoPage() {
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);
  const [aba, setAba] = useState('comentarios');

  // Só evita mostrar a tela para quem não está logado. Quem decide se a conta é admin é o servidor
  // (requireAdmin em cada rota) — sem sessão de admin, toda chamada desta tela volta 401/403.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser) router.push('/admin/login');
    }, 1500);

    const unsubscribe = onAuthStateChanged(
      auth,
      (usuario) => {
        clearTimeout(timeout);
        if (!usuario) router.push('/admin/login');
        else setVerificando(false);
      },
      () => {
        clearTimeout(timeout);
        router.push('/admin/login');
      },
    );

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  if (verificando) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        Verificando permissões de administrador...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f8fafc', padding: '20px 16px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', fontSize: '13px' }}>
          <Link href="/admin" style={{ color: '#60a5fa', textDecoration: 'none' }}>← Pedidos</Link>
          <span style={{ color: '#475569' }}>•</span>
          <Link href="/admin/anuncios" style={{ color: '#94a3b8', textDecoration: 'none' }}>Anúncios</Link>
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Automação</h1>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 16px 0' }}>
          Instagram (comentários, respostas com IA, publicação diária) e respostas automáticas no WhatsApp ADM.
        </p>

        <div role="tablist" aria-label="Seções" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#f8fafc',
                background: aba === a.id ? '#2563eb' : '#1e293b',
                border: `1px solid ${aba === a.id ? '#2563eb' : 'rgba(255, 255, 255, 0.12)'}`,
              }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        {aba === 'comentarios' && <AbaComentarios />}
        {aba === 'automacao' && <AbaAutomacao />}
        {aba === 'publicacoes' && <AbaPublicacoes />}
        {aba === 'whatsapp' && <AbaWhatsappAdm />}
        {aba === 'conexao' && <AbaConexao />}
      </div>
    </div>
  );
}
