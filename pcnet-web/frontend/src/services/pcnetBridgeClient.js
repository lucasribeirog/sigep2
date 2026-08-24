const SOURCE_APP = 'NEXUS_APP';
const SOURCE_BRIDGE = 'NEXUS_PCNET_BRIDGE';

let seq = 0;
let listenerInstalado = false;
const pendentes = new Map();

function instalarListener() {
  if (listenerInstalado || typeof window === 'undefined') return;
  listenerInstalado = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (
      !data ||
      data.source !== SOURCE_BRIDGE ||
      data.type !== 'RESPONSE' ||
      !data.requestId
    ) {
      return;
    }

    const pendente = pendentes.get(data.requestId);
    if (!pendente) return;

    clearTimeout(pendente.timer);
    pendentes.delete(data.requestId);

    if (!data.ok) {
      const erro = new Error(data.error || 'Falha na comunicação com o PCNet Bridge.');
      erro.codigo = data.errorCode || null;
      pendente.reject(erro);
      return;
    }

    if (data.response?.erro) {
      const erro = new Error(data.response.erro);
      erro.codigo = data.response.erroCodigo || null;
      pendente.reject(erro);
      return;
    }

    pendente.resolve(data.response);
  });
}

export function pcnetBridgeRequest(action, payload = null, timeoutMs = 45000) {
  instalarListener();

  return new Promise((resolve, reject) => {
    const requestId = `nexus-${action.toLowerCase()}-${Date.now()}-${++seq}`;

    const timer = setTimeout(() => {
      pendentes.delete(requestId);
      const erro = new Error('O PCNet Bridge não respondeu dentro do tempo esperado.');
      erro.codigo = 'BRIDGE_TIMEOUT';
      reject(erro);
    }, timeoutMs);

    pendentes.set(requestId, { resolve, reject, timer });

    window.postMessage(
      {
        source: SOURCE_APP,
        type: 'PCNET_BRIDGE_REQUEST',
        requestId,
        action,
        payload,
      },
      '*'
    );
  });
}
