const VERSION = '0.2.27.0';
const PCNET_URL = 'https://www.pcnet.mg.gov.br/APP/';
const NEXUS_WEB_ORIGIN = 'https://nexus-laudos-dev.onrender.com';
const NEXUS_TAB_PATTERNS = [
  'http://localhost/*',
  'http://127.0.0.1/*',
  `${NEXUS_WEB_ORIGIN}/*`
];

function ehUrlNexus(url) {
  const valor = String(url || '');
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(valor)
    || valor === NEXUS_WEB_ORIGIN
    || valor.startsWith(`${NEXUS_WEB_ORIGIN}/`);
}

// V2.16: mantém o recarregamento automático do Nexus após instalação/atualização
// qualquer aba do Nexus que já esteja aberta. Isso faz o content script entrar em
// ação sem exigir que o usuário recarregue a página manualmente.
browser.runtime.onInstalled.addListener((details) => {
  if (!['install', 'update'].includes(details?.reason)) return;
  setTimeout(async () => {
    try {
      const tabs = await browser.tabs.query({ url: NEXUS_TAB_PATTERNS });
      for (const tab of tabs) {
        if (tab?.id) await browser.tabs.reload(tab.id).catch(() => {});
      }
    } catch (error) {
      console.warn('[Nexus PCNet Bridge] Falha ao recarregar o Nexus após a instalação:', error?.message || error);
    }
  }, 300);
});
const TTL_MS = 8000;
const STORAGE_KEY = 'pcnetBridgeFramesV2';
const LAST_FAV_KEY = 'pcnetBridgeLastFavV2';
const LAST_MOV_KEY = 'pcnetBridgeLastMovementV23';
const LAST_SAMPLE_KEY = 'pcnetBridgeLastSampleV25';
const MANAGED_ROOT_KEY = 'pcnetBridgeManagedRootTabV211';
let operacaoVisualAtiva = null;
const movimentosEmAndamento = new Set();
const movimentosConcluidos = new Map();
const amostrasEmAndamento = new Set();
// V2.20 - ações nativas da caixa de Aceite.
const acoesAceiteEmAndamento = new Set();
const acoesAceiteConcluidas = new Map();
const autoHideTimers = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function lerEstados() {
  const obj = await browser.storage.local.get(STORAGE_KEY);
  return obj[STORAGE_KEY] || {};
}

async function gravarEstados(estados) {
  await browser.storage.local.set({ [STORAGE_KEY]: estados });
}

async function lerAbaGerenciadaId() {
  const obj = await browser.storage.local.get(MANAGED_ROOT_KEY).catch(() => ({}));
  const id = Number(obj?.[MANAGED_ROOT_KEY]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function definirAbaGerenciada(tabId) {
  const id = Number(tabId);
  if (Number.isInteger(id) && id > 0) {
    await browser.storage.local.set({ [MANAGED_ROOT_KEY]: id });
    return id;
  }
  await browser.storage.local.remove(MANAGED_ROOT_KEY).catch(() => {});
  return null;
}

async function migrarAbaOcultaLegadaSeNecessario() {
  const atual = await lerAbaGerenciadaId();
  if (atual) return atual;

  // Migração V2.10 -> V2.11: só adotamos uma aba PCNet JÁ OCULTA, sem opener,
  // e com heartbeat autenticado. Abas visíveis abertas manualmente nunca são
  // apropriadas pelo Bridge.
  const estados = await lerEstados();
  const agora = Date.now();
  const tabs = await browser.tabs.query({ url: ['https://*.pcnet.mg.gov.br/*'] });
  const candidatas = [];
  for (const tab of tabs) {
    if (!tab.hidden || tab.openerTabId != null) continue;
    const raw = limparFramesAntigos(estados[String(tab.id)] || { frames: {} }, agora);
    const frames = Object.values(raw.frames || {}).filter(f => f?.ts && agora - f.ts <= TTL_MS * 2);
    if (!frames.some(f => f.autenticado)) continue;
    candidatas.push({ tab, lastSeen: raw.lastSeen || 0 });
  }
  candidatas.sort((a, b) => b.lastSeen - a.lastSeen);
  const escolhida = candidatas[0]?.tab?.id || null;
  if (escolhida) await definirAbaGerenciada(escolhida);
  return escolhida;
}

async function obterAbaGerenciada({ migrarLegado = true } = {}) {
  let id = await lerAbaGerenciadaId();
  if (!id && migrarLegado) id = await migrarAbaOcultaLegadaSeNecessario();
  if (!id) return null;
  try {
    const tab = await browser.tabs.get(id);
    if (!tab || !ehUrlPcnet(tab.url)) {
      await definirAbaGerenciada(null);
      return null;
    }
    return tab;
  } catch {
    await definirAbaGerenciada(null);
    return null;
  }
}

function limparFramesAntigos(tabData, agora = Date.now()) {
  const frames = tabData?.frames || {};
  for (const [frameId, frame] of Object.entries(frames)) {
    if (!frame?.ts || agora - frame.ts > TTL_MS * 3) delete frames[frameId];
  }
  return { ...(tabData || {}), frames };
}

async function registrarHeartbeat(message, sender) {
  if (!sender.tab?.id || !message.payload) return;
  const estados = await lerEstados();
  const tabId = String(sender.tab.id);
  const atual = limparFramesAntigos(estados[tabId] || { frames: {} });
  atual.frames[String(sender.frameId ?? 0)] = message.payload;
  atual.tabId = sender.tab.id;
  atual.windowId = sender.tab.windowId;
  atual.lastSeen = Date.now();
  estados[tabId] = atual;
  await gravarEstados(estados);

  // V2.11: somente a aba RAIZ explicitamente gerenciada pelo Bridge pode ser
  // auto-ocultada. Uma aba PCNet aberta manualmente pelo usuário permanece
  // completamente livre e visível, mesmo autenticada.
  if (message.payload?.autenticado) {
    const gerenciadaId = await lerAbaGerenciadaId();
    if (gerenciadaId === sender.tab.id) agendarOcultacaoAposAutenticacao(sender.tab.id);
  }
}

function agendarOcultacaoAposAutenticacao(tabId) {
  if (!tabId) return;
  const anterior = autoHideTimers.get(tabId);
  if (anterior) clearTimeout(anterior);
  const timer = setTimeout(() => {
    autoHideTimers.delete(tabId);
    ocultarAposAutenticacao(tabId).catch((error) => {
      console.warn('[Nexus PCNet Bridge] Auto-ocultação pós-login falhou:', error?.message || error);
    });
  }, 250);
  autoHideTimers.set(tabId, timer);
}

async function encontrarAbaNexus(preferWindowId = null) {
  const tabs = await browser.tabs.query({ url: NEXUS_TAB_PATTERNS });
  if (!tabs.length) return null;
  return tabs.find(t => preferWindowId != null && t.windowId === preferWindowId)
    || tabs.find(t => t.active)
    || tabs[0];
}

async function ocultarAposAutenticacao(tabId) {
  const gerenciadaId = await lerAbaGerenciadaId();
  if (!gerenciadaId || gerenciadaId !== tabId) return;
  let tab;
  try { tab = await browser.tabs.get(tabId); } catch { return; }
  if (!tab || tab.hidden || !ehUrlPcnet(tab.url)) return;

  if (tab.active) {
    const nexus = await encontrarAbaNexus(tab.windowId);
    if (!nexus) return; // sem Nexus aberto, não escondemos a aba ativa do usuário
    await browser.tabs.update(nexus.id, { active: true }).catch(() => {});
    if (nexus.windowId != null) await browser.windows.update(nexus.windowId, { focused: true }).catch(() => {});
    await sleep(80);
  }

  try {
    const atual = await browser.tabs.get(tabId);
    if (!atual.active && !atual.hidden) await browser.tabs.hide(tabId);
  } catch {}
}

async function removerTab(tabId) {
  const estados = await lerEstados();
  delete estados[String(tabId)];
  await gravarEstados(estados);
  const gerenciadaId = await lerAbaGerenciadaId();
  if (gerenciadaId === Number(tabId)) await definirAbaGerenciada(null);
}

async function obterStatus() {
  const tab = await obterAbaGerenciada({ migrarLegado: true });
  if (!tab) {
    return {
      bridge: true,
      versao: VERSION,
      conectado: false,
      motivo: 'Nenhuma aba PCNet gerenciada pelo Nexus. Abas PCNet abertas manualmente não são controladas pelo Bridge.'
    };
  }

  const estados = await lerEstados();
  const agora = Date.now();
  const tabData = limparFramesAntigos(estados[String(tab.id)] || { frames: {} }, agora);
  const frames = Object.values(tabData.frames || {}).filter(f => f?.ts && agora - f.ts <= TTL_MS);
  const autenticados = frames.filter(f => f.autenticado);
  const frameAuth = autenticados.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const ultimo = await browser.storage.local.get(LAST_FAV_KEY).catch(() => ({}));

  return {
    bridge: true,
    versao: VERSION,
    conectado: Boolean(frameAuth),
    tabId: tab.id,
    oculto: Boolean(tab.hidden),
    ativo: Boolean(tab.active),
    url: frameAuth?.url || tab.url || '',
    titulo: frameAuth?.titulo || tab.title || '',
    marcadores: frameAuth?.marcadores || [],
    score: frameAuth?.score || 0,
    ultimaConfirmacao: frameAuth?.ts || tabData.lastSeen || null,
    ultimaFav: ultimo?.[LAST_FAV_KEY] || null,
    motivo: frameAuth
      ? 'Sessão autenticada detectada na aba PCNet gerenciada pelo Nexus.'
      : 'A aba PCNet gerenciada está aberta, mas ainda não confirmou autenticação.'
  };
}

async function abrirOuMostrarPcnet() {
  let tab = await obterAbaGerenciada({ migrarLegado: true });
  if (tab) {
    try {
      if (tab.hidden) await browser.tabs.show(tab.id);
      tab = await browser.tabs.update(tab.id, { active: true });
      if (tab?.windowId != null) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
      return { ...await obterStatus(), acao: 'mostrado' };
    } catch {
      await definirAbaGerenciada(null);
    }
  }

  // Não reaproveitamos abas PCNet visíveis abertas manualmente. O Nexus possui
  // uma única aba raiz dedicada; somente ela será ocultada/automatizada.
  tab = await browser.tabs.create({ url: PCNET_URL, active: true });
  await definirAbaGerenciada(tab.id);
  return { bridge: true, versao: VERSION, conectado: false, tabId: tab.id, oculto: false, ativo: true, acao: 'aberto' };
}

async function ocultarPcnet(tabIdPreferido = null) {
  const status = await obterStatus();
  const tabId = tabIdPreferido || status.tabId;
  if (!tabId) return { ...status, acao: 'nenhuma_aba' };

  const tab = await browser.tabs.get(tabId);
  if (tab.active) {
    return { ...status, acao: 'nao_ocultado', aviso: 'A aba PCNet ainda esta ativa. Volte para a aba do Nexus antes de oculta-la.' };
  }
  if (!tab.hidden) await browser.tabs.hide(tabId);
  return { ...await obterStatus(), acao: 'ocultado' };
}

async function mostrarPcnet() {
  const status = await obterStatus();
  if (!status.tabId) return abrirOuMostrarPcnet();
  await browser.tabs.show(status.tabId);
  const tab = await browser.tabs.update(status.tabId, { active: true });
  if (tab?.windowId != null) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
  return { ...await obterStatus(), acao: 'mostrado' };
}

async function tentarOcultarAutomaticamente(activeInfo) {
  let ativa;
  try { ativa = await browser.tabs.get(activeInfo.tabId); } catch { return; }
  const url = ativa?.url || '';
  const ehNexus = ehUrlNexus(url);
  if (!ehNexus) return;

  const status = await obterStatus();
  if (!status.conectado || !status.tabId || status.oculto || status.tabId === activeInfo.tabId) return;
  try { await browser.tabs.hide(status.tabId); } catch (error) { console.warn('[Nexus PCNet Bridge] Nao foi possivel ocultar a aba:', error?.message || error); }
}

async function framesFrescos(tabId) {
  const estados = await lerEstados();
  const tabData = limparFramesAntigos(estados[String(tabId)] || { frames: {} });
  const agora = Date.now();
  return Object.entries(tabData.frames || {})
    .filter(([, f]) => f?.ts && agora - f.ts <= TTL_MS * 2)
    .map(([frameId, frame]) => ({ frameId: Number(frameId), frame }));
}

async function enviarAoFrame(tabId, frameId, action, payload = null) {
  try {
    return await browser.tabs.sendMessage(
      tabId,
      { type: 'PCNET_FRAME_COMMAND', action, payload: payload || {} },
      { frameId }
    );
  } catch {
    return null;
  }
}

async function sondarTab(tabId) {
  const frames = await framesFrescos(tabId);
  const resultados = [];
  const ids = frames.length ? frames.map(f => f.frameId) : [0];
  for (const frameId of ids) {
    const r = await enviarAoFrame(tabId, frameId, 'PROBE');
    if (r?.ok) resultados.push({ tabId, frameId, ...r });
  }
  return resultados;
}

async function tabsPcnet() {
  return browser.tabs.query({ url: ['https://*.pcnet.mg.gov.br/*'] });
}

function ehUrlPcnet(url) {
  return /^https:\/\/[^/]*pcnet\.mg\.gov\.br\//i.test(String(url || ''));
}

function ehTelaCustodiaFav(url) {
  const valor = String(url || '');
  return /\/PCnet\/custodiasel\.do/i.test(valor) && /modoJanelaPlc=popup/i.test(valor);
}

async function fecharPopupsCustodiaLegados(ctx) {
  // V2.1 ainda permitia que o PCNet criasse uma janela popup e só a minimizava.
  // Ao iniciar uma nova busca, removemos apenas essas janelas antigas de
  // Movimentação FAV. Abas normais/ocultas continuam disponíveis para reuso.
  const tabs = await tabsPcnet();
  const janelasRemovidas = new Set();

  for (const tab of tabs) {
    if (ctx && !(await abaRelacionadaAoContexto(tab, ctx))) continue;
    if (!ehTelaCustodiaFav(tab.url)) continue;
    let win = null;
    try { win = await browser.windows.get(tab.windowId); } catch {}
    if (!win) continue;

    const popupReal = win.type === 'popup'
      || (ctx?.nexusWindowId != null && tab.windowId !== ctx.nexusWindowId && !tab.hidden);
    if (!popupReal || janelasRemovidas.has(tab.windowId)) continue;

    try {
      await browser.windows.remove(tab.windowId);
      janelasRemovidas.add(tab.windowId);
    } catch {}
  }
}

async function criarAbaCustodiaOculta(url, ctx) {
  if (!url || !ehUrlPcnet(url)) {
    const erro = new Error('O PCNet não forneceu uma URL válida para a consulta de Cadeia de Custódia.');
    erro.codigo = 'URL_CUSTODIA_INVALIDA';
    throw erro;
  }

  const createProps = {
    url: 'about:blank',
    active: false
  };
  if (ctx?.nexusWindowId != null) createProps.windowId = ctx.nexusWindowId;
  if (ctx?.pcnetRootTabId != null) createProps.openerTabId = ctx.pcnetRootTabId;

  // Cria primeiro about:blank em segundo plano, esconde a aba e SOMENTE ENTÃO
  // navega para a tela de Movimentação FAV. Assim não existe janela popup para
  // aparecer/minimizar e nem troca visual de aba durante a automação.
  let tab;
  try {
    tab = await browser.tabs.create(createProps);
  } catch {
    delete createProps.openerTabId;
    tab = await browser.tabs.create(createProps);
  }

  try {
    if (!tab.hidden) await browser.tabs.hide(tab.id);
  } catch (error) {
    try { await browser.tabs.remove(tab.id); } catch {}
    const erro = new Error('O Firefox não permitiu ocultar a aba auxiliar da Cadeia de Custódia.');
    erro.codigo = 'ABA_CUSTODIA_NAO_OCULTADA';
    throw erro;
  }

  try {
    tab = await browser.tabs.update(tab.id, { url });
  } catch (error) {
    try { await browser.tabs.remove(tab.id); } catch {}
    const erro = new Error('Não foi possível abrir a consulta de Cadeia de Custódia na aba oculta.');
    erro.codigo = 'CUSTODIA_OCULTA_NAO_ABRIU';
    throw erro;
  }

  return tab;
}

async function criarAbaPcnetOculta(url, ctx) {
  if (!url || !ehUrlPcnet(url)) {
    const erro = new Error('O PCNet não forneceu uma URL válida para a operação auxiliar.');
    erro.codigo = 'URL_PCNET_AUXILIAR_INVALIDA';
    throw erro;
  }
  const props = { url: 'about:blank', active: false };
  if (ctx?.nexusWindowId != null) props.windowId = ctx.nexusWindowId;
  if (ctx?.pcnetRootTabId != null) props.openerTabId = ctx.pcnetRootTabId;
  let tab;
  try { tab = await browser.tabs.create(props); }
  catch { delete props.openerTabId; tab = await browser.tabs.create(props); }
  try { if (!tab.hidden) await browser.tabs.hide(tab.id); }
  catch (error) {
    try { await browser.tabs.remove(tab.id); } catch {}
    const erro = new Error('O Firefox não permitiu ocultar a aba auxiliar do PCNet.');
    erro.codigo = 'ABA_PCNET_AUXILIAR_NAO_OCULTADA';
    throw erro;
  }
  try { tab = await browser.tabs.update(tab.id, { url }); }
  catch (error) {
    try { await browser.tabs.remove(tab.id); } catch {}
    const erro = new Error('Não foi possível abrir a operação auxiliar do PCNet em segundo plano.');
    erro.codigo = 'ABA_PCNET_AUXILIAR_NAO_ABRIU';
    throw erro;
  }
  return tab;
}

async function focarNexus(ctx) {
  if (!ctx?.nexusTabId) return;
  try {
    await browser.tabs.update(ctx.nexusTabId, { active: true });
    const tab = await browser.tabs.get(ctx.nexusTabId);
    if (tab?.windowId != null) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } catch {}
}

async function abaRelacionadaAoContexto(tab, ctx) {
  if (!tab?.id || !ctx?.pcnetRootTabId) return false;
  if (tab.id === ctx.pcnetRootTabId) return true;

  // Segue a cadeia de opener até a raiz gerenciada. Isso inclui popups/abas
  // criados pelo próprio PCNet e as abas auxiliares do Bridge, sem capturar
  // uma aba PCNet que o usuário abriu manualmente.
  let openerId = tab.openerTabId;
  const visitados = new Set();
  for (let i = 0; openerId != null && i < 8; i++) {
    if (openerId === ctx.pcnetRootTabId) return true;
    if (visitados.has(openerId)) break;
    visitados.add(openerId);
    try {
      const opener = await browser.tabs.get(openerId);
      openerId = opener?.openerTabId ?? null;
    } catch {
      break;
    }
  }
  return false;
}

async function tabsPcnetRelacionadas(ctx, { incluirRoot = true } = {}) {
  if (!ctx?.pcnetRootTabId) return [];
  const tabs = await tabsPcnet();
  const saida = [];
  for (const tab of tabs) {
    if (!incluirRoot && tab.id === ctx.pcnetRootTabId) continue;
    if (await abaRelacionadaAoContexto(tab, ctx)) saida.push(tab);
  }
  return saida;
}

async function conterSuperficiePcnet(tabOuId, ctx = operacaoVisualAtiva) {
  if (!ctx) return;
  let tab = tabOuId;
  try {
    if (typeof tabOuId === 'number') tab = await browser.tabs.get(tabOuId);
  } catch { return; }
  if (!tab?.id || tab.id === ctx.nexusTabId) return;

  const relacionada = await abaRelacionadaAoContexto(tab, ctx);
  if (!relacionada) return;

  // Se o PCNet abriu uma aba normal na mesma janela do Nexus, devolve o foco ao
  // Nexus e então esconde a aba. Popups legados não nativos continuam minimizados.
  if (tab.windowId === ctx.nexusWindowId) {
    await focarNexus(ctx);
    await sleep(20);
    try {
      const atual = await browser.tabs.get(tab.id);
      if (!atual.active && !atual.hidden) await browser.tabs.hide(tab.id);
    } catch {}
  } else {
    try { await browser.windows.update(tab.windowId, { state: 'minimized' }); } catch {}
    await focarNexus(ctx);
  }
}

async function localizarFrameCom(capacidade, tabIds = null) {
  const tabs = await tabsPcnet();
  const filtradas = Array.isArray(tabIds) ? tabs.filter(t => tabIds.includes(t.id)) : tabs;
  for (const tab of filtradas) {
    const probes = await sondarTab(tab.id);
    const alvo = probes.find(p => Boolean(p?.analise?.capacidades?.[capacidade]));
    if (alvo) return { ...alvo, tab };
  }
  return null;
}

async function enviarPrimeiroQueFuncionar(action, capacidadePreferida, payload = null, tabIds = null) {
  const tabs = await tabsPcnet();
  const filtradas = Array.isArray(tabIds) ? tabs.filter(t => tabIds.includes(t.id)) : tabs;

  for (const tab of filtradas) {
    const probes = await sondarTab(tab.id);
    const ordenados = capacidadePreferida
      ? [...probes].sort((a, b) => Number(Boolean(b?.analise?.capacidades?.[capacidadePreferida])) - Number(Boolean(a?.analise?.capacidades?.[capacidadePreferida])))
      : probes;

    for (const probe of ordenados) {
      const r = await enviarAoFrame(tab.id, probe.frameId, action, payload);
      if (r?.ok) return { tab, frameId: probe.frameId, resultado: r };
    }
  }
  return null;
}

async function aguardarFrameCom(capacidade, timeoutMs = 10000, tabIds = null) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const alvo = await localizarFrameCom(capacidade, tabIds);
    if (alvo) return alvo;
    await sleep(250);
  }
  return null;
}

async function garantirTelaBuscaFav(status, visualCtx = null) {
  // Remove apenas popups antigos criados pela V2.1. A partir da V2.2 a tela de
  // Movimentação FAV é aberta em uma aba de fundo já oculta, sem janela visível.
  await fecharPopupsCustodiaLegados(visualCtx);
  await sleep(80);

  // Se já existe uma aba oculta de consulta pertencente à raiz gerenciada,
  // reutiliza diretamente. Uma consulta aberta manualmente pelo usuário é ignorada.
  const tabsRelacionadas = await tabsPcnetRelacionadas(visualCtx);
  let busca = await localizarFrameCom('favInput', tabsRelacionadas.map(t => t.id));
  if (busca) {
    await conterSuperficiePcnet(busca.tab, visualCtx);
    return busca;
  }

  // A tela principal de aceite normalmente contém o ícone de Cadeia de Custódia.
  let custodia = await localizarFrameCom('cadeiaCustodia', [status.tabId]);

  if (!custodia) {
    // Tenta chegar ao aceite por item de menu/atalho DOM. Essa etapa ainda é
    // propositalmente conservadora: não grava nada e será validada no PCNet real.
    await enviarPrimeiroQueFuncionar('OPEN_ACCEPTANCE', null, null, [status.tabId]);

    const limite = Date.now() + 7000;
    while (Date.now() < limite) {
      custodia = await localizarFrameCom('cadeiaCustodia', [status.tabId]);
      if (custodia) break;
      await sleep(300);
    }
  }

  if (!custodia) {
    const erro = new Error('Não localizei o ícone de Cadeia de Custódia na tela atual do PCNet. Clique em “Conectar PCNet”, abra uma vez a tela de Aceite de Requisições (Ctrl+F1 no PCNet) e volte ao Nexus. A busca continuará sem gravar nenhuma movimentação.');
    erro.codigo = 'TELA_ACEITE_NAO_LOCALIZADA';
    throw erro;
  }

  const alvoCustodia = await enviarAoFrame(custodia.tabId, custodia.frameId, 'GET_CUSTODY_TARGET');
  if (!alvoCustodia?.ok || !alvoCustodia?.url) {
    const erro = new Error('O Bridge encontrou a Cadeia de Custódia, mas não conseguiu obter o endereço da consulta de FAV.');
    erro.codigo = 'CUSTODIA_ALVO_NAO_OBTIDO';
    throw erro;
  }

  // V2.15: a tela de Cadeia de Custódia pode abrir antes de o formulário legado
  // terminar de montar. Como esta etapa é SOMENTE de leitura, fazemos tentativas
  // independentes, fechando apenas a aba auxiliar que não ficou pronta. Nenhuma
  // movimentação é gravada aqui.
  const tentativasCustodia = [
    { timeout: 14000, pausaAntes: 0, pausaPosLoad: 300 },
    { timeout: 18000, pausaAntes: 700, pausaPosLoad: 600 },
    { timeout: 22000, pausaAntes: 1200, pausaPosLoad: 900 }
  ];

  let ultimoDetalhe = '';

  for (let i = 0; i < tentativasCustodia.length; i++) {
    const cfg = tentativasCustodia[i];
    if (cfg.pausaAntes) await sleep(cfg.pausaAntes);

    // Pode ter terminado de carregar numa aba relacionada enquanto aguardávamos.
    const relacionadasAgora = await tabsPcnetRelacionadas(visualCtx);
    busca = await localizarFrameCom('favInput', relacionadasAgora.map(t => t.id));
    if (busca) {
      await conterSuperficiePcnet(busca.tab, visualCtx);
      return busca;
    }

    let tabOculta = null;
    try {
      tabOculta = await criarAbaCustodiaOculta(alvoCustodia.url, visualCtx);
      await aguardarTabCarregado(tabOculta.id, 12000);
      await sleep(cfg.pausaPosLoad);

      busca = await aguardarFrameCom('favInput', cfg.timeout, [tabOculta.id]);
      if (busca) {
        await conterSuperficiePcnet(busca.tab, visualCtx);
        return busca;
      }

      ultimoDetalhe = `tentativa ${i + 1}: #numeroDaFAV_Arg não apareceu em ${cfg.timeout} ms`;
    } catch (error) {
      ultimoDetalhe = `tentativa ${i + 1}: ${error?.message || String(error)}`;
    } finally {
      if (!busca && tabOculta?.id) {
        try { await browser.tabs.remove(tabOculta.id); } catch {}
      }
    }

    // Mantém o Nexus como superfície visual do usuário entre as tentativas.
    await focarNexus(visualCtx).catch(() => {});
  }

  const erro = new Error(
    'A consulta oculta da Cadeia de Custódia foi aberta novamente, mas o campo da FAV ' +
    '(#numeroDaFAV_Arg) não apareceu. O PCNet pode estar temporariamente lento. ' +
    (ultimoDetalhe ? `Último detalhe: ${ultimoDetalhe}` : '')
  );
  erro.codigo = 'CUSTODIA_OCULTA_TIMEOUT';
  throw erro;
}

async function buscarFav(payload = {}, sender = null) {
  const numeroFav = String(payload?.numeroFav ?? payload?.numero_fav ?? payload?.fav ?? '').trim();
  if (!numeroFav) throw new Error('Informe o número da FAV que deseja buscar.');

  const status = await obterStatus();
  if (!status.conectado || !status.tabId) {
    throw new Error('O PCNet não está conectado. Faça o login e volte ao Nexus antes de buscar a FAV.');
  }

  const visualCtx = {
    nexusTabId: sender?.tab?.id || null,
    nexusWindowId: sender?.tab?.windowId ?? null,
    pcnetRootTabId: status.tabId,
    iniciadoEm: Date.now()
  };
  operacaoVisualAtiva = visualCtx;

  try {
    const tela = await garantirTelaBuscaFav(status, visualCtx);
    await conterSuperficiePcnet(tela.tab, visualCtx);

    const r = await enviarAoFrame(tela.tabId, tela.frameId, 'SEARCH_FAV', {
      numeroFav,
      selecionar: true
    });

    if (!r?.ok) {
      if (r?.codigo === 'FAV_NAO_ENCONTRADA') {
        const detalhe = r.mensagemSistema ? ` O PCNet informou: ${r.mensagemSistema}` : '';
        throw new Error(`A FAV ${numeroFav} não foi encontrada na consulta de Cadeia de Custódia.${detalhe}`);
      }
      throw new Error('A tela de pesquisa foi localizada, mas o Bridge não conseguiu pesquisar a FAV.');
    }

    await conterSuperficiePcnet(tela.tab, visualCtx);

    const contexto = {
      numeroFav,
      tabId: tela.tabId,
      frameId: tela.frameId,
      linha: r.linha || '',
      registro: r.registro || null,
      selecionada: Boolean(r.selecionada),
      pesquisaLimpa: Boolean(r.pesquisaLimpa),
      ts: Date.now()
    };
    await browser.storage.local.set({ [LAST_FAV_KEY]: contexto });

    return {
      bridge: true,
      versao: VERSION,
      operacao: 'BUSCAR_FAV',
      status: 'ENCONTRADA',
      numeroFav,
      selecionada: Boolean(r.selecionada),
      pesquisaLimpa: Boolean(r.pesquisaLimpa),
      linha: r.linha || '',
      registro: r.registro || null,
      contexto: { tabId: tela.tabId, frameId: tela.frameId },
      aviso: 'Busca limpa e seleção concluídas em aba auxiliar oculta. Nenhuma movimentação foi gravada.'
    };
  } finally {
    // A aba auxiliar permanece aberta, oculta e com a FAV selecionada para o
    // próximo passo. Nenhuma janela popup é necessária na V2.2.
    operacaoVisualAtiva = null;
  }
}


async function lerUltimaFav() {
  const obj = await browser.storage.local.get(LAST_FAV_KEY).catch(() => ({}));
  return obj?.[LAST_FAV_KEY] || null;
}

async function removerAbaSeAuxiliar(tabId, pcnetRootTabId) {
  if (!tabId || tabId === pcnetRootTabId) return;
  try { await browser.tabs.remove(tabId); } catch {}
}

async function conterTodasAsSuperficiesPcnet(ctx) {
  const tabs = await tabsPcnetRelacionadas(ctx, { incluirRoot: false });
  for (const tab of tabs) await conterSuperficiePcnet(tab, ctx).catch(() => {});
}

async function aguardarTelaSobCustodia(tabBuscaId, visualCtx, timeoutMs = 15000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    await conterTodasAsSuperficiesPcnet(visualCtx);
    const tabs = await tabsPcnetRelacionadas(visualCtx, { incluirRoot: false });
    const ids = [];
    if (tabBuscaId) ids.push(tabBuscaId);
    for (const tab of tabs) {
      if (!ids.includes(tab.id)) ids.push(tab.id);
    }

    const alvo = await localizarFrameCom('finalidadePericial', ids);
    if (alvo) {
      await conterSuperficiePcnet(alvo.tab, visualCtx).catch(() => {});
      return alvo;
    }
    await sleep(220);
  }
  return null;
}

async function lerResultadoMovimentacao(tabId) {
  let tab;
  try { tab = await browser.tabs.get(tabId); } catch { return { fechado: true, erro: null, sucesso: null }; }
  if (!tab) return { fechado: true, erro: null, sucesso: null };

  const probes = await sondarTab(tabId);
  const frameIds = probes.length ? probes.map(p => p.frameId) : [0];
  let ultimo = null;
  for (const frameId of frameIds) {
    const r = await enviarAoFrame(tabId, frameId, 'READ_CUSTODY_RESULT');
    if (!r) continue;
    ultimo = r;
    if (r.mensagemSistema) {
      return { fechado: false, erro: r.mensagemSistema, sucesso: r.mensagemSucesso || null, resultado: r };
    }
    if (r.mensagemSucesso) {
      return { fechado: false, erro: null, sucesso: r.mensagemSucesso, resultado: r };
    }
  }
  return { fechado: false, erro: null, sucesso: ultimo?.mensagemSucesso || null, resultado: ultimo };
}


function erroEtapaPreviaSeAplicavel(mensagem) {
  const texto = String(mensagem || '').trim();
  if (!texto) return null;
  if (!/(colet|acondicion|material\s+n[aã]o\s+colet|material\s+n[aã]o\s+acondicion)/i.test(texto)) return null;
  const erro = new Error(`Antes de movimentar a FAV para exame pericial, registre as etapas de Coleta e Acondicionamento no PCNet. O PCNet informou: ${texto}`);
  erro.codigo = 'ETAPA_PREVIA_PENDENTE';
  return erro;
}

async function procurarErroVisivelNosTabs(tabIds = []) {
  const ids = [...new Set((tabIds || []).filter(Boolean))];
  for (const tabId of ids) {
    const leitura = await lerResultadoMovimentacao(tabId).catch(() => null);
    if (leitura?.erro) return leitura.erro;
  }
  return null;
}

async function movimentarFav(payload = {}, sender = null) {
  const numeroFav = String(payload?.numeroFav ?? payload?.numero_fav ?? payload?.fav ?? '').trim();
  const novoLacre = String(payload?.novoLacre ?? payload?.novo_lacre ?? '').trim();
  if (!numeroFav) throw new Error('Informe o número da FAV que deseja movimentar.');

  const assinaturaMov = `${numeroFav}|${novoLacre}`;
  const anteriorMov = movimentosConcluidos.get(assinaturaMov);
  if (anteriorMov && Date.now() - Number(anteriorMov._guardTs || 0) < 5 * 60 * 1000) {
    return { ...anteriorMov, reutilizado: true, aviso: 'Esta mesma movimentação acabou de ser concluída; nenhuma nova gravação foi executada.' };
  }
  if (movimentosEmAndamento.has(assinaturaMov)) {
    const erro = new Error(`A movimentação da FAV ${numeroFav} já está em andamento. Aguarde a conclusão.`);
    erro.codigo = 'MOVIMENTACAO_JA_EM_ANDAMENTO';
    throw erro;
  }
  const status = await obterStatus();
  if (!status.conectado || !status.tabId) {
    throw new Error('O PCNet não está conectado. Faça o login e volte ao Nexus antes de movimentar a FAV.');
  }

  const ultimaFav = await lerUltimaFav();
  if (!ultimaFav || String(ultimaFav.numeroFav) !== numeroFav) {
    throw new Error(`A FAV ${numeroFav} precisa ser buscada e selecionada novamente antes da movimentação.`);
  }

  let tabBusca = null;
  try { tabBusca = await browser.tabs.get(ultimaFav.tabId); } catch {}
  if (!tabBusca) {
    throw new Error('A aba auxiliar da FAV não está mais disponível. Busque a FAV novamente antes de movimentar.');
  }

  movimentosEmAndamento.add(assinaturaMov);
  const visualCtx = {
    nexusTabId: sender?.tab?.id || null,
    nexusWindowId: sender?.tab?.windowId ?? null,
    pcnetRootTabId: status.tabId,
    iniciadoEm: Date.now(),
    operacao: 'MOVIMENTAR_FAV'
  };
  operacaoVisualAtiva = visualCtx;

  let telaMov = null;
  try {
    await conterSuperficiePcnet(tabBusca, visualCtx);

    // A FAV já está marcada na tela oculta de Movimentação FAV. O content script
    // força o target da ação "Sob Custódia" para a própria aba oculta para que
    // o PCNet não crie uma janela visível.
    const abrir = await enviarAoFrame(ultimaFav.tabId, ultimaFav.frameId, 'OPEN_SOB_CUSTODIA_SELF', { numeroFav });
    if (!abrir?.ok) {
      const mapa = {
        FAV_NAO_ESTA_MAIS_NA_TELA: 'A FAV não está mais presente na consulta. Busque-a novamente.',
        FAV_NAO_SELECIONADA: 'Não consegui manter a FAV selecionada.',
        BOTAO_SOB_CUSTODIA_NAO_ENCONTRADO: 'O botão “Sob Custódia” não foi encontrado na tela do PCNet.'
      };
      throw new Error(mapa[abrir?.codigo] || 'Não foi possível abrir a etapa “Sob Custódia”.');
    }

    telaMov = await aguardarTelaSobCustodia(ultimaFav.tabId, visualCtx, 16000);
    if (!telaMov) {
      const tabsAtuais = await tabsPcnetRelacionadas(visualCtx);
      const erroVisivel = await procurarErroVisivelNosTabs([ultimaFav.tabId, ...tabsAtuais.map(t => t.id)]);
      const etapaPendente = erroEtapaPreviaSeAplicavel(erroVisivel);
      if (etapaPendente) throw etapaPendente;
      if (erroVisivel) {
        const erro = new Error(`O PCNet recusou a abertura de “Sob Custódia”: ${erroVisivel}`);
        erro.codigo = 'PCNET_RECUSOU_SOB_CUSTODIA';
        throw erro;
      }
      throw new Error('O PCNet recebeu o comando “Sob Custódia”, mas a tela de finalidade pericial não apareceu a tempo. Nenhuma gravação foi executada.');
    }

    const preparo = await enviarAoFrame(telaMov.tabId, telaMov.frameId, 'PREPARE_CUSTODY', { novoLacre });
    if (!preparo?.ok) {
      const mapa = {
        FINALIDADE_PERICIAL_NAO_ENCONTRADA: 'A opção de finalidade pericial não foi encontrada.',
        ROMPIMENTO_SIM_NAO_ENCONTRADO: 'A opção “houve rompimento de lacre: sim” não foi encontrada.',
        ROMPIMENTO_NAO_NAO_ENCONTRADO: 'A opção “houve rompimento de lacre: não” não foi encontrada.',
        NOVO_INVOLUCRO_NAO_ENCONTRADO: 'O campo do novo invólucro/lacre não foi encontrado.'
      };
      throw new Error(mapa[preparo?.codigo] || 'Não foi possível preencher a movimentação de custódia.');
    }
    if (!preparo.finalidadePericial || !preparo.podeGravar) {
      throw new Error('A tela de movimentação não ficou em um estado válido para gravação. Nenhum dado foi gravado.');
    }
    if (novoLacre && String(preparo.novoLacre || '').trim() !== novoLacre) {
      throw new Error('O PCNet não confirmou o novo lacre informado. A movimentação foi interrompida antes de gravar.');
    }

    await browser.storage.local.set({
      [LAST_MOV_KEY]: {
        numeroFav,
        novoLacre,
        tabId: telaMov.tabId,
        frameId: telaMov.frameId,
        preparo,
        ts: Date.now()
      }
    });

    const gravacao = await enviarAoFrame(telaMov.tabId, telaMov.frameId, 'CLICK_SAVE_CUSTODY');
    if (!gravacao?.ok) {
      const detalhe = gravacao?.mensagemSistema ? ` ${gravacao.mensagemSistema}` : '';
      throw new Error(`O Bridge não conseguiu acionar “Gravar” no PCNet.${detalhe}`);
    }

    // A implementação antiga aguardava 4 s e considerava erro somente quando
    // o PCNet preenchia .msg_erro. Mantemos o mesmo critério, mas consultamos
    // várias vezes para capturar mensagens que apareçam com atraso.
    let leitura = { erro: null, sucesso: null };
    for (let i = 0; i < 14; i += 1) {
      await sleep(i === 0 ? 650 : 300);
      leitura = await lerResultadoMovimentacao(telaMov.tabId);
      if (leitura.erro || leitura.sucesso || leitura.fechado) break;
    }

    if (leitura.erro) {
      const etapaPendente = erroEtapaPreviaSeAplicavel(leitura.erro);
      if (etapaPendente) throw etapaPendente;
      const erro = new Error(`O PCNet recusou a movimentação: ${leitura.erro}`);
      erro.codigo = 'PCNET_RECUSOU_MOVIMENTACAO';
      throw erro;
    }

    // Fecha somente a superfície auxiliar. A aba principal autenticada do PCNet
    // permanece intacta/oculta para as próximas operações.
    await removerAbaSeAuxiliar(telaMov.tabId, status.tabId);
    if (ultimaFav.tabId !== telaMov.tabId) {
      await removerAbaSeAuxiliar(ultimaFav.tabId, status.tabId);
    }
    await browser.storage.local.remove([LAST_FAV_KEY, LAST_MOV_KEY]).catch(() => {});

    const retorno = {
      bridge: true,
      versao: VERSION,
      operacao: 'MOVIMENTAR_FAV',
      status: 'SUCESSO',
      numeroFav,
      novoLacre: novoLacre || null,
      houveRompimento: novoLacre ? 'SIM' : 'NAO',
      finalidade: 'EXAME_PERICIAL',
      mensagemSistema: leitura.sucesso || null,
      mensagem: `FAV ${numeroFav} movimentada com sucesso.`
    };
    movimentosConcluidos.set(assinaturaMov, { ...retorno, _guardTs: Date.now() });
    return retorno;
  } catch (error) {
    // Em erro, a aba auxiliar continua oculta apenas se ainda for útil para
    // diagnóstico. Nunca mostramos/focamos automaticamente uma tela PCNet.
    if (telaMov?.tab) await conterSuperficiePcnet(telaMov.tab, visualCtx).catch(() => {});
    throw error;
  } finally {
    movimentosEmAndamento.delete(assinaturaMov);
    await focarNexus(visualCtx);
    operacaoVisualAtiva = null;
  }
}


function situacaoClAc(registro) {
  const tokens = String(registro?.situacao || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return { conhecida: tokens.length > 0, cl: tokens.includes('CL'), ac: tokens.includes('AC') };
}

async function lerFavsEmFrame(alvo) {
  if (!alvo) return [];
  const r = await enviarAoFrame(alvo.tabId, alvo.frameId, 'READ_BEM_MATERIAL_FAVS');
  return Array.isArray(r?.favs) ? r.favs : [];
}

async function lerFavsNoTab(tabId) {
  const saida = new Set();
  const probes = await sondarTab(tabId).catch(() => []);
  for (const probe of probes) {
    const r = await enviarAoFrame(tabId, probe.frameId, 'READ_BEM_MATERIAL_FAVS');
    for (const fav of (Array.isArray(r?.favs) ? r.favs : [])) {
      const valor = String(fav || '').trim();
      if (valor) saida.add(valor);
    }
  }
  return [...saida];
}

async function escolherTabPcnetPrincipal(preferido = null) {
  const gerenciada = await obterAbaGerenciada({ migrarLegado: true });
  if (!gerenciada) return null;
  if (preferido != null && gerenciada.id !== Number(preferido)) return null;
  return gerenciada;
}

async function aguardarTabCarregado(tabId, timeoutMs = 12000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab?.status === 'complete') return tab;
    } catch {}
    await sleep(180);
  }
  try { return await browser.tabs.get(tabId); } catch { return null; }
}

async function localizarPesquisaLaudoOuTentar(status, visualCtx) {
  const principal = await escolherTabPcnetPrincipal(status?.tabId);
  if (!principal?.id) {
    const e = new Error('Nao encontrei uma aba PCNet autenticada para abrir a pesquisa de laudos.');
    e.codigo = 'PCNET_TAB_NAO_LOCALIZADA';
    throw e;
  }

  const tabId = principal.id;
  await conterSuperficiePcnet(principal, visualCtx).catch(() => {});

  // Se a Pesquisa de Laudo ja estiver montada, reaproveita a mesma tela.
  let probe = await executarPcnetMainWorld(tabId, 'PROBE_LAUDO_SEARCH');
  if (probe?.ok) {
    return {
      pesquisa: { tabId, frameId: 0, tab: await browser.tabs.get(tabId).catch(() => principal), viaMainWorld: true },
      auxiliarCriada: null,
      jaAberta: true
    };
  }

  // Rotas internas .do do PCNet dependem do shell /APP/. Se a aba estiver fora
  // dele, voltamos somente ao shell principal; nunca navegamos diretamente para
  // LAUDOSPERICIAIS/*.do ou PCnet/*.do.
  let tabAtual = await browser.tabs.get(tabId).catch(() => principal);
  const urlAtual = String(tabAtual?.url || '');
  if (!/\/APP\//i.test(urlAtual)) {
    await browser.tabs.update(tabId, { url: PCNET_URL });
    await aguardarTabCarregado(tabId, 15000);
    await sleep(600);
  }

  // V2.15: o PCNet pode concluir o AJAX do modulo ou da pesquisa alguns segundos
  // depois de uma tentativa aparentemente falha. Por isso, antes de repetir um
  // clique, sempre sondamos o estado atual. Todos os retries abaixo sao somente
  // de navegacao/pesquisa; nenhuma gravacao de laudo ou movimentacao ocorre aqui.
  const tentativas = [
    { pausa: 350, recarregarModulo: false },
    { pausa: 900, recarregarModulo: false },
    { pausa: 1500, recarregarModulo: true }
  ];

  let ultimoModulo = null;
  let ultimaAbertura = null;
  let ultimoProbe = probe;
  let ultimoDetalhe = '';

  for (let i = 0; i < tentativas.length; i++) {
    const cfg = tentativas[i];
    if (cfg.pausa) await sleep(cfg.pausa);

    // 1) Pode ter ficado pronta atrasada desde a tentativa anterior.
    ultimoProbe = await executarPcnetMainWorld(tabId, 'PROBE_LAUDO_SEARCH');
    if (ultimoProbe?.ok) {
      return {
        pesquisa: { tabId, frameId: 0, tab: await browser.tabs.get(tabId).catch(() => principal), viaMainWorld: true },
        auxiliarCriada: null,
        jaAberta: i > 0,
        abertura: ultimaAbertura,
        modulo: ultimoModulo,
        tentativaLaudo: i + 1
      };
    }

    // 2) Descobre se o menu "Selecionar Laudo/Parecer" ainda esta presente.
    let menu = await executarPcnetMainWorld(tabId, 'PROBE_LAUDO_MENU');

    // Na primeira tentativa (ou se o menu sumiu) carrega/recarrega o modulo.
    if (i === 0 || !menu?.ok || cfg.recarregarModulo) {
      ultimoModulo = await executarPcnetMainWorld(tabId, 'LOAD_LAUDOS_MODULE');

      if (!ultimoModulo?.ok) {
        const detalhes = (ultimoModulo?.resultados || []).map(r =>
          `${r.codigo || r.erro || r.erroExecucao || 'falha'} ${r.detalhe || ''}`
        ).join(' | ').slice(0, 1800);

        ultimoDetalhe = `tentativa ${i + 1}: modulo nao ficou pronto. ${detalhes}`;

        // Ainda pode ter terminado atrasado enquanto montavamos a mensagem.
        await sleep(700);
        ultimoProbe = await executarPcnetMainWorld(tabId, 'PROBE_LAUDO_SEARCH');
        if (ultimoProbe?.ok) {
          return {
            pesquisa: { tabId, frameId: 0, tab: await browser.tabs.get(tabId).catch(() => principal), viaMainWorld: true },
            auxiliarCriada: null,
            abertura: ultimaAbertura,
            modulo: ultimoModulo,
            tentativaLaudo: i + 1
          };
        }
        continue;
      }

      // Dá uma margem pequena para o menu lateral legado estabilizar.
      await sleep(i === 0 ? 300 : 650);
      menu = await executarPcnetMainWorld(tabId, 'PROBE_LAUDO_MENU');
    }

    if (!menu?.ok) {
      ultimoDetalhe = `tentativa ${i + 1}: item Selecionar Laudo/Parecer nao localizado apos carregar o modulo.`;
      continue;
    }

    // 3) Aciona o item REAL “Selecionar Laudo/Parecer”.
    ultimaAbertura = await executarPcnetMainWorld(tabId, 'OPEN_LAUDO_SEARCH');

    if (ultimaAbertura?.ok) {
      return {
        pesquisa: { tabId, frameId: 0, tab: await browser.tabs.get(tabId).catch(() => principal), viaMainWorld: true },
        auxiliarCriada: null,
        abertura: ultimaAbertura,
        modulo: ultimoModulo,
        tentativaLaudo: i + 1
      };
    }

    const detalhesAbertura = (ultimaAbertura?.resultados || []).map(r =>
      `${r.codigo || r.erro || r.erroExecucao || 'falha'} ${r.detalhe || ''} casoDeUso=${r.casoDeUso || ''}`
    ).join(' | ').slice(0, 1800);

    ultimoDetalhe = `tentativa ${i + 1}: ${detalhesAbertura || 'pesquisa ainda nao ficou pronta'}`;

    // 4) OPEN_LAUDO_SEARCH já espera internamente. Mesmo assim, fazemos uma
    // sonda tardia porque o AJAX do PCNet pode concluir logo apos o timeout.
    await sleep(i === 0 ? 700 : 1100);
    ultimoProbe = await executarPcnetMainWorld(tabId, 'PROBE_LAUDO_SEARCH');
    if (ultimoProbe?.ok) {
      return {
        pesquisa: { tabId, frameId: 0, tab: await browser.tabs.get(tabId).catch(() => principal), viaMainWorld: true },
        auxiliarCriada: null,
        abertura: ultimaAbertura,
        modulo: ultimoModulo,
        tentativaLaudo: i + 1,
        prontaAtrasada: true
      };
    }
  }

  const detalhesProbe = (ultimoProbe?.resultados || []).map(r =>
    `${r.codigo || r.erro || r.erroExecucao || 'falha'} casoDeUso=${r.casoDeUso || ''}`
  ).join(' | ').slice(0, 1200);

  const e = new Error(
    'O modulo de Laudos carregou, mas “Selecionar Laudo/Parecer” nao abriu a pesquisa ' +
    'apos novas tentativas seguras. O PCNet pode estar temporariamente lento. ' +
    `${ultimoDetalhe} ${detalhesProbe}`.trim()
  );
  e.codigo = 'TELA_PESQUISA_LAUDO_NAO_LOCALIZADA';
  throw e;
}

async function executarPcnetMainWorld(tabId, operacao, argumento = null) {
  // O DOM operacional do PCNet validado esta no documento principal (#AJAX e
  // #menuModulos). Executamos no MAIN world do frame 0 para usar as proprias
  // funcoes legadas da pagina, sem content-script isolado, iframe ou clique visual.
  let resultados;
  try {
    resultados = await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      func: async (op, arg) => {
        const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
        const sleepLocal = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const canon = (v) => {
          const d = String(v || '').replace(/\D/g, '');
          return d ? (d.replace(/^0+/, '') || '0') : '';
        };
        const aguardar = async (predicado, timeout = 10000, passo = 120) => {
          const limite = Date.now() + timeout;
          let valor = null;
          while (Date.now() < limite) {
            try { valor = predicado(); } catch (_) { valor = null; }
            if (valor) return valor;
            await sleepLocal(passo);
          }
          return null;
        };
        const setValor = (el, valor) => {
          if (!el) return false;
          const proto = Object.getPrototypeOf(el);
          const desc = Object.getOwnPropertyDescriptor(proto, 'value')
            || (typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null)
            || (typeof HTMLTextAreaElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') : null);
          if (desc?.set) desc.set.call(el, String(valor)); else el.value = String(valor);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };
        const retorno = {
          ok: false,
          operacao: op,
          url: location.href,
          casoDeUso: String(window.casoDeUso || ''),
          titulo: document.title || '',
          top: window.top === window
        };

        try {
          if (op === 'LOAD_LAUDOS_MODULE') {
            const menu = document.getElementById('menuRapido');
            if (!menu) {
              retorno.codigo = 'MENU_RAPIDO_NAO_ENCONTRADO';
            } else {
              const opcoes = Array.from(menu.options || []);
              const opcao = opcoes.find(o =>
                /\/LAUDOSPERICIAIS\/controle\.do\?carregaMenu=1268(?:&|$)/i.test(String(o.value || ''))
              ) || opcoes.find(o => /Laudos\s+Periciais\s*\/\s*Parecer/i.test(norm(o.textContent || o.innerText || '')));
              if (!opcao) {
                retorno.codigo = 'OPCAO_LAUDOS_NAO_ENCONTRADA';
              } else if (typeof window.onChangeMenu !== 'function' || typeof window.carregarMenu !== 'function') {
                retorno.codigo = 'FUNCOES_MENU_PCNET_NAO_DISPONIVEIS';
                retorno.funcoes = {
                  onChangeMenu: typeof window.onChangeMenu === 'function',
                  carregarMenu: typeof window.carregarMenu === 'function'
                };
              } else {
                menu.selectedIndex = opcao.index;
                window.onChangeMenu('/APP');
                window.carregarMenu(menu);

                const pronto = await aguardar(() => {
                  const modulo = document.getElementById('menuModulos');
                  if (!modulo) return null;
                  const selecionar = Array.from(modulo.querySelectorAll('[onclick]')).find(el =>
                    /acessarprocedimentolaudopericialsel\.do/i.test(String(el.getAttribute('onclick') || ''))
                    || /^Selecionar\s+Laudo\s*\/\s*Parecer$/i.test(norm(el.innerText || el.textContent || ''))
                  );
                  return selecionar ? { modulo, selecionar } : null;
                }, 12000, 150);

                if (pronto) {
                  retorno.ok = true;
                  retorno.codigo = 'MODULO_LAUDOS_PRONTO';
                  retorno.metodo = 'menuRapido_onChangeMenu_carregarMenu';
                  retorno.opcao = opcao.value;
                  retorno.itemSelecionar = String(pronto.selecionar.outerHTML || '').slice(0, 1600);
                } else {
                  retorno.codigo = 'MODULO_LAUDOS_TIMEOUT';
                  retorno.detalhe = norm(document.getElementById('menuModulos')?.innerText || '').slice(0, 1200);
                  retorno.ajaxAtivo = Boolean(window.AJAX?.AJAX_ATIVO);
                }
              }
            }
          } else if (op === 'PROBE_LAUDO_MENU') {
            const modulo = document.getElementById('menuModulos');
            const item = modulo && Array.from(modulo.querySelectorAll('[onclick]')).find(el =>
              /acessarprocedimentolaudopericialsel\.do/i.test(String(el.getAttribute('onclick') || ''))
              || /^Selecionar\s+Laudo\s*\/\s*Parecer$/i.test(norm(el.innerText || el.textContent || ''))
            );
            retorno.ok = Boolean(item);
            retorno.codigo = item ? 'MENU_LAUDO_PRONTO' : 'MENU_LAUDO_NAO_LOCALIZADO';
            if (item) retorno.outer = String(item.outerHTML || '').slice(0, 1600);
          } else if (op === 'OPEN_LAUDO_SEARCH') {
            const modulo = document.getElementById('menuModulos');
            const item = modulo && Array.from(modulo.querySelectorAll('[onclick]')).find(el =>
              /acessarprocedimentolaudopericialsel\.do/i.test(String(el.getAttribute('onclick') || ''))
              || /^Selecionar\s+Laudo\s*\/\s*Parecer$/i.test(norm(el.innerText || el.textContent || ''))
            );
            if (!item) {
              retorno.codigo = 'SELECIONAR_LAUDO_NAO_ENCONTRADO';
            } else {
              item.click();
              const pronto = await aguardar(() => {
                const campo = document.querySelector('#AJAX input[name="idObj_Arg"]');
                const btn = document.querySelector('#AJAX #btnPesquisar');
                const caso = String(window.casoDeUso || '');
                return campo && btn && /\/LAUDOSPERICIAIS\/acessarprocedimentolaudopericialsel\.do/i.test(caso)
                  ? { campo, btn, caso } : null;
              }, 12000, 150);
              if (pronto) {
                retorno.ok = true;
                retorno.codigo = 'PESQUISA_LAUDO_PRONTA';
                retorno.metodo = 'click_item_real_Selecionar_Laudo_Parecer';
                retorno.casoDeUso = pronto.caso;
              } else {
                retorno.codigo = 'PESQUISA_LAUDO_TIMEOUT';
                retorno.casoDeUso = String(window.casoDeUso || '');
                retorno.detalhe = norm(document.getElementById('AJAX')?.innerText || '').slice(0, 1200);
              }
            }
          } else if (op === 'PROBE_LAUDO_SEARCH') {
            const campo = document.querySelector('#AJAX input[name="idObj_Arg"]');
            const btn = document.querySelector('#AJAX #btnPesquisar');
            const caso = String(window.casoDeUso || '');
            retorno.ok = Boolean(campo && btn && /\/LAUDOSPERICIAIS\/acessarprocedimentolaudopericialsel\.do/i.test(caso));
            retorno.codigo = retorno.ok ? 'PESQUISA_LAUDO_PRONTA' : 'PESQUISA_LAUDO_AINDA_NAO_PRONTA';
            retorno.casoDeUso = caso;
            retorno.temCampo = Boolean(campo);
            retorno.temBtnPesquisar = Boolean(btn);
          } else if (op === 'SEARCH_OPEN_LAUDO') {
            const original = norm(arg || '');
            const segmentos = original.split(/\D+/).filter(Boolean);
            const segmentoBusca = [...segmentos].reverse().find(x => x.length >= 8 && x.length <= 10)
              || original.replace(/\D/g, '');
            const alvoCanon = canon(segmentoBusca);
            const campo = document.querySelector('#AJAX input[name="idObj_Arg"]');
            const pesquisar = document.querySelector('#AJAX #btnPesquisar');
            const casoPesquisa = String(window.casoDeUso || '');

            if (!segmentoBusca || !alvoCanon) {
              retorno.codigo = 'NUMERO_LAUDO_VAZIO';
            } else if (!campo || !pesquisar || !/acessarprocedimentolaudopericialsel\.do/i.test(casoPesquisa)) {
              retorno.codigo = 'TELA_PESQUISA_LAUDO_NAO_ENCONTRADA';
              retorno.casoDeUso = casoPesquisa;
            } else {
              setValor(campo, segmentoBusca);
              pesquisar.click();

              const linha = await aguardar(() => {
                const trs = Array.from(document.querySelectorAll('#AJAX tr'));
                return trs.find(tr => {
                  const primeiro = tr.querySelector('td');
                  if (!primeiro) return false;
                  return canon(primeiro.innerText || primeiro.textContent || '') === alvoCanon;
                }) || null;
              }, 12000, 160);

              if (!linha) {
                retorno.codigo = 'LAUDO_NAO_ENCONTRADO';
                retorno.numeroBusca = segmentoBusca;
              } else {
                const celula = Array.from(linha.querySelectorAll('td[onclick]')).find(td =>
                  /chPlc\s*=\s*0*\d+/i.test(String(td.getAttribute('onclick') || ''))
                  && /acessarprocedimentolaudopericial/i.test(String(td.getAttribute('onclick') || ''))
                ) || linha.querySelector('td[onclick*="chPlc="]');

                if (!celula) {
                  retorno.codigo = 'CELULA_ABRIR_LAUDO_NAO_ENCONTRADA';
                  retorno.linha = norm(linha.innerText || linha.textContent || '').slice(0, 1200);
                } else {
                  const onclick = String(celula.getAttribute('onclick') || '');
                  celula.click();
                  const aberto = await aguardar(() => {
                    const caso = String(window.casoDeUso || '');
                    const texto = norm(document.getElementById('AJAX')?.innerText || '');
                    return /\/LAUDOSPERICIAIS\/acessarprocedimentolaudopericialman\.do/i.test(caso)
                      && /N[º°o.]?\s+Procedimento\s+Laudo\s*\/\s*Parecer/i.test(texto)
                      ? { caso, texto } : null;
                  }, 12000, 150);

                  if (aberto) {
                    const mCompleto = aberto.texto.match(/N[º°o.]?\s+Procedimento\s+Laudo\s*\/\s*Parecer\s+([0-9-]{15,})/i);
                    retorno.ok = true;
                    retorno.codigo = 'LAUDO_ABERTO';
                    retorno.metodo = 'click_td_onclick_nativo';
                    retorno.numeroBusca = segmentoBusca;
                    retorno.numeroLaudoCompleto = mCompleto ? mCompleto[1] : null;
                    retorno.casoDeUso = aberto.caso;
                    retorno.onclick = onclick.slice(0, 1000);
                    retorno.linha = norm(linha.innerText || linha.textContent || '').slice(0, 1200);
                  } else {
                    retorno.codigo = 'LAUDO_NAO_ABRIU';
                    retorno.casoDeUso = String(window.casoDeUso || '');
                  }
                }
              }
            }
          } else if (op === 'OPEN_BENS') {
            const modulo = document.getElementById('menuModulos');
            if (!modulo) {
              retorno.codigo = 'MENU_MODULOS_NAO_ENCONTRADO';
            } else {
              const titulo = Array.from(modulo.querySelectorAll('[onclick]')).find(el =>
                /expandeMenu\(['"]#Bens Materiais['"]\)/i.test(String(el.getAttribute('onclick') || ''))
                || /^Bens\s+Materiais$/i.test(norm(el.childNodes?.[0]?.textContent || el.innerText || ''))
              );
              if (!titulo) {
                retorno.codigo = 'BENS_MATERIAIS_NAO_ENCONTRADO';
              } else {
                titulo.click();
                const acessar = await aguardar(() => Array.from(modulo.querySelectorAll('[onclick]')).find(el =>
                  /acessarbemmaterialsel\.do\?evento=F9-Pesquisar/i.test(String(el.getAttribute('onclick') || ''))
                  || /^Acessar\s*\/\s*Cadastrar$/i.test(norm(el.innerText || el.textContent || ''))
                ) || null, 3000, 80);
                if (!acessar) {
                  retorno.codigo = 'ACESSAR_CADASTRAR_BENS_NAO_ENCONTRADO';
                } else {
                  acessar.click();
                  const pronto = await aguardar(() => {
                    const caso = String(window.casoDeUso || '');
                    const btn = document.querySelector('#AJAX input#botao_menu[value="Novo Bem Material"]');
                    return /\/PCnet\/acessarbemmaterialsel\.do/i.test(caso) && btn ? { caso, btn } : null;
                  }, 12000, 150);
                  if (pronto) {
                    retorno.ok = true;
                    retorno.codigo = 'BENS_MATERIAIS_PRONTO';
                    retorno.metodo = 'click_menu_nativo_Bens_Acessar';
                    retorno.casoDeUso = pronto.caso;
                    retorno.botao = String(pronto.btn.outerHTML || '').slice(0, 1200);
                  } else {
                    retorno.codigo = 'BENS_MATERIAIS_TIMEOUT';
                    retorno.casoDeUso = String(window.casoDeUso || '');
                    retorno.detalhe = norm(document.getElementById('AJAX')?.innerText || '').slice(0, 1200);
                  }
                }
              }
            }
          } else if (op === 'PROBE_NOVO_BEM') {
            const btn = document.querySelector('#AJAX input#botao_menu[value="Novo Bem Material"]');
            const caso = String(window.casoDeUso || '');
            retorno.ok = Boolean(btn && /\/PCnet\/acessarbemmaterialsel\.do/i.test(caso));
            retorno.codigo = retorno.ok ? 'NOVO_BEM_PRONTO' : 'NOVO_BEM_AINDA_NAO_PRONTO';
            retorno.casoDeUso = caso;
            if (btn) retorno.outer = String(btn.outerHTML || '').slice(0, 1200);
          } else if (op === 'OPEN_NOVO_BEM') {
            const btn = document.querySelector('#AJAX input#botao_menu[value="Novo Bem Material"]');
            if (!btn) {
              retorno.codigo = 'BOTAO_NOVO_BEM_MATERIAL_NAO_ENCONTRADO';
            } else {
              btn.click();
              const pronto = await aguardar(() => {
                const caso = String(window.casoDeUso || '');
                const modo = document.querySelector('#AJAX #modoPlc')?.value || '';
                const lacre = document.querySelector('#AJAX input[name="novoNumeroInvolucro"]');
                const info = document.querySelector('#AJAX #infAdicional');
                const salvar = document.querySelector('#AJAX #btnGrava');
                return /\/PCnet\/acessaroutrobemmaterialman\.do/i.test(caso)
                  && modo === 'inclusaoPlc' && lacre && info && salvar
                  ? { caso, modo, lacre, info, salvar } : null;
              }, 12000, 150);
              if (pronto) {
                retorno.ok = true;
                retorno.codigo = 'NOVO_BEM_FORM_PRONTO';
                retorno.metodo = 'click_Novo_Bem_Material_nativo';
                retorno.casoDeUso = pronto.caso;
                retorno.salvarOnclick = String(pronto.salvar.getAttribute('onclick') || '').slice(0, 1200);
              } else {
                retorno.codigo = 'NOVO_BEM_MATERIAL_TIMEOUT';
                retorno.casoDeUso = String(window.casoDeUso || '');
              }
            }
          } else if (op === 'PROBE_NOVO_FORM') {
            const caso = String(window.casoDeUso || '');
            const modo = document.querySelector('#AJAX #modoPlc')?.value || '';
            const input = document.querySelector('#AJAX input[name="novoNumeroInvolucro"]');
            const info = document.querySelector('#AJAX #infAdicional');
            const salvar = document.querySelector('#AJAX #btnGrava');
            retorno.ok = Boolean(/\/PCnet\/acessaroutrobemmaterialman\.do/i.test(caso) && modo === 'inclusaoPlc' && input && info && salvar);
            retorno.codigo = retorno.ok ? 'NOVO_BEM_FORM_PRONTO' : 'NOVO_BEM_FORM_AINDA_NAO_PRONTO';
            retorno.casoDeUso = caso;
            retorno.modoPlc = modo;
          } else if (op === 'FILL_SAVE_SAMPLE') {
            const dados = arg || {};
            const lacre = norm(dados.numeroLacre || dados.numero_lacre || '');
            const descricao = String(dados.descricao || '');
            const caso = String(window.casoDeUso || '');
            const modo = document.querySelector('#AJAX #modoPlc')?.value || '';
            const input = document.querySelector('#AJAX input[name="novoNumeroInvolucro"]');
            const info = document.querySelector('#AJAX #infAdicional');
            const salvar = document.querySelector('#AJAX #btnGrava');

            if (!/\/PCnet\/acessaroutrobemmaterialman\.do/i.test(caso) || modo !== 'inclusaoPlc' || !input || !info || !salvar) {
              retorno.codigo = 'TELA_NOVO_BEM_MATERIAL_NAO_ENCONTRADA';
              retorno.casoDeUso = caso;
              retorno.modoPlc = modo;
            } else if (!lacre) {
              retorno.codigo = 'LACRE_AMOSTRA_VAZIO';
            } else {
              // Garante a opcao “Lacre de seguranca: Numero”, exatamente como a
              // tela abre por padrao. Nao usa “Nao se aplica”.
              const chk = document.querySelector('#AJAX #involucroNaoSeAplicaChk');
              const aux = document.querySelector('#AJAX input[name="involucroNaoSeAplicaAux"]');
              if (chk?.checked) {
                chk.checked = false;
                try { if (typeof window.ajustarExibicao === 'function') window.ajustarExibicao(chk); } catch (_) {}
              }
              if (aux) aux.value = '0';
              input.disabled = false;

              setValor(input, lacre);
              setValor(info, descricao);
              try { if (typeof window.campoAlterado === 'function') window.campoAlterado(); } catch (_) {}

              const onclick = String(salvar.getAttribute('onclick') || '');
              if (!/GRAVAR_F6/i.test(onclick)) {
                retorno.codigo = 'SALVAR_NATIVO_GRAVAR_F6_NAO_CONFIRMADO';
                retorno.salvarOnclick = onclick.slice(0, 1200);
              } else {
                // O clique executa o onclick nativo confirmado no PCNet:
                // executarAntesGravar(); transfereDadosMCE(); podeSairSemConfirmacao();
                // plcAjax.ajaxSubmit('POST', getBotaoArray('GRAVAR_F6'));
                salvar.click();
                await sleepLocal(120);
                retorno.ok = true;
                retorno.codigo = 'SALVAR_AMOSTRA_DISPARADO';
                retorno.metodo = 'btnGrava_onclick_nativo_GRAVAR_F6';
                retorno.casoDeUso = String(window.casoDeUso || '');
                retorno.salvarOnclick = onclick.slice(0, 1200);
              }
            }
          } else if (op === 'GET_ACCEPTANCE_DETAIL_READONLY') {
            // V2.19: abre uma requisição da caixa de Aceite somente para leitura
            // e extrai também anexos e ocorrências usando os controles reais do PCNet.
            const dados = arg && typeof arg === 'object' ? arg : { requisicao: arg };
            const requisicao = norm(
              dados?.requisicao
              ?? dados?.numeroRequisicao
              ?? dados?.numero_requisicao
              ?? ''
            );
            const requisicaoCanon = canon(requisicao);

            // V2.24: página nativa calculada a partir da ordem do CSV completo.
            // Ela é independente da paginação/filtragem visual feita pelo Nexus.
            const paginaPcnetInformada = Boolean(
              dados?.paginaPcnet != null
              || dados?.pagina_pcnet != null
            );

            const paginaPcnet = Math.max(1, Number(
              dados?.paginaPcnet
              ?? dados?.pagina_pcnet
              ?? 1
            ) || 1);

            const indicePcnetRaw = Number(dados?.indicePcnet ?? dados?.indice_pcnet);
            const indicePcnet = Number.isFinite(indicePcnetRaw) && indicePcnetRaw >= 0
              ? Math.floor(indicePcnetRaw)
              : null;

            const posicaoPcnetRaw = Number(dados?.posicaoPcnet ?? dados?.posicao_pcnet);
            const posicaoPcnet = Number.isFinite(posicaoPcnetRaw) && posicaoPcnetRaw >= 1
              ? Math.floor(posicaoPcnetRaw)
              : null;

            retorno.paginacaoAlvo = {
              paginaPcnetInformada,
              paginaPcnet,
              indicePcnet,
              posicaoPcnet
            };

            const localizarFormularioAceite = () =>
              document.querySelector('form[name="aceitefatolaudosForm"]');

            // V2.23: o mesmo form pode existir tanto na listagem quanto no detalhe.
            // Só tratamos a tela como LISTA quando houver evidência positiva do SEL.
            // Isso evita tentar pesquisar uma nova requisição em um detalhe vazio
            // deixado por Receber/Aceitar/Aguardar Material/Devolver.
            const localizarTelaListaAceite = () => {
              const form = localizarFormularioAceite();
              if (!form) return null;

              const caso = String(window.casoDeUso || '');
              const btnPesquisar = document.querySelector('#btnPesquisar');
              const btnLimpar = document.querySelector('#btnLimpar');
              const temLinhaAceite = Boolean(
                form.querySelector('input[id^="itensPlc["][id$=".flagAceita"]')
              );

              const ehCasoLista =
                /\/LAUDOSPERICIAIS\/aceitefatolaudossel\.do/i.test(caso);

              if (ehCasoLista && btnPesquisar) {
                return { form, btnPesquisar, btnLimpar, caso };
              }

              // Fallback estrutural para versões em que casoDeUso demora a atualizar.
              if (btnPesquisar && btnLimpar && temLinhaAceite) {
                return { form, btnPesquisar, btnLimpar, caso };
              }

              return null;
            };

            const aguardarAjaxParado = async (timeout = 15000) => {
              await sleepLocal(180);
              const limite = Date.now() + timeout;
              while (Date.now() < limite) {
                let ativo = false;
                try { ativo = Boolean(window.AJAX?.AJAX_ATIVO); } catch (_) {}
                if (!ativo) return true;
                await sleepLocal(120);
              }
              return false;
            };

            /*
             * V2.26 - O Ctrl+F1 / redirectajaxPCnet abre o formulário de
             * pesquisa do Aceite, mas o PCNet só monta as linhas e o navegador
             * (#iniAnt/nav*) DEPOIS que o botão Pesquisar é executado.
             *
             * Portanto, antes de tentar paginação ou abrirFato(), garantimos que
             * existe um conjunto de resultados realmente carregado. Se acabamos
             * de voltar de um detalhe, fazemos exatamente o que o usuário faria:
             * Limpar -> Pesquisar. Nenhuma requisição é alterada nessa etapa.
             */
            const garantirResultadosAceiteCarregados = async () => {
              const raizAtual = () => document.getElementById('AJAX') || document;
              const temLinhas = () => Boolean(
                raizAtual().querySelector('input[id^="itensPlc["][id$=".flagAceita"]')
              );

              if (temLinhas()) {
                return {
                  ok: true,
                  pesquisou: false,
                  motivo: 'linhas_ja_carregadas',
                  paginaAtual: detectarPaginaAtualAceite?.() || null
                };
              }

              let tela = localizarTelaListaAceite();
              if (!tela?.btnPesquisar) {
                return {
                  ok: false,
                  pesquisou: false,
                  motivo: 'btnPesquisar_nao_encontrado'
                };
              }

              const limpar = document.querySelector('#btnLimpar');
              if (limpar) {
                try { limpar.click(); } catch (_) {}
                await aguardarAjaxParado(8000);
                await sleepLocal(180);
              }

              // O AJAX do Limpar pode reconstruir todo o formulário.
              tela = localizarTelaListaAceite() || tela;
              const pesquisar = tela?.btnPesquisar || document.querySelector('#btnPesquisar');
              if (!pesquisar) {
                return {
                  ok: false,
                  pesquisou: false,
                  motivo: 'btnPesquisar_sumiu_apos_limpar'
                };
              }

              try { pesquisar.click(); }
              catch (e) {
                return {
                  ok: false,
                  pesquisou: false,
                  motivo: 'click_pesquisar_falhou',
                  erro: String(e?.message || e || '').slice(0, 800)
                };
              }

              await aguardarAjaxParado(15000);

              const pronto = await aguardar(() => {
                if (temLinhas()) return 'linhas';
                const texto = norm(raizAtual().innerText || raizAtual().textContent || '');
                if (/um\s+total\s*:\s*de\s+\d+/i.test(texto)) return 'total';
                if (/nenhum\s+(?:registro|resultado)/i.test(texto)) return 'vazio';
                return null;
              }, 9000, 150);

              return {
                ok: Boolean(pronto),
                pesquisou: true,
                motivo: pronto || 'resultado_pesquisa_timeout',
                temLinhas: temLinhas(),
                paginaAtual: detectarPaginaAtualAceite?.() || null,
                iniAnt: String(document.getElementById('iniAnt')?.value || '')
              };
            };

            const localizarLinha = () => {
              const raiz = document.getElementById('AJAX') || document;
              const linhas = Array.from(raiz.querySelectorAll('tr'));
              const linha = linhas.find(tr => {
                const celulas = Array.from(tr.querySelectorAll('td'));
                return celulas.some(td => {
                  const valor = norm(td.innerText || td.textContent || '');
                  return canon(valor) === requisicaoCanon;
                });
              }) || null;
              return { linha, linhas };
            };

            const localizarCampoBuscaRequisicao = (form) => {
              if (!form) return null;

              const seletorCampo =
                'input[type="text"],input:not([type]),input[type="search"]';

              const inputs = Array.from(
                form.querySelectorAll(seletorCampo)
              );

              // 1) Melhor caso: id/name/title/placeholder já dizem "requisição".
              let campo = inputs.find(el => {
                const meta = norm([
                  el.id,
                  el.name,
                  el.title,
                  el.placeholder
                ].filter(Boolean).join(' '));
                return /requisi[cç][aã]o/i.test(meta);
              }) || null;

              if (campo) return campo;

              // 2) LABEL HTML clássico.
              const labels = Array.from(form.querySelectorAll('label'));
              const labelReq = labels.find(label =>
                /n[º°o.]?\s*(?:da\s+)?requisi[cç][aã]o|requisi[cç][aã]o/i.test(
                  norm(label.innerText || label.textContent || '')
                )
              );

              if (labelReq) {
                const id = labelReq.getAttribute('for');
                if (id) campo = document.getElementById(id);

                if (!campo) {
                  campo = labelReq.parentElement?.querySelector(seletorCampo) || null;
                }

                if (!campo) {
                  campo = labelReq.closest('tr')?.querySelector(seletorCampo) || null;
                }

                if (campo) return campo;
              }

              // 3) O PCNet legado frequentemente não usa <label>; o título fica
              // em TD/TH e o input na célula seguinte ou na mesma linha.
              const rotulosTabela = Array.from(
                form.querySelectorAll('td,th,span,div')
              ).filter(el => {
                const texto = norm(el.innerText || el.textContent || '');
                if (!texto || texto.length > 160) return false;
                return /n[º°o.]?\s*(?:da\s+)?requisi[cç][aã]o|requisi[cç][aã]o/i.test(texto);
              });

              for (const rotulo of rotulosTabela) {
                campo = rotulo.querySelector?.(seletorCampo) || null;
                if (campo) return campo;

                let irmao = rotulo.nextElementSibling;
                for (let i = 0; irmao && i < 3; i += 1, irmao = irmao.nextElementSibling) {
                  campo = irmao.matches?.(seletorCampo)
                    ? irmao
                    : irmao.querySelector?.(seletorCampo);
                  if (campo) return campo;
                }

                const linhaRotulo = rotulo.closest('tr');
                if (linhaRotulo) {
                  const camposLinha = Array.from(
                    linhaRotulo.querySelectorAll(seletorCampo)
                  );
                  if (camposLinha.length === 1) return camposLinha[0];

                  const proximaLinha = linhaRotulo.nextElementSibling;
                  if (proximaLinha) {
                    const camposProxima = Array.from(
                      proximaLinha.querySelectorAll?.(seletorCampo) || []
                    );
                    if (camposProxima.length === 1) return camposProxima[0];
                  }
                }
              }

              // 4) Associa cada input ao texto do bloco/linha em que ele está.
              // Só aceitamos quando há exatamente um candidato contextual.
              const contextuais = inputs.filter(el => {
                const td = el.closest('td,th');
                const tr = el.closest('tr');
                const contexto = norm([
                  td?.previousElementSibling?.innerText || '',
                  td?.innerText || '',
                  tr?.innerText || ''
                ].join(' '));
                return /n[º°o.]?\s*(?:da\s+)?requisi[cç][aã]o|requisi[cç][aã]o/i.test(contexto);
              });

              return contextuais.length === 1 ? contextuais[0] : null;
            };

            const assinaturaPaginaAceite = () => {
              const raiz = document.getElementById('AJAX') || document;
              return Array.from(
                raiz.querySelectorAll('input[id^="itensPlc["][id$=".flagAceita"]')
              )
                .map(el => `${el.id}|${norm(el.closest('tr')?.innerText || '')}`)
                .join('||')
                .slice(0, 12000);
            };

            const elementoVisivel = (el) => {
              if (!el) return false;
              if (el.disabled) return false;
              const estilo = (() => {
                try { return window.getComputedStyle(el); } catch (_) { return null; }
              })();
              if (estilo && (estilo.display === 'none' || estilo.visibility === 'hidden')) return false;
              return Boolean(el.offsetParent !== null || el.getClientRects?.().length);
            };

            const dentroDeLinhaDeRequisicao = (el) => {
              const tr = el?.closest?.('tr');
              if (!tr) return false;
              return Boolean(
                tr.querySelector('input[id^="itensPlc["][id$=".flagAceita"]')
                || tr.querySelector('[onclick*="abrirFato"]')
              );
            };

            const ancestralPaginacao = (el) => {
              let atual = el;
              for (let i = 0; atual && i < 5; i += 1, atual = atual.parentElement) {
                const meta = norm([
                  atual.id,
                  atual.className,
                  atual.getAttribute?.('name') || '',
                  atual.getAttribute?.('title') || '',
                  atual.getAttribute?.('aria-label') || '',
                  atual.innerText || ''
                ].filter(Boolean).join(' '));
                if (/p[aá]gin|paginacao|pagina[cç][aã]o|pager|page|navega[cç][aã]o/i.test(meta)) {
                  return atual;
                }
              }
              return null;
            };

            const tornarClicavel = (el) => {
              if (!el) return null;
              const tag = String(el.tagName || '').toUpperCase();
              if (['A', 'BUTTON', 'INPUT'].includes(tag) || el.hasAttribute?.('onclick')) return el;
              return el.closest?.('a,button,input[type="button"],input[type="submit"],[onclick]') || el;
            };

            const ITENS_POR_PAGINA_ACEITE = 20;

            const detectarPaginaAtualAceite = () => {
              const raiz = document.getElementById('AJAX') || document;

              /*
               * V2.27 - CORREÇÃO IMPORTANTE DA PAGINAÇÃO.
               *
               * O PCNet NÃO mantém #iniAnt com o início da página atual depois
               * que o AJAX termina. No PCNet real foi confirmado:
               *
               *   página 1 carregada -> iniAnt = "1", nav3 -> 21
               *   página 2 carregada -> iniAnt = "1", nav3 -> 41
               *
               * Portanto #iniAnt é parâmetro de navegação, não marcador confiável
               * da página corrente. A página atual passa a ser detectada por:
               *
               * 1) texto real "de X até Y de um total de Z";
               * 2) destino do nav3 (próxima página);
               * 3) destino do nav2 (página anterior);
               * 4) página única, quando não há nav2/nav3.
               */

              const textoRaiz = norm(
                raiz.innerText || raiz.textContent || ''
              );

              const faixa = textoRaiz.match(
                /\bde\s+(\d+)\s+at[eé]\s+(\d+)\s+de\s+um\s+total\s*:?\s*(?:de\s*)?(\d+)/i
              );

              if (faixa) {
                const primeiro = Number(faixa[1]);
                if (Number.isInteger(primeiro) && primeiro >= 1) {
                  return Math.floor((primeiro - 1) / ITENS_POR_PAGINA_ACEITE) + 1;
                }
              }

              const extrairInicioNav = (el) => {
                if (!el) return null;
                const onclick = String(el.getAttribute?.('onclick') || '');
                const m = onclick.match(
                  /getElementById\(\s*(['"])iniAnt\1\s*\)\.value\s*=\s*(['"])(\d+)\2/i
                );
                if (!m) return null;
                const valor = Number(m[3]);
                return Number.isInteger(valor) && valor >= 1 ? valor : null;
              };

              // nav3 é o botão ">". Na página 1 aponta para 21; na página 2
              // aponta para 41; logo seu destino revela a página corrente.
              const inicioProxima = extrairInicioNav(
                raiz.querySelector('#nav3') || document.getElementById('nav3')
              );

              if (inicioProxima != null && inicioProxima > 1) {
                return Math.max(
                  1,
                  Math.floor((inicioProxima - 1) / ITENS_POR_PAGINA_ACEITE)
                );
              }

              // Em uma última página pode não existir nav3. nav2 é o botão "<"
              // e aponta para o início da página anterior.
              const inicioAnterior = extrairInicioNav(
                raiz.querySelector('#nav2') || document.getElementById('nav2')
              );

              if (inicioAnterior != null) {
                return Math.floor((inicioAnterior - 1) / ITENS_POR_PAGINA_ACEITE) + 2;
              }

              // Se há resultados e não há navegação anterior/próxima, trata-se
              // de uma listagem de página única.
              const temLinhas = Boolean(
                raiz.querySelector('input[id^="itensPlc["][id$=".flagAceita"]')
              );

              if (temLinhas) {
                return 1;
              }

              // Fallback legado para alguma variação futura do PCNet.
              const campos = Array.from(raiz.querySelectorAll('input,select'));
              const candidatosCampos = campos
                .map(el => {
                  const meta = norm([el.id, el.name, el.title].filter(Boolean).join(' '));
                  const valor = Number(String(el.value || '').trim());
                  let score = 0;
                  if (/paginaAtual|pagina_atual|paginaCorrente|currentPage/i.test(meta)) score += 200;
                  else if (/p[aá]gin|page/i.test(meta)) score += 80;
                  if (/iniAnt|itensPlc|quantidade|tamanho|size|porPagina/i.test(meta)) score -= 180;
                  if (!Number.isInteger(valor) || valor < 1 || valor > 10000) score -= 500;
                  return { valor, score };
                })
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score);

              if (candidatosCampos.length && candidatosCampos[0].score >= 150) {
                return candidatosCampos[0].valor;
              }

              return null;
            };

            const localizarControlePaginaNumero = (numeroPagina) => {
              const raiz = document.getElementById('AJAX') || document;
              const alvo = String(numeroPagina);
              const elementos = Array.from(raiz.querySelectorAll(
                'a,button,input[type="button"],input[type="submit"],input[type="image"],img,span,td,[onclick]'
              ));
              const unicos = new Map();

              for (const bruto of elementos) {
                const el = tornarClicavel(bruto);
                if (!el || unicos.has(el) || dentroDeLinhaDeRequisicao(el)) continue;
                unicos.set(el, true);

                const texto = norm(
                  el.value
                  || el.innerText
                  || el.textContent
                  || bruto.alt
                  || bruto.title
                  || ''
                );
                const meta = norm([
                  texto,
                  el.id,
                  el.name,
                  el.className,
                  el.title,
                  el.getAttribute?.('aria-label') || '',
                  el.getAttribute?.('href') || '',
                  el.getAttribute?.('onclick') || '',
                  bruto.getAttribute?.('src') || '',
                  bruto.getAttribute?.('alt') || ''
                ].filter(Boolean).join(' '));

                let score = 0;
                if (texto === alvo) score += 150;
                if (new RegExp(`(?:pagina|page|pag)[^0-9]{0,12}0*${numeroPagina}(?:\\D|$)`, 'i').test(meta)) score += 120;
                if (ancestralPaginacao(el)) score += 90;
                if (/p[aá]gin|paginacao|pagina[cç][aã]o|pager|page/i.test(meta)) score += 60;
                if (/btnPesquisar|btnLimpar|aceitar|receber|devolver|aguardar|gravar|salvar|excluir|abrirFato/i.test(meta)) score -= 500;
                if (!elementoVisivel(el)) score -= 300;

                unicos.set(el, { el, score, texto, meta });
              }

              return [...unicos.values()]
                .filter(x => x && typeof x === 'object' && x.score >= 200)
                .sort((a, b) => b.score - a.score)[0] || null;
            };

            const localizarControleProximaPagina = () => {
              const raiz = document.getElementById('AJAX') || document;
              const elementos = Array.from(raiz.querySelectorAll(
                'a,button,input[type="button"],input[type="submit"],input[type="image"],img,span,td,[onclick]'
              ));
              const vistos = new Set();
              const candidatos = [];

              for (const bruto of elementos) {
                const el = tornarClicavel(bruto);
                if (!el || vistos.has(el) || dentroDeLinhaDeRequisicao(el)) continue;
                vistos.add(el);

                const texto = norm(
                  el.value
                  || el.innerText
                  || el.textContent
                  || bruto.alt
                  || bruto.title
                  || ''
                );
                const meta = norm([
                  texto,
                  el.id,
                  el.name,
                  el.className,
                  el.title,
                  el.getAttribute?.('aria-label') || '',
                  el.getAttribute?.('href') || '',
                  el.getAttribute?.('onclick') || '',
                  bruto.getAttribute?.('src') || '',
                  bruto.getAttribute?.('alt') || ''
                ].filter(Boolean).join(' '));

                let score = 0;
                if (/^pr[oó]xim[ao](?:\s+p[aá]gina)?$/i.test(texto)) score += 220;
                if (/pr[oó]xim[ao]|next|seguinte|avan[cç]ar/i.test(meta)) score += 150;
                if (/direita|right|seta[_-]?(?:dir|right)|forward/i.test(meta)) score += 90;
                if (/^(?:>|>>|»|›|→)$/i.test(texto)) score += 100;
                if (ancestralPaginacao(el)) score += 90;
                if (/p[aá]gin|paginacao|pagina[cç][aã]o|pager|page/i.test(meta)) score += 60;
                if (/btnPesquisar|btnLimpar|aceitar|receber|devolver|aguardar|gravar|salvar|excluir|abrirFato/i.test(meta)) score -= 500;
                if (!elementoVisivel(el)) score -= 300;

                if (score > 0) candidatos.push({ el, score, texto, meta });
              }

              return candidatos.filter(x => x.score >= 150).sort((a, b) => b.score - a.score)[0] || null;
            };

            const clicarPaginaEAguardar = async (controle, timeout = 12000) => {
              if (!controle?.el) return { ok: false, motivo: 'controle_ausente' };

              const assinaturaAntes = assinaturaPaginaAceite();
              const casoAntes = String(window.casoDeUso || '');

              try { controle.el.click(); }
              catch (e) {
                return { ok: false, motivo: 'click_falhou', erro: String(e?.message || e || '') };
              }

              await aguardarAjaxParado(timeout);

              const mudou = await aguardar(() => {
                const assinaturaDepois = assinaturaPaginaAceite();
                const casoDepois = String(window.casoDeUso || '');
                if (assinaturaDepois && assinaturaDepois !== assinaturaAntes) return assinaturaDepois;
                if (casoDepois && casoDepois !== casoAntes) return `caso:${casoDepois}`;
                return null;
              }, 6000, 120);

              return {
                ok: Boolean(mudou),
                assinaturaAntes,
                assinaturaDepois: assinaturaPaginaAceite(),
                mudou: Boolean(mudou)
              };
            };

            const navegarParaPaginaAceite = async (paginaAlvo) => {
              const alvo = Math.max(1, Number(paginaAlvo) || 1);
              const paginaInicial = detectarPaginaAtualAceite();
              const diagnostico = {
                paginaAlvo: alvo,
                paginaInicialDetectada: paginaInicial,
                paginaFinalDetectada: null,
                inicioAlvo: ((alvo - 1) * ITENS_POR_PAGINA_ACEITE) + 1,
                metodo: null,
                passos: []
              };

              if (paginaInicial === alvo) {
                diagnostico.metodo = 'iniAnt_ja_na_pagina_alvo';
                diagnostico.paginaFinalDetectada = paginaInicial;
                return { ok: true, ...diagnostico };
              }

              /*
               * V2.25 - MÉTODO PRINCIPAL, 100% NATIVO.
               *
               * HTML confirmado no PCNet:
               *
               * <input id="iniAnt" type="hidden" value="1"
               *        name="pAcIniNavaceitefatolaudosselNav">
               *
               * <a id="nav3" href="#"
               *    onclick="document.getElementById('acao').value='navega';
               *             document.getElementById('iniAnt').value='21';
               *             plcAjax.ajaxSubmit('POST','F9-Pesquisar');">
               *
               * Reproduzimos exatamente o estado que o próprio paginador monta,
               * sem depender do ícone/nav1/nav2/nav3 ou de texto visual.
               */
              const raiz = document.getElementById('AJAX') || document;
              const acao = raiz.querySelector('#acao') || document.getElementById('acao');
              const iniAnt = raiz.querySelector('#iniAnt') || document.getElementById('iniAnt');
              const temPlcAjax = Boolean(window.plcAjax && typeof window.plcAjax.ajaxSubmit === 'function');
              const inicioAlvo = ((alvo - 1) * ITENS_POR_PAGINA_ACEITE) + 1;

              diagnostico.controlesNativos = {
                temAcao: Boolean(acao),
                acaoId: acao?.id || '',
                acaoName: acao?.name || '',
                acaoValorAntes: String(acao?.value || ''),
                temIniAnt: Boolean(iniAnt),
                iniAntId: iniAnt?.id || '',
                iniAntName: iniAnt?.name || '',
                iniAntValorAntes: String(iniAnt?.value || ''),
                temPlcAjax
              };

              /*
               * Primeiro preferimos o próprio <a> do paginador cujo onclick
               * aponta para o iniAnt desejado. O HTML real confirmado é, por
               * exemplo, nav3 -> iniAnt='21' -> F9-Pesquisar. Assim preservamos
               * qualquer efeito colateral interno do componente de navegação.
               */
              const controleNativoPagina = Array.from(
                raiz.querySelectorAll('a[onclick],button[onclick],input[onclick]')
              ).find(el => {
                const onclick = String(el.getAttribute('onclick') || '');
                const m = onclick.match(
                  /getElementById\(\s*(['"])iniAnt\1\s*\)\.value\s*=\s*(['"])(\d+)\2/i
                );
                return Boolean(
                  m
                  && Number(m[3]) === inicioAlvo
                  && /F9-Pesquisar/i.test(onclick)
                );
              }) || null;

              if (controleNativoPagina) {
                const assinaturaAntes = assinaturaPaginaAceite();
                try {
                  controleNativoPagina.click();
                  await aguardarAjaxParado(15000);

                  const confirmouControle = await aguardar(() => {
                    const tela = localizarTelaListaAceite();
                    if (!tela) return null;

                    const inicioAtual = Number(String(document.getElementById('iniAnt')?.value || '').trim());
                    const paginaAtual = detectarPaginaAtualAceite();

                    const assinaturaDepois = assinaturaPaginaAceite();
                    const mudouAssinatura = Boolean(
                      assinaturaDepois && assinaturaDepois !== assinaturaAntes
                    );

                    return paginaAtual === alvo && mudouAssinatura
                      ? { paginaAtual, inicioAtual, assinaturaDepois }
                      : null;
                  }, 9000, 120);

                  diagnostico.passos.push({
                    tipo: 'click_controle_nativo_iniAnt',
                    id: controleNativoPagina.id || '',
                    inicioAlvo,
                    ok: Boolean(confirmouControle),
                    paginaConfirmada: confirmouControle?.paginaAtual || null
                  });

                  if (confirmouControle) {
                    diagnostico.metodo = 'click_paginador_nativo_pcnet';
                    diagnostico.paginaFinalDetectada = confirmouControle.paginaAtual;
                    return { ok: true, ...diagnostico };
                  }
                } catch (e) {
                  diagnostico.passos.push({
                    tipo: 'click_controle_nativo_iniAnt',
                    id: controleNativoPagina.id || '',
                    inicioAlvo,
                    ok: false,
                    erro: String(e?.message || e || '').slice(0, 1000)
                  });
                }
              }

              if (acao && iniAnt && temPlcAjax) {
                const assinaturaAntes = assinaturaPaginaAceite();

                try {
                  acao.value = 'navega';
                  iniAnt.value = String(inicioAlvo);

                  window.plcAjax.ajaxSubmit('POST', 'F9-Pesquisar');

                  // Aguarda iniciar/finalizar o AJAX do PLC.
                  await aguardarAjaxParado(15000);

                  const confirmou = await aguardar(() => {
                    const tela = localizarTelaListaAceite();
                    if (!tela) return null;

                    const iniAtual = document.getElementById('iniAnt');
                    const inicioAtual = Number(String(iniAtual?.value || '').trim());
                    const paginaAtual = detectarPaginaAtualAceite();

                    const assinaturaDepois = assinaturaPaginaAceite();
                    const mudouAssinatura = Boolean(
                      assinaturaDepois
                      && assinaturaDepois !== assinaturaAntes
                    );

                    if (paginaAtual === alvo && (mudouAssinatura || alvo === 1)) {
                      return {
                        paginaAtual,
                        inicioAtual,
                        assinaturaDepois
                      };
                    }

                    return null;
                  }, 9000, 120);

                  diagnostico.passos.push({
                    tipo: 'iniAnt_plcAjax_nativo',
                    inicioAlvo,
                    ok: Boolean(confirmou),
                    paginaConfirmada: confirmou?.paginaAtual || null,
                    inicioConfirmado: confirmou?.inicioAtual || null
                  });

                  if (confirmou) {
                    diagnostico.metodo = 'iniAnt_acao_navega_plcAjax_F9_Pesquisar';
                    diagnostico.paginaFinalDetectada = confirmou.paginaAtual;
                    return { ok: true, ...diagnostico };
                  }
                } catch (e) {
                  diagnostico.passos.push({
                    tipo: 'iniAnt_plcAjax_nativo',
                    ok: false,
                    erro: String(e?.message || e || '').slice(0, 1000)
                  });
                }
              }

              /*
               * Fallback compatível: mantemos os detectores antigos apenas se
               * uma versão futura do PCNet deixar de expor #acao/#iniAnt/plcAjax.
               */
              const direto = localizarControlePaginaNumero(alvo);
              if (direto) {
                const r = await clicarPaginaEAguardar(direto);
                diagnostico.passos.push({
                  tipo: 'fallback_pagina_direta',
                  texto: direto.texto,
                  score: direto.score,
                  ok: r.ok
                });
                if (r.ok) {
                  diagnostico.metodo = 'fallback_controle_numero_pagina';
                  diagnostico.paginaFinalDetectada = detectarPaginaAtualAceite() || alvo;
                  return { ok: true, ...diagnostico };
                }
              }

              diagnostico.metodo = 'paginacao_nativa_nao_confirmada';
              diagnostico.paginaFinalDetectada = detectarPaginaAtualAceite();
              return { ok: false, ...diagnostico };
            };

            const localizarLinhaPercorrendoPaginacao = async (maxPaginas = 80) => {
              // V2.25: fallback determinístico usando o mesmo #iniAnt nativo.
              // Normalmente não será necessário porque paginaPcnet já vem do CSV.
              const limite = Math.max(1, Math.min(200, Number(maxPaginas) || 80));

              for (let paginaTentativa = 1; paginaTentativa <= limite; paginaTentativa += 1) {
                if (paginaTentativa > 1) {
                  const nav = await navegarParaPaginaAceite(paginaTentativa);
                  if (!nav?.ok) break;
                }

                const achou = localizarLinha().linha;
                if (achou) {
                  return {
                    linha: achou,
                    paginasPercorridas: paginaTentativa - 1,
                    paginaEncontrada: paginaTentativa
                  };
                }
              }

              return {
                linha: localizarLinha().linha,
                paginasPercorridas: null,
                paginaEncontrada: null
              };
            };

            const valorControle = (el) => {
              if (!el) return '';
              const tag = String(el.tagName || '').toUpperCase();
              if (tag === 'SELECT') {
                const selecionadas = Array.from(el.selectedOptions || [])
                  .map(x => norm(x.textContent || x.value || ''))
                  .filter(Boolean);
                return selecionadas.join(', ') || norm(el.value);
              }
              if (el.type === 'checkbox' || el.type === 'radio') {
                return el.checked ? norm(el.value || 'Sim') : '';
              }
              return norm(el.value ?? el.textContent ?? '');
            };

            const resumirControle = (el) => {
              if (!el) return null;
              return {
                tag: String(el.tagName || ''),
                id: String(el.id || ''),
                name: String(el.name || ''),
                type: String(el.type || ''),
                texto: norm(el.innerText || el.textContent || el.value || '').slice(0, 500),
                href: String(el.getAttribute?.('href') || '').slice(0, 2200),
                onclick: String(el.getAttribute?.('onclick') || '').slice(0, 3000),
                src: String(el.getAttribute?.('src') || '').slice(0, 1400),
                title: String(el.getAttribute?.('title') || '').slice(0, 800),
                alt: String(el.getAttribute?.('alt') || '').slice(0, 800),
                outerHTML: String(el.outerHTML || '').slice(0, 3000)
              };
            };

            const decodificarAmp = (v) => String(v || '').replace(/&amp;/gi, '&');

            const extrairRotaDownload = (onclick) => {
              const texto = decodificarAmp(onclick);
              const m = texto.match(/(["'])(\/PCnet\/anexardocumento\.do\?[^"']*?idArquivoAnexadoPlc=\d+[^"']*)\1/i)
                || texto.match(/(\/PCnet\/anexardocumento\.do\?[^\s"')]+idArquivoAnexadoPlc=\d+[^\s"')]*?)/i);
              return m ? (m[2] || m[1] || '') : '';
            };

            const extrairRotaBo = (onclick) => {
              const texto = decodificarAmp(onclick);
              const mJanela = texto.match(/janela\s*\(\s*(["'])(\/POLICIAL\/acessarfatopolicialman\.do\?[^"']+)\1/i);
              if (mJanela) return mJanela[2];
              const m = texto.match(/(\/POLICIAL\/acessarfatopolicialman\.do\?[^\s"')]+)/i);
              return m ? m[1] : '';
            };

            if (!requisicaoCanon) {
              retorno.codigo = 'REQUISICAO_VAZIA';
            } else {
              // 1) Garante POSITIVAMENTE a tela de LISTAGEM do Aceite.
              // O form aceitefatolaudosForm também pode sobreviver no detalhe;
              // por isso a mera existência do form não é suficiente.
              let telaLista = localizarTelaListaAceite();
              let form = telaLista?.form || null;

              if (!telaLista) {
                const rotaAceite =
                  '/LAUDOSPERICIAIS/aceitefatolaudossel.do?evento=F9-Pesquisar';
                let abriu = false;

                try {
                  if (typeof window.redirectajaxPCnet === 'function') {
                    window.redirectajaxPCnet(rotaAceite);
                    abriu = true;
                    retorno.metodoAberturaAceite = 'redirectajaxPCnet_forcar_lista_v223';
                  } else if (
                    typeof window.ajaxPCnet === 'function'
                    && document.getElementById('AJAX')
                  ) {
                    window.ajaxPCnet(rotaAceite, 'AJAX');
                    abriu = true;
                    retorno.metodoAberturaAceite = 'ajaxPCnet_forcar_lista_v223';
                  }
                } catch (e) {
                  retorno.erroAberturaAceite = String(e?.message || e || '').slice(0, 800);
                }

                if (abriu) {
                  await aguardarAjaxParado(15000);
                  telaLista = await aguardar(() => localizarTelaListaAceite(), 22000, 150);
                  form = telaLista?.form || null;
                }
              }

              if (!telaLista || !form) {
                retorno.codigo = 'ACEITE_TELA_NAO_LOCALIZADA';
                retorno.casoDeUsoAtual = String(window.casoDeUso || '');
                retorno.temFormAceite = Boolean(localizarFormularioAceite());
                retorno.temBtnPesquisar = Boolean(document.querySelector('#btnPesquisar'));
                retorno.temBtnLimpar = Boolean(document.querySelector('#btnLimpar'));
              } else {
                // V2.26: quando voltamos do detalhe, o PCNet pode exibir apenas
                // o formulário do Ctrl+F1. Sem clicar em Pesquisar ainda não há
                // linhas nem controles de paginação. Inicializamos a listagem
                // completa antes de usar paginaPcnet.
                const preparoListaAceite = await garantirResultadosAceiteCarregados();
                retorno.preparoListaAceite = preparoListaAceite;

                telaLista = localizarTelaListaAceite() || telaLista;
                form = telaLista?.form || form;

                // 2) Primeiro tenta a linha JÁ PRESENTE no DOM.
                // Se ela já estiver visível, não tocamos em paginação nem filtros.
                let { linha } = localizarLinha();
                let campoBuscaRequisicao = localizarCampoBuscaRequisicao(form);
                let paginasPercorridas = 0;
                let pesquisaExataExecutada = false;
                let pesquisaExataFalhou = false;
                let navegacaoPagina = null;

                // V2.24 - FLUXO PRINCIPAL:
                // a página vem gravada no próprio item a partir da ordem original
                // do CSV completo. Portanto filtros/paginação local do Nexus não
                // alteram a página nativa que devemos abrir no PCNet.
                if (!linha) {
                  const paginaAtualAntesDaNavegacao = detectarPaginaAtualAceite();

                  // V2.25: navega para a página nativa alvo inclusive ao VOLTAR
                  // para a página 1. Isso é necessário porque o PCNet preserva
                  // #iniAnt após abrir uma requisição de páginas posteriores.
                  if (paginaAtualAntesDaNavegacao !== paginaPcnet) {
                    navegacaoPagina = await navegarParaPaginaAceite(paginaPcnet);

                    if (navegacaoPagina?.ok) {
                      linha = await aguardar(() => localizarLinha().linha, 5000, 120);
                    }
                  } else {
                    navegacaoPagina = {
                      ok: true,
                      paginaAlvo: paginaPcnet,
                      paginaInicialDetectada: paginaAtualAntesDaNavegacao,
                      paginaFinalDetectada: paginaAtualAntesDaNavegacao,
                      metodo: 'pagina_nativa_ja_alvo'
                    };
                  }
                }

                // 3) Fallback por pesquisa EXATA do nº da requisição.
                // Só é usado quando a ida à paginaPcnet não localizou a linha.
                if (!linha && campoBuscaRequisicao) {
                  const limpar = document.querySelector('#btnLimpar');

                  if (limpar) {
                    try { limpar.click(); } catch (_) {}
                    await aguardarAjaxParado(8000);
                    await sleepLocal(180);

                    telaLista = localizarTelaListaAceite() || telaLista;
                    form = telaLista?.form || localizarFormularioAceite() || form;
                    campoBuscaRequisicao = localizarCampoBuscaRequisicao(form)
                      || campoBuscaRequisicao;
                  }

                  setValor(campoBuscaRequisicao, requisicao);

                  const pesquisar = document.querySelector('#btnPesquisar');
                  if (pesquisar) {
                    try { pesquisar.click(); } catch (_) {}
                    pesquisaExataExecutada = true;
                    await aguardarAjaxParado(15000);
                    await sleepLocal(220);
                  }

                  linha = await aguardar(() => localizarLinha().linha, 9000, 150);
                  pesquisaExataFalhou = Boolean(pesquisaExataExecutada && !linha);
                }

                // Se a pesquisa exata falhou, restaura a listagem antes do último
                // fallback. Nenhum filtro parcial fica preso no PCNet.
                if (!linha && pesquisaExataFalhou) {
                  const limparNovamente = document.querySelector('#btnLimpar');
                  if (limparNovamente) {
                    try { limparNovamente.click(); } catch (_) {}
                    await aguardarAjaxParado(8000);
                    await sleepLocal(180);
                  }

                  const pesquisarNovamente = document.querySelector('#btnPesquisar');
                  if (pesquisarNovamente) {
                    try { pesquisarNovamente.click(); } catch (_) {}
                    await aguardarAjaxParado(15000);
                    await sleepLocal(220);
                  }
                }

                // 4) Compatibilidade final: paginação sequencial somente-leitura.
                // Em operação normal a V2.24 deve chegar aqui raramente, porque já
                // possui a paginaPcnet exata no item.
                if (!linha && !paginaPcnetInformada) {
                  const percorrido = await localizarLinhaPercorrendoPaginacao(12);
                  linha = percorrido?.linha || null;
                  paginasPercorridas = percorrido?.paginasPercorridas ?? 0;
                }

                retorno.campoBuscaRequisicao = campoBuscaRequisicao ? {
                  id: campoBuscaRequisicao.id || '',
                  name: campoBuscaRequisicao.name || '',
                  placeholder: campoBuscaRequisicao.placeholder || ''
                } : null;

                retorno.pesquisaRequisicao = {
                  paginaPcnetInformada,
                  paginaPcnet,
                  indicePcnet,
                  posicaoPcnet,
                  navegacaoPagina,
                  pesquisaExataExecutada,
                  pesquisaExataFalhou,
                  paginasPercorridas,
                  casoDeUso: String(window.casoDeUso || '')
                };

                if (!linha) {
                  retorno.codigo = 'REQUISICAO_NAO_LOCALIZADA_NA_TELA';
                  retorno.requisicao = requisicao;
                  retorno.inputsDisponiveis = Array.from(form.querySelectorAll('input'))
                    .map(el => ({
                      id: el.id || '',
                      name: el.name || '',
                      type: el.type || '',
                      value: String(el.value || '').slice(0, 200),
                      title: String(el.title || '').slice(0, 200),
                      placeholder: String(el.placeholder || '').slice(0, 200)
                    }))
                    .slice(0, 100);

                  retorno.controlesPaginacao = Array.from(
                    (document.getElementById('AJAX') || document).querySelectorAll(
                      'a,button,input[type="button"],input[type="submit"],input[type="image"],img,span,td,[onclick]'
                    )
                  )
                    .map(el => ({
                      tag: String(el.tagName || ''),
                      id: el.id || '',
                      name: el.name || '',
                      texto: norm(el.value || el.innerText || el.textContent || '').slice(0, 200),
                      title: String(el.title || '').slice(0, 200),
                      href: String(el.getAttribute?.('href') || '').slice(0, 500),
                      onclick: String(el.getAttribute?.('onclick') || '').slice(0, 800)
                    }))
                    .filter(x => {
                      const meta = norm([x.id, x.name, x.texto, x.title, x.href, x.onclick].join(' '));
                      return /p[aá]gin|prox|next|seguinte|avan[cç]ar|pager|page|^(?:>|>>|»|›|→)$|^\d+$/i.test(meta);
                    })
                    .slice(0, 80);
                } else {
                  // 3) Identifica o controle nativo de abertura.
                  const todasLinhas = Array.from(
                    (document.getElementById('AJAX') || document).querySelectorAll('tr')
                  );
                  const celulas = Array.from(linha.querySelectorAll('td'));
                  const abrirFato = Array.from(linha.querySelectorAll('[onclick]')).find(el =>
                    /\babrirFato\s*\(/i.test(String(el.getAttribute('onclick') || ''))
                  ) || null;

                  retorno.coordenadas = {
                    indiceLinha: todasLinhas.indexOf(linha),
                    requisicao,
                    celulas: celulas.map((td, indice) => ({
                      indice,
                      texto: norm(td.innerText || td.textContent || '').slice(0, 1000),
                      onclick: String(td.getAttribute('onclick') || '').slice(0, 1400)
                    })),
                    clicaveis: Array.from(linha.querySelectorAll('a,button,input[type="button"],input[type="submit"],[onclick]'))
                      .map((el, indice) => ({
                        indice,
                        ...resumirControle(el)
                      }))
                      .slice(0, 40)
                  };

                  if (!abrirFato) {
                    retorno.codigo = 'CONTROLE_ABRIR_REQUISICAO_NAO_IDENTIFICADO';
                    retorno.requisicao = requisicao;
                  } else {
                    // 4) Abre a requisição pelo onclick já existente no PCNet.
                    const casoAntes = String(window.casoDeUso || '');
                    const formAntes = localizarFormularioAceite();
                    try {
                      abrirFato.click();
                    } catch (e) {
                      retorno.codigo = 'CLICK_DETALHE_FALHOU';
                      retorno.erroClick = String(e?.message || e || '').slice(0, 800);
                    }

                    if (retorno.codigo !== 'CLICK_DETALHE_FALHOU') {
                      const detalheAberto = await aguardar(() => {
                        const casoAgora = String(window.casoDeUso || '');
                        const formAgora = localizarFormularioAceite();
                        const raizAgora = document.getElementById('AJAX') || document.body;
                        const textoAgora = norm(raizAgora?.innerText || raizAgora?.textContent || '');
                        const mudouCaso = Boolean(casoAgora && casoAgora !== casoAntes);
                        const saiuDaLista = Boolean(formAntes && !formAgora);
                        const linhaSaiu = !document.contains(linha);
                        const aindaTemNumero = textoAgora.includes(requisicao)
                          || textoAgora.includes(requisicao.replace(/\D/g, ''));
                        return aindaTemNumero && (mudouCaso || saiuDaLista || linhaSaiu)
                          ? { casoAgora, raizAgora, textoAgora }
                          : null;
                      }, 15000, 150);

                      if (!detalheAberto) {
                        retorno.codigo = 'DETALHE_REQUISICAO_NAO_ABRIU';
                        retorno.requisicao = requisicao;
                        retorno.casoDeUsoDepois = String(window.casoDeUso || '');
                      } else {
                        // 5) Extrai os dados básicos.
                        const raiz = detalheAberto.raizAgora
                          || document.getElementById('AJAX')
                          || document.body;
                        const campos = [];

                        for (const label of Array.from(raiz.querySelectorAll('label'))) {
                          const nome = norm(label.innerText || label.textContent || '');
                          if (!nome) continue;
                          let controle = null;
                          const forId = label.getAttribute('for');
                          if (forId) controle = document.getElementById(forId);
                          if (!controle) {
                            controle = label.parentElement?.querySelector(
                              'input:not([type="button"]):not([type="submit"]),select,textarea'
                            ) || null;
                          }
                          if (controle) {
                            const valor = valorControle(controle);
                            if (valor) campos.push({
                              nome: nome.replace(/:\s*$/, ''),
                              valor,
                              id: controle.id || '',
                              name: controle.name || ''
                            });
                          }
                        }

                        const linhasTabela = Array.from(raiz.querySelectorAll('tr'))
                          .map(tr => Array.from(tr.querySelectorAll(':scope > th,:scope > td'))
                            .map(td => norm(td.innerText || td.textContent || ''))
                            .filter(Boolean))
                          .filter(cols => cols.length > 0);

                        const paresTabela = [];
                        for (const cols of linhasTabela) {
                          if (cols.length >= 2 && cols[0] && cols[1]) {
                            paresTabela.push({
                              nome: cols[0].replace(/:\s*$/, '').slice(0, 500),
                              valor: cols.slice(1).join(' | ').slice(0, 3000)
                            });
                          }
                        }

                        const controles = Array.from(raiz.querySelectorAll(
                          'input:not([type="hidden"]):not([type="button"]):not([type="submit"]),select,textarea'
                        ))
                          .map(el => ({
                            id: el.id || '',
                            name: el.name || '',
                            valor: valorControle(el)
                          }))
                          .filter(x => Boolean(x.valor));

                        const secoes = Array.from(raiz.querySelectorAll('fieldset'))
                          .map(fieldset => ({
                            titulo: norm(fieldset.querySelector('legend')?.innerText
                              || fieldset.querySelector('legend')?.textContent || ''),
                            texto: norm(fieldset.innerText || fieldset.textContent || '').slice(0, 6000)
                          }))
                          .filter(x => x.titulo || x.texto);

                        // 6) Documentos anexados: seletores reais confirmados no PCNet.
                        const inputsNomeArquivo = Array.from(raiz.querySelectorAll(
                          'input[name^="listaAnexoFaep_Det["][name$=".nomeArquivo"],input[id^="listaAnexoFaep_Det["][id$=".nomeArquivo"]'
                        ));
                        const botoesBaixarGlobais = Array.from(raiz.querySelectorAll(
                          'input[type="button"][value="Baixar"][onclick*="idArquivoAnexadoPlc"],button[onclick*="idArquivoAnexadoPlc"],a[onclick*="idArquivoAnexadoPlc"]'
                        ));

                        const documentos = inputsNomeArquivo
                          .map((inputNome, indice) => {
                            const nome = norm(inputNome.value || inputNome.textContent || '');
                            if (!nome) return null;
                            const tr = inputNome.closest('tr');
                            let botao = tr?.querySelector(
                              'input[type="button"][value="Baixar"][onclick*="idArquivoAnexadoPlc"],button[onclick*="idArquivoAnexadoPlc"],a[onclick*="idArquivoAnexadoPlc"]'
                            ) || null;
                            if (!botao && botoesBaixarGlobais.length === inputsNomeArquivo.length) {
                              botao = botoesBaixarGlobais[indice] || null;
                            }
                            if (!botao && inputsNomeArquivo.length === 1 && botoesBaixarGlobais.length === 1) {
                              botao = botoesBaixarGlobais[0];
                            }

                            const onclick = String(botao?.getAttribute?.('onclick') || '');
                            const idMatch = decodificarAmp(onclick).match(/idArquivoAnexadoPlc=(\d+)/i);
                            const idArquivoAnexadoPlc = idMatch ? idMatch[1] : '';
                            const urlBaixar = extrairRotaDownload(onclick);

                            return {
                              nome,
                              idArquivoAnexadoPlc: idArquivoAnexadoPlc || null,
                              urlBaixar: urlBaixar || null,
                              podeBaixar: Boolean(idArquivoAnexadoPlc),
                              controleBaixar: resumirControle(botao)
                            };
                          })
                          .filter(Boolean);

                        // 7) Ocorrências: captura a lupa real e a rota visualizarBOSemCC.
                        const anchorsBo = Array.from(raiz.querySelectorAll('a[onclick*="visualizarBOSemCC"],[onclick*="visualizarBOSemCC"]'));
                        const ocorrenciasMap = new Map();

                        for (const controle of anchorsBo) {
                          const onclick = decodificarAmp(controle.getAttribute?.('onclick') || '');
                          const rotaVisualizacao = extrairRotaBo(onclick);
                          const numeroMatch = onclick.match(/numeroReds=([^&"')\s]+)/i);
                          const numero = numeroMatch
                            ? decodeURIComponent(numeroMatch[1])
                            : '';
                          if (!numero) continue;

                          const tr = controle.closest('tr');
                          const celulas = Array.from(tr?.querySelectorAll('td') || []);
                          const textos = celulas.map(td => norm(td.innerText || td.textContent || ''));
                          const indiceNumero = textos.findIndex(v => v.includes(numero));
                          let natureza = '';
                          if (indiceNumero >= 0) {
                            natureza = textos.slice(indiceNumero + 1).find(v =>
                              v
                              && !v.includes(numero)
                              && !/^\d+[.]?$/.test(v)
                              && !/natureza\s+da\s+ocorr[eê]ncia/i.test(v)
                            ) || '';
                          }

                          ocorrenciasMap.set(numero, {
                            numero,
                            natureza,
                            rotaVisualizacao: rotaVisualizacao || null,
                            podeVisualizar: Boolean(rotaVisualizacao),
                            controleLupa: resumirControle(controle)
                          });
                        }

                        // Fallback: ao menos lista os REDS presentes na tabela.
                        const regexReds = /\b\d{4}-\d{8,10}-\d{3}\b/;
                        for (const tr of Array.from(raiz.querySelectorAll('tr'))) {
                          const texto = norm(tr.innerText || tr.textContent || '');
                          const numero = texto.match(regexReds)?.[0] || '';
                          if (!numero || ocorrenciasMap.has(numero)) continue;
                          const textos = Array.from(tr.querySelectorAll('td'))
                            .map(td => norm(td.innerText || td.textContent || ''));
                          const indiceNumero = textos.findIndex(v => v.includes(numero));
                          const natureza = indiceNumero >= 0
                            ? (textos.slice(indiceNumero + 1).find(v =>
                                v
                                && !v.includes(numero)
                                && !/^\d+[.]?$/.test(v)
                                && !/natureza\s+da\s+ocorr[eê]ncia/i.test(v)
                              ) || '')
                            : '';
                          ocorrenciasMap.set(numero, {
                            numero,
                            natureza,
                            rotaVisualizacao: null,
                            podeVisualizar: false,
                            controleLupa: null
                          });
                        }

                        const ocorrencias = [...ocorrenciasMap.values()];

                        retorno.ok = true;
                        retorno.codigo = 'DETALHE_REQUISICAO_LIDO';
                        retorno.metodo = 'main_world_pcnet_detalhe_readonly_v224';
                        retorno.requisicao = requisicao;
                        retorno.capturaDocumentos = {
                          quantidade: documentos.length,
                          comDownload: documentos.filter(x => x.podeBaixar).length
                        };
                        retorno.capturaOcorrencias = {
                          quantidade: ocorrencias.length,
                          comBo: ocorrencias.filter(x => x.podeVisualizar).length
                        };
                        retorno.detalhes = {
                          requisicao,
                          paginaPcnet,
                          indicePcnet,
                          posicaoPcnet,
                          casoDeUso: String(window.casoDeUso || ''),
                          titulo: document.title || '',
                          campos,
                          paresTabela,
                          controles,
                          secoes,
                          documentos,
                          ocorrencias,
                          linhasTabela: linhasTabela.slice(0, 250),
                          texto: norm(raiz.innerText || raiz.textContent || '').slice(0, 30000)
                        };
                      }
                    }
                  }
                }
              }
            }

          } else if (op === 'EXECUTE_ACCEPTANCE_ACTION') {
            /*
             * =========================================================
             * V2.20 - AÇÕES NATIVAS DA REQUISIÇÃO
             * =========================================================
             * Executa SOMENTE o botão nativo exato da ação solicitada.
             * DEVOLVER exige justificativa e confirma o valor no DOM
             * antes do clique. Nenhum fallback escolhe botão "parecido".
             */
            const dados = arg && typeof arg === 'object' ? arg : {};
            const requisicao = norm(
              dados.requisicao
              ?? dados.numeroRequisicao
              ?? dados.numero_requisicao
              ?? ''
            );
            const requisicaoCanon = canon(requisicao);
            const acao = String(dados.acao || '').trim().toUpperCase();
            const justificativa = String(dados.justificativa || '').trim();

            /*
             * V2.21: controles reais confirmados no HTML do PCNet.
             * Não procuramos mais apenas pelo texto do botão.
             */
            const configuracoes = {
              RECEBER: {
                nome: 'Receber',
                id: 'receber',
                name: 'receber',
                value: 'Receber',
                evento: 'receberFato'
              },
              ACEITAR: {
                nome: 'Aceitar',
                id: 'aceitar',
                name: 'aceitar',
                value: 'Aceitar',
                evento: 'aceitarFato'
              },
              AGUARDAR_MATERIAL: {
                nome: 'Aguardar material',
                id: 'aguardarmaterial',
                name: 'aguardarmaterial',
                value: 'Aguardar Material',
                evento: 'aguardarMaterialFato'
              },
              DEVOLVER: {
                nome: 'Devolver',
                id: 'devolver',
                name: 'devolver',
                value: 'Devolver',
                evento: 'devolverFato'
              }
            };
            const config = configuracoes[acao] || null;

            if (!requisicaoCanon) {
              retorno.codigo = 'REQUISICAO_VAZIA';
            } else if (!config) {
              retorno.codigo = 'ACAO_ACEITE_INVALIDA';
            } else if (acao === 'DEVOLVER' && !justificativa) {
              retorno.codigo = 'JUSTIFICATIVA_OBRIGATORIA';
            } else {
              const raiz = document.getElementById('AJAX') || document.body;
              const textoAntes = norm(raiz?.innerText || raiz?.textContent || '');

              const requisicaoVisivel =
                textoAntes.includes(requisicao)
                || Array.from(raiz.querySelectorAll('input,textarea'))
                  .some(el => canon(el.value || '') === requisicaoCanon);

              const telaAcoes = /a[cç][oõ]es\s+da\s+requisi[cç][aã]o/i.test(textoAntes);

              if (!requisicaoVisivel || !telaAcoes) {
                retorno.codigo = 'DETALHE_ACEITE_NAO_ESTA_ABERTO';
                retorno.requisicao = requisicao;
                retorno.casoDeUso = String(window.casoDeUso || '');
              } else {
                const controles = Array.from(
                  raiz.querySelectorAll(
                    'input[type="button"],input[type="submit"],button,a[onclick]'
                  )
                );

                const resumirBotao = (el) => ({
                  tag: String(el.tagName || ''),
                  id: el.id || '',
                  name: el.name || '',
                  texto: norm(el.value || el.innerText || el.textContent || ''),
                  onclick: String(el.getAttribute?.('onclick') || '').slice(0, 1600),
                  disabled: Boolean(el.disabled),
                  display: el ? String(getComputedStyle(el).display || '') : ''
                });

                retorno.acoesEncontradas = controles
                  .map(resumirBotao)
                  .filter(x => /receber|aceitar|aguardar|devolver/i.test(
                    `${x.id} ${x.name} ${x.texto} ${x.onclick}`
                  ));

                const botao = raiz.querySelector(`#${config.id}`);
                const onclickBotao = String(botao?.getAttribute?.('onclick') || '');
                const valorBotao = norm(botao?.value || botao?.innerText || botao?.textContent || '');
                const eventoEscapado = String(config.evento).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regexEvento = new RegExp(
                  `plcAjax\\.ajaxSubmit\\(\\s*['"]POST['"]\\s*,\\s*['"]${eventoEscapado}['"]\\s*\\)`,
                  'i'
                );

                const botaoValido = Boolean(
                  botao
                  && String(botao.name || '') === config.name
                  && valorBotao.toLowerCase() === config.value.toLowerCase()
                  && regexEvento.test(onclickBotao)
                );

                const botaoDisponivel = Boolean(
                  botaoValido
                  && !botao.disabled
                  && getComputedStyle(botao).display !== 'none'
                  && getComputedStyle(botao).visibility !== 'hidden'
                );

                retorno.botaoEsperado = {
                  id: config.id,
                  name: config.name,
                  value: config.value,
                  evento: config.evento
                };

                if (!botaoValido) {
                  retorno.codigo = 'ACAO_ACEITE_CONTROLE_NATIVO_NAO_CONFIRMADO';
                  retorno.acao = acao;
                  retorno.requisicao = requisicao;
                  retorno.botaoEncontrado = botao ? resumirBotao(botao) : null;
                } else if (!botaoDisponivel) {
                  retorno.codigo = 'ACAO_ACEITE_NAO_DISPONIVEL';
                  retorno.acao = acao;
                  retorno.requisicao = requisicao;
                  retorno.botaoEncontrado = resumirBotao(botao);
                } else {
                  retorno.botaoSelecionado = resumirBotao(botao);

                  let campoJustificativa = null;

                  if (acao === 'DEVOLVER') {
                    campoJustificativa = Array.from(
                      raiz.querySelectorAll('textarea,input[type="text"]')
                    ).find(el => {
                      const meta = norm([
                        el.id,
                        el.name,
                        el.title,
                        el.placeholder
                      ].filter(Boolean).join(' '));
                      return /justificativa/i.test(meta);
                    }) || null;

                    if (!campoJustificativa) {
                      const rotulo = Array.from(
                        raiz.querySelectorAll('label,td,th,span,div')
                      ).find(el => /^justificativa\s*:?\s*$/i.test(
                        norm(el.innerText || el.textContent || '')
                      ));

                      if (rotulo) {
                        const linhaRotulo = rotulo.closest('tr');
                        campoJustificativa =
                          linhaRotulo?.querySelector('textarea,input[type="text"]')
                          || linhaRotulo?.nextElementSibling?.querySelector?.('textarea,input[type="text"]')
                          || rotulo.parentElement?.querySelector('textarea,input[type="text"]')
                          || null;
                      }
                    }

                    if (!campoJustificativa) {
                      const textareas = Array.from(raiz.querySelectorAll('textarea'));
                      if (textareas.length === 1) campoJustificativa = textareas[0];
                    }

                    if (!campoJustificativa) {
                      retorno.codigo = 'CAMPO_JUSTIFICATIVA_NAO_ENCONTRADO';
                      retorno.justificativaLocalizada = false;
                    } else {
                      setValor(campoJustificativa, justificativa);
                      try {
                        if (typeof window.campoAlterado === 'function') window.campoAlterado();
                      } catch (_) {}

                      retorno.justificativaLocalizada = true;
                      retorno.campoJustificativa = {
                        id: campoJustificativa.id || '',
                        name: campoJustificativa.name || '',
                        valor: String(campoJustificativa.value || '')
                      };

                      if (String(campoJustificativa.value || '').trim() !== justificativa) {
                        retorno.codigo = 'JUSTIFICATIVA_NAO_CONFIRMADA_NO_DOM';
                      }
                    }
                  }

                  if (!retorno.codigo) {
                    const errosAntes = new Set(
                      Array.from(document.querySelectorAll('.msg_erro'))
                        .map(el => norm(el.innerText || el.textContent || ''))
                        .filter(Boolean)
                    );
                    const sucessosAntes = new Set(
                      Array.from(document.querySelectorAll('.msg_sucesso'))
                        .map(el => norm(el.innerText || el.textContent || ''))
                        .filter(Boolean)
                    );

                    const alertas = [];
                    const confirmacoes = [];
                    const alertOriginal = window.alert;
                    const confirmOriginal = window.confirm;

                    window.alert = function (mensagem) {
                      alertas.push(norm(mensagem));
                    };
                    window.confirm = function (mensagem) {
                      confirmacoes.push(norm(mensagem));
                      return true;
                    };

                    try {
                      botao.click();
                      retorno.acaoDisparada = true;

                      const inicioEspera = Date.now();
                      const limite = inicioEspera + 18000;
                      let viuAjaxAtivo = false;

                      while (Date.now() < limite) {
                        let ativo = false;
                        try { ativo = Boolean(window.AJAX?.AJAX_ATIVO); } catch (_) {}
                        if (ativo) viuAjaxAtivo = true;
                        if (viuAjaxAtivo && !ativo) break;

                        if (!ativo && Date.now() - inicioEspera > 1800) {
                          const textoAgora = norm(
                            document.getElementById('AJAX')?.innerText
                            || document.getElementById('AJAX')?.textContent
                            || ''
                          );
                          if (textoAgora !== textoAntes) break;
                        }
                        await sleepLocal(120);
                      }
                    } catch (e) {
                      retorno.codigo = 'CLICK_ACAO_ACEITE_FALHOU';
                      retorno.erroClick = String(e?.message || e || '').slice(0, 1000);
                    } finally {
                      window.alert = alertOriginal;
                      window.confirm = confirmOriginal;
                    }

                    retorno.alertas = alertas;
                    retorno.confirmacoes = confirmacoes;

                    if (retorno.acaoDisparada && retorno.codigo !== 'CLICK_ACAO_ACEITE_FALHOU') {
                      const errosDepois = Array.from(document.querySelectorAll('.msg_erro'))
                        .map(el => norm(el.innerText || el.textContent || ''))
                        .filter(Boolean);
                      const sucessosDepois = Array.from(document.querySelectorAll('.msg_sucesso'))
                        .map(el => norm(el.innerText || el.textContent || ''))
                        .filter(Boolean);

                      const novoErro =
                        errosDepois.find(msg => !errosAntes.has(msg))
                        || alertas.find(msg => /erro|falha|obrigat|inv[aá]lid|n[aã]o\s+foi\s+poss[ií]vel|informe/i.test(msg))
                        || '';

                      const novoSucesso =
                        sucessosDepois.find(msg => !sucessosAntes.has(msg))
                        || alertas.find(msg => /sucesso|realizad|efetuad|conclu[ií]d/i.test(msg))
                        || '';

                      if (novoErro) {
                        retorno.codigo = 'PCNET_RECUSOU_ACAO_ACEITE';
                        retorno.mensagemSistema = novoErro;
                      } else {
                        const raizDepois = document.getElementById('AJAX') || document.body;
                        const textoDepois = norm(raizDepois?.innerText || raizDepois?.textContent || '');
                        const aindaNaMesmaTela =
                          textoDepois.includes(requisicao)
                          && /a[cç][oõ]es\s+da\s+requisi[cç][aã]o/i.test(textoDepois);
                        const voltouLista = Boolean(
                          document.querySelector('form[name="aceitefatolaudosForm"]')
                          && !/a[cç][oõ]es\s+da\s+requisi[cç][aã]o/i.test(textoDepois)
                        );

                        if (novoSucesso || voltouLista || !aindaNaMesmaTela) {
                          retorno.ok = true;
                          retorno.codigo = 'ACAO_ACEITE_CONFIRMADA';
                          retorno.acao = acao;
                          retorno.acaoNome = config.nome;
                          retorno.requisicao = requisicao;
                          retorno.mensagemSistema = novoSucesso || null;
                          retorno.metodo = 'botao_nativo_pcnet_v221';
                        } else {
                          retorno.codigo = 'ACAO_ACEITE_DISPARADA_SEM_CONFIRMACAO';
                          retorno.acao = acao;
                          retorno.requisicao = requisicao;
                        }
                      }
                    }
                  }
                }
              }
            }


          } else if (op === 'LIST_ACCEPTANCE_READONLY') {
            // V2.16: consulta somente leitura da caixa de Aceite diretamente no
            // MAIN world do PCNet. Isso permite reutilizar as funcoes nativas
            // onChangeMenu/carregarMenu/plcAjax, evitando o isolamento do
            // content-script ao navegar pelo Menu Rapido.
            const localizarFormularioAceite = () =>
              document.querySelector('form[name="aceitefatolaudosForm"]');

            /*
             * V2.21: o mesmo form pode permanecer no DOM depois de uma ação
             * (ex.: aguardarMaterialFato), enquanto o conteúdo do detalhe já foi
             * descarregado. Portanto a existência do form, sozinha, NÃO significa
             * que estamos na tela de listagem. A lista só é considerada pronta
             * quando o caso de uso/controles de pesquisa correspondem ao SEL.
             */
            const localizarTelaListaAceite = () => {
              const form = localizarFormularioAceite();
              const btnPesquisar = document.querySelector('#btnPesquisar');
              if (!form || !btnPesquisar) return null;

              const caso = String(window.casoDeUso || '');
              const ehCasoLista = /\/LAUDOSPERICIAIS\/aceitefatolaudossel\.do/i.test(caso);
              const temLimpar = Boolean(document.querySelector('#btnLimpar'));
              const temCampoLista = Boolean(
                form.querySelector('input[id^="itensPlc["][id$=".flagAceita"]')
                || form.querySelector('input[name*="requis" i],input[id*="requis" i]')
              );

              return (ehCasoLista || (temLimpar && temCampoLista))
                ? { form, btnPesquisar, caso }
                : null;
            };

            const aguardarAjaxParado = async (timeout = 12000) => {
              // Da um instante para o PLC Ajax efetivamente iniciar.
              await sleepLocal(180);
              const limite = Date.now() + timeout;
              while (Date.now() < limite) {
                let ativo = false;
                try { ativo = Boolean(window.AJAX?.AJAX_ATIVO); } catch (_) {}
                if (!ativo) return true;
                await sleepLocal(120);
              }
              return false;
            };

            let telaLista = localizarTelaListaAceite();
            let form = telaLista?.form || null;

            if (!telaLista) {
              // V2.16 FIX3: abrir diretamente o caso de uso real do Aceite.
              // O Menu Rápido (carregaMenu=2103) carrega apenas a estrutura/menu
              // do módulo e, dependendo do estado atual do shell legado, pode não
              // chegar ao formulário aceitefatolaudosForm. O atalho Ctrl+F1 do
              // próprio PCNet termina neste caso de uso; por isso reproduzimos o
              // redirecionamento AJAX nativo diretamente no shell já autenticado.
              const rotaAceite =
                '/LAUDOSPERICIAIS/aceitefatolaudossel.do?evento=F9-Pesquisar';

              let navegacaoDisparada = false;

              try {
                if (typeof window.redirectajaxPCnet === 'function') {
                  window.redirectajaxPCnet(rotaAceite);
                  navegacaoDisparada = true;
                  retorno.metodoAbertura = 'redirectajaxPCnet_rota_direta';
                } else if (
                  typeof window.ajaxPCnet === 'function'
                  && document.getElementById('AJAX')
                ) {
                  window.ajaxPCnet(rotaAceite, 'AJAX');
                  navegacaoDisparada = true;
                  retorno.metodoAbertura = 'ajaxPCnet_rota_direta';
                }
              } catch (e) {
                retorno.erroAberturaDireta = String(e?.message || e || '').slice(0, 500);
              }

              if (!navegacaoDisparada) {
                retorno.codigo = 'ACEITE_NAVEGACAO_NATIVA_INDISPONIVEL';
              } else {
                telaLista = await aguardar(
                  () => localizarTelaListaAceite(),
                  22000,
                  150
                );
                form = telaLista?.form || null;

                if (!telaLista || !form) {
                  retorno.codigo = 'ACEITE_TELA_TIMEOUT_ROTA_DIRETA';
                  retorno.urlAtual = String(location.href || '').slice(0, 800);
                  retorno.temDivAjax = Boolean(document.getElementById('AJAX'));
                  retorno.temMenuRapido = Boolean(document.getElementById('menuRapido'));
                }
              }
            }

            if (telaLista && form) {
              // Limpar e pesquisar alteram apenas os filtros da tela. Nenhuma
              // requisicao e aceita/recebida/devolvida nesta operacao.
              let btnLimpar = document.querySelector('#btnLimpar');
              if (btnLimpar) {
                try { btnLimpar.click(); } catch (_) {}
                await aguardarAjaxParado(8000);
                await sleepLocal(180);
              }

              telaLista = localizarTelaListaAceite();
              form = telaLista?.form || null;
              let btnPesquisar = telaLista?.btnPesquisar || document.querySelector('#btnPesquisar');

              if (!telaLista || !form || !btnPesquisar) {
                retorno.codigo = 'ACEITE_PESQUISAR_NAO_ENCONTRADO';
              } else {
                try { btnPesquisar.click(); } catch (_) {}
                await aguardarAjaxParado(15000);

                // Espera o DOM refletir a resposta da pesquisa. A caixa pode
                // estar vazia, por isso aceitamos tanto linhas quanto o texto
                // de total/nenhum resultado.
                await aguardar(() => {
                  if (document.querySelector('input[id^="itensPlc["][id$=".flagAceita"]')) {
                    return true;
                  }
                  const t = norm(document.body?.innerText || '');
                  return /um\s+total\s*:\s*de\s+\d+/i.test(t)
                    || /nenhum\s+(?:registro|resultado)/i.test(t);
                }, 9000, 150);

                const response = await fetch(
                  '/LAUDOSPERICIAIS/aceitefatolaudossel.do?evento=exportarCSV',
                  {
                    credentials: 'include',
                    cache: 'no-store'
                  }
                );

                if (!response.ok) {
                  retorno.codigo = 'CSV_ACEITE_HTTP_ERRO';
                  retorno.statusHttp = response.status;
                } else {
                  const tipo = String(response.headers.get('content-type') || '');
                  const buffer = await response.arrayBuffer();
                  const texto = new TextDecoder('windows-1252').decode(buffer);

                  if (!/N[ºo°]\s*Requisi[cç][aã]o/i.test(texto.slice(0, 300))) {
                    retorno.codigo = 'CSV_ACEITE_CONTEUDO_INESPERADO';
                    retorno.contentType = tipo;
                    retorno.inicio = texto.slice(0, 220);
                  } else {
                    const parseCsv = (conteudo, separador = ';') => {
                      const linhas = [];
                      let linha = [];
                      let campo = '';
                      let entreAspas = false;

                      for (let i = 0; i < conteudo.length; i += 1) {
                        const ch = conteudo[i];

                        if (ch === '"') {
                          if (entreAspas && conteudo[i + 1] === '"') {
                            campo += '"';
                            i += 1;
                          } else {
                            entreAspas = !entreAspas;
                          }
                          continue;
                        }

                        if (ch === separador && !entreAspas) {
                          linha.push(campo);
                          campo = '';
                          continue;
                        }

                        if ((ch === '\n' || ch === '\r') && !entreAspas) {
                          if (ch === '\r' && conteudo[i + 1] === '\n') i += 1;
                          linha.push(campo);
                          if (linha.some(v => String(v || '').trim() !== '')) {
                            linhas.push(linha);
                          }
                          linha = [];
                          campo = '';
                          continue;
                        }

                        campo += ch;
                      }

                      if (campo.length || linha.length) {
                        linha.push(campo);
                        if (linha.some(v => String(v || '').trim() !== '')) {
                          linhas.push(linha);
                        }
                      }

                      return linhas;
                    };

                    const linhas = parseCsv(String(texto || '').replace(/^\uFEFF/, ''), ';');
                    // V2.24: preserva a posição ORIGINAL da linha no resultado
                    // completo do PCNet. O Nexus pode filtrar/reordenar visualmente sem
                    // perder a página nativa em que a requisição está no PCNet.
                    const ITENS_POR_PAGINA_PCNET = 20;

                    const itens = linhas
                      .slice(1)
                      .filter(colunas => Boolean(String(colunas[0] || '').trim()))
                      .map((colunas, indiceOriginal) => ({
                        requisicao: String(colunas[0] || '').trim(),
                        procedimentoOrigem: String(colunas[1] || '').trim(),
                        situacao: String(colunas[2] || '').trim(),
                        tipo: String(colunas[3] || '').trim(),
                        natureza: String(colunas[4] || '').trim(),
                        unidadeOrigem: String(colunas[5] || '').trim(),
                        dataHora: String(colunas[6] || '').trim(),
                        especieExame: String(colunas[7] || '').trim(),
                        fav: String(colunas[8] || '').trim(),

                        // Metadados de paginação nativa (base 1 para página/posição).
                        indicePcnet: indiceOriginal,
                        paginaPcnet: Math.floor(indiceOriginal / ITENS_POR_PAGINA_PCNET) + 1,
                        posicaoPcnet: (indiceOriginal % ITENS_POR_PAGINA_PCNET) + 1
                      }));

                    retorno.ok = true;
                    retorno.codigo = 'ACEITE_LISTADO';
                    retorno.total = itens.length;
                    retorno.itens = itens;
                    retorno.atualizadoEm = Date.now();
                    retorno.contentType = tipo;
                    retorno.metodo = 'main_world_pcnet_nativo_csv_alert_guard';
                  }
                }
              }
            }
          } else if (op === 'SNAPSHOT_MENU') {
            retorno.ok = true;
            retorno.casoDeUso = String(window.casoDeUso || '');
            retorno.ajaxAtivo = Boolean(window.AJAX?.AJAX_ATIVO);
            retorno.menuItems = Array.from(document.querySelectorAll('#menuModulos [onclick]'))
              .map(x => ({
                texto: norm(x.innerText || x.textContent || ''),
                onclick: String(x.getAttribute('onclick') || '')
              }))
              .filter(x => x.texto || x.onclick)
              .slice(0, 80);
          }
        } catch (e) {
          retorno.ok = false;
          retorno.codigo = 'MAIN_WORLD_EXCEPTION';
          retorno.erro = String(e?.message || e || '').slice(0, 1000);
        }
        return retorno;
      },
      args: [operacao, argumento]
    });
  } catch (error) {
    return { ok: false, operacao, erro: String(error?.message || error || ''), resultados: [] };
  }

  const itens = (resultados || []).map(r => ({
    frameId: r.frameId,
    ...(r.result || {}),
    erroExecucao: r.error ? String(r.error?.message || r.error) : ''
  }));
  return {
    ok: itens.some(x => x.ok),
    operacao,
    resultados: itens,
    sucesso: itens.find(x => x.ok) || null
  };
}

async function aguardarBotaoNovoBemMaterial(tabId, timeoutMs = 14000) {
  const limite = Date.now() + timeoutMs;
  let ultimo = null;
  while (Date.now() < limite) {
    ultimo = await executarPcnetMainWorld(tabId, 'PROBE_NOVO_BEM');
    if (ultimo?.ok) return ultimo;
    await sleep(300);
  }
  return null;
}

async function abrirBensMateriaisMainWorld(tabId, visualCtx, timeoutMs = 18000) {
  await conterTodasAsSuperficiesPcnet(visualCtx).catch(() => {});
  const abertura = await executarPcnetMainWorld(tabId, 'OPEN_BENS');
  if (abertura?.ok) return { tabId, diagnosticoMenu: { mainWorld: abertura } };
  abrirBensMateriaisMainWorld.ultimoDiagnostico = { mainWorld: abertura };
  return null;
}

async function aguardarBensMateriaisNoTab(tabId, visualCtx, timeoutMs = 18000) {
  const resultado = await abrirBensMateriaisMainWorld(tabId, visualCtx, timeoutMs);
  if (!resultado) aguardarBensMateriaisNoTab.ultimoDiagnostico = abrirBensMateriaisMainWorld.ultimoDiagnostico;
  return resultado;
}

async function aguardarNovoBemMaterialNoTab(tabId, visualCtx, timeoutMs = 14000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    await conterTodasAsSuperficiesPcnet(visualCtx).catch(() => {});
    const probe = await executarPcnetMainWorld(tabId, 'PROBE_NOVO_FORM');
    if (probe?.ok) return { tabId, mainWorld: probe };
    await sleep(300);
  }
  return null;
}

async function capturarFavAmostraAposSalvar({ tabId, favOriginal, numeroLacre, favsAntes = [], visualCtx, timeoutMs = 14000 }) {
  const antes = new Set((favsAntes || []).map(v => String(v).trim()).filter(Boolean));
  const original = String(favOriginal || '').trim();
  const limite = Date.now() + timeoutMs;
  let ultimoErro = '';
  let ultimaMensagem = '';

  while (Date.now() < limite) {
    await conterTodasAsSuperficiesPcnet(visualCtx).catch(() => {});
    const tabs = await tabsPcnetRelacionadas(visualCtx);
    const ordenadas = [tabId, ...tabs.map(t => t.id).filter(id => id !== tabId)];
    const candidatos = new Set();

    for (const id of ordenadas) {
      const probes = await sondarTab(id).catch(() => []);
      for (const probe of probes) {
        const r = await enviarAoFrame(id, probe.frameId, 'READ_SAMPLE_RESULT', { numeroLacre });
        if (!r) continue;
        if (id === tabId && r.mensagemSistema) ultimoErro = r.mensagemSistema;
        if (id === tabId && r.mensagemSucesso) ultimaMensagem = r.mensagemSucesso;
        if (id === tabId && r.favPorIdentificador && String(r.favPorIdentificador).trim() !== original) {
          return { favAmostra: String(r.favPorIdentificador).trim(), mensagemSistema: ultimaMensagem || null, metodo: 'identificador_unico' };
        }
        if (r.favPorLacre && String(r.favPorLacre).trim() !== original) {
          return { favAmostra: String(r.favPorLacre).trim(), mensagemSistema: ultimaMensagem || null, metodo: 'linha_por_lacre' };
        }
        if (id === tabId) {
          for (const fav of (r.favs || [])) {
            const valor = String(fav || '').trim();
            if (!valor || valor === original || antes.has(valor)) continue;
            candidatos.add(valor);
          }
        }
      }
    }

    if (ultimoErro) {
      const erro = new Error(`O PCNet recusou a criação da FAV da amostra: ${ultimoErro}`);
      erro.codigo = 'PCNET_RECUSOU_CRIACAO_AMOSTRA';
      throw erro;
    }
    if (candidatos.size === 1) {
      return { favAmostra: [...candidatos][0], mensagemSistema: ultimaMensagem || null, metodo: 'diferenca_favs' };
    }
    if (candidatos.size > 1) {
      const erro = new Error(`O Bem Material parece ter sido salvo, mas encontrei mais de uma FAV nova possível (${[...candidatos].join(', ')}). Para evitar criar duplicidade, o Nexus não repetirá a criação automaticamente.`);
      erro.codigo = 'FAV_AMOSTRA_CAPTURA_AMBIGUA';
      throw erro;
    }
    await sleep(350);
  }
  return { favAmostra: null, mensagemSistema: ultimaMensagem || null, metodo: null };
}

async function criarFavAmostra(payload = {}, sender = null) {
  const numeroLaudo = String(payload?.numeroLaudo ?? payload?.numero_laudo ?? '').trim();
  const favOriginal = String(payload?.favOriginal ?? payload?.fav_original ?? payload?.numeroFav ?? '').trim();
  const numeroLacre = String(payload?.numeroLacre ?? payload?.numero_lacre ?? payload?.envelopeAmostra ?? '').trim();
  const unidadeUsuario = String(payload?.unidadeUsuario ?? payload?.unidade_usuario ?? payload?.unidade ?? '').trim();
  if (!numeroLaudo) { const e = new Error('Informe o número do laudo no PCNet para criar a FAV da amostra.'); e.codigo = 'NUMERO_LAUDO_OBRIGATORIO'; throw e; }
  if (!favOriginal) { const e = new Error('Informe a FAV original antes de criar a FAV da amostra.'); e.codigo = 'FAV_ORIGINAL_OBRIGATORIA'; throw e; }
  if (!numeroLacre) { const e = new Error('Informe o lacre/envelope da amostra antes de criar a nova FAV.'); e.codigo = 'LACRE_AMOSTRA_OBRIGATORIO'; throw e; }
  if (!unidadeUsuario) { const e = new Error('A unidade cadastrada do usuário é obrigatória para registrar automaticamente a Coleta da nova FAV.'); e.codigo = 'UNIDADE_USUARIO_OBRIGATORIA'; throw e; }

  const assinatura = `${numeroLaudo}|${favOriginal}|${numeroLacre}`;
  const salvo = await browser.storage.local.get(LAST_SAMPLE_KEY).catch(() => ({}));
  const anterior = salvo?.[LAST_SAMPLE_KEY];
  if (anterior?.assinatura === assinatura) {
    if (anterior.status === 'SUCESSO' && anterior.favAmostra && anterior.etapasOk !== false) {
      return { ...anterior, bridge: true, versao: VERSION, operacao: 'CRIAR_FAV_AMOSTRA', reutilizado: true, aviso: 'A FAV da amostra já havia sido criada e preparada nesta sessão; nenhuma nova criação foi executada.' };
    }
    if (anterior.status === 'FAV_CRIADA_ETAPAS_PENDENTES' && anterior.favAmostra) {
      try {
        const etapas = await prepararColetaAcondicionamentoFav({ numeroFav: anterior.favAmostra, unidadeUsuario }, sender);
        const recuperado = { ...anterior, status: 'SUCESSO', etapasOk: true, etapas, mensagem: `FAV ${anterior.favAmostra} já existente; Coleta/Acondicionamento concluídos.`, ts: Date.now() };
        await browser.storage.local.set({ [LAST_SAMPLE_KEY]: recuperado });
        return { ...recuperado, bridge: true, versao: VERSION, operacao: 'CRIAR_FAV_AMOSTRA', reutilizado: true };
      } catch (error) {
        return { ...anterior, bridge: true, versao: VERSION, operacao: 'CRIAR_FAV_AMOSTRA', reutilizado: true, etapasOk: false, etapasErro: error?.message || String(error), etapasErroCodigo: error?.codigo || error?.code || null, aviso: 'A FAV já existe; o Nexus não criou outra. As etapas CL/AC ainda precisam ser concluídas.' };
      }
    }
    if (anterior.status === 'GRAVACAO_DISPARADA' || anterior.status === 'CRIADA_SEM_FAV') {
      const e = new Error('Uma criação desta mesma amostra já chegou à etapa de gravação no PCNet, mas o número da nova FAV não foi capturado com segurança. Não clique novamente para evitar duplicidade; abra o PCNet e confira o Bem Material criado.');
      e.codigo = 'AMOSTRA_JA_GRAVADA_SEM_CAPTURA';
      throw e;
    }
  }
  if (amostrasEmAndamento.has(assinatura)) {
    const e = new Error('A criação desta FAV de amostra já está em andamento. Aguarde.');
    e.codigo = 'CRIACAO_AMOSTRA_JA_EM_ANDAMENTO';
    throw e;
  }

  const status = await obterStatus();
  if (!status.conectado || !status.tabId) throw new Error('O PCNet não está conectado. Faça o login antes de criar a FAV da amostra.');

  amostrasEmAndamento.add(assinatura);
  const visualCtx = {
    nexusTabId: sender?.tab?.id || null,
    nexusWindowId: sender?.tab?.windowId ?? null,
    pcnetRootTabId: status.tabId,
    iniciadoEm: Date.now(),
    operacao: 'CRIAR_FAV_AMOSTRA'
  };
  operacaoVisualAtiva = visualCtx;
  let tabOperacaoId = null;
  let gravacaoDisparada = false;

  try {
    const inicio = await localizarPesquisaLaudoOuTentar(status, visualCtx);
    const pesquisa = inicio.pesquisa;
    tabOperacaoId = pesquisa.tabId;
    await conterSuperficiePcnet(pesquisa.tab, visualCtx).catch(() => {});

    // Pesquisa e abertura do laudo pelo fluxo nativo validado no console:
    // #idObj_Arg -> #btnPesquisar -> linha exata -> td[onclick] do proprio PCNet.
    const abriuMain = await executarPcnetMainWorld(pesquisa.tabId, 'SEARCH_OPEN_LAUDO', numeroLaudo);
    if (!abriuMain?.ok) {
      const codigos = (abriuMain?.resultados || []).map(x => x.codigo).filter(Boolean);
      const codigo = codigos.includes('LAUDO_NAO_ENCONTRADO') ? 'LAUDO_NAO_ENCONTRADO'
        : (codigos[0] || 'ABRIR_LAUDO_FALHOU');
      const mapa = {
        LAUDO_NAO_ENCONTRADO: `O laudo ${numeroLaudo} nao foi encontrado na pesquisa do PCNet.`,
        TELA_PESQUISA_LAUDO_NAO_ENCONTRADA: 'A Pesquisa de Laudo nao esta na tela nativa esperada.',
        CELULA_ABRIR_LAUDO_NAO_ENCONTRADA: 'O resultado do laudo apareceu, mas a celula de abertura do PCNet nao foi localizada.',
        LAUDO_NAO_ABRIU: 'O resultado foi clicado, mas o PCNet nao concluiu a abertura do laudo.'
      };
      const detalhes = (abriuMain?.resultados || []).map(x => `${x.codigo || x.erro || x.erroExecucao || 'falha'} casoDeUso=${x.casoDeUso || ''}`).join(' | ').slice(0, 1600);
      const e = new Error(`${mapa[codigo] || 'Nao foi possivel abrir o laudo no PCNet.'}${detalhes ? ` (${detalhes})` : ''}`);
      e.codigo = codigo;
      throw e;
    }

    // SEARCH_OPEN_LAUDO so retorna sucesso depois de confirmar
    // /acessarprocedimentolaudopericialman.do e os Dados Basicos do laudo.
    await sleep(120);
    const bens = await aguardarBensMateriaisNoTab(tabOperacaoId, visualCtx, 18000);
    if (!bens) {
      const d = aguardarBensMateriaisNoTab.ultimoDiagnostico?.mainWorld || {};
      const resumo = (d.resultados || []).map(x => `${x.codigo || x.erro || x.erroExecucao || 'falha'} casoDeUso=${x.casoDeUso || ''}`).join(' | ').slice(0, 1500);
      const e = new Error(`O laudo foi localizado, mas Bens Materiais > Acessar / Cadastrar nao ficou pronto pelo menu nativo do PCNet. ${resumo || 'sem diagnostico'}. Nenhum novo Bem Material foi salvo.`);
      e.codigo = 'BENS_MATERIAIS_TIMEOUT';
      throw e;
    }

    const favsAntes = await lerFavsNoTab(tabOperacaoId);

    // Só tenta abrir depois de confirmar o botão EXATO no DOM da tela de conteúdo.
    const botaoPronto = await aguardarBotaoNovoBemMaterial(tabOperacaoId, 8000);
    if (!botaoPronto?.ok) {
      const e = new Error('A tela de Bens Materiais abriu, mas o botão “Novo Bem Material” ainda não apareceu. Nenhum dado foi gravado.');
      e.codigo = 'BOTAO_NOVO_BEM_MATERIAL_NAO_ENCONTRADO';
      throw e;
    }

    const novoMain = await executarPcnetMainWorld(tabOperacaoId, 'OPEN_NOVO_BEM');
    if (!novoMain?.ok) {
      const detalhes = (novoMain?.resultados || []).map(r =>
        `frame ${r.frameId}: ${r.metodo || r.codigo || r.erro || r.erroExecucao || 'sem botão'}`
      ).join(' | ').slice(0, 1800);
      const e = new Error(`O botão “Novo Bem Material” foi detectado, mas não pôde ser acionado. ${detalhes}`);
      e.codigo = 'NOVO_BEM_MATERIAL_NAO_ABRIU';
      throw e;
    }

    const formNovo = await aguardarNovoBemMaterialNoTab(tabOperacaoId, visualCtx, 13000);
    if (!formNovo) {
      const e = new Error('A tela “Novo Bem Material” não apareceu a tempo. Nenhum dado foi gravado.'); e.codigo = 'NOVO_BEM_MATERIAL_TIMEOUT'; throw e;
    }

    const numeroLaudoDescricao = abriuMain?.sucesso?.numeroLaudoCompleto || numeroLaudo;
    const descricao = `Amostra da fav original ${favOriginal}, cujo resultado encontra-se no laudo nº ${numeroLaudoDescricao} acondicionada em invólucro número ${numeroLacre}.`;
    const salvar = await executarPcnetMainWorld(tabOperacaoId, 'FILL_SAVE_SAMPLE', { numeroLacre, descricao });
    if (!salvar?.ok) {
      const detalhes = (salvar?.resultados || []).map(r => `frame ${r.frameId}: ${r.codigo || r.erro || r.erroExecucao || 'falha'}`).join(' | ').slice(0, 1800);
      const e = new Error(`Não foi possível preencher/salvar o novo Bem Material da amostra. ${detalhes}`); e.codigo = 'SALVAR_AMOSTRA_FALHOU'; throw e;
    }
    gravacaoDisparada = true;
    await browser.storage.local.set({
      [LAST_SAMPLE_KEY]: { assinatura, status: 'GRAVACAO_DISPARADA', numeroLaudo, favOriginal, numeroLacre, ts: Date.now() }
    });

    const captura = await capturarFavAmostraAposSalvar({ tabId: tabOperacaoId, favOriginal, numeroLacre, favsAntes, visualCtx });
    if (!captura.favAmostra) {
      await browser.storage.local.set({
        [LAST_SAMPLE_KEY]: { assinatura, status: 'CRIADA_SEM_FAV', numeroLaudo, favOriginal, numeroLacre, ts: Date.now() }
      });
      const e = new Error('O PCNet recebeu o comando de salvar o novo Bem Material, mas o Bridge não conseguiu capturar com segurança o número da FAV gerada. NÃO tente criar novamente. Abra o PCNet e confira a FAV criada para esse lacre.');
      e.codigo = 'FAV_AMOSTRA_CRIADA_SEM_CAPTURA';
      throw e;
    }

    const baseRetorno = {
      bridge: true,
      versao: VERSION,
      operacao: 'CRIAR_FAV_AMOSTRA',
      status: 'FAV_CRIADA_ETAPAS_PENDENTES',
      assinatura,
      numeroLaudo,
      favOriginal,
      favAmostra: captura.favAmostra,
      numeroLacre,
      unidadeUsuario,
      metodoCaptura: captura.metodo,
      mensagemSistema: captura.mensagemSistema || null,
      etapasOk: false,
      mensagem: `FAV ${captura.favAmostra} criada para a amostra; iniciando Coleta/Acondicionamento.`,
      ts: Date.now()
    };
    // A partir daqui a FAV já existe. Salvamos esse estado ANTES de CL/AC para
    // garantir que qualquer falha posterior jamais dispare uma segunda criação.
    await browser.storage.local.set({ [LAST_SAMPLE_KEY]: baseRetorno });

    try {
      const etapas = await prepararColetaAcondicionamentoFav({ numeroFav: captura.favAmostra, unidadeUsuario }, sender);
      const retorno = {
        ...baseRetorno,
        status: 'SUCESSO',
        etapasOk: true,
        etapas,
        registro: etapas?.registro || null,
        mensagem: `FAV ${captura.favAmostra} criada; Coleta e Acondicionamento concluídos.`,
        ts: Date.now()
      };
      await browser.storage.local.set({ [LAST_SAMPLE_KEY]: retorno });
      return retorno;
    } catch (error) {
      const retorno = {
        ...baseRetorno,
        status: 'FAV_CRIADA_ETAPAS_PENDENTES',
        etapasOk: false,
        etapasErro: error?.message || String(error),
        etapasErroCodigo: error?.codigo || error?.code || null,
        mensagem: `FAV ${captura.favAmostra} criada, mas Coleta/Acondicionamento não foram concluídos automaticamente. A criação NÃO será repetida.`,
        ts: Date.now()
      };
      await browser.storage.local.set({ [LAST_SAMPLE_KEY]: retorno });
      return retorno;
    }
  } catch (error) {
    if (gravacaoDisparada && error?.codigo === 'PCNET_RECUSOU_CRIACAO_AMOSTRA') {
      // Houve resposta explícita de erro do PCNet; nesse caso o Bem Material não
      // deve ser tratado como criado e uma nova tentativa corrigida pode ocorrer.
      const atual = await browser.storage.local.get(LAST_SAMPLE_KEY).catch(() => ({}));
      if (atual?.[LAST_SAMPLE_KEY]?.assinatura === assinatura) await browser.storage.local.remove(LAST_SAMPLE_KEY).catch(() => {});
    } else if (gravacaoDisparada) {
      const atual = await browser.storage.local.get(LAST_SAMPLE_KEY).catch(() => ({}));
      if (atual?.[LAST_SAMPLE_KEY]?.assinatura === assinatura && atual[LAST_SAMPLE_KEY].status === 'GRAVACAO_DISPARADA') {
        await browser.storage.local.set({
          [LAST_SAMPLE_KEY]: { ...atual[LAST_SAMPLE_KEY], status: 'CRIADA_SEM_FAV', erroCaptura: error?.message || String(error) }
        });
      }
    }
    throw error;
  } finally {
    amostrasEmAndamento.delete(assinatura);
    await focarNexus(visualCtx);
    operacaoVisualAtiva = null;
  }
}

async function aguardarTelaEtapaCustodia(capacidade, tabBuscaId, visualCtx, timeoutMs = 15000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    await conterTodasAsSuperficiesPcnet(visualCtx).catch(() => {});
    const tabs = await tabsPcnetRelacionadas(visualCtx, { incluirRoot: false });
    const ids = [];
    if (tabBuscaId) ids.push(tabBuscaId);
    for (const tab of tabs) {
      if (!ids.includes(tab.id)) ids.push(tab.id);
    }
    const alvo = await localizarFrameCom(capacidade, ids);
    if (alvo) {
      await conterSuperficiePcnet(alvo.tab, visualCtx).catch(() => {});
      return alvo;
    }
    await sleep(180);
  }
  return null;
}

async function aguardarGravacaoEtapaCustodia(tabId, nomeEtapa, timeoutMs = 18000) {
  const limite = Date.now() + timeoutMs;
  let ultima = null;
  while (Date.now() < limite) {
    await sleep(220);
    const leitura = await lerResultadoMovimentacao(tabId).catch(() => null);
    if (!leitura) continue;
    ultima = leitura;
    if (leitura.erro) {
      const e = new Error(`O PCNet recusou ${nomeEtapa}: ${leitura.erro}`);
      e.codigo = `PCNET_RECUSOU_${nomeEtapa.toUpperCase().replace(/\W+/g, '_')}`;
      throw e;
    }
    const sucesso = String(leitura.sucesso || '').trim();
    if (/registros?\s+gravados?\s+com\s+sucesso/i.test(sucesso) || sucesso) {
      return { sucesso, leitura };
    }
  }
  const e = new Error(`O comando de salvar ${nomeEtapa} foi enviado, mas a confirmação “Registros gravados com sucesso” não apareceu a tempo.`);
  e.codigo = `${nomeEtapa.toUpperCase().replace(/\W+/g, '_')}_CONFIRMACAO_TIMEOUT`;
  e.detalhe = ultima || null;
  throw e;
}

async function executarEtapaCustodiaFav({ numeroFav, etapa, unidadeUsuario = '', sender = null }) {
  const status = await obterStatus();
  const ultimaFav = await lerUltimaFav();
  if (!status.conectado || !ultimaFav || String(ultimaFav.numeroFav) !== String(numeroFav)) {
    const e = new Error(`Não foi possível manter a FAV ${numeroFav} selecionada para registrar ${etapa}.`);
    e.codigo = 'FAV_NAO_SELECIONADA_PARA_ETAPA';
    throw e;
  }

  const visualCtx = {
    nexusTabId: sender?.tab?.id || null,
    nexusWindowId: sender?.tab?.windowId ?? null,
    pcnetRootTabId: status.tabId,
    iniciadoEm: Date.now(),
    operacao: `ETAPA_${etapa}`
  };
  operacaoVisualAtiva = visualCtx;
  let tela = null;
  try {
    const coleta = etapa === 'COLETA';
    const abrir = await enviarAoFrame(
      ultimaFav.tabId,
      ultimaFav.frameId,
      coleta ? 'OPEN_COLETA_SELF' : 'OPEN_ACONDICIONAMENTO_SELF',
      { numeroFav }
    );
    if (!abrir?.ok) {
      const e = new Error(`Não foi possível abrir ${coleta ? 'Coleta' : 'Acondicionamento'} da FAV ${numeroFav} no PCNet.`);
      e.codigo = abrir?.codigo || (coleta ? 'COLETA_NAO_ABRIU' : 'ACONDICIONAMENTO_NAO_ABRIU');
      throw e;
    }

    tela = await aguardarTelaEtapaCustodia(
      coleta ? 'coletaTela' : 'acondicionamentoTela',
      ultimaFav.tabId,
      visualCtx,
      16000
    );
    if (!tela) {
      const e = new Error(`O PCNet recebeu o comando de ${coleta ? 'Coleta' : 'Acondicionamento'}, mas a tela correspondente não apareceu. Nenhuma nova tentativa de gravação será feita automaticamente.`);
      e.codigo = coleta ? 'COLETA_TELA_TIMEOUT' : 'ACONDICIONAMENTO_TELA_TIMEOUT';
      throw e;
    }

    const salvar = await enviarAoFrame(
      tela.tabId,
      tela.frameId,
      coleta ? 'PREPARE_SAVE_COLETA' : 'PREPARE_SAVE_ACONDICIONAMENTO',
      coleta ? { unidadeUsuario } : {}
    );
    if (!salvar?.ok) {
      const detalhe = salvar?.mensagemSistema ? ` ${salvar.mensagemSistema}` : '';
      const e = new Error(`Não foi possível preparar/gravar ${coleta ? 'a Coleta' : 'o Acondicionamento'}.${detalhe}`);
      e.codigo = salvar?.codigo || (coleta ? 'COLETA_GRAVAR_FALHOU' : 'ACONDICIONAMENTO_GRAVAR_FALHOU');
      throw e;
    }

    const confirmacao = await aguardarGravacaoEtapaCustodia(
      tela.tabId,
      coleta ? 'Coleta' : 'Acondicionamento',
      20000
    );

    return {
      etapa,
      status: 'SUCESSO',
      numeroFav,
      unidadeUsuario: coleta ? unidadeUsuario : null,
      mensagemSistema: confirmacao.sucesso || 'Registros gravados com sucesso',
      preenchimento: salvar
    };
  } finally {
    // Como a automação redireciona o popup legado para uma superfície oculta,
    // não dependemos de window.opener/Fechar. Após a confirmação do PCNet,
    // descartamos as superfícies auxiliares e a próxima busca abre uma consulta limpa.
    if (tela?.tabId) await removerAbaSeAuxiliar(tela.tabId, status.tabId).catch(() => {});
    if (ultimaFav?.tabId && ultimaFav.tabId !== tela?.tabId) await removerAbaSeAuxiliar(ultimaFav.tabId, status.tabId).catch(() => {});
    await browser.storage.local.remove(LAST_FAV_KEY).catch(() => {});
    await focarNexus(visualCtx);
    operacaoVisualAtiva = null;
  }
}

async function prepararColetaAcondicionamentoFav(payload = {}, sender = null) {
  const numeroFav = String(payload?.numeroFav ?? payload?.numero_fav ?? payload?.fav ?? '').trim();
  const unidadeUsuario = String(payload?.unidadeUsuario ?? payload?.unidade_usuario ?? payload?.unidade ?? '').trim();
  if (!numeroFav) throw new Error('Informe a FAV a preparar.');

  let busca = await buscarFav({ numeroFav }, sender);
  let situacao = situacaoClAc(busca?.registro || {});
  if (situacao.conhecida && situacao.cl && situacao.ac) {
    return {
      bridge: true,
      versao: VERSION,
      operacao: 'PREPARAR_ETAPAS_FAV',
      status: 'JA_PRONTA',
      numeroFav,
      registro: busca.registro,
      coleta: 'JA_EXISTIA',
      acondicionamento: 'JA_EXISTIA',
      mensagem: 'A FAV já possui Coleta (CL) e Acondicionamento (AC).'
    };
  }

  const etapas = {};

  if (!situacao.cl) {
    if (!unidadeUsuario) {
      const e = new Error('A unidade cadastrada do usuário é obrigatória para preencher Endereço fato/coleta e Localização do vestígio.');
      e.codigo = 'UNIDADE_USUARIO_OBRIGATORIA';
      throw e;
    }
    etapas.coleta = await executarEtapaCustodiaFav({ numeroFav, etapa: 'COLETA', unidadeUsuario, sender });
    busca = await buscarFav({ numeroFav }, sender);
    situacao = situacaoClAc(busca?.registro || {});
    if (!situacao.cl) {
      const e = new Error(`A Coleta da FAV ${numeroFav} foi gravada, mas o PCNet ainda não retornou o marcador CL na nova consulta.`);
      e.codigo = 'COLETA_NAO_CONFIRMADA_NA_BUSCA';
      throw e;
    }
  } else {
    etapas.coleta = { etapa: 'COLETA', status: 'JA_EXISTIA', numeroFav };
  }

  if (!situacao.ac) {
    etapas.acondicionamento = await executarEtapaCustodiaFav({ numeroFav, etapa: 'ACONDICIONAMENTO', unidadeUsuario, sender });
    busca = await buscarFav({ numeroFav }, sender);
    situacao = situacaoClAc(busca?.registro || {});
    if (!(situacao.cl && situacao.ac)) {
      const e = new Error(`O Acondicionamento da FAV ${numeroFav} foi gravado, mas o PCNet ainda não retornou CL + AC na nova consulta.`);
      e.codigo = 'ACONDICIONAMENTO_NAO_CONFIRMADO_NA_BUSCA';
      throw e;
    }
  } else {
    etapas.acondicionamento = { etapa: 'ACONDICIONAMENTO', status: 'JA_EXISTIA', numeroFav };
  }

  return {
    bridge: true,
    versao: VERSION,
    operacao: 'PREPARAR_ETAPAS_FAV',
    status: 'SUCESSO',
    numeroFav,
    unidadeUsuario: unidadeUsuario || null,
    registro: busca?.registro || null,
    etapas,
    mensagem: `FAV ${numeroFav}: Coleta e Acondicionamento concluídos e confirmados na Cadeia de Custódia.`
  };
}


/* ============================================================
 * V2.19 — DETALHAMENTO / ANEXOS / BO DO ACEITE
 * ============================================================ */

async function detalharAceite(payload = {}, sender = null) {
  const requisicao = String(
    payload?.requisicao
    ?? payload?.numeroRequisicao
    ?? payload?.numero_requisicao
    ?? ''
  ).trim();

  // V2.24: referência da posição ORIGINAL no PCNet. Esses valores vêm do CSV
  // completo e não mudam quando o usuário filtra/pagina localmente no Nexus.
  const paginaPcnet = Math.max(1, Number(payload?.paginaPcnet ?? payload?.pagina_pcnet ?? 1) || 1);
  const indicePcnetRaw = Number(payload?.indicePcnet ?? payload?.indice_pcnet);
  const indicePcnet = Number.isFinite(indicePcnetRaw) && indicePcnetRaw >= 0
    ? Math.floor(indicePcnetRaw)
    : null;
  const posicaoPcnetRaw = Number(payload?.posicaoPcnet ?? payload?.posicao_pcnet);
  const posicaoPcnet = Number.isFinite(posicaoPcnetRaw) && posicaoPcnetRaw >= 1
    ? Math.floor(posicaoPcnetRaw)
    : null;

  if (!requisicao) {
    const erro = new Error('Informe o número da requisição.');
    erro.codigo = 'REQUISICAO_OBRIGATORIA';
    throw erro;
  }

  const status = await obterStatus();
  if (!status?.conectado || !status?.tabId) {
    const erro = new Error('O PCNet não está conectado. Faça o login no PCNet e tente novamente.');
    erro.codigo = 'PCNET_NAO_CONECTADO';
    throw erro;
  }

  if (
    operacaoVisualAtiva
    || movimentosEmAndamento.size > 0
    || amostrasEmAndamento.size > 0
    || acoesAceiteEmAndamento.size > 0
  ) {
    const erro = new Error('O PCNet está sendo utilizado por outra operação do Nexus. Aguarde a conclusão.');
    erro.codigo = 'PCNET_OCUPADO';
    throw erro;
  }

  const contexto = {
    tipo: 'DETALHAR_ACEITE',
    requisicao,
    nexusTabId: sender?.tab?.id || null,
    nexusWindowId: sender?.tab?.windowId ?? null,
    pcnetRootTabId: status.tabId,
    iniciadoEm: Date.now()
  };

  operacaoVisualAtiva = contexto;

  try {
    const nativo = await executarPcnetMainWorld(
      status.tabId,
      'GET_ACCEPTANCE_DETAIL_READONLY',
      {
        requisicao,
        paginaPcnet,
        indicePcnet,
        posicaoPcnet
      }
    );

    const resultados = nativo?.resultados || [];
    const resultado = resultados.find(item => item?.ok);

    if (!resultado) {
      const diagnostico = resultados.find(item => item?.codigo) || resultados[0] || null;
      const codigo = diagnostico?.codigo || 'DETALHE_ACEITE_FALHOU';
      const mensagens = {
        REQUISICAO_VAZIA: 'O número da requisição não foi informado.',
        ACEITE_TELA_NAO_LOCALIZADA: 'A tela de Aceite não pôde ser localizada no PCNet.',
        REQUISICAO_NAO_LOCALIZADA_NA_TELA: `A requisição ${requisicao} não foi localizada na tela de Aceite.`,
        CONTROLE_ABRIR_REQUISICAO_NAO_IDENTIFICADO: `A requisição ${requisicao} foi localizada, mas o controle nativo de abertura não foi identificado.`,
        CLICK_DETALHE_FALHOU: `O controle da requisição ${requisicao} foi localizado, mas o clique nativo falhou.`,
        DETALHE_REQUISICAO_NAO_ABRIU: `A requisição ${requisicao} foi acionada, mas a tela de detalhes não ficou pronta a tempo.`,
        MAIN_WORLD_EXCEPTION: 'Ocorreu uma exceção ao consultar os detalhes da requisição no PCNet.'
      };

      const erro = new Error(
        mensagens[codigo]
        || `Não foi possível abrir os detalhes da requisição ${requisicao}. Código: ${codigo}.`
      );
      erro.codigo = codigo;
      erro.diagnostico = diagnostico;
      throw erro;
    }

    return {
      bridge: true,
      versao: VERSION,
      operacao: 'DETALHAR_ACEITE',
      status: 'SUCESSO',
      requisicao,
      paginaPcnet,
      indicePcnet,
      posicaoPcnet,
      detalhes: resultado.detalhes || null,
      coordenadas: resultado.coordenadas || null,
      campoBuscaRequisicao: resultado.campoBuscaRequisicao || null,
      paginacaoAlvo: resultado.paginacaoAlvo || null,
      pesquisaRequisicao: resultado.pesquisaRequisicao || null,
      capturaDocumentos: resultado.capturaDocumentos || null,
      capturaOcorrencias: resultado.capturaOcorrencias || null,
      atualizadoEm: Date.now(),
      metodo: resultado.metodo || 'main_world_pcnet_detalhe_readonly_v224'
    };
  } finally {
    if (operacaoVisualAtiva === contexto) operacaoVisualAtiva = null;
    await focarNexus(contexto).catch(() => {});
  }
}

function nomeArquivoSeguro(nome) {
  const limpo = String(nome || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return limpo.slice(0, 180);
}

async function baixarAnexoAceite(payload = {}, sender = null) {
  const status = await obterStatus();
  if (!status?.conectado || !status?.tabId) {
    const erro = new Error('O PCNet não está conectado. Faça o login antes de baixar o anexo.');
    erro.codigo = 'PCNET_NAO_CONECTADO';
    throw erro;
  }

  const urlInformada = String(
    payload?.urlBaixar
    ?? payload?.url_baixar
    ?? ''
  ).replace(/&amp;/gi, '&').trim();

  let idArquivo = String(
    payload?.idArquivoAnexadoPlc
    ?? payload?.idArquivo
    ?? payload?.id_arquivo
    ?? ''
  ).trim();

  if (!idArquivo && urlInformada) {
    idArquivo = urlInformada.match(/idArquivoAnexadoPlc=(\d+)/i)?.[1] || '';
  }

  if (!/^\d+$/.test(idArquivo)) {
    const erro = new Error('O identificador do anexo do PCNet não foi localizado com segurança.');
    erro.codigo = 'ANEXO_ID_INVALIDO';
    throw erro;
  }

  if (!browser.downloads?.download) {
    const erro = new Error('A extensão não possui a permissão de downloads necessária. Recarregue a V2.19 com o manifest atualizado.');
    erro.codigo = 'DOWNLOADS_PERMISSION_NAO_DISPONIVEL';
    throw erro;
  }

  const url = new URL(
    '/PCnet/anexardocumento.do',
    'https://www.pcnet.mg.gov.br/'
  );
  url.searchParams.set('evento', 'Baixar');
  url.searchParams.set('idArquivoAnexadoPlc', idArquivo);

  const nome = nomeArquivoSeguro(payload?.nome ?? payload?.nomeArquivo ?? '');
  const opcoes = {
    url: url.toString(),
    saveAs: false,
    conflictAction: 'uniquify'
  };
  if (nome) opcoes.filename = nome;

  let downloadId;
  try {
    downloadId = await browser.downloads.download(opcoes);
  } catch (error) {
    const erro = new Error(`Não foi possível iniciar o download do anexo no PCNet. ${error?.message || error || ''}`.trim());
    erro.codigo = 'DOWNLOAD_ANEXO_FALHOU';
    throw erro;
  }

  return {
    bridge: true,
    versao: VERSION,
    operacao: 'BAIXAR_ANEXO_ACEITE',
    status: 'INICIADO',
    requisicao: String(payload?.requisicao || '').trim() || null,
    idArquivoAnexadoPlc: idArquivo,
    nome: nome || null,
    downloadId,
    mensagem: nome
      ? `Download de ${nome} iniciado.`
      : 'Download do anexo iniciado.'
  };
}

async function abrirBoAceite(payload = {}, sender = null) {
  const status = await obterStatus();
  if (!status?.conectado || !status?.tabId) {
    const erro = new Error('O PCNet não está conectado. Faça o login antes de visualizar o BO.');
    erro.codigo = 'PCNET_NAO_CONECTADO';
    throw erro;
  }

  const numeroReds = String(
    payload?.numeroReds
    ?? payload?.numero
    ?? payload?.reds
    ?? ''
  ).trim();

  const rota = String(
    payload?.rotaVisualizacao
    ?? payload?.urlVisualizacao
    ?? payload?.url
    ?? ''
  ).replace(/&amp;/gi, '&').trim();

  if (!rota) {
    const erro = new Error('A rota de visualização do BO não foi localizada na requisição.');
    erro.codigo = 'BO_ROTA_NAO_LOCALIZADA';
    throw erro;
  }

  let url;
  try {
    url = new URL(rota, 'https://www.pcnet.mg.gov.br/');
  } catch {
    const erro = new Error('A rota de visualização do BO é inválida.');
    erro.codigo = 'BO_ROTA_INVALIDA';
    throw erro;
  }

  const origemValida = url.origin === 'https://www.pcnet.mg.gov.br';
  const caminhoValido = /\/POLICIAL\/acessarfatopolicialman\.do$/i.test(url.pathname);
  const eventoValido = /^visualizarBOSemCC$/i.test(url.searchParams.get('evento') || '');
  const redsDaUrl = String(url.searchParams.get('numeroReds') || '').trim();

  if (!origemValida || !caminhoValido || !eventoValido) {
    const erro = new Error('A rota do BO não corresponde ao visualizador oficial esperado do PCNet.');
    erro.codigo = 'BO_ROTA_NAO_AUTORIZADA';
    throw erro;
  }

  if (numeroReds && redsDaUrl && numeroReds !== redsDaUrl) {
    const erro = new Error('O número do REDS não corresponde à rota de visualização capturada no PCNet.');
    erro.codigo = 'BO_REDS_DIVERGENTE';
    throw erro;
  }

  let janela;
  try {
    janela = await browser.windows.create({
      url: url.toString(),
      type: 'popup',
      width: 780,
      height: 500,
      focused: true
    });
  } catch (error) {
    const erro = new Error(`Não foi possível abrir o BO. ${error?.message || error || ''}`.trim());
    erro.codigo = 'BO_ABERTURA_FALHOU';
    throw erro;
  }

  return {
    bridge: true,
    versao: VERSION,
    operacao: 'ABRIR_BO_ACEITE',
    status: 'ABERTO',
    requisicao: String(payload?.requisicao || '').trim() || null,
    numeroReds: redsDaUrl || numeroReds || null,
    windowId: janela?.id || null,
    mensagem: `BO ${redsDaUrl || numeroReds || ''} aberto.`.trim()
  };
}


/* ============================================================
 * V2.20 — EXECUTAR AÇÃO DO ACEITE
 * ============================================================ */
async function executarAcaoAceite(payload = {}, sender = null) {
  const requisicao = String(payload?.requisicao ?? '').trim();
  const acao = String(payload?.acao ?? '').trim().toUpperCase();
  const justificativa = String(payload?.justificativa ?? '').trim();
  const situacaoAnterior = String(
    payload?.situacaoAnterior
    ?? payload?.situacao
    ?? ''
  ).trim();

  const acoesValidas = new Set([
    'RECEBER',
    'ACEITAR',
    'AGUARDAR_MATERIAL',
    'DEVOLVER'
  ]);

  if (!requisicao) {
    const erro = new Error('Informe o número da requisição.');
    erro.codigo = 'REQUISICAO_OBRIGATORIA';
    throw erro;
  }

  if (!acoesValidas.has(acao)) {
    const erro = new Error('Ação de Aceite inválida.');
    erro.codigo = 'ACAO_ACEITE_INVALIDA';
    throw erro;
  }

  if (acao === 'DEVOLVER' && !justificativa) {
    const erro = new Error('Informe a justificativa da devolução.');
    erro.codigo = 'JUSTIFICATIVA_OBRIGATORIA';
    throw erro;
  }

  const assinatura = `${requisicao}|${acao}`;
  const anterior = acoesAceiteConcluidas.get(assinatura);

  if (
    anterior
    && Date.now() - Number(anterior._guardTs || 0) < 2 * 60 * 1000
  ) {
    return {
      ...anterior,
      reutilizado: true,
      aviso: 'Esta mesma ação acabou de ser confirmada; nenhum novo clique foi executado.'
    };
  }

  if (acoesAceiteEmAndamento.has(assinatura)) {
    const erro = new Error(`A ação ${acao} da requisição ${requisicao} já está em andamento.`);
    erro.codigo = 'ACAO_ACEITE_JA_EM_ANDAMENTO';
    throw erro;
  }

  const status = await obterStatus();
  if (!status?.conectado || !status?.tabId) {
    const erro = new Error('O PCNet não está conectado.');
    erro.codigo = 'PCNET_NAO_CONECTADO';
    throw erro;
  }

  if (
    operacaoVisualAtiva
    || movimentosEmAndamento.size > 0
    || amostrasEmAndamento.size > 0
    || acoesAceiteEmAndamento.size > 0
  ) {
    const erro = new Error('O PCNet está sendo utilizado por outra operação do Nexus. Aguarde a conclusão.');
    erro.codigo = 'PCNET_OCUPADO';
    throw erro;
  }

  const contexto = {
    tipo: 'ACAO_ACEITE',
    acao,
    requisicao,
    nexusTabId: sender?.tab?.id || null,
    nexusWindowId: sender?.tab?.windowId ?? null,
    pcnetRootTabId: status.tabId,
    iniciadoEm: Date.now()
  };

  acoesAceiteEmAndamento.add(assinatura);
  operacaoVisualAtiva = contexto;

  try {
    const nativo = await executarPcnetMainWorld(
      status.tabId,
      'EXECUTE_ACCEPTANCE_ACTION',
      { requisicao, acao, justificativa }
    );

    const resultados = nativo?.resultados || [];
    const resultado =
      resultados.find(item => item?.ok)
      || resultados.find(item => item?.acaoDisparada)
      || resultados.find(item => item?.codigo)
      || resultados[0]
      || null;

    if (!resultado) {
      const erro = new Error('O PCNet não retornou resultado para a ação.');
      erro.codigo = 'ACAO_ACEITE_SEM_RETORNO';
      throw erro;
    }

    if (!resultado.ok && !resultado.acaoDisparada) {
      const mensagens = {
        DETALHE_ACEITE_NAO_ESTA_ABERTO:
          'A tela de detalhes da requisição não está aberta no PCNet.',
        ACAO_ACEITE_NAO_DISPONIVEL:
          'Esta ação não está disponível para a situação atual da requisição.',
        ACAO_ACEITE_CONTROLE_NATIVO_NAO_CONFIRMADO:
          'O controle nativo desta ação não corresponde ao HTML esperado do PCNet. Nenhum clique foi executado.',
        ACAO_ACEITE_AMBIGUA:
          'O PCNet apresentou mais de um controle para esta ação. O Nexus não executou nenhum deles.',
        JUSTIFICATIVA_OBRIGATORIA:
          'Informe a justificativa da devolução.',
        CAMPO_JUSTIFICATIVA_NAO_ENCONTRADO:
          'O campo Justificativa não foi localizado no PCNet. A devolução não foi executada.',
        JUSTIFICATIVA_NAO_CONFIRMADA_NO_DOM:
          'O PCNet não confirmou o preenchimento da justificativa. A devolução foi interrompida.',
        CLICK_ACAO_ACEITE_FALHOU:
          'O botão nativo do PCNet foi localizado, mas o clique falhou.',
        PCNET_RECUSOU_ACAO_ACEITE:
          resultado.mensagemSistema
            ? `O PCNet recusou a ação: ${resultado.mensagemSistema}`
            : 'O PCNet recusou a ação.'
      };

      const erro = new Error(
        mensagens[resultado.codigo]
        || `Não foi possível executar a ação. Código: ${resultado.codigo || 'desconhecido'}.`
      );
      erro.codigo = resultado.codigo || 'ACAO_ACEITE_FALHOU';
      erro.diagnostico = resultado;
      throw erro;
    }

    /*
     * O clique nunca é repetido. Depois dele, fazemos somente uma leitura
     * da caixa de Aceite para confirmar remoção ou mudança de situação.
     */
    let verificacao = null;

    try {
      const consulta = await executarPcnetMainWorld(
        status.tabId,
        'LIST_ACCEPTANCE_READONLY'
      );
      const lista = (consulta?.resultados || []).find(item => item?.ok);

      if (lista) {
        const itemAtual = (
          Array.isArray(lista.itens) ? lista.itens : []
        ).find(item => String(item.requisicao || '').trim() === requisicao) || null;

        verificacao = {
          localizado: Boolean(itemAtual),
          removidoDaCaixa: !itemAtual,
          situacaoAnterior: situacaoAnterior || null,
          situacaoAtual: itemAtual?.situacao || null,
          itemAtual
        };
      }
    } catch (_) {}

    const normalizarSituacao = (valor) => String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const situacaoMudou = Boolean(
      verificacao
      && situacaoAnterior
      && verificacao.situacaoAtual
      && normalizarSituacao(verificacao.situacaoAtual) !== normalizarSituacao(situacaoAnterior)
    );

    const confirmado = Boolean(
      resultado.ok
      || verificacao?.removidoDaCaixa
      || situacaoMudou
    );

    if (!confirmado) {
      const erro = new Error(
        'O comando foi enviado ao PCNet, mas o Nexus não conseguiu confirmar o resultado com segurança. ' +
        'A ação NÃO será repetida automaticamente. Atualize a caixa antes de tentar novamente.'
      );
      erro.codigo = 'ACAO_ACEITE_RESULTADO_INDETERMINADO';
      erro.diagnostico = { resultado, verificacao };
      throw erro;
    }

    const nomes = {
      RECEBER: 'Recebimento',
      ACEITAR: 'Aceite',
      AGUARDAR_MATERIAL: 'Aguardar material',
      DEVOLVER: 'Devolução'
    };

    const retorno = {
      bridge: true,
      versao: VERSION,
      operacao: 'ACAO_ACEITE',
      status: 'SUCESSO',
      acao,
      requisicao,
      justificativa: acao === 'DEVOLVER' ? justificativa : null,
      mensagemSistema: resultado.mensagemSistema || null,
      verificacao,
      mensagem: `${nomes[acao]} da requisição ${requisicao} executado com sucesso.`,
      _guardTs: Date.now()
    };

    acoesAceiteConcluidas.set(assinatura, retorno);
    return retorno;
  } finally {
    acoesAceiteEmAndamento.delete(assinatura);
    if (operacaoVisualAtiva === contexto) operacaoVisualAtiva = null;
    await focarNexus(contexto).catch(() => {});
  }
}

async function listarAceite(sender = null) {
  const status = await obterStatus();

  if (!status?.conectado || !status?.tabId) {
    const erro = new Error(
      'O PCNet não está conectado. Faça o login no PCNet e tente novamente.'
    );
    erro.codigo = 'PCNET_NAO_CONECTADO';
    throw erro;
  }

  // A leitura usa a mesma aba PCNet gerenciada. Não interrompemos uma
  // movimentação/automação já em curso.
  if (
    operacaoVisualAtiva
    || movimentosEmAndamento.size > 0
    || amostrasEmAndamento.size > 0
    || acoesAceiteEmAndamento.size > 0
  ) {
    const erro = new Error(
      'O PCNet está sendo utilizado por outra operação do Nexus. Aguarde a conclusão e atualize a caixa de aceite.'
    );
    erro.codigo = 'PCNET_OCUPADO';
    throw erro;
  }

  const contexto = {
    tipo: 'LISTAR_ACEITE',
    nexusTabId: sender?.tab?.id || null,
    nexusWindowId: sender?.tab?.windowId ?? null,
    pcnetRootTabId: status.tabId,
    iniciadoEm: Date.now()
  };

  operacaoVisualAtiva = contexto;

  try {
    // A tela de Aceite é carregada pelo próprio JavaScript legado do PCNet.
    // Executamos no MAIN world para chamar onChangeMenu/carregarMenu e depois
    // usamos o endpoint CSV nativo. Isso evita depender de eventos sinteticos
    // disparados a partir do isolated world do content-script.
    const nativo = await executarPcnetMainWorld(
      status.tabId,
      'LIST_ACCEPTANCE_READONLY'
    );

    const resultado = (nativo?.resultados || []).find(item => item?.ok);

    if (!resultado) {
      const detalhes = (nativo?.resultados || [])
        .map(item => `${item?.codigo || 'falha'}${item?.erro ? `: ${item.erro}` : ''}`)
        .join(' | ')
        .slice(0, 1400);

      const erro = new Error(
        'Não foi possível consultar a caixa de Aceite no PCNet.'
        + (detalhes ? ` ${detalhes}` : '')
      );
      erro.codigo = (nativo?.resultados || []).find(item => item?.codigo)?.codigo
        || 'ACEITE_LISTAGEM_FALHOU';
      throw erro;
    }

    return {
      bridge: true,
      versao: VERSION,
      operacao: 'LISTAR_ACEITE',
      status: 'SUCESSO',
      total: Number(resultado.total || 0),
      itens: Array.isArray(resultado.itens) ? resultado.itens : [],
      atualizadoEm: resultado.atualizadoEm || Date.now(),
      metodo: resultado.metodo || 'main_world_pcnet_nativo_csv_alert_guard'
    };
  } finally {
    if (operacaoVisualAtiva === contexto) {
      operacaoVisualAtiva = null;
    }
    await focarNexus(contexto).catch(() => {});
  }
}


browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'PCNET_FRAME_HEARTBEAT') {
    return registrarHeartbeat(message, sender).then(() => ({ ok: true }));
  }
  if (message?.type === 'NEXUS_COMMAND') {
    switch (message.action) {
      case 'STATUS': return obterStatus();
      case 'OPEN_PCNET': return abrirOuMostrarPcnet();
      case 'SHOW_PCNET': return mostrarPcnet();
      case 'HIDE_PCNET': return ocultarPcnet();
      case 'LISTAR_ACEITE': return listarAceite(sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null
      }));
      case 'DETALHAR_ACEITE': return detalharAceite(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null,
        diagnostico: error?.diagnostico || null
      }));
      case 'ACAO_ACEITE': return executarAcaoAceite(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null,
        diagnostico: error?.diagnostico || null
      }));
      case 'BAIXAR_ANEXO_ACEITE': return baixarAnexoAceite(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null
      }));
      case 'ABRIR_BO_ACEITE': return abrirBoAceite(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null
      }));
      case 'BUSCAR_FAV': return buscarFav(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null
      }));
      case 'MOVIMENTAR_FAV': return movimentarFav(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null
      }));
      case 'CRIAR_FAV_AMOSTRA': return criarFavAmostra(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null
      }));
      case 'PREPARAR_ETAPAS_FAV': return prepararColetaAcondicionamentoFav(message.payload || {}, sender).catch((error) => ({
        bridge: true,
        versao: VERSION,
        erro: error?.message || String(error),
        erroCodigo: error?.codigo || error?.code || null
      }));
      default: return Promise.resolve({ bridge: true, versao: VERSION, erro: 'Comando desconhecido.' });
    }
  }
  return undefined;
});

browser.tabs.onCreated.addListener((tab) => {
  const ctx = operacaoVisualAtiva;
  if (!ctx) return;
  setTimeout(() => { conterSuperficiePcnet(tab.id, ctx).catch(() => {}); }, 0);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const ctx = operacaoVisualAtiva;
  if (!ctx) return;
  // conterSuperficiePcnet valida a cadeia de opener até a raiz gerenciada.
  // Portanto uma nova aba PCNet manual permanece intocada.
  conterSuperficiePcnet(tabId, ctx).catch(() => {});
});

browser.tabs.onRemoved.addListener((tabId) => { removerTab(tabId).catch(() => {}); });
browser.tabs.onActivated.addListener((activeInfo) => { tentarOcultarAutomaticamente(activeInfo).catch(() => {}); });
