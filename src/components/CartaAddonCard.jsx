'use client';

import { useState, useEffect } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import PixQrCode from './PixQrCode';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite dos outros add-ons

// Add-on "Carta Virtual" (R$ 3,99) — mesmo padrão de pagamento do playback e do vídeo, em
// componente próprio pra não engordar entrega/page.jsx (já acima do limite de 400 linhas, ver
// .claude/rules/frontend.md).
//
// Depois de pago, o texto já vem escrito pelo servidor (src/lib/payments.js chama generateCartaText
// na aprovação) — o `order` chega ao vivo do onSnapshot que a página pai mantém, então cartaTexto
// aparece sozinho. O botão de gerar aqui é só a rede de segurança pra quando aquela geração falhou.
export default function CartaAddonCard({ orderId, order }) {
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [pixCopied, setPixCopied] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const [aberta, setAberta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erroTexto, setErroTexto] = useState('');

  const hasAccess = unlocked || order?.hasCartaAccess || order?.cartaAddonPaid;
  const texto = order?.cartaTexto || '';
  const remetente = order?.customerName || '';
  const honoree = order?.honoreeName || '';
  const linkPublico = typeof window !== 'undefined' ? `${window.location.origin}/carta?orderId=${orderId}` : '';
  const [linkCopiado, setLinkCopiado] = useState(false);

  // Qual música toca sozinha quando alguém abre a página pública da carta (pedido 04/09/2026) — só
  // mostra escolha quando tem mais de uma faixa gerada; com uma só, não tem o que escolher.
  const faixasMusica = [order?.audioUrl, ...(Array.isArray(order?.audioFiles) ? order.audioFiles : [])].filter(Boolean);
  const faixasUnicas = [...new Set(faixasMusica)];
  const [musicaEscolhida, setMusicaEscolhida] = useState('');
  const [salvandoMusica, setSalvandoMusica] = useState(false);

  useEffect(() => {
    if (order?.cartaMusicaUrl) setMusicaEscolhida(order.cartaMusicaUrl);
    else if (faixasUnicas[0]) setMusicaEscolhida(faixasUnicas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.cartaMusicaUrl, faixasUnicas[0]]);

  const handleEscolherMusica = async (url) => {
    setMusicaEscolhida(url);
    setSalvandoMusica(true);
    try {
      await fetch('/api/carta/choose-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, audioUrl: url }),
      });
    } catch (e) {
      console.warn('[CartaAddonCard] Falha ao salvar música escolhida:', e?.message);
    }
    setSalvandoMusica(false);
  };

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);

    const resultado = await requestPixCharge(
      { orderId, sku: 'carta_addon', isSecondaryPayment: true },
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
        console.warn('[CartaAddonCard] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess]);

  const chamarApi = async (payload) => {
    const res = await fetch('/api/carta/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível concluir agora.');
    return data;
  };

  const handleGerar = async () => {
    setGerando(true);
    setErroTexto('');
    try {
      await chamarApi({});
      // cartaTexto chega pelo onSnapshot do pai — não precisa setar estado local.
    } catch (err) {
      setErroTexto(err.message);
    } finally {
      setGerando(false);
    }
  };

  const handleSalvar = async () => {
    if (!rascunho.trim()) return;
    setSalvando(true);
    setErroTexto('');
    try {
      await chamarApi({ texto: rascunho });
      setEditando(false);
    } catch (err) {
      setErroTexto(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const cardStyle = {
    padding: '20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(251, 191, 36, 0.10) 100%)',
    border: '1.5px solid rgba(236, 72, 153, 0.25)',
    marginTop: '16px',
  };

  // --- Ainda não comprou: oferta + checkout ---
  if (!hasAccess) {
    return (
      <div className="glass-card" style={cardStyle}>
        {pixInfo.paymentId ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>
              Escaneie pra liberar a Carta Virtual
            </p>
            <PixQrCode payload={pixInfo.qrCode} size={180} label="QR Code para pagamento da Carta Virtual via PIX" />
            <div style={{ margin: '12px 0 10px', textAlign: 'left' }}>
              <label htmlFor="pix-copia-cola-carta" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Ou use o código PIX Copia e Cola:
              </label>
              <textarea
                id="pix-copia-cola-carta"
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
              {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX (R$ 3,99)'}
            </button>
            {pollingTimedOut && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                Ainda não identificamos o pagamento. Se já pagou, aguarde mais um instante.
              </p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>💌</div>
            <h4 style={{ fontSize: '1rem', marginBottom: '6px', fontFamily: 'var(--font-family-title)' }}>
              Carta Virtual {honoree ? `para ${honoree}` : ''}
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.45' }}>
              Uma carta escrita a partir da <strong>mesma história</strong> que você contou pra música —
              com envelope que abre, foto e sua assinatura. Você pode editar cada palavra antes de
              enviar. Por <strong style={{ color: 'var(--success)' }}>R$ 3,99</strong>.
            </p>
            {pixError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--error, #ef4444)', marginBottom: '10px' }}>{pixError}</p>
            )}
            <button
              type="button"
              onClick={handleGeneratePix}
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: '10px 20px', fontSize: '0.88rem', fontWeight: 'bold', border: 'none', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Gerando cobrança...' : 'Quero a Carta — R$ 3,99'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- Já pagou, mas o texto ainda não existe (geração automática falhou ou está em curso) ---
  if (!texto) {
    return (
      <div className="glass-card" style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>💌</div>
        <p style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>Sua Carta Virtual está liberada!</p>
        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          {order?.cartaStatus === 'FAILED'
            ? 'Tivemos um problema ao escrever a carta. É só tocar no botão que eu escrevo agora.'
            : 'Estou escrevendo sua carta com a história que você contou...'}
        </p>
        {erroTexto && <p style={{ fontSize: '0.8rem', color: 'var(--error, #ef4444)', marginBottom: '10px' }}>{erroTexto}</p>}
        <button
          type="button"
          onClick={handleGerar}
          disabled={gerando}
          className="btn btn-primary"
          style={{ padding: '10px 18px', fontSize: '0.86rem', fontWeight: 'bold', border: 'none', cursor: gerando ? 'default' : 'pointer', opacity: gerando ? 0.7 : 1 }}
        >
          {gerando ? 'Escrevendo...' : '✍️ Escrever minha carta'}
        </button>
      </div>
    );
  }

  // --- Carta pronta: envelope fechado até o clique, depois papel + foto + assinatura ---
  return (
    <div className="glass-card" style={cardStyle}>
      {!aberta ? (
        <button
          type="button"
          onClick={() => setAberta(true)}
          style={{
            width: '100%',
            background: 'linear-gradient(160deg, #fdf2f8 0%, #fce7f3 100%)',
            border: '1.5px solid rgba(236, 72, 153, 0.35)',
            borderRadius: '14px',
            padding: '30px 20px',
            cursor: 'pointer',
            textAlign: 'center',
            position: 'relative',
          }}
          aria-label="Abrir a carta"
        >
          <div style={{ fontSize: '2.6rem', lineHeight: 1 }}>✉️</div>
          {/* Lacre de cera — círculo com sombra e brilho, como um selo de verdade. */}
          <div
            style={{
              width: '38px',
              height: '38px',
              margin: '-19px auto 0',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #f472b6, #9d174d)',
              boxShadow: '0 3px 8px rgba(157, 23, 77, 0.5), inset 0 1px 2px rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 1,
            }}
            aria-hidden="true"
          >
            <span style={{ fontSize: '0.95rem', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>💗</span>
          </div>
          <div style={{ marginTop: '14px', fontFamily: 'var(--font-family-title)', fontSize: '1rem', color: '#9d174d' }}>
            {honoree ? `Uma carta para ${honoree}` : 'Sua carta chegou'}
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#be185d' }}>toque no lacre para abrir</div>
        </button>
      ) : (
        <div>
          <div
            style={{
              background: '#fffdf7',
              border: '1px solid #f1e6cf',
              borderRadius: '12px',
              padding: '22px 20px',
              boxShadow: 'inset 0 0 40px rgba(180, 150, 90, 0.08)',
            }}
          >
            {order?.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.coverUrl}
                alt={honoree ? `Foto de ${honoree}` : 'Foto da homenagem'}
                style={{
                  width: '116px',
                  height: '116px',
                  objectFit: 'cover',
                  float: 'right',
                  marginLeft: '14px',
                  marginBottom: '10px',
                  border: '6px solid #fff',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                  transform: 'rotate(3deg)',
                  borderRadius: '2px',
                }}
              />
            )}

            {editando ? (
              <textarea
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                rows={12}
                style={{ width: '100%', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '0.9rem', lineHeight: '1.7', color: '#3f3a2f', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
              />
            ) : (
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: '1.85', color: '#3f3a2f', margin: 0 }}>
                {texto}
              </p>
            )}

            {!editando && remetente && (
              <p style={{ clear: 'both', marginTop: '18px', textAlign: 'right', fontFamily: 'cursive', fontSize: '1.25rem', color: '#8a6d3b' }}>
                {remetente}
              </p>
            )}
          </div>

          {erroTexto && <p style={{ fontSize: '0.8rem', color: 'var(--error, #ef4444)', marginTop: '10px' }}>{erroTexto}</p>}

          {faixasUnicas.length > 1 && (
            <div style={{ marginTop: '14px', textAlign: 'left' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: '700', marginBottom: '8px' }}>
                Música que toca sozinha quando abrir a carta:
              </p>
              {faixasUnicas.map((url, i) => (
                <label
                  key={url}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '8px',
                    border: `1.5px solid ${musicaEscolhida === url ? 'var(--primary)' : 'var(--border-color)'}`,
                    marginBottom: '6px', cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="carta-musica"
                    checked={musicaEscolhida === url}
                    onChange={() => handleEscolherMusica(url)}
                  />
                  <span style={{ fontSize: '0.78rem', fontWeight: '600', minWidth: '52px' }}>Faixa {i + 1}</span>
                  <audio controls src={url} style={{ flex: 1, height: '30px' }} />
                </label>
              ))}
              {salvandoMusica && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Salvando...</p>}
            </div>
          )}

          {linkPublico && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
              <a href={linkPublico} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '0.82rem', textDecoration: 'none', textAlign: 'center' }}>
                👀 Ver página da carta
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(linkPublico);
                  setLinkCopiado(true);
                  setTimeout(() => setLinkCopiado(false), 3000);
                }}
                className="btn btn-secondary"
                style={{ padding: '10px 14px', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                {linkCopiado ? '✅ Link copiado!' : '🔗 Copiar link'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {editando ? (
              <>
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '10px', fontSize: '0.82rem', fontWeight: 'bold', border: 'none', cursor: salvando ? 'default' : 'pointer' }}
                >
                  {salvando ? 'Salvando...' : '💾 Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="btn btn-secondary"
                  style={{ padding: '10px 14px', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setRascunho(texto); setEditando(true); }}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '10px', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  ✏️ Editar texto
                </button>
                <button
                  type="button"
                  onClick={handleGerar}
                  disabled={gerando}
                  className="btn btn-secondary"
                  style={{ padding: '10px 14px', fontSize: '0.82rem', cursor: gerando ? 'default' : 'pointer' }}
                >
                  {gerando ? 'Escrevendo...' : '🔄 Escrever outra'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
