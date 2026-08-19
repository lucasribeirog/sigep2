(() => {
  const VERSION = '0.2.11.0';
  const SOURCE_APP = 'NEXUS_APP';
  const SOURCE_BRIDGE = 'NEXUS_PCNET_BRIDGE';

  function postar(payload) {
    window.postMessage({ source: SOURCE_BRIDGE, versao: VERSION, ...payload }, '*');
  }

  function pronto() {
    postar({ type: 'READY' });
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_APP || data.type !== 'PCNET_BRIDGE_REQUEST') return;
    const requestId = data.requestId;
    try {
      const response = await browser.runtime.sendMessage({
        type: 'NEXUS_COMMAND',
        action: data.action,
        payload: data.payload || null
      });
      postar({ type: 'RESPONSE', requestId, ok: true, response });
    } catch (error) {
      postar({ type: 'RESPONSE', requestId, ok: false, error: error?.message || String(error), errorCode: error?.codigo || error?.code || null });
    }
  });

  pronto();
  window.addEventListener('pageshow', pronto);
})();
