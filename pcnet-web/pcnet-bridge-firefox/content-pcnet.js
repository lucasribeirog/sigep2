(() => {
  const VERSION = '0.2.27.0';
  let ultimoResumo = '';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizar(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim();
  }

  function normalizarFav(texto) {
    return normalizar(texto)
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[.\-]/g, '');
  }

  // O PCNet pode exibir/retornar a mesma FAV com ou sem zeros à esquerda
  // (ex.: 002289075 <-> 2289075). Para comparação, tratamos ambas como o
  // mesmo identificador numérico, sem alterar o valor mostrado no Nexus.
  function canonicalizarNumeroFav(texto) {
    const digitos = String(texto || '').replace(/\D/g, '');
    if (!digitos) return '';
    return digitos.replace(/^0+(?=\d)/, '');
  }

  function textoContemFavExata(texto, favCanonica) {
    if (!favCanonica) return false;
    const grupos = String(texto || '').match(/\d+/g) || [];
    return grupos.some(grupo => canonicalizarNumeroFav(grupo) === favCanonica);
  }

  function detectarCapacidades() {
    const texto = normalizar(document.body?.innerText || '');
    const inputsTexto = Array.from(document.querySelectorAll('input[type="text"]')).filter(el => !el.disabled);
    const botaoNovoBem = document.querySelector('input#botao_menu[value="Novo Bem Material"], input[value="Novo Bem Material"], button[value="Novo Bem Material"]');
    const temNovoBem = Boolean(botaoNovoBem);
    return {
      cadeiaCustodia: Boolean(document.querySelector('img[src*="ico_cadeia_custodia.png"]')),
      aceiteRequisicoes: Boolean(
        document.querySelector('form[name="aceitefatolaudosForm"]')
        && document.querySelector('#btnPesquisar')
        && document.querySelector('#btVerRequisicao')
      ),
      favInput: Boolean(document.querySelector('#numeroDaFAV_Arg')),
      favPesquisar: Boolean(document.querySelector('#btnPesquisar')),
      favLimpar: Boolean(document.querySelector('#btnLimpar')),
      sobCustodia: Boolean(document.querySelector('input[value="Sob Custódia"], button[value="Sob Custódia"], input[value="Sob Custodia"], button[value="Sob Custodia"]')),
      finalidadePericial: Boolean(document.querySelector('#finalidade2')),
      rompeuLacreSim: Boolean(document.querySelector('#houveRompimentoLacre0')),
      rompeuLacreNao: Boolean(document.querySelector('#houveRompimentoLacre1')),
      novoInvolucro: Boolean(document.querySelector('#involucroNumero')),
      gravarCustodia: Boolean(document.querySelector('#btnGrava')),
      laudoSearch: Boolean((document.querySelector('#btnPesquisar') || /acessarprocedimentolaudopericialsel\.do/i.test(location.href)) && inputsTexto.length && (/(?:N[º°o.]?\s*(?:do\s*)?Laudo|Laudo\s+Pericial|Pesquisa\s+de\s+laudo\s+pericial)/i.test(texto) || /acessarprocedimentolaudopericialsel\.do/i.test(location.href))),
      bemMaterialLista: temNovoBem,
      novoBemMaterialBotao: Boolean(botaoNovoBem),
      novoBemMaterial: Boolean(document.querySelector('input[name="novoNumeroInvolucro"]') && document.querySelector('#infAdicional')),
      coletaTela: Boolean(
        document.querySelector('#btnGrava')
        && document.querySelector('#materialColetadoTerceiro1')
        && document.querySelector('#enderecoFatoColeta')
        && document.querySelector('#localizacao')
        && /Coleta/i.test(texto)
      ),
      acondicionamentoTela: Boolean(
        document.querySelector('#btnGrava')
        && document.querySelector('#materialAcondicionadoTerceiro1')
        && document.querySelector('#involucroRompidoStr1')
        && /Acondicionamento/i.test(texto)
      )
    };
  }

  function analisar() {
    const texto = normalizar(document.body?.innerText || '').slice(0, 120000);
    const url = location.href;
    const marcadores = [];

    if (/Menu\s*R[aá]pido/i.test(texto)) marcadores.push('MENU_RAPIDO');
    if (/Sess[aã]o\s+expira\s+em/i.test(texto)) marcadores.push('SESSAO_EXPIRA');
    if (/Seja\s+bem[- ]?vindo/i.test(texto)) marcadores.push('BEM_VINDO');
    if (/PCnet\s*-\s*Sistema\s+de\s+Gerenciamento/i.test(texto)) marcadores.push('RODAPE_PCNET');

    let score = marcadores.length;
    if (/\/APP\/?/i.test(location.pathname)) score += 1;
    if (/loginVM\.zul/i.test(url) || /seg\.id/i.test(url)) score = 0;

    return {
      versao: VERSION,
      autenticado: score >= 2,
      score,
      marcadores,
      capacidades: detectarCapacidades(),
      url,
      titulo: document.title || '',
      topFrame: window.top === window,
      ts: Date.now()
    };
  }

  function enviar(force = false) {
    const payload = analisar();
    const resumo = JSON.stringify({
      autenticado: payload.autenticado,
      score: payload.score,
      marcadores: payload.marcadores,
      capacidades: payload.capacidades,
      url: payload.url,
      titulo: payload.titulo
    });
    if (!force && resumo === ultimoResumo) return;
    ultimoResumo = resumo;
    browser.runtime.sendMessage({ type: 'PCNET_FRAME_HEARTBEAT', payload }).catch(() => {});
  }

  function setValorInput(input, valor) {
    if (!input) return false;
    const proto = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    if (descriptor?.set) descriptor.set.call(input, String(valor));
    else input.value = String(valor);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function clicar(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
    try { el.click(); return true; } catch {}
    return false;
  }

  function escaparRegex(texto) {
    return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function textoVisivelLinha(linha) {
    if (!linha) return '';
    const inner = normalizar(linha.innerText || '');
    if (inner) return inner;

    try {
      const clone = linha.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      return normalizar(clone.textContent || '');
    } catch {
      return '';
    }
  }

  function extrairRegistroLinha(linha, numeroFav) {
    const cells = Array.from(linha?.querySelectorAll?.('td') || [])
      .map((td) => normalizar(td.innerText || td.textContent || ''));
    const alvo = canonicalizarNumeroFav(numeroFav);

    let indiceFav = -1;
    for (let i = 0; i < cells.length; i += 1) {
      const digitos = canonicalizarNumeroFav(cells[i]);
      if (digitos === alvo) {
        indiceFav = i;
        break;
      }
    }

    if (indiceFav >= 0) {
      return {
        situacao: cells[indiceFav - 3] || '',
        classificacao: cells[indiceFav - 2] || '',
        descricao: cells[indiceFav - 1] || '',
        numeroFav: cells[indiceFav] || String(numeroFav || ''),
        lacre: cells[indiceFav + 1] || '',
        unidadeUltimaMovimentacao: cells[indiceFav + 2] || ''
      };
    }

    return {
      situacao: '',
      classificacao: '',
      descricao: textoVisivelLinha(linha),
      numeroFav: String(numeroFav || ''),
      lacre: '',
      unidadeUltimaMovimentacao: ''
    };
  }

  function encontrarLinhaFav(numeroFav) {
    const alvoCanonico = canonicalizarNumeroFav(numeroFav);
    if (!alvoCanonico) return null;

    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"][name*="flagSelecionada"]'));
    for (const checkbox of checkboxes) {
      const linha = checkbox.closest('tr');
      if (!linha) continue;

      const texto = textoVisivelLinha(linha);
      const campos = Array.from(linha.querySelectorAll('input, a'))
        .map(el => normalizar(el.value || el.textContent || el.title || el.getAttribute('href') || ''))
        .filter(Boolean)
        .join(' ');
      const candidato = `${texto} ${campos}`;

      // Comparação numérica exata por grupos de dígitos. Isto evita que
      // 002289075 deixe de casar com 2289075, sem aceitar substring de outro
      // número maior.
      if (!textoContemFavExata(candidato, alvoCanonico)) continue;

      return {
        linha,
        checkbox,
        texto: texto || `FAV ${numeroFav}`,
        registro: extrairRegistroLinha(linha, numeroFav)
      };
    }
    return null;
  }

  async function limparPesquisaFav() {
    let input = document.querySelector('#numeroDaFAV_Arg');
    if (!input) return { ok: false, codigo: 'CAMPO_FAV_NAO_ENCONTRADO' };

    setValorInput(input, '');
    const btnLimpar = document.querySelector('#btnLimpar');
    if (btnLimpar) {
      clicar(btnLimpar);
      await sleep(800);
    }

    input = document.querySelector('#numeroDaFAV_Arg');
    if (input) setValorInput(input, '');
    for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"][name*="flagSelecionada"]:checked'))) {
      clicar(cb);
    }
    await sleep(120);
    return { ok: true, codigo: 'PESQUISA_LIMPA', usouBotaoLimpar: Boolean(btnLimpar) };
  }

  function extrairUrlCustodia(link) {
    if (!link) return null;

    const candidatos = [
      link.getAttribute('href') || '',
      link.getAttribute('onclick') || '',
      link.getAttribute('data-url') || ''
    ];

    const href = candidatos[0].trim();
    if (href && !/^javascript:/i.test(href) && /custodiasel\.do/i.test(href)) {
      try { return new URL(href, location.href).href; } catch {}
    }

    for (const fonte of candidatos) {
      const texto = String(fonte || '');
      const match = texto.match(/["']([^"']*custodiasel\.do[^"']*)["']/i)
        || texto.match(/(\/PCnet\/custodiasel\.do[^\s);]*)/i);
      if (!match?.[1]) continue;
      try { return new URL(match[1], location.href).href; } catch {}
    }

    try {
      return new URL('/PCnet/custodiasel.do?modoJanelaPlc=popup', location.origin).href;
    } catch {
      return null;
    }
  }

  async function obterAlvoCadeiaCustodia() {
    const icone = document.querySelector('img[src*="ico_cadeia_custodia.png"]');
    const link = icone?.closest('a');
    if (!icone || !link) {
      return { ok: false, codigo: 'ICONE_CUSTODIA_NAO_ENCONTRADO' };
    }

    const url = extrairUrlCustodia(link);
    if (!url) {
      return { ok: false, codigo: 'URL_CUSTODIA_NAO_EXTRAIDA' };
    }

    return {
      ok: true,
      codigo: 'CUSTODIA_ALVO_OBTIDO',
      metodo: 'url_sem_popup',
      url,
      target: link.getAttribute('target') || '',
      hrefRaw: link.getAttribute('href') || ''
    };
  }

  async function tentarAbrirAceite() {
    if (document.querySelector('img[src*="ico_cadeia_custodia.png"]')) {
      return { ok: true, codigo: 'ACEITE_JA_ABERTO', metodo: 'custodia_ja_visivel' };
    }

    const candidatos = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], td.menu_item'));
    const alvo = candidatos.find((el) => {
      const txt = normalizar(el.textContent || el.value || el.title || el.getAttribute('alt') || '');
      return /aceite\s*(de\s*)?requisi[cç][oõ]es/i.test(txt)
        || /requisi[cç][oõ]es.*aceite/i.test(txt);
    });

    if (alvo && clicar(alvo)) {
      return { ok: true, codigo: 'ACEITE_COMANDO_ENVIADO', metodo: 'menu_texto' };
    }

    try {
      const init = {
        key: 'F1', code: 'F1', keyCode: 112, which: 112,
        ctrlKey: true, bubbles: true, cancelable: true
      };
      document.dispatchEvent(new KeyboardEvent('keydown', init));
      window.dispatchEvent(new KeyboardEvent('keydown', init));
      document.dispatchEvent(new KeyboardEvent('keyup', init));
      window.dispatchEvent(new KeyboardEvent('keyup', init));
      return { ok: false, tentativa: true, codigo: 'ACEITE_ATALHO_SINTETICO_ENVIADO', metodo: 'ctrl_f1_sintetico' };
    } catch {
      return { ok: false, codigo: 'ACEITE_NAO_LOCALIZADO' };
    }
  }


  function selecionarValor(el, valor) {
    if (!el) return false;
    try {
      const proto = Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
        || Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (descriptor?.set) descriptor.set.call(el, String(valor));
      else el.value = String(valor);

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch {
      try {
        el.value = String(valor);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch {
        return false;
      }
    }
  }

  async function aguardarMudancaEstavelDom(disparar, {
    timeoutMs = 10000,
    quietMs = 450,
    minimoMs = 250
  } = {}) {
    return new Promise((resolve) => {
      let terminou = false;
      let viuMudanca = false;
      let timerQuieto = null;
      let timerTimeout = null;
      const inicio = Date.now();

      const finalizar = (motivo) => {
        if (terminou) return;
        terminou = true;
        if (timerQuieto) clearTimeout(timerQuieto);
        if (timerTimeout) clearTimeout(timerTimeout);
        try { observer.disconnect(); } catch {}
        resolve({
          ok: true,
          motivo,
          viuMudanca,
          duracaoMs: Date.now() - inicio
        });
      };

      const agendarQuieto = () => {
        if (timerQuieto) clearTimeout(timerQuieto);
        timerQuieto = setTimeout(() => {
          if (Date.now() - inicio >= minimoMs) finalizar('dom_estavel');
          else agendarQuieto();
        }, quietMs);
      };

      const observer = new MutationObserver(() => {
        viuMudanca = true;
        agendarQuieto();
      });

      try {
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true
          });
        }
      } catch {}

      timerTimeout = setTimeout(() => finalizar('timeout'), timeoutMs);

      Promise.resolve()
        .then(disparar)
        .then(() => {
          // Caso a tela já estivesse no estado desejado e não haja mutação,
          // não esperamos o timeout completo.
          setTimeout(() => {
            if (!viuMudanca && !terminou) finalizar('sem_mutacao');
          }, 900);
        })
        .catch(() => finalizar('disparo_falhou'));
    });
  }

  async function abrirListaAceite() {
    if (document.querySelector('form[name="aceitefatolaudosForm"]')) {
      return {
        ok: true,
        codigo: 'ACEITE_LISTA_JA_ABERTA',
        metodo: 'formulario_presente'
      };
    }

    const menu = document.querySelector('#menuRapido');
    if (!menu) {
      return {
        ok: false,
        codigo: 'MENU_RAPIDO_NAO_ENCONTRADO'
      };
    }

    const opcoes = Array.from(menu.options || []);
    const opcao = opcoes.find((option) => {
      const valor = String(option.value || '');
      const texto = normalizar(option.textContent || option.innerText || '');
      return /carregaMenu=2103(?:&|&amp;|$)/i.test(valor)
        || /requisi[cç][aã]o\s+pericial\s*\/\s*parecer/i.test(texto);
    });

    if (!opcao?.value) {
      return {
        ok: false,
        codigo: 'OPCAO_ACEITE_NAO_ENCONTRADA'
      };
    }

    const valor = opcao.value;
    const alterado = selecionarValor(menu, valor);

    return {
      ok: alterado,
      codigo: alterado
        ? 'ACEITE_LISTA_NAVEGACAO_ENVIADA'
        : 'ACEITE_LISTA_NAVEGACAO_FALHOU',
      metodo: 'menu_rapido',
      valor
    };
  }

  function parseCsvSeparado(texto, separador = ';') {
    const linhas = [];
    let linha = [];
    let campo = '';
    let entreAspas = false;

    for (let i = 0; i < texto.length; i += 1) {
      const ch = texto[i];

      if (ch === '"') {
        if (entreAspas && texto[i + 1] === '"') {
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
        if (ch === '\r' && texto[i + 1] === '\n') i += 1;

        linha.push(campo);

        if (linha.some((valor) => String(valor || '').trim() !== '')) {
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
      if (linha.some((valor) => String(valor || '').trim() !== '')) {
        linhas.push(linha);
      }
    }

    return linhas;
  }

  function converterCsvAceiteParaObjetos(texto) {
    const limpo = String(texto || '').replace(/^\uFEFF/, '');
    const linhas = parseCsvSeparado(limpo, ';');

    if (!linhas.length) return [];

    return linhas
      .slice(1)
      .map((colunas) => ({
        requisicao: String(colunas[0] || '').trim(),
        procedimentoOrigem: String(colunas[1] || '').trim(),
        situacao: String(colunas[2] || '').trim(),
        tipo: String(colunas[3] || '').trim(),
        natureza: String(colunas[4] || '').trim(),
        unidadeOrigem: String(colunas[5] || '').trim(),
        dataHora: String(colunas[6] || '').trim(),
        especieExame: String(colunas[7] || '').trim(),
        fav: String(colunas[8] || '').trim()
      }))
      .filter((item) => Boolean(item.requisicao));
  }

  async function listarAceiteCsv() {
    if (!document.querySelector('form[name="aceitefatolaudosForm"]')) {
      return {
        ok: false,
        codigo: 'TELA_ACEITE_NAO_ENCONTRADA'
      };
    }

    // Esta V2.16 é SOMENTE LEITURA para Aceite.
    // Limpar/F9 alteram apenas a pesquisa exibida; não modificam requisições.
    let btnLimpar = document.querySelector('#btnLimpar');
    if (btnLimpar) {
      await aguardarMudancaEstavelDom(
        () => clicar(btnLimpar),
        { timeoutMs: 7000, quietMs: 450, minimoMs: 250 }
      );
    }

    let btnPesquisar = document.querySelector('#btnPesquisar');
    if (!btnPesquisar) {
      return {
        ok: false,
        codigo: 'BOTAO_PESQUISAR_ACEITE_NAO_ENCONTRADO'
      };
    }

    await aguardarMudancaEstavelDom(
      () => clicar(btnPesquisar),
      { timeoutMs: 12000, quietMs: 550, minimoMs: 350 }
    );

    const response = await fetch(
      '/LAUDOSPERICIAIS/aceitefatolaudossel.do?evento=exportarCSV',
      {
        credentials: 'include',
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        codigo: 'CSV_ACEITE_HTTP_ERRO',
        statusHttp: response.status
      };
    }

    const tipo = String(response.headers.get('content-type') || '');
    const buffer = await response.arrayBuffer();
    const texto = new TextDecoder('windows-1252').decode(buffer);

    if (!/N[ºo°]\s*Requisi[cç][aã]o/i.test(texto.slice(0, 300))) {
      return {
        ok: false,
        codigo: 'CSV_ACEITE_CONTEUDO_INESPERADO',
        contentType: tipo
      };
    }

    const itens = converterCsvAceiteParaObjetos(texto);

    return {
      ok: true,
      codigo: 'ACEITE_LISTADO',
      total: itens.length,
      itens,
      atualizadoEm: Date.now(),
      contentType: tipo
    };
  }

  async function buscarFav(numeroFav, selecionar = true) {
    let input = document.querySelector('#numeroDaFAV_Arg');
    let btnPesquisar = document.querySelector('#btnPesquisar');
    if (!input || !btnPesquisar) {
      return { ok: false, codigo: 'TELA_BUSCA_FAV_NAO_ENCONTRADA' };
    }

    const numeroOriginal = String(numeroFav ?? '').trim();
    const numeroCanonico = canonicalizarNumeroFav(numeroOriginal);

    async function pesquisarUmaVez(valorPesquisa, timeoutMs = 12000) {
      const limpeza = await limparPesquisaFav();
      if (!limpeza?.ok) return { erroLimpeza: limpeza };

      input = document.querySelector('#numeroDaFAV_Arg');
      btnPesquisar = document.querySelector('#btnPesquisar');
      if (!input || !btnPesquisar) {
        return { erroTela: { ok: false, codigo: 'TELA_BUSCA_FAV_NAO_ENCONTRADA_APOS_LIMPEZA' } };
      }

      setValorInput(input, valorPesquisa);
      clicar(btnPesquisar);

      const limite = Date.now() + timeoutMs;
      while (Date.now() < limite) {
        await sleep(250);
        const achado = encontrarLinhaFav(numeroOriginal);
        if (achado) return { achado, limpeza };
      }
      return { achado: null, limpeza };
    }

    let tentativa = await pesquisarUmaVez(numeroOriginal, 12000);
    if (tentativa?.erroLimpeza) return tentativa.erroLimpeza;
    if (tentativa?.erroTela) return tentativa.erroTela;

    // Alguns formulários do PCNet aceitam a FAV com zeros à esquerda, mas a
    // consulta de custódia pode pesquisar pelo valor numérico sem esses zeros.
    // Só fazemos a tentativa canônica quando os valores realmente diferem.
    if (!tentativa.achado && numeroCanonico && numeroCanonico !== numeroOriginal.replace(/\D/g, '')) {
      tentativa = await pesquisarUmaVez(numeroCanonico, 12000);
      if (tentativa?.erroLimpeza) return tentativa.erroLimpeza;
      if (tentativa?.erroTela) return tentativa.erroTela;
    }

    // A primeira consulta após abrir/recarregar a Cadeia de Custódia pode ser
    // ignorada pelo PCNet enquanto o AJAX anterior ainda termina. Como pesquisar
    // é uma operação somente de leitura, repetimos internamente uma única vez
    // antes de informar FAV não encontrada. Isso elimina a necessidade de o
    // usuário clicar em "Movimentar FAV" pela segunda vez.
    if (!tentativa.achado) {
      await sleep(600);
      const valorRetry = numeroCanonico || numeroOriginal;
      tentativa = await pesquisarUmaVez(valorRetry, 15000);
      if (tentativa?.erroLimpeza) return tentativa.erroLimpeza;
      if (tentativa?.erroTela) return tentativa.erroTela;
    }

    const achado = tentativa.achado;
    if (!achado) {
      const erro = document.querySelector('.msg_erro, td.msg_erro, div.msg_erro');
      const mensagemSistema = normalizar(erro?.innerText || erro?.textContent || '');
      return {
        ok: false,
        codigo: 'FAV_NAO_ENCONTRADA',
        numeroFav: numeroOriginal,
        numeroFavCanonico: numeroCanonico || null,
        mensagemSistema: mensagemSistema || null
      };
    }

    if (selecionar && !achado.checkbox.checked) clicar(achado.checkbox);
    await sleep(180);

    return {
      ok: true,
      codigo: 'FAV_ENCONTRADA',
      numeroFav: numeroOriginal,
      numeroFavCanonico: numeroCanonico || null,
      selecionada: Boolean(achado.checkbox.checked || !selecionar),
      linha: normalizar(achado.texto).slice(0, 320),
      registro: achado.registro,
      checkboxName: achado.checkbox.name || '',
      pesquisaLimpa: true,
      capacidades: detectarCapacidades()
    };
  }

  function forcarAlvosNoMesmoTab(botao) {
    try {
      const form = botao?.form || botao?.closest?.('form');
      if (form) {
        form.setAttribute('target', '_self');
        try { form.target = '_self'; } catch {}
      }
      try { botao?.setAttribute?.('formtarget', '_self'); } catch {}

      // As telas de Coleta/Acondicionamento usam a funcao legada janela(...)
      // depois de um POST que guarda os itens selecionados no servidor. Como a
      // aba de custodia ja esta oculta, redirecionamos janela()/window.open()
      // para o proprio documento. Assim a automacao nao exibe popup ao usuario.
      if (typeof exportFunction === 'function' && window.wrappedJSObject) {
        const page = window.wrappedJSObject;
        const originalOpen = page.open;
        const originalJanela = page.janela;
        const selfOpen = exportFunction(function(url) {
          try { if (url) page.location.href = String(url); } catch {}
          return page;
        }, page);
        const selfJanela = exportFunction(function(url) {
          try { if (url) page.location.href = String(url); } catch {}
          return page;
        }, page);

        try { page.open = selfOpen; } catch {}
        try { if (typeof originalJanela === 'function') page.janela = selfJanela; } catch {}

        setTimeout(() => {
          try { page.open = originalOpen; } catch {}
          try { if (typeof originalJanela === 'function') page.janela = originalJanela; } catch {}
        }, 5000);
      }
    } catch {}
  }

  async function abrirSobCustodiaNoMesmoTab(numeroFav) {
    const achado = encontrarLinhaFav(numeroFav);
    if (!achado) return { ok: false, codigo: 'FAV_NAO_ESTA_MAIS_NA_TELA' };
    if (!achado.checkbox.checked) {
      clicar(achado.checkbox);
      await sleep(150);
    }
    if (!achado.checkbox.checked) {
      return { ok: false, codigo: 'FAV_NAO_SELECIONADA' };
    }

    const btn = document.querySelector('input[value="Sob Custódia"], button[value="Sob Custódia"], input[value="Sob Custodia"], button[value="Sob Custodia"]');
    if (!btn) return { ok: false, codigo: 'BOTAO_SOB_CUSTODIA_NAO_ENCONTRADO' };

    forcarAlvosNoMesmoTab(btn);
    const clicou = clicar(btn);
    return {
      ok: Boolean(clicou),
      codigo: clicou ? 'SOB_CUSTODIA_DISPARADO' : 'SOB_CUSTODIA_NAO_CLICADO',
      numeroFav: String(numeroFav)
    };
  }

  function chamarFuncaoPagina(nome, elemento) {
    try {
      const page = window.wrappedJSObject;
      const fn = page?.[nome];
      if (typeof fn !== 'function') return false;
      fn.call(page, elemento?.wrappedJSObject || elemento);
      return true;
    } catch {
      return false;
    }
  }

  function chamarFuncaoPaginaArgs(nome, ...args) {
    try {
      const page = window.wrappedJSObject;
      const fn = page?.[nome];
      if (typeof fn !== 'function') return false;
      fn.apply(page, args);
      return true;
    } catch {
      return false;
    }
  }

  function elementosClicaveis() {
    return Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], td.menu_item, span'));
  }

  function textoElemento(el) {
    return normalizar(el?.innerText || el?.textContent || el?.value || el?.title || el?.getAttribute?.('alt') || '');
  }

  async function tentarAbrirPesquisaLaudo() {
    if (detectarCapacidades().laudoSearch) return { ok: true, codigo: 'PESQUISA_LAUDO_JA_ABERTA' };

    const candidatos = elementosClicaveis();
    const alvo = candidatos.find(el => {
      const txt = textoElemento(el);
      const onclick = String(el.getAttribute?.('onclick') || '');
      return /acessarprocedimentolaudopericialsel\.do/i.test(onclick)
        || /(?:pesquisar|consultar|acessar).*laudo|laudo.*(?:pesquisar|consultar|acessar)/i.test(txt);
    });
    if (alvo && clicar(alvo)) return { ok: true, codigo: 'PESQUISA_LAUDO_MENU_DISPARADO', metodo: 'menu_real' };
    return { ok: false, codigo: 'PESQUISA_LAUDO_NAO_LOCALIZADA' };
  }

  async function pesquisarEAbrirLaudo(numeroLaudo) {
    if (!detectarCapacidades().laudoSearch) return { ok: false, codigo: 'TELA_PESQUISA_LAUDO_NAO_ENCONTRADA' };
    const numero = normalizar(numeroLaudo);
    if (!numero) return { ok: false, codigo: 'NUMERO_LAUDO_VAZIO' };

    const btnLimpar = document.querySelector('#btnLimpar') || elementosClicaveis().find(el => /^Limpar$/i.test(textoElemento(el)));
    if (btnLimpar) { clicar(btnLimpar); await sleep(350); }

    const inputs = Array.from(document.querySelectorAll('input[type="text"]')).filter(el => !el.disabled && el.offsetParent !== null);
    if (!inputs.length) return { ok: false, codigo: 'CAMPO_NUMERO_LAUDO_NAO_ENCONTRADO' };
    setValorInput(inputs[0], numero);

    const pesquisar = document.querySelector('#btnPesquisar') || elementosClicaveis().find(el => /Pesquisar|F9/i.test(textoElemento(el)));
    if (!pesquisar) return { ok: false, codigo: 'BOTAO_PESQUISAR_LAUDO_NAO_ENCONTRADO' };
    clicar(pesquisar);

    const limite = Date.now() + 10000;
    let linha = null;
    const digitos = numero.replace(/\D/g, '');
    const numeroCanonico = (digitos.replace(/^0+/, '') || '0');

    // O PCNet aceita, por exemplo, 019179615 na pesquisa, mas a grade pode
    // exibir 19179615 (suprimindo o zero inicial). Portanto a identificação
    // da linha deve comparar o valor numérico canônico, e não a string crua.
    const mesmoNumeroLaudo = (valor) => {
      const d = String(valor || '').replace(/\D/g, '');
      if (!d) return false;
      return (d.replace(/^0+/, '') || '0') === numeroCanonico;
    };

    while (Date.now() < limite) {
      await sleep(250);
      const linhas = Array.from(document.querySelectorAll('tr'));
      linha = linhas.find(tr => {
        const txt = textoVisivelLinha(tr);
        if (/N[º°o.]?\s*(?:do\s*)?Laudo/i.test(txt)) return false;

        // Preferimos comparar célula por célula para não misturar o número do
        // laudo com requisição, procedimento e outros números da mesma linha.
        const celulas = Array.from(tr.querySelectorAll('td'));
        if (celulas.some(td => mesmoNumeroLaudo(textoElemento(td)))) return true;

        // Fallback para layouts antigos em que o resultado não vem em TDs.
        const tokensNumericos = txt.match(/\d+/g) || [];
        return tokensNumericos.some(mesmoNumeroLaudo);
      }) || null;
      if (linha) break;
    }
    if (!linha) return { ok: false, codigo: 'LAUDO_NAO_ENCONTRADO', numeroLaudo: numero };

    const alvo = linha.querySelector('td') || linha;
    try { alvo.scrollIntoView({ block: 'center' }); } catch {}
    clicar(alvo);
    await sleep(120);
    try { alvo.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })); } catch {}
    return { ok: true, codigo: 'LAUDO_ABERTURA_DISPARADA', numeroLaudo: numero };
  }

  function elementoVisivel(el) {
    if (!el) return false;
    try {
      const st = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || '1') > 0 && r.width > 0 && r.height > 0;
    } catch {
      return true;
    }
  }

  function localizarControleEsconderMostrar() {
    const seletores = [
      '[title="ESCONDER/MOSTRAR" i]',
      '[title*="ESCONDER/MOSTRAR" i]',
      '[alt="ESCONDER/MOSTRAR" i]',
      '[alt*="ESCONDER/MOSTRAR" i]',
      'input[value="ESCONDER/MOSTRAR" i]',
      'button[value="ESCONDER/MOSTRAR" i]'
    ];
    for (const sel of seletores) {
      const el = document.querySelector(sel);
      if (el && elementoVisivel(el)) return el;
    }
    return Array.from(document.querySelectorAll('a,button,input,img,span,td')).find(el =>
      elementoVisivel(el) && /ESCONDER\s*\/\s*MOSTRAR/i.test(textoElemento(el))
    ) || null;
  }

  function localizarMenuBensMateriais() {
    const candidatos = Array.from(document.querySelectorAll('td, a, span, div, button, input[type="button"]'));
    return candidatos.find(el => {
      const t = textoElemento(el);
      return elementoVisivel(el) && /^Bens\s+Materiais$/i.test(t);
    }) || null;
  }

  function localizarAcessarCadastrar() {
    return Array.from(document.querySelectorAll('td, a, span, div, button, input[type="button"], input[type="submit"]')).find(el =>
      elementoVisivel(el) && /^Acessar\s*\/\s*Cadastrar$/i.test(textoElemento(el))
    ) || null;
  }

  async function mostrarMenuLateralSeNecessario() {
    // Se "Bens Materiais" já está visível, não toca no alternador para não recolher o menu.
    if (localizarMenuBensMateriais()) return { ok: true, codigo: 'MENU_LATERAL_JA_VISIVEL' };

    const toggle = localizarControleEsconderMostrar();
    if (!toggle) return { ok: false, codigo: 'ESCONDER_MOSTRAR_NAO_ENCONTRADO' };

    // Em algumas telas o title fica na imagem e o onclick no <a> pai.
    const alvo = toggle.closest?.('a,button,td') || toggle;
    if (!clicar(alvo)) return { ok: false, codigo: 'ESCONDER_MOSTRAR_CLIQUE_FALHOU' };
    await sleep(350);
    return { ok: true, codigo: 'ESCONDER_MOSTRAR_CLICADO' };
  }

  async function abrirMenuBensMateriais() {
    const menu = localizarMenuBensMateriais();
    if (menu && clicar(menu)) {
      await sleep(350);
      return { ok: true, codigo: 'BENS_MATERIAIS_CLICADO', metodo: 'clique_real_menu' };
    }

    // Fallback legado, usado somente se o elemento visual não estiver disponível.
    if (chamarFuncaoPaginaArgs('expandeMenu', '#Bens Materiais')) {
      await sleep(350);
      return { ok: true, codigo: 'BENS_MATERIAIS_EXPANDEMENU', metodo: 'expandeMenu' };
    }
    return { ok: false, codigo: 'BENS_MATERIAIS_MENU_NAO_ENCONTRADO' };
  }

  async function abrirAcessarCadastrarBensMateriais() {
    const alvo = localizarAcessarCadastrar();
    if (alvo && clicar(alvo)) {
      return { ok: true, codigo: 'ACESSAR_CADASTRAR_CLICADO', metodo: 'clique_real_menu' };
    }

    // Mantém a rota histórica como fallback depois de tentar exatamente o fluxo visual.
    if (chamarFuncaoPaginaArgs('redirectajaxCnet', '/PCnet/acessarbemmaterialsel.do?evento=F9-Pesquisar&janelaModal=N')) {
      return { ok: true, codigo: 'ACESSAR_CADASTRAR_REDIRECT', metodo: 'redirectajaxCnet' };
    }
    return { ok: false, codigo: 'ACESSAR_CADASTRAR_NAO_ENCONTRADO' };
  }

  async function abrirBensMateriaisLegado() {
    // Replica a sequência do pcnetService antigo, no contexto JS real da página.
    // Não depende de o menu lateral estar visualmente aberto.
    const etapas = { mudaMenu: false, expandeMenu: false, redirect: false };

    try {
      etapas.mudaMenu = chamarFuncaoPaginaArgs('mudaMenu', '/APP');
      await sleep(1200);
    } catch {}

    try {
      etapas.expandeMenu = chamarFuncaoPaginaArgs('expandeMenu', '#Bens Materiais');
      await sleep(1200);
    } catch {}

    try {
      etapas.redirect = chamarFuncaoPaginaArgs(
        'redirectajaxCnet',
        '/PCnet/acessarbemmaterialsel.do?evento=F9-Pesquisar&janelaModal=N'
      );
    } catch {}

    // Mesmo que o redirect descarregue o frame logo após a chamada, o background
    // confirmará o sucesso pela aparição efetiva da lista de Bens Materiais.
    return {
      ok: Boolean(etapas.redirect || etapas.expandeMenu || etapas.mudaMenu),
      codigo: etapas.redirect ? 'BENS_MATERIAIS_LEGACY_REDIRECT_DISPARADO'
        : etapas.expandeMenu ? 'BENS_MATERIAIS_LEGACY_MENU_EXPANDIDO'
          : etapas.mudaMenu ? 'BENS_MATERIAIS_LEGACY_MUDAMENU_DISPARADO'
            : 'BENS_MATERIAIS_LEGACY_FUNCOES_NAO_ENCONTRADAS',
      etapas
    };
  }

  async function abrirBensMateriais() {
    // Compatibilidade: executa a mesma sequência solicitada pelo usuário em um único comando.
    const t = await mostrarMenuLateralSeNecessario();
    if (!t.ok && t.codigo !== 'ESCONDER_MOSTRAR_NAO_ENCONTRADO') return t;
    const b = await abrirMenuBensMateriais();
    if (!b.ok) return b;
    return abrirAcessarCadastrarBensMateriais();
  }

  function extrairFavsVisiveis() {
    const saida = new Set();
    const aceitar = (valor) => {
      const t = normalizar(valor);
      const ms = t.match(/\b\d{5,9}(?:\/20\d{2})?\b/g) || [];
      for (const m of ms) saida.add(m);
    };

    for (const table of Array.from(document.querySelectorAll('table'))) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) continue;
      let idxFav = -1;
      for (const row of rows.slice(0, 4)) {
        const cells = Array.from(row.querySelectorAll('th,td'));
        const idx = cells.findIndex(c => /(?:N[uú]mero\s+da\s+)?FAV/i.test(normalizar(c.innerText || c.textContent || '')));
        if (idx >= 0) { idxFav = idx; break; }
      }
      if (idxFav >= 0) {
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells[idxFav]) aceitar(cells[idxFav].innerText || cells[idxFav].textContent || '');
        }
      }
    }

    for (const el of Array.from(document.querySelectorAll('input[name*="fav" i], input[id*="fav" i]'))) aceitar(el.value || '');
    // Na tela “Acessa Outro Bem Material”, o campo identificadorUnico e rotulado
    // como “Identificacao unica/Numero FAV”. Depois da gravacao ele pode conter
    // diretamente a FAV recem-gerada.
    const identificadorUnico = document.querySelector('#identificadorUnico, input[name="identificadorUnico"]');
    if (identificadorUnico) aceitar(identificadorUnico.value || '');
    const texto = normalizar(document.body?.innerText || '');
    const rx = /(?:FAV|Ficha\s+de\s+Acompanhamento)[^0-9]{0,30}(\d{5,9}(?:\/20\d{2})?)/gi;
    let m;
    while ((m = rx.exec(texto))) saida.add(m[1]);
    return [...saida];
  }

  async function abrirNovoBemMaterial() {
    const btn = document.querySelector('input#botao_menu[value="Novo Bem Material"]')
      || document.querySelector('input[value="Novo Bem Material"], button[value="Novo Bem Material"]')
      || elementosClicaveis().find(el => /Novo\s+Bem\s+Material/i.test(textoElemento(el)));
    if (btn && clicar(btn)) return { ok: true, codigo: 'NOVO_BEM_MATERIAL_DISPARADO', favsAntes: extrairFavsVisiveis() };
    if (chamarFuncaoPaginaArgs('novoBemaMaterial')) return { ok: true, codigo: 'NOVO_BEM_MATERIAL_FUNCAO_DISPARADA', favsAntes: extrairFavsVisiveis() };
    return { ok: false, codigo: 'BOTAO_NOVO_BEM_MATERIAL_NAO_ENCONTRADO', favsAntes: extrairFavsVisiveis() };
  }

  async function preencherESalvarAmostra(payload = {}) {
    const lacre = normalizar(payload.numeroLacre || payload.numero_lacre || '');
    const descricao = normalizar(payload.descricao || '');
    const input = document.querySelector('input[name="novoNumeroInvolucro"]');
    const info = document.querySelector('#infAdicional');
    if (!input || !info) return { ok: false, codigo: 'TELA_NOVO_BEM_MATERIAL_NAO_ENCONTRADA' };
    if (!lacre) return { ok: false, codigo: 'LACRE_AMOSTRA_VAZIO' };

    setValorInput(input, lacre);
    setValorInput(info, descricao);
    await sleep(150);

    const btnSalvar = elementosClicaveis().find(el => /^Salvar$/i.test(textoElemento(el)))
      || document.querySelector('input[value="Salvar"], button[value="Salvar"]');
    if (!btnSalvar) return { ok: false, codigo: 'BOTAO_SALVAR_AMOSTRA_NAO_ENCONTRADO' };
    clicar(btnSalvar);
    return { ok: true, codigo: 'SALVAR_AMOSTRA_DISPARADO', lacre, ts: Date.now() };
  }

  function extrairFavPorLacre(numeroLacre) {
    const lacre = normalizar(numeroLacre);
    if (!lacre) return null;
    const lacreDigitos = lacre.replace(/\D/g, '');

    // Primeiro usa a estrutura da tabela: identifica a coluna FAV pelo cabeçalho
    // e só aceita o valor dessa coluna na linha que contém o lacre da amostra.
    for (const table of Array.from(document.querySelectorAll('table'))) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) continue;
      let idxFav = -1;
      for (const row of rows.slice(0, 5)) {
        const cells = Array.from(row.querySelectorAll('th,td'));
        const idx = cells.findIndex(c => /(?:N[uú]mero\s+da\s+)?FAV/i.test(normalizar(c.innerText || c.textContent || '')));
        if (idx >= 0) { idxFav = idx; break; }
      }
      if (idxFav < 0) continue;

      for (const row of rows) {
        const texto = textoVisivelLinha(row);
        if (!texto) continue;
        const compacto = texto.replace(/\D/g, '');
        if (!texto.includes(lacre) && !(lacreDigitos && compacto.includes(lacreDigitos))) continue;
        const cells = Array.from(row.querySelectorAll('td'));
        const valor = normalizar(cells[idxFav]?.innerText || cells[idxFav]?.textContent || '');
        const m = valor.match(/(\d{5,9}(?:\/20\d{2})?)/);
        if (m && m[1].replace(/\D/g, '') !== lacreDigitos) return m[1];
      }
    }

    // Fallback para layouts antigos sem cabeçalho identificável.
    for (const tr of Array.from(document.querySelectorAll('tr'))) {
      const texto = textoVisivelLinha(tr);
      if (!texto) continue;
      const compacto = texto.replace(/\D/g, '');
      if (!texto.includes(lacre) && !(lacreDigitos && compacto.includes(lacreDigitos))) continue;
      const m = texto.match(/FAV[^0-9]{0,20}(\d{5,9}(?:\/20\d{2})?)/i);
      if (m && m[1].replace(/\D/g, '') !== lacreDigitos) return m[1];
    }
    return null;
  }

  async function lerResultadoAmostra(payload = {}) {
    const erro = lerErroSistema();
    const identificador = normalizar(document.querySelector('#identificadorUnico, input[name="identificadorUnico"]')?.value || '');
    const favIdentificador = /^\d{5,9}(?:\/20\d{2})?$/.test(identificador) ? identificador : null;
    return {
      ok: !erro,
      codigo: erro ? 'AMOSTRA_COM_ERRO' : 'AMOSTRA_SEM_ERRO_VISIVEL',
      mensagemSistema: erro || null,
      mensagemSucesso: lerMensagemSucesso() || null,
      favs: extrairFavsVisiveis(),
      favPorIdentificador: favIdentificador,
      favPorLacre: extrairFavPorLacre(payload?.numeroLacre || payload?.numero_lacre || ''),
      capacidades: detectarCapacidades(),
      url: location.href,
      titulo: document.title || ''
    };
  }

  async function abrirEtapaCustodiaNoMesmoTab(numeroFav, etapa) {
    const achado = encontrarLinhaFav(numeroFav);
    if (!achado) return { ok: false, codigo: 'FAV_NAO_ESTA_MAIS_NA_TELA' };
    if (!achado.checkbox.checked) { clicar(achado.checkbox); await sleep(120); }
    if (!achado.checkbox.checked) return { ok: false, codigo: 'FAV_NAO_SELECIONADA' };

    const coleta = etapa === 'COLETA';
    const btn = coleta
      ? (document.querySelector('input[value="Coleta"][onclick*="gerarColetaMult"]')
        || elementosClicaveis().find(el => /^Coleta$/i.test(textoElemento(el)) && /gerarColetaMult/i.test(String(el.getAttribute?.('onclick') || ''))))
      : (document.querySelector('input[value="Acondicionamento"][onclick*="gerarAcondicionamentoMult"]')
        || elementosClicaveis().find(el => /^Acondicionamento$/i.test(textoElemento(el)) && /gerarAcondicionamentoMult/i.test(String(el.getAttribute?.('onclick') || ''))));

    if (!btn) return { ok: false, codigo: coleta ? 'BOTAO_COLETA_NAO_ENCONTRADO' : 'BOTAO_ACONDICIONAMENTO_NAO_ENCONTRADO' };
    forcarAlvosNoMesmoTab(btn);
    clicar(btn);
    return { ok: true, codigo: coleta ? 'COLETA_DISPARADA' : 'ACONDICIONAMENTO_DISPARADO', numeroFav: String(numeroFav) };
  }

  async function preencherESalvarColeta(payload = {}) {
    const erroAntes = lerErroSistema();
    if (erroAntes) return { ok: false, codigo: 'ERRO_ANTES_COLETA', mensagemSistema: erroAntes };

    const unidade = normalizar(payload?.unidadeUsuario || payload?.unidade_usuario || payload?.unidade || '');
    if (!unidade) return { ok: false, codigo: 'UNIDADE_USUARIO_OBRIGATORIA' };

    const radioNao = document.querySelector('#materialColetadoTerceiro1');
    const endereco = document.querySelector('#enderecoFatoColeta');
    const localizacao = document.querySelector('#localizacao');
    const btn = document.querySelector('#btnGrava');
    if (!radioNao || !endereco || !localizacao || !btn) {
      return { ok: false, codigo: 'TELA_COLETA_INCOMPLETA' };
    }

    if (!radioNao.checked) clicar(radioNao);
    await sleep(100);
    setValorInput(endereco, unidade);
    setValorInput(localizacao, unidade);
    try { chamarFuncaoPaginaArgs('campoAlterado'); } catch {}
    await sleep(80);

    const onclick = String(btn.getAttribute('onclick') || '');
    if (!/GRAVAR_F6/i.test(onclick)) {
      return { ok: false, codigo: 'SALVAR_COLETA_GRAVAR_F6_NAO_CONFIRMADO' };
    }
    clicar(btn);
    return {
      ok: true,
      codigo: 'COLETA_GRAVACAO_DISPARADA',
      unidade,
      terceiro: 'NAO',
      endereco: normalizar(endereco.value),
      localizacao: normalizar(localizacao.value),
      ts: Date.now()
    };
  }

  async function preencherESalvarAcondicionamento() {
    const erroAntes = lerErroSistema();
    if (erroAntes) return { ok: false, codigo: 'ERRO_ANTES_ACONDICIONAMENTO', mensagemSistema: erroAntes };

    const terceiroNao = document.querySelector('#materialAcondicionadoTerceiro1');
    const rompimentoNao = document.querySelector('#involucroRompidoStr1');
    const novoInvolucro = document.querySelector('#involucroNumero');
    const outroTipo = document.querySelector('#outroTipoEmbalagemStr');
    const btn = document.querySelector('#btnGrava');
    if (!terceiroNao || !rompimentoNao || !btn) {
      return { ok: false, codigo: 'TELA_ACONDICIONAMENTO_INCOMPLETA' };
    }

    if (!terceiroNao.checked) clicar(terceiroNao);
    await sleep(80);
    if (!rompimentoNao.checked) clicar(rompimentoNao);
    await sleep(100);

    // Nao houve rompimento: o lacre informado na criacao da FAV permanece o
    // atual. O PCNet deve manter o campo de novo invólucro desabilitado/vazio.
    if (outroTipo?.checked) clicar(outroTipo);
    if (novoInvolucro) {
      try { novoInvolucro.value = ''; } catch {}
      novoInvolucro.disabled = true;
    }

    const onclick = String(btn.getAttribute('onclick') || '');
    if (!/GRAVAR_F6/i.test(onclick)) {
      return { ok: false, codigo: 'SALVAR_ACONDICIONAMENTO_GRAVAR_F6_NAO_CONFIRMADO' };
    }
    clicar(btn);
    return {
      ok: true,
      codigo: 'ACONDICIONAMENTO_GRAVACAO_DISPARADA',
      terceiro: 'NAO',
      houveRompimento: 'NAO',
      novoLacreInformado: false,
      ts: Date.now()
    };
  }

  async function prepararCustodia(novoLacre = '') {
    const finalidade = document.querySelector('#finalidade2');
    if (!finalidade) return { ok: false, codigo: 'FINALIDADE_PERICIAL_NAO_ENCONTRADA' };

    if (!finalidade.checked) clicar(finalidade);
    chamarFuncaoPagina('campoAlterado', finalidade);
    await sleep(180);

    const lacre = normalizar(novoLacre);
    if (lacre) {
      const radioSim = document.querySelector('#houveRompimentoLacre0');
      if (!radioSim) return { ok: false, codigo: 'ROMPIMENTO_SIM_NAO_ENCONTRADO' };
      if (!radioSim.checked) clicar(radioSim);
      chamarFuncaoPagina('habilitarDesabilitarCampoNovoInvolucro', radioSim);
      await sleep(180);

      const inputLacre = document.querySelector('#involucroNumero');
      if (!inputLacre) return { ok: false, codigo: 'NOVO_INVOLUCRO_NAO_ENCONTRADO' };
      setValorInput(inputLacre, lacre);
    } else {
      const radioNao = document.querySelector('#houveRompimentoLacre1');
      if (!radioNao) return { ok: false, codigo: 'ROMPIMENTO_NAO_NAO_ENCONTRADO' };
      if (!radioNao.checked) clicar(radioNao);
      chamarFuncaoPagina('habilitarDesabilitarCampoNovoInvolucro', radioNao);
      await sleep(120);
    }

    const inputAtual = document.querySelector('#involucroNumero');
    return {
      ok: true,
      codigo: 'CUSTODIA_PREENCHIDA',
      finalidadePericial: Boolean(document.querySelector('#finalidade2')?.checked),
      houveRompimento: lacre ? 'SIM' : 'NAO',
      novoLacre: lacre ? normalizar(inputAtual?.value || lacre) : '',
      podeGravar: Boolean(document.querySelector('#btnGrava'))
    };
  }

  function lerErroSistema() {
    const candidatos = Array.from(document.querySelectorAll('.msg_erro, td.msg_erro, div.msg_erro, .erro, .error'));
    for (const el of candidatos) {
      const texto = normalizar(el?.innerText || el?.textContent || '');
      if (texto) return texto;
    }
    return '';
  }

  function lerMensagemSucesso() {
    const candidatos = Array.from(document.querySelectorAll('#msg_confirma_id, .msg_confirma, td.msg_confirma, div.msg_confirma, .msg_sucesso, .sucesso, .success, td.msg_sucesso, div.msg_sucesso'));
    for (const el of candidatos) {
      const texto = normalizar(el?.innerText || el?.textContent || '');
      if (texto) return texto;
    }
    return '';
  }

  async function gravarCustodia() {
    const erroAntes = lerErroSistema();
    if (erroAntes) return { ok: false, codigo: 'ERRO_ANTES_DE_GRAVAR', mensagemSistema: erroAntes };

    const btn = document.querySelector('#btnGrava');
    if (!btn) return { ok: false, codigo: 'BOTAO_GRAVAR_NAO_ENCONTRADO' };
    clicar(btn);

    // Retorna rapidamente; o background acompanha a tela após a submissão.
    return { ok: true, codigo: 'GRAVACAO_DISPARADA', ts: Date.now() };
  }

  async function lerResultadoCustodia() {
    const erro = lerErroSistema();
    const sucesso = lerMensagemSucesso();
    return {
      ok: !erro,
      codigo: erro ? 'CUSTODIA_COM_ERRO' : 'CUSTODIA_SEM_ERRO_VISIVEL',
      mensagemSistema: erro || null,
      mensagemSucesso: sucesso || null,
      btnGravaDisponivel: Boolean(document.querySelector('#btnGrava') && !document.querySelector('#btnGrava')?.disabled),
      btnFecharDisponivel: Boolean(document.querySelector('#fechar_id')),
      capacidades: detectarCapacidades(),
      url: location.href,
      titulo: document.title || ''
    };
  }


  async function marcarAlvoNativo(token) {
    const valor = normalizar(token);
    if (!valor || !/^NEXUSPCNET_[A-Za-z0-9_-]{12,96}$/.test(valor)) {
      return { ok: false, codigo: 'TOKEN_NATIVO_INVALIDO' };
    }
    try {
      if (window.top === window) {
        const atual = String(document.title || '').replace(/^NEXUSPCNET_[A-Za-z0-9_-]+\s+/, '');
        document.title = `${valor} ${atual || 'PCNet'}`;
        return { ok: true, codigo: 'ALVO_NATIVO_MARCADO', titulo: document.title };
      }
      return { ok: false, codigo: 'ALVO_NATIVO_NAO_TOP_FRAME' };
    } catch (error) {
      return { ok: false, codigo: 'ALVO_NATIVO_MARCA_FALHOU', erro: error?.message || String(error) };
    }
  }

  async function executarComando(action, payload = {}) {
    switch (action) {
      case 'PROBE':
        return { ok: true, codigo: 'PROBE', analise: analisar() };
      case 'OPEN_ACCEPTANCE':
        return tentarAbrirAceite();
      case 'OPEN_ACCEPTANCE_LIST':
        return abrirListaAceite();
      case 'LIST_ACCEPTANCE':
        return listarAceiteCsv();
      case 'GET_CUSTODY_TARGET':
        return obterAlvoCadeiaCustodia();
      case 'SEARCH_FAV':
        return buscarFav(payload?.numeroFav, payload?.selecionar !== false);
      case 'OPEN_SOB_CUSTODIA_SELF':
        return abrirSobCustodiaNoMesmoTab(payload?.numeroFav);
      case 'PREPARE_CUSTODY':
        return prepararCustodia(payload?.novoLacre || '');
      case 'CLICK_SAVE_CUSTODY':
        return gravarCustodia();
      case 'READ_CUSTODY_RESULT':
        return lerResultadoCustodia();
      case 'MARK_NATIVE_TARGET':
        return marcarAlvoNativo(payload?.token || '');
      case 'OPEN_LAUDO_SEARCH':
        return tentarAbrirPesquisaLaudo();
      case 'SEARCH_OPEN_LAUDO':
        return pesquisarEAbrirLaudo(payload?.numeroLaudo || payload?.numero_laudo);
      case 'SHOW_SIDE_MENU':
        return mostrarMenuLateralSeNecessario();
      case 'OPEN_BENS_MATERIAIS_LEGACY':
        return abrirBensMateriaisLegado();
      case 'OPEN_BENS_MATERIAIS_MENU':
        return abrirMenuBensMateriais();
      case 'OPEN_BENS_MATERIAIS_ACCESS':
        return abrirAcessarCadastrarBensMateriais();
      case 'OPEN_BENS_MATERIAIS':
        return abrirBensMateriais();
      case 'READ_BEM_MATERIAL_FAVS':
        return { ok: true, codigo: 'FAVS_LIDAS', favs: extrairFavsVisiveis(), capacidades: detectarCapacidades() };
      case 'OPEN_NOVO_BEM_MATERIAL':
        return abrirNovoBemMaterial();
      case 'FILL_SAVE_SAMPLE_MATERIAL':
        return preencherESalvarAmostra(payload || {});
      case 'READ_SAMPLE_RESULT':
        return lerResultadoAmostra(payload || {});
      case 'OPEN_COLETA_SELF':
        return abrirEtapaCustodiaNoMesmoTab(payload?.numeroFav, 'COLETA');
      case 'PREPARE_SAVE_COLETA':
        return preencherESalvarColeta(payload || {});
      case 'OPEN_ACONDICIONAMENTO_SELF':
        return abrirEtapaCustodiaNoMesmoTab(payload?.numeroFav, 'ACONDICIONAMENTO');
      case 'PREPARE_SAVE_ACONDICIONAMENTO':
        return preencherESalvarAcondicionamento();
      default:
        return { ok: false, codigo: 'COMANDO_FRAME_DESCONHECIDO', action };
    }
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'PCNET_FRAME_COMMAND') return undefined;
    return executarComando(message.action, message.payload || {})
      .then((resultado) => {
        enviar(true);
        return resultado;
      });
  });

  enviar(true);
  setInterval(() => enviar(true), 1800);

  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => enviar(false), 250);
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
