'use client';

import { useState, useEffect, useRef } from 'react';
import { requestPixCharge } from '@/lib/pixCheckout';
import { compressImage } from '@/lib/imageCompress';
import RetrospectivaEditor from './delivery/RetrospectivaEditor';
import { AddonCheckout } from './delivery/EditorParts';

const MAX_PIX_ATTEMPTS = 3;
const PIX_POLLING_MAX_ATTEMPTS = 150; // ~10min a cada 4s, mesmo limite dos outros add-ons
const MAX_FOTOS = 20;

// Add-on "Retrospectiva" (R$ 9,99) — venda + editor do conteúdo. A página pública que o cliente
// compartilha é /retrospectiva?orderId=X.
//
// Mesmo padrão de checkout do playback/carta/vídeo. O que muda é o depois: aqui o cliente PREENCHE
// o conteúdo (linha do tempo, contador, quiz), então este componente é editor, não só entrega.
// Fica em arquivo próprio pra não engordar entrega/page.jsx (ver .claude/rules/frontend.md).
export default function RetrospectivaAddonCard({ orderId, order, onUnlocked }) {
  const [pixInfo, setPixInfo] = useState({ qrCode: '', paymentId: '' });
  const [loading, setLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [contadorLabel, setContadorLabel] = useState('Juntos há');
  const [dataInicio, setDataInicio] = useState('');
  const [momentos, setMomentos] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);

  const [fotosProprias, setFotosProprias] = useState([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [erroFotos, setErroFotos] = useState('');

  const hasAccess = unlocked || order?.hasRetrospectivaAccess || order?.retrospectivaAddonPaid;
  // Fotos do Vídeo Homenagem (quem comprou o vídeo já tem fotos prontas, reaproveita) SOMADAS às
  // fotos enviadas na própria retrospectiva — quem NÃO comprou vídeo não tinha foto nenhuma pra
  // usar aqui antes disso (achado 03/09/2026, relatado pelo dono do estúdio).
  const fotosDoVideo = Array.isArray(order?.slideshowImages) ? order.slideshowImages : [];
  const fotos = [...fotosDoVideo, ...fotosProprias];

  // Initialize once per order; live polling must not overwrite an unsaved edit/removal.
  const initializedOrder = useRef(null);
  useEffect(() => {
    if (!order || initializedOrder.current === orderId) return;
    initializedOrder.current = orderId;
    const r = order.retrospectiva || {};
    setTitulo(r.titulo || '');
    setContadorLabel(r.contadorLabel || 'Juntos há');
    setDataInicio(r.dataInicio || '');
    setMomentos(r.momentos || []);
    setQuiz(r.quiz || []);
    setFotosProprias(r.fotos || []);
    setDirty(false);
  }, [orderId, order]);

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
        const uploadData = new FormData();
        uploadData.append('file', arquivo, `foto_${i}.jpg`);
        const uploadRes = await fetch(`/api/media/upload?folder=retrospectiva&orderId=${encodeURIComponent(orderId)}`, {
          method: 'POST',
          body: uploadData
        });
        if (!uploadRes.ok) {
          throw new Error(`Falha no upload da foto ${i + 1}`);
        }
        const resJson = await uploadRes.json();
        if (!resJson?.url) {
          throw new Error(`URL da foto ${i + 1} não retornada`);
        }
        novasUrls.push(resJson.url);
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
        setDirty(true);
      } else {
        setDirty(false);
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
            if (typeof onUnlocked === 'function') {
              onUnlocked();
            }
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn('[RetrospectivaAddonCard] Erro ao consultar status do PIX:', e?.message);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [orderId, pixInfo.paymentId, hasAccess, onUnlocked]);

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
        setDirty(false);
      }
    } catch (e) {
      setMsg('❌ Falha de conexão ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const linkPublico = typeof window !== 'undefined' ? `${window.location.origin}/r/${orderId}` : '';
  if (!hasAccess) return <AddonCheckout sku="retrospectiva_addon" title="A história de vocês merece um lugar." description="Um álbum com fotos, momentos e a música que faz tudo ganhar sentido." features={['Álbum com até 20 fotos', 'Linha do tempo e contador de datas', 'Quiz opcional e página para compartilhar']} image="/experiencia/familia.webp" pix={pixInfo} loading={loading} error={pixError} timedOut={pollingTimedOut} onGenerate={handleGeneratePix} />;
  const edit = setter => value => { setDirty(true); setter(value); };
  return <RetrospectivaEditor titulo={titulo} setTitulo={edit(setTitulo)} contadorLabel={contadorLabel} setContadorLabel={edit(setContadorLabel)}
    dataInicio={dataInicio} setDataInicio={edit(setDataInicio)} momentos={momentos} setMomentos={edit(setMomentos)}
    quiz={quiz} setQuiz={edit(setQuiz)} fotos={fotos} inheritedPhotos={fotosDoVideo.length} setFotosProprias={edit(setFotosProprias)}
    uploading={enviandoFotos} onUpload={handleUploadFotos} photoError={erroFotos} saving={salvando}
    message={msg} dirty={dirty} onSave={salvar} url={linkPublico} />;
}
