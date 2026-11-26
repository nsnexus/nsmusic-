'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

// Manda para o servidor, em lotes, tudo o que o chat mostrou (mensagens do cliente e do bot) e as
// marcas do atendimento — é o que aparece na aba "Atendimentos" do painel. Falha aqui nunca
// atrapalha a conversa: o histórico é só registro.

const ESPERA_MS = 2000;

function novoId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (_) {}
  // Fallback v4 para navegador antigo.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : ((r % 4) + 8)).toString(16);
  });
}

function resumir(m) {
  const base = { de: m.de, tipo: m.tipo, em: new Date().toISOString() };
  switch (m.tipo) {
    case 'texto': return { ...base, texto: m.texto, ...(Array.isArray(m.opcoes) && m.opcoes.length ? { opcoes: m.opcoes.map((o) => o.label) } : {}) };
    case 'letra': return { ...base, texto: m.texto };
    case 'audio': return { ...base, titulo: m.titulo || 'Áudio' };
    case 'arquivo': return { ...base, nome: m.nome };
    case 'link': case 'whatsapp': return { ...base, titulo: m.titulo, texto: m.url };
    case 'pix': return { ...base, titulo: m.titulo || 'Pix', texto: m.valor ? `R$ ${Number(m.valor).toFixed(2).replace('.', ',')}` : 'Pix gerado' };
    case 'imagem': return { ...base, nome: m.nome || 'imagem' };
    default: return null;
  }
}

export function useHistorico(orderId) {
  const conversaId = useRef(null);
  const fila = useRef([]);
  const marcas = useRef(new Set());
  const timer = useRef(null);
  const telefone = useRef('');
  const pedido = useRef(orderId);
  pedido.current = orderId;

  const enviar = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (fila.current.length === 0 && marcas.current.size === 0) return;
    if (!conversaId.current) conversaId.current = novoId();
    const corpo = JSON.stringify({
      acao: 'registrar',
      conversaId: conversaId.current,
      orderId: pedido.current || undefined,
      telefone: telefone.current || undefined,
      mensagens: fila.current.splice(0, 40),
      marcas: Array.from(marcas.current),
    });
    marcas.current.clear();
    fetch('/api/suporte/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true }).catch(() => {});
    if (fila.current.length) timer.current = setTimeout(enviar, 300);
  }, []);

  const agendar = useCallback(() => {
    if (!timer.current) timer.current = setTimeout(enviar, ESPERA_MS);
  }, [enviar]);

  const registrar = useCallback((lista) => {
    for (const m of lista) {
      const r = resumir(m);
      if (r) fila.current.push(r);
    }
    agendar();
  }, [agendar]);

  /** Id desta conversa (o servidor usa para não repetir ela no histórico anterior do cliente). */
  const idDaConversa = useCallback(() => {
    if (!conversaId.current) conversaId.current = novoId();
    return conversaId.current;
  }, []);

  const marcar = useCallback((marca) => {
    if (!marca) return;
    marcas.current.add(marca);
    agendar();
  }, [agendar]);

  // Sai da página ou troca de aba: manda o que faltou.
  useEffect(() => {
    const aoSair = () => { if (document.visibilityState === 'hidden') enviar(); };
    document.addEventListener('visibilitychange', aoSair);
    window.addEventListener('pagehide', enviar);
    return () => {
      document.removeEventListener('visibilitychange', aoSair);
      window.removeEventListener('pagehide', enviar);
      clearTimeout(timer.current);
    };
  }, [enviar]);

  const definirTelefone = useCallback((t) => {
    const d = String(t || '').replace(/\D/g, '');
    if (d.length >= 10 && d.length <= 13) telefone.current = d;
  }, []);

  // Mesmo objeto entre renderizações: quem depende dele em useCallback/useEffect não reinicia.
  return useMemo(() => ({ registrar, marcar, definirTelefone, idDaConversa }), [registrar, marcar, definirTelefone, idDaConversa]);
}
