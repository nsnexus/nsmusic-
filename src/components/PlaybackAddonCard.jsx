'use client';

import { useState, useEffect } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import { buildAudioProxySrc } from '@/lib/audioProxy';
import PixQrCode from './PixQrCode';
import { useWhatsappSuporte, linkWhatsapp } from '@/lib/useWhatsappSuporte';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite do add-on de vídeo

// Add-on "Gerar Playback" (instrumental sem voz, R$ 4,99). O pagamento continua automático aqui; a
// ENTREGA passou a ser manual, pelo WhatsApp, em 24/09/2026.
//
// Por quê: a separação vocal era feita na Kie.ai e falhava quase sempre — 10 dos 11 playbacks pagos
// entre 04/09 e 23/09 terminaram em `playbackStatus: FAILED` com `kie_callback_200` (a Kie.ai
// aceitava a tarefa, mandava callback de sucesso, e a URL do instrumental vinha num campo que o
// webhook não reconhecia; já eram duas variantes de formato antes dessa). Cliente pagava e não
// recebia. Enquanto isso não for confiável, o estúdio prefere entregar na mão: o cliente paga, fala
// no WhatsApp com o número do pedido, e recebe o arquivo por lá.
//
// Este componente não gera nada e não fala com provedor nenhum: cobra, confirma e mostra o caminho
// do WhatsApp. `playbackUrl`/`READY` continuam sendo respeitados para quem já tem o arquivo
// gravado no pedido (os playbacks antigos que deram certo).
export default function PlaybackAddonCard({ orderId, order }) {
  // Número do suporte vem da configuração editável no painel (src/lib/configSite.js), não do código.
  const whatsappSuporte = useWhatsappSuporte();
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  // Faixa escolhida pelo cliente. Continua sendo gravada no pedido (/api/playback/choose-track)
  // porque agora ela serve para o estúdio saber QUAL das duas versões transformar em playback.
  const faixas = Array.isArray(order?.audioIds) ? order.audioIds : [];
  const arquivosFaixas = Array.isArray(order?.audioFiles) ? order.audioFiles : [];
  const temEscolha = faixas.length > 1;
  const [faixaEscolhida, setFaixaEscolhida] = useState(0);

  const hasAccess = unlocked || order?.hasPlaybackAccess || order?.playbackAddonPaid;
  const identificacao = order?.orderNumber || orderId;

  const handleGeneratePix = async () => {
    if (!orderId) return;
    setPixError('');
    setLoading(true);

    // Salva a faixa escolhida ANTES de cobrar — se falhar, segue mesmo assim (nunca bloqueia o
    // pagamento por causa disso; o cliente ainda informa a faixa na conversa do WhatsApp).
    if (temEscolha && faixas[faixaEscolhida]) {
      try {
        await fetch('/api/playback/choose-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, audioId: faixas[faixaEscolhida] }),
        });
      } catch (e) {
        console.warn('[PlaybackAddonCard] Falha ao salvar faixa escolhida:', e?.message);
      }
    }

    const resultado = await requestPixCharge(
      { orderId, sku: 'playback_addon', isSecondaryPayment: true },
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
        console.warn('[PlaybackAddonCard] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess]);

  const estiloCartao = {
    padding: '20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)',
    border: '1.5px solid rgba(139, 92, 246, 0.35)',
    marginTop: '16px',
    color: '#ffffff',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
  };

  if (!hasAccess) {
    return (
      <div className="glass-card" style={estiloCartao}>
        {pixInfo.paymentId ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '10px', color: '#ffffff' }}>
              Escaneie pra liberar o Playback (Instrumental)
            </p>
            <PixQrCode payload={pixInfo.qrCode} size={180} label="QR Code para pagamento do Playback via PIX" />
            <div style={{ margin: '12px 0 10px', textAlign: 'left' }}>
              <label htmlFor="pix-copia-cola-playback" style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                Ou use o código PIX Copia e Cola:
              </label>
              <textarea
                id="pix-copia-cola-playback"
                readOnly
                value={pixInfo.qrCode}
                style={{ width: '100%', height: '60px', background: '#FFFFFF', color: '#0f172a', border: '1.5px solid var(--border-color)', borderRadius: '8px', padding: '10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none' }}
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
              {pixCopied ? '✅ Código PIX Copiado!' : '📋 Copiar Código PIX (R$ 4,99)'}
            </button>
            <p style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '10px' }}>
              Assim que o pagamento cair, aparece aqui o botão pra pedir seu playback no WhatsApp.
            </p>
            {pollingTimedOut && (
              <p style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '10px' }}>
                Ainda não identificamos o pagamento. Se já pagou, aguarde mais um instante — a confirmação
                pode demorar um pouco.
              </p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: '1.05rem', marginBottom: '6px', fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
              🎧 Gerar Playback (Instrumental)
            </h4>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '14px', lineHeight: '1.4' }}>
              A versão da sua música sem voz, pronta pra cantar junto — por apenas <strong style={{ color: '#34d399' }}>R$ 4,99</strong>.
              <br />
              <span style={{ fontSize: '0.8rem' }}>
                Depois do pagamento você fala com a gente no WhatsApp e recebe o arquivo por lá.
              </span>
            </p>
            {temEscolha && (
              <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px', textAlign: 'center', color: '#ffffff' }}>
                  Qual das 2 versões você quer transformar em playback?
                </p>
                {faixas.map((id, i) => (
                  <label
                    key={id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1.5px solid ${faixaEscolhida === i ? 'var(--secondary)' : 'rgba(255,255,255,0.18)'}`,
                      backgroundColor: faixaEscolhida === i ? 'rgba(236, 72, 153, 0.18)' : 'rgba(0,0,0,0.3)',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="playback-faixa"
                        checked={faixaEscolhida === i}
                        onChange={() => setFaixaEscolhida(i)}
                      />
                      <span style={{ fontSize: '0.88rem', fontWeight: '600', color: '#ffffff' }}>Faixa {i + 1}</span>
                    </div>
                    {arquivosFaixas[i] && (
                      <audio controls src={buildAudioProxySrc(arquivosFaixas[i])} style={{ width: '100%', maxWidth: '100%', height: '36px' }} />
                    )}
                  </label>
                ))}
              </div>
            )}
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
              {loading ? 'Gerando cobrança...' : 'Gerar Playback — R$ 4,99'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Playback antigo que ficou pronto antes da entrega virar manual: continua tocando e baixando.
  if (order?.playbackStatus === 'READY' && order?.playbackUrl) {
    return (
      <div className="glass-card" style={{ ...estiloCartao, textAlign: 'center' }}>
        <h4 style={{ fontSize: '1.05rem', marginBottom: '10px', fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
          🎧 Seu Playback está pronto!
        </h4>
        <audio controls src={buildAudioProxySrc(order.playbackUrl)} style={{ width: '100%', marginBottom: '10px' }} />
        <a
          href={`/api/audio/proxy?url=${encodeURIComponent(order.playbackUrl)}&download=${encodeURIComponent(`playback-${identificacao}.mp3`)}`}
          download={`playback-${identificacao}.mp3`}
          className="btn btn-secondary"
          style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none' }}
        >
          💾 Baixar Playback
        </a>
      </div>
    );
  }

  // Pago e sem arquivo: o caminho é o WhatsApp. Vale também para os pedidos que ficaram em FAILED
  // na época da geração automática — para o cliente, a situação é a mesma: pagou e falta receber.
  const faixaInformada = temEscolha
    ? ` (faixa ${Math.max(1, faixas.indexOf(order?.playbackChosenAudioId) + 1)})`
    : '';

  return (
    <div className="glass-card" style={{ ...estiloCartao, textAlign: 'center' }}>
      <h4 style={{ fontSize: '1.05rem', marginBottom: '8px', fontFamily: 'var(--font-family-title)', color: '#ffffff' }}>
        ✅ Playback pago — só falta pedir
      </h4>
      <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '14px', lineHeight: 1.45 }}>
        Seu pagamento está confirmado. Mande uma mensagem no WhatsApp com o número do seu pedido que a
        gente prepara o playback e te envia por lá.
      </p>
      <p style={{ fontSize: '0.9rem', fontWeight: '700', color: '#ffffff', marginBottom: '14px' }}>
        Pedido <span style={{ color: '#34d399' }}>{identificacao}</span>
      </p>
      <a
        href={linkWhatsapp(
          whatsappSuporte,
          `Olá! Paguei o Playback (Instrumental) do pedido ${identificacao}${faixaInformada} e gostaria de receber o arquivo.`
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary"
        style={{ padding: '12px 20px', fontSize: '0.9rem', fontWeight: 'bold', textDecoration: 'none', display: 'inline-block' }}
      >
        💬 Pedir meu playback no WhatsApp
      </a>
    </div>
  );
}
