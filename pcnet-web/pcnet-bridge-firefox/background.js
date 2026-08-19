const VERSION = '0.2.11.0';
const PCNET_URL = 'https://www.pcnet.mg.gov.br/APP/';
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
  const tabs = await browser.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*'] });
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
  const ehNexus = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url);
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

  const tabOculta = await criarAbaCustodiaOculta(alvoCustodia.url, visualCtx);
  busca = await aguardarFrameCom('favInput', 12000, [tabOculta.id]);
  if (busca) await conterSuperficiePcnet(busca.tab, visualCtx);
  if (!busca) {
    try { await browser.tabs.remove(tabOculta.id); } catch {}
    const erro = new Error('A consulta oculta da Cadeia de Custódia foi aberta, mas o campo da FAV (#numeroDaFAV_Arg) não apareceu a tempo.');
    erro.codigo = 'CUSTODIA_OCULTA_TIMEOUT';
    throw erro;
  }

  return busca;
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
    await aguardarTabCarregado(tabId, 12000);
    await sleep(350);
  }

  // Fluxo validado no console do PCNet:
  // #menuRapido -> opcao Laudos Periciais/Parecer -> onChangeMenu('/APP') ->
  // carregarMenu(menu) -> menu lateral do modulo 1268.
  const modulo = await executarPcnetMainWorld(tabId, 'LOAD_LAUDOS_MODULE');
  if (!modulo?.ok) {
    const detalhes = (modulo?.resultados || []).map(r =>
      `${r.codigo || r.erro || r.erroExecucao || 'falha'} ${r.detalhe || ''}`
    ).join(' | ').slice(0, 1800);
    const e = new Error(`Nao consegui carregar o modulo “Laudos Periciais/Parecer” pelo Menu Rapido nativo do PCNet. ${detalhes}`);
    e.codigo = 'MODULO_LAUDOS_NAO_CARREGOU';
    throw e;
  }

  // Dentro do modulo 1268, aciona o item REAL “Selecionar Laudo/Parecer”.
  // Rota correta confirmada: acessarprocedimentolaudopericialsel.do (singular).
  const abertura = await executarPcnetMainWorld(tabId, 'OPEN_LAUDO_SEARCH');
  if (!abertura?.ok) {
    const detalhes = (abertura?.resultados || []).map(r =>
      `${r.codigo || r.erro || r.erroExecucao || 'falha'} ${r.detalhe || ''}`
    ).join(' | ').slice(0, 1800);
    const e = new Error(`O modulo de Laudos carregou, mas “Selecionar Laudo/Parecer” nao abriu a pesquisa. ${detalhes}`);
    e.codigo = 'TELA_PESQUISA_LAUDO_NAO_LOCALIZADA';
    throw e;
  }

  probe = await executarPcnetMainWorld(tabId, 'PROBE_LAUDO_SEARCH');
  if (!probe?.ok) {
    const detalhes = (probe?.resultados || []).map(r =>
      `${r.codigo || r.erro || r.erroExecucao || 'falha'} casoDeUso=${r.casoDeUso || ''}`
    ).join(' | ').slice(0, 1600);
    const e = new Error(`A Pesquisa de Laudo foi acionada, mas os controles nativos (#idObj_Arg e #btnPesquisar) nao ficaram prontos. ${detalhes}`);
    e.codigo = 'TELA_PESQUISA_LAUDO_NAO_LOCALIZADA';
    throw e;
  }

  return {
    pesquisa: { tabId, frameId: 0, tab: await browser.tabs.get(tabId).catch(() => principal), viaMainWorld: true },
    auxiliarCriada: null,
    abertura,
    modulo
  };
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
