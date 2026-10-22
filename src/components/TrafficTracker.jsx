'use client';

import { useEffect } from 'react';
import { identifyTrafficSource } from '@/lib/trafficSource';

const SESSION_VISIT_KEY = 'ns_session_visited';
const SESSION_ID_KEY = 'ns_analytics_session_id';

function getOrCreateSessionId() {
  try {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch (e) {
    return 's_' + Date.now();
  }
}

/**
 * Componente cliente leve que executa em todas as rotas da aplicação.
 * 1. Captura parâmetros de campanha (UTMs, fbclid, ttclid, gclid) e armazena localmente.
 * 2. Registra o acesso ao site no backend APENAS UMA VEZ por sessão (incremental, sem spam de requisições).
 */
export default function TrafficTracker() {
  useEffect(() => {
    try {
      // Se o usuário caiu em qualquer página com token de recuperação de senha (#access_token=...&type=recovery),
      // redireciona imediatamente para a tela de redefinição de senha mantendo os tokens intactos.
      if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('type=recovery') && !window.location.pathname.startsWith('/login')) {
        window.location.replace('/login?modo=redefinir' + window.location.hash);
        return;
      }

      const traffic = identifyTrafficSource();

      // Envia registro ao backend apenas na PRIMEIRA visualização desta sessão
      const alreadyTracked = sessionStorage.getItem(SESSION_VISIT_KEY);
      if (!alreadyTracked) {
        sessionStorage.setItem(SESSION_VISIT_KEY, '1');
        const sessionId = getOrCreateSessionId();

        const payload = {
          sessionId,
          platform: traffic?.platform || 'direto',
          utmSource: traffic?.utmSource || null,
          utmMedium: traffic?.utmMedium || null,
          utmCampaign: traffic?.utmCampaign || null,
          utmContent: traffic?.utmContent || null,
          utmTerm: traffic?.utmTerm || null,
          pagePath: window.location.pathname || '/',
          referrer: document.referrer || '',
        };

        // Fire-and-forget via fetch keepalive
        fetch('/api/analytics/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    } catch (e) {
      // Ignora silenciosamente em caso de bloqueadores de rastreamento no navegador
    }
  }, []);

  return null;
}
