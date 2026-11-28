'use client';

// Pergunta ao servidor se o telefone digitado no /criar tem WhatsApp (ver src/lib/verificaWhatsapp.js).
// Espera o cliente parar de digitar (900 ms) e só consulta número com formato válido; guarda as
// respostas desta visita para não perguntar de novo o mesmo número. Nunca bloqueia o pedido.
//
// Devolve 'idle' | 'checking' | 'tem' | 'nao_tem' | 'desconhecido'.

import { useEffect, useRef, useState } from 'react';
import { normalizeBrazilPhoneDigits } from './telefoneBr';

const ESPERA_MS = 900;

export function useVerificaWhatsapp(telefone, formatoValido) {
  const [status, setStatus] = useState('idle');
  const respostas = useRef(new Map());

  useEffect(() => {
    const digitos = normalizeBrazilPhoneDigits(telefone).slice(0, 11);
    if (!formatoValido || digitos.length < 10) {
      setStatus('idle');
      return undefined;
    }
    if (respostas.current.has(digitos)) {
      setStatus(respostas.current.get(digitos));
      return undefined;
    }

    let cancelado = false;
    const controle = new AbortController();
    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/whatsapp/verificar-numero', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefone: digitos }),
          signal: controle.signal,
        });
        const data = res.ok ? await res.json() : null;
        const resultado = ['tem', 'nao_tem'].includes(data?.resultado) ? data.resultado : 'desconhecido';
        if (resultado !== 'desconhecido') respostas.current.set(digitos, resultado);
        if (!cancelado) setStatus(resultado);
      } catch {
        if (!cancelado) setStatus('desconhecido');
      }
    }, ESPERA_MS);

    return () => {
      cancelado = true;
      clearTimeout(timer);
      controle.abort();
    };
  }, [telefone, formatoValido]);

  return status;
}
