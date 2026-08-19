import React, { useEffect, useRef, useState } from 'react';

const SOURCE_APP = 'NEXUS_APP';
const SOURCE_BRIDGE = 'NEXUS_PCNET_BRIDGE';
const BRIDGE_XPI_URL = '/downloads/nexus-pcnet-bridge.xpi';

export default function PcnetBridgeStatus() {
  const [bridge, setBridge] = useState('checking');
  const [status, setStatus] = useState(null);
  const [erro, setErro] = useState('');
  const pending = useRef(new Map());
  const seq = useRef(0);
  const readyRef = useRef(false);

  function request(action, payload = null, timeoutMs = 2200) {
    return new Promise((resolve, reject) => {
      const requestId = `nexus-status-${Date.now()}-${++seq.current}`;
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        reject(new Error('A extensão não respondeu.'));
      }, timeoutMs);
      pending.current.set(requestId, { resolve, reject, timer });
      window.postMessage({ source: SOURCE_APP, type: 'PCNET_BRIDGE_REQUEST', requestId, action, payload }, '*');
    });
  }

  async function atualizar() {
    try {
      const r = await request('STATUS');
      readyRef.current = true;
      setBridge('ready');
      setStatus(r);
    } catch {
      if (!readyRef.current) setBridge('missing');
    }
  }

  useEffect(() => {
    function onMessage(event) {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.source !== SOURCE_BRIDGE) return;
      if (d.type === 'READY') {
        readyRef.current = true;
        setBridge('ready');
        setTimeout(() => atualizar().catch(() => {}), 20);
        return;
      }
      if (d.type === 'RESPONSE' && d.requestId) {
        const item = pending.current.get(d.requestId);
        if (!item) return;
        clearTimeout(item.timer);
        pending.current.delete(d.requestId);
        d.ok ? item.resolve(d.response) : item.reject(new Error(d.error || 'Falha no Bridge'));
      }
    }

    window.addEventListener('message', onMessage);
    const first = setTimeout(() => atualizar().catch(() => {}), 150);
    const missing = setTimeout(() => setBridge(v => v === 'checking' ? 'missing' : v), 1400);
    const interval = setInterval(() => atualizar().catch(() => {}), 2500);
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(first);
      clearTimeout(missing);
      clearInterval(interval);
      for (const item of pending.current.values()) clearTimeout(item.timer);
      pending.current.clear();
    };
  }, []);

  async function conectar() {
    try {
      setErro('');
      const r = await request('OPEN_PCNET', null, 5000);
      setStatus(r);
      setBridge('ready');
    } catch (e) {
      setErro(e.message || 'Falha ao abrir o PCNet.');
    }
  }

  const conectado = Boolean(status?.conectado);

  if (bridge === 'checking') {
    return <div className="bg-white border rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-gray-500"><span className="w-2 h-2 rounded-full bg-gray-300"/>PCNet · verificando...</div>;
  }

  if (bridge === 'missing') {
    return (
      <div className="bg-white border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-amber-800">○ PCNet Bridge não instalado</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Instale a extensão oficial do Nexus para habilitar a integração com o PCNet.</div>
        </div>
        <button
          type="button"
          onClick={() => { window.location.href = BRIDGE_XPI_URL; }}
          className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-bold shrink-0"
        >
          Instalar PCNet Bridge
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white border rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${conectado ? 'border-emerald-200' : 'border-gray-200'}`}>
      <div>
        <div className={`text-sm font-bold ${conectado ? 'text-emerald-700' : 'text-gray-700'}`}>{conectado ? '● PCNet conectado' : '○ PCNet não conectado'}</div>
        {!conectado && <div className="text-[11px] text-gray-500 mt-0.5">O PCNet só será exibido para login/reautenticação.</div>}
        {erro && <div className="text-[11px] text-red-600 mt-1">{erro}</div>}
      </div>
      {!conectado && <button type="button" onClick={conectar} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-bold shrink-0">Conectar PCNet</button>}
    </div>
  );
}
