'use client';

import React, { useState } from 'react';
import { chamarAdmin, estilos } from './apiAutomacao';

// Ligação com o Google Drive: link da pasta + chave da conta de serviço. A chave é enviada uma vez
// e nunca volta do servidor — a tela só mostra o e-mail da conta, que é com quem a pasta precisa
// ser compartilhada.
export default function ConfigDrive({ config, onSalvo }) {
  const [pasta, setPasta] = useState('');
  const [json, setJson] = useState('');
  const [salvando, setSalvando] = useState('');
  const [mensagem, setMensagem] = useState(null);

  const salvar = async (campos, chave) => {
    setSalvando(chave);
    setMensagem(null);
    const r = await chamarAdmin('/api/admin/instagram/publicacao', { method: 'POST', body: campos });
    setSalvando('');
    if (r.ok) {
      setPasta('');
      setJson('');
      setMensagem({ tipo: 'sucesso', texto: 'Salvo.' });
      onSalvo();
    } else {
      setMensagem({ tipo: 'erro', texto: r.error });
    }
  };

  return (
    <section style={{ ...estilos.cartao, display: 'grid', gap: '14px' }}>
      <h2 style={{ fontSize: '15px', margin: 0 }}>Google Drive</h2>

      <div>
        <label htmlFor="drive-json" style={estilos.rotulo}>
          Conta de serviço do Google (conteúdo do arquivo .json){config.emailDaContaDeServico ? ' — já configurada' : ''}
        </label>
        <textarea
          id="drive-json"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={3}
          placeholder='{ "type": "service_account", ... }'
          autoComplete="off"
          spellCheck={false}
          style={{ ...estilos.campo, resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
        />
        <button
          type="button"
          disabled={salvando === 'json' || !json.trim()}
          onClick={() => salvar({ contaDeServico: json.trim() }, 'json')}
          style={{ ...estilos.botaoPrimario, marginTop: '8px', opacity: salvando === 'json' || !json.trim() ? 0.6 : 1 }}
        >
          {salvando === 'json' ? 'Salvando...' : 'Salvar conta de serviço'}
        </button>
      </div>

      {config.emailDaContaDeServico && (
        <div style={estilos.sucesso}>
          Compartilhe a pasta de posts com este e-mail, como <strong>Leitor</strong>:
          <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '4px', overflowWrap: 'anywhere', userSelect: 'all' }}>
            {config.emailDaContaDeServico}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="drive-pasta" style={estilos.rotulo}>
          Link da pasta de posts no Drive{config.pastaId ? ' — já configurada' : ''}
        </label>
        <input
          id="drive-pasta"
          type="url"
          value={pasta}
          onChange={(e) => setPasta(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          style={estilos.campo}
        />
        <button
          type="button"
          disabled={salvando === 'pasta' || !pasta.trim()}
          onClick={() => salvar({ pasta: pasta.trim() }, 'pasta')}
          style={{ ...estilos.botaoPrimario, marginTop: '8px', opacity: salvando === 'pasta' || !pasta.trim() ? 0.6 : 1 }}
        >
          {salvando === 'pasta' ? 'Salvando...' : 'Salvar pasta'}
        </button>
      </div>

      {mensagem && (
        <div role="status" style={mensagem.tipo === 'sucesso' ? estilos.sucesso : estilos.erro}>{mensagem.texto}</div>
      )}

      <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1' }}>
        <strong style={{ color: '#f8fafc' }}>Como a pasta precisa estar</strong>
        <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
          <li>Uma subpasta por dia, com o nome no formato <code>2026-11-17</code>.</li>
          <li>Dentro dela, as imagens em <strong>.jpg</strong> (o Instagram não aceita PNG). Uma imagem vira foto; várias viram carrossel, na ordem do nome do arquivo.</li>
          <li>Um arquivo <code>legenda.txt</code> com a legenda e as hashtags (até 2.200 caracteres).</li>
        </ul>
      </div>
    </section>
  );
}
