'use client';

import { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { requestPixCharge } from '@/lib/pixCheckout';
import { compressImage } from '@/lib/imageCompress';
import PixQrCode from './PixQrCode';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite dos outros add-ons
const MAX_MOMENTOS = 20;
const MAX_QUIZ = 10;
const MAX_FOTOS = 20;

// Add-on "Retrospectiva" (R$ 9,99) — venda + editor do conteúdo. A página pública que o cliente
// compartilha é /retrospectiva?orderId=X.
//
// Mesmo padrão de checkout do playback/carta/vídeo. O que muda é o depois: aqui o cliente PREENCHE
// o conteúdo (linha do tempo, contador, quiz), então este componente é editor, não só entrega.
// Fica em arquivo próprio pra não engordar entrega/page.jsx (ver .claude/rules/frontend.md).
export default function RetrospectivaAddonCard({ orderId, order }) {
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [pixCopied, setPixCopied] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [contadorLabel, setContadorLabel] = useState('Juntos há');
  const [dataInicio, setDataInicio] = useState('');
  const [momentos, setMomentos] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [linkCopiado, setLinkCopiado] = useState(false);

  const [fotosProprias, setFotosProprias] = useState([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [erroFotos, setErroFotos] = useState('');

  const hasAccess = unlocked || order?.hasRetrospectivaAccess || order?.retrospectivaAddonPaid;
  // Fotos do Vídeo Homenagem (quem comprou o vídeo já tem fotos prontas, reaproveita) SOMADAS às
  // fotos enviadas na própria retrospectiva — quem NÃO comprou vídeo não tinha foto nenhuma pra
  // usar aqui antes disso (achado 03/09/2026, relatado pelo dono do estúdio).
  const fotosDoVideo = Array.isArray(order?.slideshowImages) ? order.slideshowImages : [];
  const fotos = [...fotosDoVideo, ...fotosProprias];

  // Carrega o que já foi salvo (o `order` vem ao vivo do onSnapshot da página pai).
  useEffect(() => {
    const r = order?.retrospectiva;
    if (!r) return;
    setTitulo((atual) => atual || r.titulo || '');
    setContadorLabel((atual) => (atual && atual !== 'Juntos há' ? atual : r.contadorLabel || 'Juntos há'));
    setDataInicio((atual) => atual || r.dataInicio || '');
    setMomentos((atual) => (atual.length ? atual : (r.momentos || [])));
    setQuiz((atual) => (atual.length ? atual : (r.quiz || [])));
    setFotosProprias((atual) => (atual.length ? atual : (r.fotos || [])));
  }, [order?.retrospectiva]);

  const handleUploadFotos = async (e) => {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = ''; // permite reenviar o mesmo arquivo depois, se remover e quiser recolocar
    if (arquivos.length === 0 || !orderId) return;

    const espacoRestante = MAX_FOTOS - fotos.length;
    if (espacoRestante <= 0) {
      setErroFotos(`Máximo de ${MAX_FOTOS} fotos.`);
      return;
    }

    setEnviandoFotos(true);
    setErroFotos('');
    try {
      const selecionados = arquivos.slice(0, espacoRestante);
      const novasUrls = [];
      for (let i = 0; i < selecionados.length; i++) {
        // Comprime antes de subir (upload mais rápido, menos Storage — ver imageCompress.js).
        const arquivo = await compressImage(selecionados[i]);
        const fileRef = ref(storage, `orders/${orderId}/retrospectiva/${Date.now()}_${i}_${arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
        await uploadBytes(fileRef, arquivo);
        novasUrls.push(await getDownloadURL(fileRef));
      }
      // Salva junto (não separado) para o cliente nunca perder o upload se fechar a aba antes de
      // clicar em "Salvar retrospectiva" mais abaixo.
      const listaFinal = [...fotosProprias, ...novasUrls];
      setFotosProprias(listaFinal);
      const res = await fetch('/api/retrospectiva/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, retrospectiva: { titulo, contadorLabel, dataInicio, momentos, quiz, fotos: listaFinal } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErroFotos(data.error || 'Fotos enviadas, mas não foi possível salvar agora. Tente "Salvar retrospectiva" abaixo.');
      }
    } catch (err) {
      console.warn('[RetrospectivaAddonCard] Erro ao enviar fotos:', err?.message);
      setErroFotos('Não foi possível enviar as fotos agora. Tente de novo.');
    } finally {
      setEnviandoFotos(false);
    }
  };

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);
    const resultado = await requestPixCharge(
      { orderId, sku: 'retrospectiva_addon', isSecondaryPayment: true },
      { attempts: MAX_PIX_ATTEMPTS }
    );
    setLoading(false);
    if (resultado.ok) {
      setPixInfo({ qrCode: resultado.data.qrCode || '', paymentId: resultado.data.paymentId || '' });
    } else {
      setPixError(resultado.error);
    }
  };

  // Polling do pagamento — com cleanup obrigatório (ver .claude/rules/frontend.md).
  useEffect(() => {
    if (!orderId || !pixInfo.paymentId || hasAccess) return;
    setPollingTimedOut(false);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts >= PIX_POLLING_MAX_ATTEMPTS) {
        clearInterval(interval);
        setPollingTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/payments/status?orderId=${orderId}&paymentId=${pixInfo.paymentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved' || data.status === 'PAGO' || data.status === 'PAGAMENTO_APROVADO') {
            setUnlocked(true);
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn('[RetrospectivaAddonCard] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess]);

  const salvar = async () => {
    setSalvando(true);
    setMsg('');
    try {
      const res = await fetch('/api/retrospectiva/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          retrospectiva: { titulo, contadorLabel, dataInicio, momentos, quiz, fotos: fotosProprias },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`❌ ${data.error || 'Não foi possível salvar agora.'}`);
      } else {
        setMsg('✅ Retrospectiva salva!');
      }
    } catch (e) {
      setMsg('❌ Falha de conexão ao salvar.');
    } finally {
      setSalvando(false);
      setTimeout(() => setMsg(''), 6000);
    }
  };

  const cardStyle = {
    padding: '20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.10) 0%, rgba(59, 130, 246, 0.08) 100%)',
    border: '1.5px solid rgba(168, 85, 247, 0.28)',
    marginTop: '16px',
  };

  // --- Ainda não comprou ---
  if (!hasAccess) {
    return (
      <div className="glass-card" style={cardStyle}>
        {pixInfo.paymentId ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>Escaneie pra liberar a Retrospectiva</p>
            <PixQrCode payload={pixInfo.qrCode} size={180} label="QR Code para pagamento da Retrospectiva via PIX" />
            <div style={{ margin: '12px 0 10px', textAlign: 'left' }}>
              <label htmlFor="pix-copia-cola-retro" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Ou use o código PIX Copia e Cola:
              </label>
              <textarea
                id="pix-copia-cola-retro"
                readOnly
                value={pixInfo.qrCode}
                style={{ width: '100%', height: '60px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(pixInfo.qrCode);
                setPixCopied(true);
                setTimeout(() => setPixCopied(false), 3000);
              }}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
            >
              {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX (R$ 9,99)'}
            </button>
            {pollingTimedOut && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                Ainda não identificamos o pagamento. Se já pagou, aguarde mais um instante.
              </p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>📖</div>
            <h4 style={{ fontSize: '1rem', marginBottom: '6px', fontFamily: 'var(--font-family-title)' }}>Retrospectiva</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.45' }}>
              Uma <strong>página só de vocês</strong>, com a sua música tocando de fundo, linha do tempo,
              contador ao vivo (&quot;juntos há 10 anos, 3 meses e 2 dias&quot;), álbum de fotos e um
              quiz. É um <strong>link pra mandar pra família</strong> — abre na hora, em qualquer
              celular. Por <strong style={{ color: 'var(--success)' }}>R$ 9,99</strong>.
            </p>

            {/* Imagem demonstrativa de como funciona a Retrospectiva */}
            <div style={{ margin: '16px auto 20px', maxWidth: '440px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/como-funciona-retrospectiva.jpg"
                alt="Como funciona a sua Retrospectiva"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>

            {pixError && <p style={{ fontSize: '0.8rem', color: 'var(--error, #ef4444)', marginBottom: '10px' }}>{pixError}</p>}
            <button
              type="button"
              onClick={handleGeneratePix}
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: '12px 28px', fontSize: '0.95rem', fontWeight: 'bold', border: 'none', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Gerando cobrança...' : 'Quero a Retrospectiva — R$ 9,99'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- Comprado: editor ---
  const linkPublico = typeof window !== 'undefined' ? `${window.location.origin}/retrospectiva?orderId=${orderId}` : '';

  return (
    <div className="glass-card" style={cardStyle}>
      <h4 style={{ fontSize: '1rem', marginBottom: '4px', fontFamily: 'var(--font-family-title)', textAlign: 'center' }}>
        📖 Sua Retrospectiva
      </h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '16px' }}>
        Monte a página e depois compartilhe o link.
      </p>

      <label htmlFor="retro-titulo" style={estilos.label}>Título da página</label>
      <input id="retro-titulo" type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Nossa história" style={estilos.input} />

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="retro-label" style={estilos.label}>Texto do contador</label>
          <input id="retro-label" type="text" value={contadorLabel} onChange={(e) => setContadorLabel(e.target.value)} placeholder="Juntos há" style={estilos.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="retro-data" style={estilos.label}>Contando desde</label>
          <input id="retro-data" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={estilos.input} />
        </div>
      </div>

      {/* Fotos da retrospectiva — próprias, não dependem de ter comprado o Vídeo Homenagem. */}
      <p style={estilos.secao}>Fotos ({fotos.length}/{MAX_FOTOS})</p>
      {fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          {fotos.map((url, i) => (
            <div key={url} style={{ position: 'relative', width: '64px', height: '64px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
              {i >= fotosDoVideo.length && (
                <button
                  type="button"
                  onClick={() => setFotosProprias((lista) => lista.filter((u) => u !== url))}
                  title="Remover foto"
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: 'var(--error, #ef4444)', color: '#fff', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1 }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {fotos.length < MAX_FOTOS && (
        <label className="btn btn-secondary" style={{ ...estilos.adicionar, display: 'block', textAlign: 'center', cursor: enviandoFotos ? 'default' : 'pointer', opacity: enviandoFotos ? 0.7 : 1, marginBottom: '4px' }}>
          {enviandoFotos ? 'Enviando...' : '+ Adicionar fotos'}
          <input type="file" accept="image/*" multiple onChange={handleUploadFotos} disabled={enviandoFotos} style={{ display: 'none' }} />
        </label>
      )}
      {erroFotos && <p style={{ fontSize: '0.78rem', color: 'var(--error, #ef4444)', margin: '6px 0 0' }}>{erroFotos}</p>}

      {/* Linha do tempo */}
      <p style={estilos.secao}>Linha do tempo</p>
      {momentos.map((m, i) => (
        <div key={i} style={estilos.bloco}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="date"
              value={m.data || ''}
              onChange={(e) => setMomentos((lista) => lista.map((x, xi) => xi === i ? { ...x, data: e.target.value } : x))}
              style={{ ...estilos.input, flex: '0 0 44%' }}
              aria-label={`Data do momento ${i + 1}`}
            />
            <input
              type="text"
              value={m.titulo || ''}
              onChange={(e) => setMomentos((lista) => lista.map((x, xi) => xi === i ? { ...x, titulo: e.target.value } : x))}
              placeholder="Título do momento"
              style={{ ...estilos.input, flex: 1 }}
              aria-label={`Título do momento ${i + 1}`}
            />
          </div>
          <textarea
            value={m.texto || ''}
            onChange={(e) => setMomentos((lista) => lista.map((x, xi) => xi === i ? { ...x, texto: e.target.value } : x))}
            placeholder="O que aconteceu nesse dia?"
            rows={2}
            style={{ ...estilos.input, resize: 'vertical' }}
            aria-label={`Descrição do momento ${i + 1}`}
          />
          {fotos.length > 0 && (
            <select
              value={m.fotoUrl || ''}
              onChange={(e) => setMomentos((lista) => lista.map((x, xi) => xi === i ? { ...x, fotoUrl: e.target.value } : x))}
              style={estilos.input}
              aria-label={`Foto do momento ${i + 1}`}
            >
              <option value="">Sem foto</option>
              {fotos.map((url, fi) => <option key={url} value={url}>Foto {fi + 1}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setMomentos((lista) => lista.filter((_, xi) => xi !== i))} style={estilos.remover}>
            Remover momento
          </button>
        </div>
      ))}
      {momentos.length < MAX_MOMENTOS && (
        <button type="button" onClick={() => setMomentos((l) => [...l, { data: '', titulo: '', texto: '', fotoUrl: '' }])} className="btn btn-secondary" style={estilos.adicionar}>
          + Adicionar momento
        </button>
      )}

      {/* Quiz */}
      <p style={estilos.secao}>Quiz (opcional)</p>
      {quiz.map((q, i) => (
        <div key={i} style={estilos.bloco}>
          <input
            type="text"
            value={q.pergunta || ''}
            onChange={(e) => setQuiz((lista) => lista.map((x, xi) => xi === i ? { ...x, pergunta: e.target.value } : x))}
            placeholder="Pergunta"
            style={estilos.input}
            aria-label={`Pergunta ${i + 1}`}
          />
          {[0, 1, 2, 3].map((oi) => (
            <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <input
                type="radio"
                name={`correta-${i}`}
                checked={Number(q.correta ?? 0) === oi}
                onChange={() => setQuiz((lista) => lista.map((x, xi) => xi === i ? { ...x, correta: oi } : x))}
                aria-label={`Marcar opção ${oi + 1} como correta`}
              />
              <input
                type="text"
                value={q.opcoes?.[oi] || ''}
                onChange={(e) => setQuiz((lista) => lista.map((x, xi) => {
                  if (xi !== i) return x;
                  const opcoes = [...(x.opcoes || ['', '', '', ''])];
                  opcoes[oi] = e.target.value;
                  return { ...x, opcoes };
                }))}
                placeholder={`Opção ${oi + 1}${oi < 2 ? '' : ' (opcional)'}`}
                style={{ ...estilos.input, marginBottom: 0, flex: 1 }}
                aria-label={`Opção ${oi + 1} da pergunta ${i + 1}`}
              />
            </div>
          ))}
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 8px' }}>Marque a bolinha da resposta certa.</p>
          <button type="button" onClick={() => setQuiz((lista) => lista.filter((_, xi) => xi !== i))} style={estilos.remover}>
            Remover pergunta
          </button>
        </div>
      ))}
      {quiz.length < MAX_QUIZ && (
        <button type="button" onClick={() => setQuiz((l) => [...l, { pergunta: '', opcoes: ['', '', '', ''], correta: 0 }])} className="btn btn-secondary" style={estilos.adicionar}>
          + Adicionar pergunta
        </button>
      )}

      {msg && <p style={{ fontSize: '0.82rem', margin: '12px 0 0', color: msg.startsWith('✅') ? 'var(--success)' : 'var(--error, #ef4444)' }}>{msg}</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="btn btn-primary"
        style={{ width: '100%', padding: '12px', marginTop: '14px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: salvando ? 'default' : 'pointer' }}
      >
        {salvando ? 'Salvando...' : '💾 Salvar retrospectiva'}
      </button>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <a href={linkPublico} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '0.82rem', textDecoration: 'none', textAlign: 'center' }}>
          👀 Ver página
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(linkPublico);
            setLinkCopiado(true);
            setTimeout(() => setLinkCopiado(false), 3000);
          }}
          className="btn btn-secondary"
          style={{ flex: 1, padding: '10px', fontSize: '0.82rem', cursor: 'pointer' }}
        >
          {linkCopiado ? '✅ Link copiado!' : '🔗 Copiar link'}
        </button>
      </div>
    </div>
  );
}

const estilos = {
  label: { fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' },
  input: { width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-primary)', background: 'var(--bg-primary)', marginBottom: '10px', boxSizing: 'border-box' },
  secao: { fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: '16px 0 8px' },
  bloco: { padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.6)', border: '1px solid var(--border-color)', marginBottom: '10px' },
  adicionar: { width: '100%', padding: '9px', fontSize: '0.82rem', cursor: 'pointer' },
  remover: { background: 'none', border: 'none', color: 'var(--error, #ef4444)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 },
};
