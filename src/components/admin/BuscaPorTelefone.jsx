'use client';

import { useState } from 'react';

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function textoDoLocal(local) {
  if (!local) return 'Localização indisponível';
  const lugar = [local.cidade, local.estado, local.pais].filter(Boolean).join(', ');
  return [lugar || 'Local desconhecido', local.provedor].filter(Boolean).join(' · ');
}

const botao = {
  padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff',
  fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
};

// Busca um cliente pelo telefone e mostra os IPs que ele usou, de onde são e quantas outras pessoas
// usaram o mesmo IP — com o botão de bloquear ao lado de cada um.
// `chamar` e `onBloquear` vêm de LimitesCota (mesma rota e mesma ação de bloqueio da aba).
export default function BuscaPorTelefone({ chamar, onBloquear, processando }) {
  const [telefone, setTelefone] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);

  const buscar = async (e) => {
    e?.preventDefault();
    if (!telefone.trim()) return;
    setBuscando(true);
    setErro('');
    setResultado(null);
    try {
      setResultado(await chamar('POST', { action: 'buscar', telefone: telefone.trim() }));
    } catch (err) {
      setErro(err.message);
    } finally {
      setBuscando(false);
    }
  };

  const bloquear = async ({ ip = '', comTelefone = false }) => {
    const pessoa = resultado.pessoa;
    await onBloquear(comTelefone ? pessoa.telefone : '', pessoa.nomes[0] || '', 'Bloqueio pela busca por telefone', ip);
    await buscar();
  };

  const pessoa = resultado?.pessoa;

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>🔎 Buscar pessoa pelo telefone</h3>
      <form onSubmit={buscar} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <label htmlFor="busca-telefone" style={{ position: 'absolute', left: '-9999px' }}>Telefone com DDD</label>
        <input
          id="busca-telefone"
          type="tel"
          inputMode="tel"
          placeholder="WhatsApp com DDD (ex: 94 99999-1234)"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          style={{ flex: '1 1 220px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
        />
        <button type="submit" disabled={buscando || !telefone.trim()} style={{ ...botao, background: '#7c3aed', opacity: buscando || !telefone.trim() ? 0.6 : 1 }}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {erro && <p role="alert" style={{ color: '#dc2626', fontSize: '0.85rem', margin: '10px 0 0' }}>{erro}</p>}
      {resultado && !resultado.encontrado && (
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '10px 0 0' }}>Nenhum pedido encontrado com esse telefone.</p>
      )}

      {pessoa && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
              <strong style={{ color: '#0f172a' }}>{pessoa.nomes.join(' / ') || 'Sem nome'}</strong> · {pessoa.telefone}
              <br />
              {pessoa.pedidos} pedidos ({pessoa.pagos} pagos) · primeiro em {formatarData(pessoa.primeiroPedidoEm)} · último em {formatarData(pessoa.ultimoPedidoEm)}
            </div>
            {pessoa.bloqueado ? (
              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#991b1b' }}>🚫 Telefone já bloqueado</span>
            ) : (
              <button type="button" disabled={Boolean(processando)} onClick={() => bloquear({ comTelefone: true })} style={{ ...botao, opacity: processando ? 0.6 : 1 }}>
                Bloquear telefone
              </button>
            )}
          </div>

          <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a', margin: '14px 0 8px' }}>IPs usados nos pedidos</h4>
          {resultado.ips.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>Nenhum pedido dessa pessoa tem IP gravado.</p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {resultado.ips.map((item) => (
                <div key={item.ip} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.83rem', color: '#334155', lineHeight: 1.55, minWidth: 0 }}>
                    <strong style={{ fontFamily: 'monospace', color: '#0f172a', overflowWrap: 'anywhere' }}>{item.ip}</strong>
                    <br />
                    {textoDoLocal(item.local)}
                    <br />
                    {item.pedidos} {item.pedidos === 1 ? 'pedido' : 'pedidos'} · último uso em {formatarData(item.ultimoUso)}
                    {item.outrosTelefones > 0 && (
                      <>
                        <br />
                        <span style={{ color: '#b45309', fontWeight: '600' }}>
                          ⚠️ {item.outrosTelefones} {item.outrosTelefones === 1 ? 'outro telefone usou' : 'outros telefones usaram'} este IP — pode ser IP compartilhado de operadora.
                        </span>
                      </>
                    )}
                  </div>
                  {item.bloqueado ? (
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#991b1b' }}>🚫 IP já bloqueado</span>
                  ) : (
                    <button type="button" disabled={Boolean(processando)} onClick={() => bloquear({ ip: item.ip })} style={{ ...botao, opacity: processando ? 0.6 : 1 }}>
                      Bloquear IP
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {pessoa.semIp > 0 && (
            <p style={{ color: '#64748b', fontSize: '0.78rem', margin: '8px 0 0' }}>{pessoa.semIp} pedido(s) sem IP gravado.</p>
          )}
          <p style={{ color: '#64748b', fontSize: '0.78rem', margin: '8px 0 0' }}>
            A localização é aproximada: mostra a cidade do provedor de internet, não o endereço da pessoa, e em rede móvel costuma apontar para outra cidade.
          </p>
        </div>
      )}
    </div>
  );
}
