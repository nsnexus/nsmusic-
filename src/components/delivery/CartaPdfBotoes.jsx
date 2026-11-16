'use client';

import { useState } from 'react';
import { FileDown, Send } from 'lucide-react';
import { gerarCartaPdf, nomeArquivoCarta } from '@/lib/cartaPdf';

function baixar(blob, nome) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export default function CartaPdfBotoes({ texto, honoree, remetente, url, disabled = false }) {
  const [estado, setEstado] = useState('');
  const [erro, setErro] = useState('');

  const executar = async (modo) => {
    setErro(''); setEstado(modo);
    try {
      const blob = await gerarCartaPdf({ texto, honoree, remetente, url });
      const nome = nomeArquivoCarta(honoree);
      if (modo === 'enviar') {
        const arquivo = new File([blob], nome, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [arquivo] })) {
          try {
            await navigator.share({ files: [arquivo], title: honoree ? `Carta para ${honoree}` : 'Uma carta' });
          } catch (e) {
            if (e?.name !== 'AbortError') throw e;
          }
          return;
        }
      }
      baixar(blob, nome);
    } catch (e) {
      console.warn('[carta-pdf] falha ao gerar:', e?.message);
      setErro('Não foi possível gerar o PDF agora. Tente de novo.');
    } finally {
      setEstado('');
    }
  };

  if (!texto) return null;
  const ocupado = disabled || Boolean(estado);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        <button type="button" className="nx-button" onClick={() => executar('baixar')} disabled={ocupado}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <FileDown size={16} aria-hidden="true" />{estado === 'baixar' ? 'Gerando…' : 'Baixar PDF'}
        </button>
        <button type="button" className="nx-button" onClick={() => executar('enviar')} disabled={ocupado}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <Send size={16} aria-hidden="true" />{estado === 'enviar' ? 'Gerando…' : 'Enviar PDF'}
        </button>
      </div>
      <p className="nx-helper" style={{ margin: '6px 0 0', fontSize: '0.78rem' }}>Pronto para imprimir em folha A4.</p>
      {erro && <p className="nx-message nx-error" role="alert">{erro}</p>}
    </div>
  );
}
