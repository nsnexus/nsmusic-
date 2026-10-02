'use client';

import { useEffect } from 'react';
import { identifyTrafficSource } from '@/lib/trafficSource';

/**
 * Componente cliente leve que executa em todas as rotas da aplicação
 * para capturar parâmetros de campanha (UTMs, fbclid, ttclid, gclid)
 * e o referenciador de origem na primeira visita do cliente.
 */
export default function TrafficTracker() {
  useEffect(() => {
    identifyTrafficSource();
  }, []);

  return null;
}
