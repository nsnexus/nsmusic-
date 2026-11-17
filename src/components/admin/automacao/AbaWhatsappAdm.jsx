'use client';

import { useState, useEffect, useCallback } from 'react';
import { chamarAdmin, formatarData, estilos } from './apiAutomacao';

const ROTA = '/api/admin/whatsapp-adm';

const ESTADOS = {
  open: { texto: 'Conectado', estilo: 'sucesso' },
  connecting: { texto: 'Aguardando a leitura do QR code', estilo: 'aviso' },
  close: { texto: 'Desconectado — conecte de novo pelo QR code', estilo: 'aviso' },
  inexistente: { texto: 'Número ainda não conectado', estilo: 'aviso' },
  sem_evolution: { texto: 'A Evolution API não está configurada no site', estilo: 'erro' },
  erro: { texto: 'Não foi possível falar com a Evolution API agora', estilo: 'erro' },
};

export default function AbaWhatsappAdm() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [qr, setQr] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    const r = await chamarAdmin(ROTA);
    if (r.ok) { setDados(r.data); setErro(''); if (r.data.estado === 'open') setQr(''); }
    else setErro(r.error);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Enquanto o QR está na tela, confere a cada 5s se o número já conectou (no máximo 2 minutos).
  useEffect(() => {
    if (!qr) return undefined;
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas += 1;
      if (tentativas > 24) { clearInterval(timer); return; }
      carregar();
    }, 5000);
    return () => clearInterval(timer);
  }, [qr, carregar]);

  const conectar = async () => {
    setOcupado(true); setErro(''); setAviso('');
    const r = await chamarAdmin(ROTA, { method: 'POST', body: { action: 'conectar' } });
    setOcupado(false);
    if (r.data) setDados((d) => ({ ...(d || {}), ...r.data }));
    if (!r.ok) { setErro(r.error); return; }
    setQr(r.data.qr || '');
    if (r.data.webhookOk === false) setAviso('O número foi preparado, mas a Evolution recusou o endereço de aviso de mensagens. Cadastre o endereço abaixo manualmente no painel da Evolution.');
    else if (r.data.estado === 'open') setAviso('O número já está conectado e o aviso de mensagens foi atualizado.');
    else if (!r.data.qr) setAviso('A Evolution não devolveu o QR code. Toque em “Conectar número” de novo em alguns segundos.');
  };

  const alternar = async (ligada) => {
    setOcupado(true); setErro('');
    const r = await chamarAdmin(ROTA, { method: 'POST', body: { action: 'salvar', ligada } });
    setOcupado(false);
    if (r.ok) setDados(r.data); else setErro(r.error);
  };

  if (!dados && !erro) return <p style={estilos.mudo}>Carregando...</p>;
  if (!dados) return <div style={estilos.erro}>{erro}</div>;

  const estado = ESTADOS[dados.estado] || { texto: `Situação: ${dados.estado}`, estilo: 'aviso' };
  const src = qr ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`) : '';

  return (
    <div style={{ display: 'grid', gap: '14px', maxWidth: '720px' }}>
      <div style={estilos.cartao}>
        <h2 style={{ margin: '0 0 6px', fontSize: '16px' }}>Respostas automáticas no número ADM</h2>
        <p style={{ ...estilos.mudo, margin: '0 0 12px' }}>
          Quando o cliente responder o menu só com o número: <strong style={{ color: '#f8fafc' }}>1</strong> pergunta o que ele quer ajustar (letra, ritmo, voz…); <strong style={{ color: '#f8fafc' }}>3</strong> com 1 pedido pago diz o código e a data e manda os arquivos, com vários lista os pedidos para ele escolher um ou TODAS; <strong style={{ color: '#f8fafc' }}>4</strong> envia o link para criar uma música; <strong style={{ color: '#f8fafc' }}>5</strong> pergunta o motivo do contato. Qualquer outra mensagem fica para você responder.
        </p>
        <div style={estilos[estado.estilo]}>{estado.texto}</div>

        <label style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '14px', fontSize: '15px', fontWeight: 700, color: '#f8fafc', cursor: 'pointer' }}>
          <input type="checkbox" checked={dados.ligada} disabled={ocupado} onChange={(e) => alternar(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#22c55e' }} />
          Automação ligada
          <span style={{ fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '999px', background: dados.ligada ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)', color: dados.ligada ? '#4ade80' : '#f87171' }}>
            {dados.ligada ? 'LIGADA' : 'DESLIGADA — marque para o robô responder'}
          </span>
        </label>
        {dados.ligada && dados.estado !== 'open' && (
          <p style={{ ...estilos.mudo, margin: '8px 0 0' }}>Ligada, mas só começa a responder depois que o número estiver conectado.</p>
        )}
      </div>

      <div style={estilos.cartao}>
        <h2 style={{ margin: '0 0 6px', fontSize: '16px' }}>Conectar o número</h2>
        <p style={{ ...estilos.mudo, margin: '0 0 12px' }}>
          No celular do número ADM: WhatsApp → três pontinhos → <strong style={{ color: '#f8fafc' }}>Dispositivos conectados</strong> → Conectar dispositivo, e aponte para o QR code. O WhatsApp continua funcionando normalmente no celular.
        </p>
        <button type="button" style={estilos.botaoPrimario} disabled={ocupado} onClick={conectar}>
          {ocupado ? 'Aguarde...' : dados.estado === 'open' ? 'Atualizar conexão' : 'Conectar número (QR code)'}
        </button>
        {src && dados.estado !== 'open' && (
          <div style={{ marginTop: '14px', background: '#fff', padding: '12px', borderRadius: '12px', width: 'fit-content' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="QR code para conectar o WhatsApp ADM" width={260} height={260} />
          </div>
        )}
        {aviso && <div style={{ ...estilos.aviso, marginTop: '12px' }}>{aviso}</div>}
        {erro && <div style={{ ...estilos.erro, marginTop: '12px' }}>{erro}</div>}
        <p style={{ ...estilos.mudo, margin: '12px 0 0', wordBreak: 'break-all' }}>
          Instância na Evolution: <code>{dados.instanceName}</code>
          {dados.webhookUrl && <><br />Endereço de aviso de mensagens (webhook, evento MESSAGES_UPSERT): <code>{dados.webhookUrl}</code></>}
        </p>
      </div>

      <div style={estilos.cartao}>
        <h2 style={{ margin: '0 0 10px', fontSize: '16px' }}>Últimas respostas</h2>
        {(!dados.ultimasAcoes || dados.ultimasAcoes.length === 0) ? (
          <p style={{ ...estilos.mudo, margin: 0 }}>Nenhuma resposta automática ainda.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '8px', fontSize: '13px' }}>
            {dados.ultimasAcoes.map((a, i) => (
              <li key={`${a.em}-${i}`} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8' }}>{formatarData(a.em)}</span>
                <span>Opção {a.opcao} · final {a.final}</span>
                <span style={{ color: '#cbd5e1' }}>{a.resultado}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
