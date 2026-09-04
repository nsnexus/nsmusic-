'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { CARTA_TEMA_SLOTS, CAIXA_TEXTO_PADRAO } from '@/lib/cartaModelo';
import CartaTemaEditor from '@/components/admin/CartaTemaEditor';
import Link from 'next/link';

// Painel de temas da Carta Virtual (pedido 04/09/2026) — 7 slots fixos (Romântica + Aniversário/
// Homenagem/Padrão em masculino e feminino, ver src/lib/cartaModelo.js), cada um com sua própria
// imagem de fundo e caixa de texto ajustável. Mesmo padrão de autenticação do resto do /admin
// (e-mail fixo, sem custom claim — ver src/app/admin/page.jsx).
export default function CartaTemasAdmin() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [temas, setTemas] = useState({});
  const [loading, setLoading] = useState(true);
  const [enviandoId, setEnviandoId] = useState('');
  const [msg, setMsg] = useState('');
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!auth.currentUser || auth.currentUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      }
    }, 1500);

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      clearTimeout(timeout);
      if (!authUser || authUser.email !== 'narcisofelizardo@gmail.com') {
        router.push('/admin/login');
      } else {
        setAutorizado(true);
        setCheckingAuth(false);
      }
    }, () => {
      clearTimeout(timeout);
      router.push('/admin/login');
    });

    return () => { clearTimeout(timeout); unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!autorizado) return;
    let ativo = true;
    (async () => {
      const dados = {};
      for (const slot of CARTA_TEMA_SLOTS) {
        try {
          const snap = await getDoc(doc(db, 'cartaTemas', slot.id));
          dados[slot.id] = snap.exists()
            ? { imagemUrl: snap.data().imagemUrl || '', caixaTexto: snap.data().caixaTexto || CAIXA_TEXTO_PADRAO }
            : { imagemUrl: '', caixaTexto: CAIXA_TEXTO_PADRAO };
        } catch (e) {
          dados[slot.id] = { imagemUrl: '', caixaTexto: CAIXA_TEXTO_PADRAO };
        }
      }
      if (ativo) { setTemas(dados); setLoading(false); }
    })();
    return () => { ativo = false; };
  }, [autorizado]);

  const handleUpload = async (slotId, file) => {
    setEnviandoId(slotId);
    setMsg('');
    try {
      const nomeArquivo = `${Date.now()}_${file.name}`.replace(/[^\w.\-]/g, '_');
      const arquivoRef = ref(storage, `cartaTemas/${slotId}/${nomeArquivo}`);
      await uploadBytes(arquivoRef, file);
      const url = await getDownloadURL(arquivoRef);
      setTemas((prev) => ({ ...prev, [slotId]: { ...prev[slotId], imagemUrl: url } }));
    } catch (e) {
      setMsg(`❌ Falha ao enviar imagem: ${e.message}`);
    }
    setEnviandoId('');
  };

  const handleChangeCaixa = (slotId, caixaTexto) => {
    setTemas((prev) => ({ ...prev, [slotId]: { ...prev[slotId], caixaTexto } }));
  };

  const handleRemoverImagem = (slotId) => {
    setTemas((prev) => ({ ...prev, [slotId]: { ...prev[slotId], imagemUrl: '' } }));
  };

  const handleSalvar = async (slotId) => {
    setEnviandoId(slotId);
    setMsg('');
    try {
      const tema = temas[slotId];
      await setDoc(doc(db, 'cartaTemas', slotId), {
        imagemUrl: tema.imagemUrl || '',
        caixaTexto: tema.caixaTexto || CAIXA_TEXTO_PADRAO,
        updatedAt: new Date().toISOString(),
      });
      setMsg(`✅ Tema salvo!`);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(`❌ Erro ao salvar: ${e.message}`);
    }
    setEnviandoId('');
  };

  if (checkingAuth || loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Carregando...</div>;
  }

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '32px 20px 60px' }}>
      <Link href="/admin" style={{ fontSize: '0.85rem', color: '#7c3aed', textDecoration: 'none' }}>← Voltar ao painel</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: '800', margin: '14px 0 6px', color: '#0f172a' }}>Temas da Carta Virtual</h1>
      <p style={{ color: '#64748b', marginBottom: '10px', fontSize: '0.9rem', maxWidth: '640px' }}>
        Envie a imagem de cada modelo e arraste a caixa pontilhada (ou puxe pelo cantinho azul) pra
        marcar onde o texto da carta vai aparecer em cima da imagem. Se o texto for grande pra caixa,
        ganha barra de rolagem sozinha — nunca vaza pra fora da imagem.
      </p>
      {msg && <p style={{ marginBottom: '16px', fontWeight: '700' }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '26px', marginTop: '20px' }}>
        {CARTA_TEMA_SLOTS.map((slot) => {
          const tema = temas[slot.id] || { imagemUrl: '', caixaTexto: CAIXA_TEXTO_PADRAO };
          const salvandoEsse = enviandoId === slot.id;
          return (
            <div key={slot.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', background: '#fff' }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>{slot.label}</h3>

              <CartaTemaEditor
                imagemUrl={tema.imagemUrl}
                caixaTexto={tema.caixaTexto}
                onChangeCaixa={(c) => handleChangeCaixa(slot.id, c)}
              />

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <label style={{ flex: 1, minWidth: '120px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.78rem', textAlign: 'center', cursor: 'pointer', color: '#334155' }}>
                  📷 {tema.imagemUrl ? 'Trocar imagem' : 'Enviar imagem'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => e.target.files?.[0] && handleUpload(slot.id, e.target.files[0])}
                  />
                </label>
                {tema.imagemUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoverImagem(slot.id)}
                    style={{ padding: '8px 10px', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', fontSize: '0.78rem', background: '#fff', cursor: 'pointer' }}
                  >
                    🗑 Remover
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSalvar(slot.id)}
                disabled={salvandoEsse}
                style={{ width: '100%', marginTop: '10px', padding: '10px', borderRadius: '8px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: '700', fontSize: '0.85rem', cursor: salvandoEsse ? 'default' : 'pointer', opacity: salvandoEsse ? 0.7 : 1 }}
              >
                {salvandoEsse ? 'Salvando...' : '💾 Salvar tema'}
              </button>

              <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '8px', textAlign: 'center' }}>
                caixa: {Math.round(tema.caixaTexto.top)}% topo · {Math.round(tema.caixaTexto.left)}% esq. ·{' '}
                {Math.round(tema.caixaTexto.width)}% larg. · {Math.round(tema.caixaTexto.height)}% alt.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
