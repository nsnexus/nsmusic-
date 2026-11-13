'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RecoveryOrdersTable({ recentRecovered = [], recentSent = [] }) {
  const [tab, setTab] = useState('RECOVERED'); // 'RECOVERED' | 'SENT'

  const formatarData = (iso) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
            {tab === 'RECOVERED' ? '🎉 Pedidos Recuperados com Sucesso' : '📤 Mensagens Enviadas Recentemente'}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            {tab === 'RECOVERED'
              ? 'Clientes que clicaram no link e efetuaram o pagamento após o aviso.'
              : 'Histórico dos disparos automáticos realizados via Meta Cloud API.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button
            type="button"
            onClick={() => setTab('RECOVERED')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: tab === 'RECOVERED' ? '#ffffff' : 'transparent',
              color: tab === 'RECOVERED' ? '#0f172a' : '#64748b',
              fontWeight: '600',
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: tab === 'RECOVERED' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            💰 Recuperados ({recentRecovered.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('SENT')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: tab === 'SENT' ? '#ffffff' : 'transparent',
              color: tab === 'SENT' ? '#0f172a' : '#64748b',
              fontWeight: '600',
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: tab === 'SENT' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📋 Todos os Disparos ({recentSent.length})
          </button>
        </div>
      </div>

      {tab === 'RECOVERED' ? (
        recentRecovered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '0.9rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>⏳</div>
            <p style={{ fontWeight: '600', margin: '0 0 4px', color: '#334155' }}>Nenhum pedido recuperado ainda</p>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>Assim que os clientes notificados pagarem o PIX, eles aparecerão aqui com o valor convertido.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#64748b', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: '700' }}>
                  <th style={{ padding: '10px 12px' }}>Pedido</th>
                  <th style={{ padding: '10px 12px' }}>Cliente</th>
                  <th style={{ padding: '10px 12px' }}>Homenageado</th>
                  <th style={{ padding: '10px 12px' }}>Enviado Em</th>
                  <th style={{ padding: '10px 12px' }}>Pago Em</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {recentRecovered.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px' }}>
                      <Link
                        href={`/admin/pedidos/${item.orderNumber || item.id}`}
                        target="_blank"
                        style={{ color: '#0284c7', fontWeight: '700', textDecoration: 'none' }}
                      >
                        {item.orderNumber || item.id} ↗
                      </Link>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b' }}>{item.customerName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.customerPhone}</div>
                    </td>
                    <td style={{ padding: '12px', color: '#475569' }}>{item.honoreeName || '-'}</td>
                    <td style={{ padding: '12px', color: '#64748b' }}>{formatarData(item.sentAt)}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: '#ecfdf5', color: '#059669', padding: '3px 8px', borderRadius: '4px', fontWeight: '600', fontSize: '0.76rem' }}>
                        ✅ {formatarData(item.paidAt)}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: '#059669' }}>
                      R$ {Number(item.amount || 9.99).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : recentSent.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '0.9rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📭</div>
          <p style={{ fontWeight: '600', margin: '0 0 4px', color: '#334155' }}>Nenhum disparo registrado ainda</p>
          <p style={{ margin: 0, fontSize: '0.8rem' }}>A automação roda a cada hora buscando pedidos pendentes de 1h a 24h atrás que geraram PIX.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#64748b', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: '700' }}>
                <th style={{ padding: '10px 12px' }}>Pedido</th>
                <th style={{ padding: '10px 12px' }}>Cliente</th>
                <th style={{ padding: '10px 12px' }}>Homenageado</th>
                <th style={{ padding: '10px 12px' }}>Enviado Em</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentSent.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px' }}>
                    <Link
                      href={`/admin/pedidos/${item.orderNumber || item.id}`}
                      target="_blank"
                      style={{ color: '#0284c7', fontWeight: '700', textDecoration: 'none' }}
                    >
                      {item.orderNumber || item.id} ↗
                    </Link>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{item.customerName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.customerPhone}</div>
                  </td>
                  <td style={{ padding: '12px', color: '#475569' }}>{item.honoreeName || '-'}</td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{formatarData(item.sentAt)}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {item.isConverted ? (
                      <span style={{ background: '#ecfdf5', color: '#059669', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.75rem' }}>
                        💰 COMPROU
                      </span>
                    ) : (
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '6px', fontWeight: '600', fontSize: '0.75rem' }}>
                        ⏳ AGUARDANDO
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

