'use client';

// Hook que entrega o número de WhatsApp do suporte para as páginas do cliente.
//
// Começa no padrão e troca quando a leitura do Firestore volta: assim o botão nunca fica sem link
// enquanto carrega. Ver src/lib/configSite.js para o porquê disso existir.

import { useEffect, useState } from 'react';
import { lerConfigSite, normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from './configSite';

export function useWhatsappSuporte() {
  const [numero, setNumero] = useState(WHATSAPP_SUPORTE_PADRAO);

  useEffect(() => {
    let ativo = true;
    lerConfigSite().then((cfg) => {
      const valido = normalizarNumeroWhatsapp(cfg?.whatsappSuporte);
      if (ativo && valido) setNumero(valido);
    });
    return () => { ativo = false; };
  }, []);

  return numero;
}

// Monta o link completo já com a mensagem pronta. Centraliza o encodeURIComponent, que estava
// repetido em todos os 10 pontos que montavam esse link à mão.
export function linkWhatsapp(numero, mensagem) {
  const destino = normalizarNumeroWhatsapp(numero) || WHATSAPP_SUPORTE_PADRAO;
  if (!mensagem) return `https://wa.me/${destino}`;
  return `https://wa.me/${destino}?text=${encodeURIComponent(mensagem)}`;
}
