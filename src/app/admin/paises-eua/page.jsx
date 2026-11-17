'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged, auth, getAdminAuthToken } from '@/lib/authClient';

// Painel: países atendidos pela loja internacional (us.nsmusic.ia.br) e os ritmos de cada um.
// Os dados ficam no banco do site US; a rota /api/admin/us-countries repassa com a chave US_PANEL_TOKEN.
// A checagem de e-mail aqui é só conveniência de tela — quem autoriza é a rota.
const ADMIN_EMAIL = 'narcisofelizardo@gmail.com';
const IDIOMAS = { en: 'Inglês', es: 'Espanhol' };

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px', marginBottom: '12px' };
const input = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' };
const btn = { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' };

async function chamar(method, body) {
  const token = await getAdminAuthToken();
  const res = await fetch('/api/admin/us-countries', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha na requisição.');
  return data;
}

export default function PaisesPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [paises, setPaises] = useState(null);
  const [padrao, setPadrao] = useState([]);
  const [aberto, setAberto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u || u.email !== ADMIN_EMAIL) router.push('/admin/login');
      else setAutorizado(true);
    }, () => router.push('/admin/login'));
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!autorizado) return;
    let ativo = true;
    chamar('GET')
      .then((d) => { if (ativo) { setPaises(d.countries); setPadrao(d.defaults || []); } })
      .catch((e) => { if (ativo) setMsg({ tipo: 'erro', texto: e.message }); });
    return () => { ativo = false; };
  }, [autorizado]);

  const alterarPais = (i, campo, valor) => setPaises((ps) => ps.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));
  const alterarRitmo = (i, j, campo, valor) => setPaises((ps) => ps.map((p, k) => (k !== i ? p : { ...p, genres: p.genres.map((g, m) => (m === j ? { ...g, [campo]: valor } : g)) })));
  const moverRitmo = (i, j, d) => setPaises((ps) => ps.map((p, k) => {
    if (k !== i) return p;
    const lista = [...p.genres]; const alvo = j + d;
    if (alvo < 0 || alvo >= lista.length) return p;
    [lista[j], lista[alvo]] = [lista[alvo], lista[j]];
    return { ...p, genres: lista };
  }));
  const removerRitmo = (i, j) => setPaises((ps) => ps.map((p, k) => (k !== i ? p : { ...p, genres: p.genres.filter((_, m) => m !== j) })));
  const novoRitmo = (i) => setPaises((ps) => ps.map((p, k) => (k !== i ? p : { ...p, genres: [...p.genres, { id: `novo-${Date.now().toString(36)}`, name: '', description: '', prompt: '', enabled: true }] })));
  const novoPais = () => {
    const code = (window.prompt('Código do país com 2 letras (ex.: CO, AR, GB):') || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return;
    if (paises.some((p) => p.code === code)) { setMsg({ tipo: 'erro', texto: `${code} já existe.` }); return; }
    setPaises((ps) => [...ps, { code, name: code, flag: '', language: 'es', active: false, genres: [] }]);
    setAberto(code);
  };
  const restaurarPadrao = (i) => {
    const original = padrao.find((p) => p.code === paises[i].code);
    if (original && window.confirm(`Voltar os ritmos de ${paises[i].name} para o padrão? As edições deste país serão perdidas ao salvar.`)) {
      setPaises((ps) => ps.map((p, k) => (k === i ? { ...original } : p)));
    }
  };

  const salvar = async () => {
    setSalvando(true); setMsg({ tipo: '', texto: '' });
    try {
      const d = await chamar('PUT', { countries: paises });
      setPaises(d.countries);
      setMsg({ tipo: 'ok', texto: 'Salvo. O site US já usa a lista nova.' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setSalvando(false);
    }
  };

  if (!autorizado || !paises) {
    return <div style={{ padding: '24px', fontFamily: 'system-ui' }}>{msg.texto ? <p role="alert" style={{ color: '#b91c1c' }}>{msg.texto}</p> : 'Carregando…'}</div>;
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '16px', fontFamily: 'system-ui', color: '#0f172a', paddingBottom: '90px' }}>
      <Link href="/admin" style={{ fontSize: '0.85rem', color: '#7c3aed', textDecoration: 'none' }}>← Painel</Link>
      <h1 style={{ fontSize: '1.4rem', margin: '8px 0 4px' }}>🌎 Países e ritmos — site EUA</h1>
      <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '0.88rem' }}>
        Países ativos aparecem no pop-up do site. Cada ritmo tem o nome que o cliente vê e o <b>estilo</b> (em inglês) que vai para a IA da música. Cobrança sempre em dólar. Vale para us.nsmusic.ia.br — o site brasileiro não muda.
      </p>

      {paises.map((p, i) => (
        <section key={p.code} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setAberto(aberto === p.code ? '' : p.code)} style={{ ...btn, border: 'none', padding: 0, background: 'none', fontSize: '1.05rem' }} aria-expanded={aberto === p.code}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#eef2ff', color: '#4338ca', borderRadius: '5px', padding: '1px 5px' }}>{p.code}</span> {p.flag} {p.name} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({p.code} · {IDIOMAS[p.language]} · {p.genres.filter((g) => g.enabled).length} ritmos)</span>
            </button>
            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700 }}>
              <input type="checkbox" checked={p.active} onChange={(e) => alterarPais(i, 'active', e.target.checked)} /> Ativo
            </label>
          </div>

          {aberto === p.code && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 120px', gap: '8px', marginBottom: '12px' }}>
                <label style={{ fontSize: '0.78rem', color: '#475569' }}>Nome<input style={input} value={p.name} onChange={(e) => alterarPais(i, 'name', e.target.value)} /></label>
                <label style={{ fontSize: '0.78rem', color: '#475569' }}>Bandeira<input style={input} value={p.flag} onChange={(e) => alterarPais(i, 'flag', e.target.value)} /></label>
                <label style={{ fontSize: '0.78rem', color: '#475569' }}>Idioma
                  <select style={input} value={p.language} onChange={(e) => alterarPais(i, 'language', e.target.value)}>
                    {Object.entries(IDIOMAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>

              {p.genres.map((g, j) => (
                <div key={j} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '8px', opacity: g.enabled ? 1 : 0.6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label style={{ fontSize: '0.78rem', color: '#475569' }}>Nome (cliente vê)<input style={input} value={g.name} onChange={(e) => alterarRitmo(i, j, 'name', e.target.value)} /></label>
                    <label style={{ fontSize: '0.78rem', color: '#475569' }}>Descrição curta<input style={input} value={g.description} onChange={(e) => alterarRitmo(i, j, 'description', e.target.value)} /></label>
                  </div>
                  <label style={{ display: 'block', marginTop: '6px', fontSize: '0.78rem', color: '#475569' }}>Estilo para a IA (em inglês)
                    <textarea style={{ ...input, minHeight: '54px' }} value={g.prompt} onChange={(e) => alterarRitmo(i, j, 'prompt', e.target.value)} />
                  </label>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.8rem', display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                      <input type="checkbox" checked={g.enabled} onChange={(e) => alterarRitmo(i, j, 'enabled', e.target.checked)} /> Mostrar
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>id: {g.id}</span>
                    <button type="button" style={{ ...btn, marginLeft: 'auto' }} onClick={() => moverRitmo(i, j, -1)} aria-label="Subir">↑</button>
                    <button type="button" style={btn} onClick={() => moverRitmo(i, j, 1)} aria-label="Descer">↓</button>
                    <button type="button" style={{ ...btn, color: '#b91c1c' }} onClick={() => removerRitmo(i, j)}>Remover</button>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" style={btn} onClick={() => novoRitmo(i)}>+ Ritmo</button>
                {padrao.some((d) => d.code === p.code) && <button type="button" style={btn} onClick={() => restaurarPadrao(i)}>Voltar ao padrão</button>}
              </div>
            </div>
          )}
        </section>
      ))}

      <button type="button" style={btn} onClick={novoPais}>+ País</button>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
        {msg.texto && <span role={msg.tipo === 'erro' ? 'alert' : 'status'} style={{ fontSize: '0.85rem', color: msg.tipo === 'erro' ? '#b91c1c' : '#047857' }}>{msg.texto}</span>}
        <button type="button" onClick={salvar} disabled={salvando} style={{ ...btn, background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 18px' }}>
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}
