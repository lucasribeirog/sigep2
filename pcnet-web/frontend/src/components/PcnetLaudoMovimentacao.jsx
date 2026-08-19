import React, { useEffect, useMemo, useRef, useState } from 'react';

const SOURCE_APP = 'NEXUS_APP';
const SOURCE_BRIDGE = 'NEXUS_PCNET_BRIDGE';

function normalizar(v) {
  return String(v ?? '').trim();
}

function CampoRegistro({ rotulo, valor, className = '' }) {
  if (!normalizar(valor)) return null;
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{rotulo}</div>
      <div className="text-xs text-gray-800 mt-0.5 break-words">{valor}</div>
    </div>
  );
}

function analisarSituacao(valor) {
  const tokens = normalizar(valor).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return {
    conhecida: tokens.length > 0,
    coletado: tokens.includes('CL'),
    acondicionado: tokens.includes('AC')
  };
}

function FichaFav({ resultado, titulo = null }) {
  if (!resultado) return null;
  const reg = resultado.registro || {};
  const situacao = analisarSituacao(reg.situacao);
  const etapasOk = !situacao.conhecida || (situacao.coletado && situacao.acondicionado);
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
      <div className="text-xs font-bold text-emerald-800">✓ {titulo || `FAV ${resultado.numeroFav} localizada e selecionada.`}</div>
      <div className="mt-3 bg-white/80 border border-emerald-100 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
        <CampoRegistro rotulo="Situação" valor={reg.situacao} />
        <CampoRegistro rotulo="Classificação" valor={reg.classificacao} />
        <CampoRegistro rotulo="FAV" valor={reg.numeroFav || resultado.numeroFav} />
        <CampoRegistro rotulo="Descrição" valor={reg.descricao} className="sm:col-span-2" />
        <CampoRegistro rotulo="Lacre atual" valor={reg.lacre} />
        <CampoRegistro rotulo="Última movimentação" valor={reg.unidadeUltimaMovimentacao} className="sm:col-span-2 lg:col-span-3" />
      </div>
      {situacao.conhecida && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${etapasOk ? 'border-emerald-200 bg-emerald-100/60 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <b>Etapas prévias:</b> Coleta {situacao.coletado ? '✓' : 'pendente'} · Acondicionamento {situacao.acondicionado ? '✓' : 'pendente'}.
        </div>
      )}
    </div>
  );
}

function configuracao(formulario, form) {
  if (formulario === 'drogas') {
    return {
      favField: 'numero_fav',
      favLabel: 'FAV principal',
      lacreField: 'envelope_encaminhamento',
      lacreLabel: 'Lacre de encaminhamento/guarda',
      lacreObrigatorio: true,
      fragmentado: form.tipo_encaminhamento === 'fragmentado',
      semCustodia: false
    };
  }

  if (formulario === 'eficiencia_objeto') {
    return {
      favField: 'n_fav',
      favLabel: 'FAV',
      lacreField: 'n_lacre',
      lacreLabel: 'Novo lacre / invólucro',
      lacreObrigatorio: false,
      fragmentado: false,
      semCustodia: false
    };
  }

  const municaoConsumida = formulario === 'balistica'
    && form.tipo_material === 'municao_isolada'
    && form.destino === 'consumida';

  return {
    favField: 'pcnet_fav',
    favLabel: 'FAV',
    lacreField: 'n_lacre',
    lacreLabel: 'Novo lacre / invólucro',
    lacreObrigatorio: false,
    fragmentado: false,
    semCustodia: municaoConsumida
  };
}

export default function PcnetLaudoMovimentacao({ formulario, form, onChange, unidadeUsuario = '' }) {
  const cfg = useMemo(() => configuracao(formulario, form), [formulario, form]);
  const [bridge, setBridge] = useState('checking');
  const [status, setStatus] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [movimentando, setMovimentando] = useState(false);
  const [resultadoFav, setResultadoFav] = useState(null);
  const [resultadoMov, setResultadoMov] = useState(null);
  const [erro, setErro] = useState('');
  const [erroCodigo, setErroCodigo] = useState('');

  const [criandoAmostra, setCriandoAmostra] = useState(false);
  const [fragBusy, setFragBusy] = useState('');
  const [favOriginalResultado, setFavOriginalResultado] = useState(null);
  const [favAmostraResultado, setFavAmostraResultado] = useState(null);
  const [fragMensagem, setFragMensagem] = useState('');
  const [fluxoBusy, setFluxoBusy] = useState(false);
  const [fluxoResumo, setFluxoResumo] = useState([]);
  const [fluxoConcluido, setFluxoConcluido] = useState(false);

  const pending = useRef(new Map());
  const seq = useRef(0);
  const readyRef = useRef(false);
  const busyRef = useRef(false);

  const favBusca = normalizar(form?.[cfg.favField]);
  const novoLacre = normalizar(form?.[cfg.lacreField]);
  const movimentacoes = (form?.pcnet_movimentacoes && typeof form.pcnet_movimentacoes === 'object') ? form.pcnet_movimentacoes : {};
  const movimentacaoSalva = favBusca ? movimentacoes[favBusca] : null;
  const reg = resultadoFav?.registro || {};
  const situacao = analisarSituacao(reg.situacao);
  const etapasPreviasOk = !situacao.conhecida || (situacao.coletado && situacao.acondicionado);

  function setCampo(name, value, type = 'text') {
    onChange({ target: { name, value, type } });
  }

  function setObjeto(name, value) {
    setCampo(name, value, 'array');
  }

  function registrarMovimentacao(numeroFav, retorno, origem = 'geral') {
    const numero = normalizar(numeroFav);
    if (!numero) return;
    setObjeto('pcnet_movimentacoes', {
      ...movimentacoes,
      [numero]: {
        status: 'SUCESSO',
        origem,
        numeroFav: numero,
        novoLacre: retorno?.novoLacre || null,
        houveRompimento: retorno?.houveRompimento || null,
        finalidade: retorno?.finalidade || 'EXAME_PERICIAL',
        ts: Date.now()
      }
    });
  }

  function limparErro() {
    setErro('');
    setErroCodigo('');
  }

  function request(action, payload = null, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      const requestId = `nexus-laudo-${Date.now()}-${++seq.current}`;
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        const e = new Error('A extensão PCNet Bridge não respondeu.');
        e.code = 'BRIDGE_TIMEOUT';
        reject(e);
      }, timeoutMs);
      pending.current.set(requestId, { resolve, reject, timer });
      window.postMessage({ source: SOURCE_APP, type: 'PCNET_BRIDGE_REQUEST', requestId, action, payload }, '*');
    });
  }

  async function atualizar() {
    if (busyRef.current) return;
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
        if (d.ok) item.resolve(d.response);
        else {
          const e = new Error(d.error || 'Falha no PCNet Bridge.');
          e.code = d.errorCode || '';
          item.reject(e);
        }
      }
    }

    window.addEventListener('message', onMessage);
    const first = setTimeout(() => atualizar().catch(() => {}), 120);
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

  useEffect(() => {
    if (!resultadoFav) return;
    if (normalizar(resultadoFav.numeroFav) !== favBusca) {
      setResultadoFav(null);
      setResultadoMov(null);
      limparErro();
    }
  }, [favBusca]);

  useEffect(() => {
    setResultadoFav(null);
    setResultadoMov(null);
    setFavOriginalResultado(null);
    setFavAmostraResultado(null);
    setFragMensagem('');
    setFluxoResumo([]);
    setFluxoConcluido(false);
    limparErro();
  }, [formulario, cfg.fragmentado, cfg.semCustodia]);

  async function comandoStatus(action) {
    try {
      limparErro();
      const r = await request(action, null, 5000);
      setStatus(r);
      setBridge('ready');
      setTimeout(() => atualizar().catch(() => {}), 500);
    } catch (e) {
      setErro(e.message || 'Falha ao comunicar com o PCNet Bridge.');
      setErroCodigo(e.code || '');
    }
  }

  async function buscarFav() {
    if (!favBusca) { setErro(`Informe a ${cfg.favLabel}.`); return; }
    if (!status?.conectado) { setErro('O PCNet não está conectado. Use o botão abaixo para abrir/conectar a sessão.'); return; }

    busyRef.current = true;
    setBuscando(true);
    limparErro();
    setResultadoFav(null);
    setResultadoMov(null);
    try {
      const r = await request('BUSCAR_FAV', { numeroFav: favBusca }, 30000);
      if (r?.erro) { const e = new Error(r.erro); e.code = r.erroCodigo || ''; throw e; }
      setResultadoFav(r);
      if (r?.numeroFav && normalizar(r.numeroFav) !== favBusca) setCampo(cfg.favField, r.numeroFav);
      setTimeout(() => atualizar().catch(() => {}), 400);
    } catch (e) {
      setErro(e.message || 'Não foi possível localizar a FAV no PCNet.');
      setErroCodigo(e.code || '');
    } finally {
      busyRef.current = false;
      setBuscando(false);
    }
  }

  async function movimentarFav() {
    if (movimentacaoSalva) { setErro(`A FAV ${favBusca} já foi movimentada neste laudo. O Nexus bloqueou uma segunda gravação.`); setErroCodigo('MOVIMENTACAO_JA_REGISTRADA'); return; }
    if (!resultadoFav?.numeroFav) { setErro('Busque a FAV no PCNet antes de movimentar.'); return; }
    if (!etapasPreviasOk) {
      setErroCodigo('ETAPA_PREVIA_PENDENTE');
      setErro('A FAV ainda não apresenta as situações CL e AC. Registre Coleta e Acondicionamento no PCNet antes de tentar “Sob Custódia”.');
      return;
    }
    if (cfg.lacreObrigatorio && !novoLacre) { setErro(`Informe o ${cfg.lacreLabel.toLowerCase()} antes da movimentação.`); return; }

    const numero = normalizar(resultadoFav.numeroFav);
    const detalhe = novoLacre
      ? `\n\nHouve rompimento de lacre: SIM\nNovo lacre/invólucro: ${novoLacre}`
      : '\n\nHouve rompimento de lacre: NÃO\nNenhum novo lacre será informado.';
    if (!window.confirm(`Confirma a movimentação efetiva da FAV ${numero} para finalidade EXAME PERICIAL?${detalhe}\n\nO PCNet será gravado ao confirmar.`)) return;

    busyRef.current = true;
    setMovimentando(true);
    limparErro();
    setResultadoMov(null);
    try {
      const r = await request('MOVIMENTAR_FAV', { numeroFav: numero, novoLacre }, 50000);
      if (r?.erro) { const e = new Error(r.erro); e.code = r.erroCodigo || ''; throw e; }
      setResultadoMov(r);
      setResultadoFav(prev => prev ? { ...prev, movimentada: true } : prev);
      registrarMovimentacao(numero, r, formulario);
      setTimeout(() => atualizar().catch(() => {}), 500);
    } catch (e) {
      setErro(e.message || 'Não foi possível movimentar a FAV.');
      setErroCodigo(e.code || '');
    } finally {
      busyRef.current = false;
      setMovimentando(false);
    }
  }

  async function criarAmostraFragmentada() {
    const numeroLaudo = normalizar(form.numero_laudo_pcnet);
    const favOriginal = normalizar(form.numero_fav);
    const lacreAmostra = normalizar(form.envelope_amostra);
    if (!numeroLaudo || !favOriginal || !lacreAmostra) {
      setErro('Para criar a FAV da amostra, informe o nº do laudo no PCNet, a FAV original e o lacre da amostra.');
      return;
    }
    if (!normalizar(unidadeUsuario)) {
      setErro('A unidade do usuário não está cadastrada. Ela é obrigatória para preencher Endereço fato/coleta e Localização na Coleta da nova FAV.');
      setErroCodigo('UNIDADE_USUARIO_OBRIGATORIA');
      return;
    }
    if (form.fav_amostra) {
      setErro(`A FAV da amostra já está preenchida como ${form.fav_amostra}. O Nexus não criará outra automaticamente.`);
      setErroCodigo('FAV_AMOSTRA_JA_PREENCHIDA');
      return;
    }
    const texto = `Será criado um NOVO BEM MATERIAL no PCNet.\n\nLaudo: ${numeroLaudo}\nFAV original: ${favOriginal}\nLacre da amostra: ${lacreAmostra}\nUnidade da Coleta: ${normalizar(unidadeUsuario)}\n\nDepois de capturar a nova FAV, o Nexus registrará automaticamente:\n• Coleta: por terceiro = NÃO; endereço/localização = sua unidade\n• Acondicionamento: por terceiro = NÃO; rompimento do lacre = NÃO\n\nConfirma?`;
    if (!window.confirm(texto)) return;

    busyRef.current = true;
    setCriandoAmostra(true);
    limparErro();
    setFragMensagem('');
    try {
      const r = await request('CRIAR_FAV_AMOSTRA', { numeroLaudo, favOriginal, numeroLacre: lacreAmostra, unidadeUsuario: normalizar(unidadeUsuario) }, 160000);
      if (r?.erro) { const e = new Error(r.erro); e.code = r.erroCodigo || ''; throw e; }
      if (!r?.favAmostra) throw new Error('O PCNet informou sucesso, mas não retornou o número da nova FAV. Não tente criar novamente até conferir o PCNet.');
      setCampo('fav_amostra', r.favAmostra);
      setObjeto('pcnet_amostra_criada', {
        status: r.etapasOk === false ? 'ETAPAS_PENDENTES' : 'SUCESSO',
        assinatura: r.assinatura || `${numeroLaudo}|${favOriginal}|${lacreAmostra}`,
        favAmostra: r.favAmostra,
        favOriginal,
        numeroLaudo,
        numeroLacre: lacreAmostra,
        unidadeUsuario: normalizar(unidadeUsuario),
        etapasOk: r.etapasOk !== false,
        etapasErro: r.etapasErro || null,
        ts: Date.now()
      });
      if (r.registro) setFavAmostraResultado({ numeroFav: r.favAmostra, registro: r.registro });
      else setFavAmostraResultado(null);
      if (r.etapasOk === false) {
        setFragMensagem(`⚠ FAV da amostra ${r.favAmostra} foi criada, mas CL/AC ficaram pendentes: ${r.etapasErro || 'confira no PCNet e tente registrar as etapas novamente.'}`);
      } else {
        setFragMensagem(`✓ FAV da amostra ${r.favAmostra} criada · Coleta e Acondicionamento concluídos.`);
      }
    } catch (e) {
      setErro(e.message || 'Não foi possível criar a FAV da amostra.');
      setErroCodigo(e.code || '');
    } finally {
      busyRef.current = false;
      setCriandoAmostra(false);
    }
  }

  async function buscarFragmentada(tipo) {
    const numero = tipo === 'original' ? normalizar(form.numero_fav) : normalizar(form.fav_amostra);
    if (!numero) { setErro(tipo === 'original' ? 'Informe a FAV original.' : 'Crie/capture primeiro a FAV da amostra.'); return null; }
    setFragBusy(`buscar-${tipo}`);
    limparErro();
    try {
      const r = await request('BUSCAR_FAV', { numeroFav: numero }, 30000);
      if (r?.erro) { const e = new Error(r.erro); e.code = r.erroCodigo || ''; throw e; }
      if (tipo === 'original') setFavOriginalResultado(r); else setFavAmostraResultado(r);
      return r;
    } catch (e) {
      setErro(e.message || `Não foi possível buscar a FAV ${numero}.`);
      setErroCodigo(e.code || '');
      return null;
    } finally {
      setFragBusy('');
    }
  }

  async function prepararEtapasFragmentada(tipo) {
    const numero = tipo === 'original' ? normalizar(form.numero_fav) : normalizar(form.fav_amostra);
    if (!numero) return;
    if (movimentacoes[numero]) { setErro(`A FAV ${numero} já foi movimentada neste laudo.`); return; }
    if (!window.confirm(`O PCNet ainda não mostra CL/AC para a FAV ${numero}.\n\nConfirma registrar a etapa de Coleta/Acondicionamento agora? Esta ação GRAVA no PCNet.`)) return;

    setFragBusy(`etapas-${tipo}`);
    limparErro();
    try {
      const r = await request('PREPARAR_ETAPAS_FAV', { numeroFav: numero, unidadeUsuario: normalizar(unidadeUsuario) }, 110000);
      if (r?.erro) { const e = new Error(r.erro); e.code = r.erroCodigo || ''; throw e; }
      setFragMensagem(r.mensagem || `Etapas da FAV ${numero} registradas.`);
      // Rebusca para que CL/AC sejam validados visualmente antes da movimentação.
      const nova = await request('BUSCAR_FAV', { numeroFav: numero }, 30000);
      if (nova?.erro) { const e = new Error(nova.erro); e.code = nova.erroCodigo || ''; throw e; }
      if (tipo === 'original') setFavOriginalResultado(nova); else setFavAmostraResultado(nova);
    } catch (e) {
      setErro(e.message || 'Não foi possível registrar Coleta/Acondicionamento.');
      setErroCodigo(e.code || '');
    } finally {
      setFragBusy('');
    }
  }

  async function movimentarFragmentada(tipo) {
    const ehOriginal = tipo === 'original';
    const numero = ehOriginal ? normalizar(form.numero_fav) : normalizar(form.fav_amostra);
    const lacre = ehOriginal ? normalizar(form.envelope_encaminhamento) : '';
    if (!numero) return;
    if (movimentacoes[numero]) { setErro(`A FAV ${numero} já foi movimentada neste laudo. O Nexus bloqueou nova gravação.`); setErroCodigo('MOVIMENTACAO_JA_REGISTRADA'); return; }
    if (ehOriginal && !lacre) { setErro('Informe o lacre do material remanescente antes de movimentar a FAV original.'); return; }

    const detalhe = ehOriginal
      ? `FAV original/restante: ${numero}\nNovo lacre do restante: ${lacre}\nRompimento: SIM`
      : `FAV da amostra: ${numero}\nLacre atual da amostra: ${normalizar(form.envelope_amostra)}\nRompimento nesta movimentação: NÃO (a FAV foi criada já acondicionada no lacre da amostra)`;
    if (!window.confirm(`Confirma a movimentação para EXAME PERICIAL?\n\n${detalhe}\n\nO Nexus fará uma nova busca da FAV e só gravará se CL e AC estiverem confirmados.`)) return;

    setFragBusy(`mov-${tipo}`);
    limparErro();
    try {
      // A seleção do PCNet é única. Sempre rebuscamos imediatamente antes de mover
      // para não depender de qual das duas FAVs foi consultada por último.
      const busca = await request('BUSCAR_FAV', { numeroFav: numero }, 30000);
      if (busca?.erro) { const e = new Error(busca.erro); e.code = busca.erroCodigo || ''; throw e; }
      if (ehOriginal) setFavOriginalResultado(busca); else setFavAmostraResultado(busca);
      const st = analisarSituacao(busca?.registro?.situacao);
      if (st.conhecida && !(st.coletado && st.acondicionado)) {
        const e = new Error(`A FAV ${numero} ainda não possui CL e AC. Use “Registrar Coleta/Acondicionamento” antes de movimentar.`);
        e.code = 'ETAPA_PREVIA_PENDENTE';
        throw e;
      }

      const r = await request('MOVIMENTAR_FAV', { numeroFav: numero, novoLacre: lacre }, 50000);
      if (r?.erro) { const e = new Error(r.erro); e.code = r.erroCodigo || ''; throw e; }
      registrarMovimentacao(numero, r, ehOriginal ? 'drogas_fragmentada_restante' : 'drogas_fragmentada_amostra');
      setFragMensagem(`✓ FAV ${numero} (${ehOriginal ? 'restante' : 'amostra'}) movimentada para exame pericial.`);
    } catch (e) {
      setErro(e.message || `Não foi possível movimentar a FAV ${numero}.`);
      setErroCodigo(e.code || '');
    } finally {
      setFragBusy('');
    }
  }


  async function executarFluxoFragmentado() {
    const favOriginal = normalizar(form.numero_fav);
    const lacreRestante = normalizar(form.envelope_encaminhamento);
    const numeroLaudo = normalizar(form.numero_laudo_pcnet);
    const lacreAmostra = normalizar(form.envelope_amostra);
    const unidade = normalizar(unidadeUsuario);
    let favAmostra = normalizar(form.fav_amostra);

    const faltantes = [];
    if (!favOriginal) faltantes.push('FAV original');
    if (!lacreRestante) faltantes.push('lacre do restante');
    if (!numeroLaudo) faltantes.push('número do laudo no PCNet');
    if (!lacreAmostra) faltantes.push('lacre da amostra');
    if (!unidade) faltantes.push('unidade do usuário');
    if (faltantes.length) {
      setErro(`Antes de movimentar, preencha: ${faltantes.join(', ')}.`);
      setErroCodigo('DADOS_FLUXO_INCOMPLETOS');
      return;
    }
    if (!status?.conectado) {
      setErro('O PCNet não está conectado. Abra/conecte a sessão antes de movimentar.');
      setErroCodigo('PCNET_NAO_CONECTADO');
      return;
    }

    const confirmacao = [
      `FAV original: ${favOriginal} → Exame Pericial`,
      `Lacre do restante: ${lacreRestante}`,
      favAmostra
        ? `FAV da amostra já existente: ${favAmostra} → verificar/concluir Coleta + Acondicionamento`
        : `Criar FAV da amostra no lacre ${lacreAmostra} → Coleta + Acondicionamento`,
      '',
      'O Nexus seguirá para as etapas seguintes mesmo se alguma delas falhar e mostrará um resumo ao final.'
    ].join('\n');
    if (!window.confirm(`Confirma executar o fluxo PCNet?

${confirmacao}`)) return;

    const resumo = [];
    const add = (statusItem, etapa, detalhe) => {
      resumo.push({ status: statusItem, etapa, detalhe: normalizar(detalhe) });
      setFluxoResumo([...resumo]);
    };
    const erroTexto = (e) => `${e?.code ? `${e.code}: ` : ''}${e?.message || String(e)}`;

    busyRef.current = true;
    setFluxoBusy(true);
    setFluxoConcluido(false);
    setFluxoResumo([]);
    setFragMensagem('');
    limparErro();

    // 1) FAV original/restante -> Exame Pericial.
    try {
      if (movimentacoes[favOriginal]) {
        add('info', 'FAV original', `FAV ${favOriginal} já constava como movimentada neste laudo; nova gravação não foi feita.`);
      } else {
        const busca = await request('BUSCAR_FAV', { numeroFav: favOriginal }, 30000);
        if (busca?.erro) { const e = new Error(busca.erro); e.code = busca.erroCodigo || ''; throw e; }
        setFavOriginalResultado(busca);
        const st = analisarSituacao(busca?.registro?.situacao);
        if (st.conhecida && !(st.coletado && st.acondicionado)) {
          const e = new Error(`A FAV ${favOriginal} não possui CL + AC confirmados; a movimentação para Exame Pericial não foi gravada.`);
          e.code = 'ETAPA_PREVIA_PENDENTE';
          throw e;
        }
        const mov = await request('MOVIMENTAR_FAV', { numeroFav: favOriginal, novoLacre: lacreRestante }, 50000);
        if (mov?.erro) { const e = new Error(mov.erro); e.code = mov.erroCodigo || ''; throw e; }
        registrarMovimentacao(favOriginal, mov, 'drogas_fragmentada_restante');
        add('sucesso', 'FAV original', `FAV ${favOriginal} movimentada para Exame Pericial; novo lacre ${lacreRestante}.`);
      }
    } catch (e) {
      add('erro', 'FAV original', erroTexto(e));
    }

    // 2) Criar a FAV da amostra somente quando ainda não existe.
    let criacaoRetorno = null;
    if (!favAmostra) {
      try {
        const r = await request('CRIAR_FAV_AMOSTRA', {
          numeroLaudo,
          favOriginal,
          numeroLacre: lacreAmostra,
          unidadeUsuario: unidade
        }, 160000);
        if (r?.erro) { const e = new Error(r.erro); e.code = r.erroCodigo || ''; throw e; }
        if (!r?.favAmostra) {
          const e = new Error('O PCNet não retornou o número da FAV da amostra. A criação não será repetida automaticamente.');
          e.code = 'FAV_AMOSTRA_NAO_CAPTURADA';
          throw e;
        }
        criacaoRetorno = r;
        favAmostra = normalizar(r.favAmostra);
        setCampo('fav_amostra', favAmostra);
        setObjeto('pcnet_amostra_criada', {
          status: r.etapasOk === false ? 'ETAPAS_PENDENTES' : 'SUCESSO',
          assinatura: r.assinatura || `${numeroLaudo}|${favOriginal}|${lacreAmostra}`,
          favAmostra,
          favOriginal,
          numeroLaudo,
          numeroLacre: lacreAmostra,
          unidadeUsuario: unidade,
          etapasOk: r.etapasOk !== false,
          etapasErro: r.etapasErro || null,
          ts: Date.now()
        });
        if (r.registro) setFavAmostraResultado({ numeroFav: favAmostra, registro: r.registro });
        add('sucesso', 'FAV da amostra', `FAV ${favAmostra} criada no lacre ${lacreAmostra}.`);
      } catch (e) {
        add('erro', 'FAV da amostra', erroTexto(e));
      }
    } else {
      add('info', 'FAV da amostra', `FAV ${favAmostra} já estava preenchida; o Nexus não criou outra.`);
    }

    // 3) Coleta + Acondicionamento da amostra. Se a criação já confirmou ambas,
    // não repete. Caso contrário, PREPARAR_ETAPAS_FAV é idempotente: busca a FAV
    // e grava apenas as etapas ainda ausentes.
    if (favAmostra) {
      if (criacaoRetorno?.etapasOk !== false && criacaoRetorno?.etapasOk !== undefined) {
        add('sucesso', 'Coleta + Acondicionamento', `CL + AC da FAV ${favAmostra} concluídos e confirmados pelo PCNet.`);
      } else {
        try {
          const etapas = await request('PREPARAR_ETAPAS_FAV', { numeroFav: favAmostra, unidadeUsuario: unidade }, 110000);
          if (etapas?.erro) { const e = new Error(etapas.erro); e.code = etapas.erroCodigo || ''; throw e; }
          if (etapas?.registro) setFavAmostraResultado({ numeroFav: favAmostra, registro: etapas.registro });
          add('sucesso', 'Coleta + Acondicionamento', etapas?.mensagem || `CL + AC da FAV ${favAmostra} concluídos.`);
          setObjeto('pcnet_amostra_criada', {
            ...(form.pcnet_amostra_criada || {}),
            status: 'SUCESSO',
            favAmostra,
            favOriginal,
            numeroLaudo,
            numeroLacre: lacreAmostra,
            unidadeUsuario: unidade,
            etapasOk: true,
            etapasErro: null,
            ts: Date.now()
          });
        } catch (e) {
          const detalheAnterior = criacaoRetorno?.etapasErro ? ` Tentativa inicial: ${criacaoRetorno.etapasErro}.` : '';
          add('erro', 'Coleta + Acondicionamento', `${erroTexto(e)}${detalheAnterior}`);
        }
      }
    } else {
      add('pendente', 'Coleta + Acondicionamento', 'Não executado porque a FAV da amostra não pôde ser determinada com segurança.');
    }

    const terminouSemErro = resumo.every(x => x.status !== 'erro' && x.status !== 'pendente');
    setFluxoConcluido(terminouSemErro);
    if (!terminouSemErro) {
      setErroCodigo('FLUXO_CONCLUIDO_COM_PENDENCIAS');
      setErro('O fluxo terminou com uma ou mais pendências. Veja o resumo abaixo; etapas já concluídas não serão repetidas indevidamente em uma nova tentativa.');
    }
    busyRef.current = false;
    setFluxoBusy(false);
    setTimeout(() => atualizar().catch(() => {}), 500);
  }


  async function executarFluxoSimples() {
    const numero = favBusca;
    const lacre = novoLacre;
    if (!numero) {
      setErro(`Informe a ${cfg.favLabel}.`);
      setErroCodigo('FAV_OBRIGATORIA');
      return;
    }
    if (cfg.lacreObrigatorio && !lacre) {
      setErro(`Informe o ${cfg.lacreLabel.toLowerCase()}.`);
      setErroCodigo('LACRE_OBRIGATORIO');
      return;
    }
    if (!status?.conectado) {
      setErro('O PCNet não está conectado. Abra/conecte a sessão antes de movimentar.');
      setErroCodigo('PCNET_NAO_CONECTADO');
      return;
    }

    const detalheLacre = lacre
      ? `Novo lacre/invólucro: ${lacre}`
      : 'Sem novo lacre/invólucro (sem rompimento).';
    if (!window.confirm(`Confirma movimentar a FAV ${numero} para EXAME PERICIAL?\n\n${detalheLacre}`)) return;

    const resumo = [];
    const add = (statusItem, etapa, detalhe) => {
      resumo.push({ status: statusItem, etapa, detalhe: normalizar(detalhe) });
      setFluxoResumo([...resumo]);
    };

    busyRef.current = true;
    setFluxoBusy(true);
    setFluxoConcluido(false);
    setFluxoResumo([]);
    limparErro();

    try {
      if (movimentacaoSalva) {
        add('info', 'Movimentação', `FAV ${numero} já constava como movimentada neste laudo; nova gravação não foi feita.`);
        setFluxoConcluido(true);
        return;
      }

      const busca = await request('BUSCAR_FAV', { numeroFav: numero }, 30000);
      if (busca?.erro) { const e = new Error(busca.erro); e.code = busca.erroCodigo || ''; throw e; }
      setResultadoFav(busca);
      const st = analisarSituacao(busca?.registro?.situacao);
      if (st.conhecida && !(st.coletado && st.acondicionado)) {
        const e = new Error(`A FAV ${numero} não possui CL + AC confirmados; a movimentação para Exame Pericial não foi gravada.`);
        e.code = 'ETAPA_PREVIA_PENDENTE';
        throw e;
      }

      const mov = await request('MOVIMENTAR_FAV', { numeroFav: numero, novoLacre: lacre }, 50000);
      if (mov?.erro) { const e = new Error(mov.erro); e.code = mov.erroCodigo || ''; throw e; }
      setResultadoMov(mov);
      registrarMovimentacao(numero, mov, formulario);
      add('sucesso', 'Movimentação', `FAV ${numero} movimentada para Exame Pericial${lacre ? `; novo lacre ${lacre}` : '; sem novo rompimento de lacre'}.`);
      setFluxoConcluido(true);
    } catch (e) {
      add('erro', 'Movimentação', `${e?.code ? `${e.code}: ` : ''}${e?.message || String(e)}`);
      setErroCodigo('FLUXO_CONCLUIDO_COM_PENDENCIAS');
      setErro('A movimentação terminou com pendência. Veja o resumo abaixo.');
    } finally {
      busyRef.current = false;
      setFluxoBusy(false);
      setTimeout(() => atualizar().catch(() => {}), 500);
    }
  }

  const conectado = Boolean(status?.conectado);

  if (cfg.semCustodia) {
    return (
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <div className="font-bold text-gray-800">PCNet · Cadeia de Custódia</div>
        <p className="text-xs text-gray-500 mt-1">As munições foram marcadas como consumidas nos exames; não há material a encaminhar à custódia neste fluxo.</p>
      </section>
    );
  }

  if (cfg.fragmentado) {
    const favOriginal = normalizar(form.numero_fav);
    const favAmostra = normalizar(form.fav_amostra);
    const temErroResumo = fluxoResumo.some(x => x.status === 'erro' || x.status === 'pendente');
    const iconeResumo = (statusItem) => statusItem === 'sucesso' ? '✓' : statusItem === 'erro' ? '✕' : statusItem === 'pendente' ? '!' : '•';
    const classeResumo = (statusItem) => statusItem === 'sucesso'
      ? 'text-emerald-800'
      : statusItem === 'erro'
        ? 'text-red-700'
        : statusItem === 'pendente'
          ? 'text-amber-800'
          : 'text-gray-600';

    return (
      <section className="rounded-xl border border-orange-200 bg-orange-50/50 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="font-bold text-orange-950">PCNet · Movimentação</h3>
            {bridge === 'checking' && <div className="text-[11px] text-gray-500 mt-1">Procurando o PCNet Bridge...</div>}
            {bridge === 'missing' && <div className="text-[11px] text-amber-700 mt-1">Extensão PCNet Bridge não detectada.</div>}
            {bridge === 'ready' && <div className={`text-[11px] mt-1 ${conectado ? 'text-emerald-700' : 'text-gray-600'}`}>{conectado ? '● PCNet conectado' : '○ PCNet não conectado'}</div>}
          </div>
          {bridge === 'ready' && !conectado && (
            <button type="button" onClick={() => comandoStatus('OPEN_PCNET')} className="px-3 py-2 rounded-lg bg-sky-700 text-white text-xs font-bold">Conectar PCNet</button>
          )}
        </div>

        <button
          type="button"
          onClick={executarFluxoFragmentado}
          disabled={bridge !== 'ready' || !conectado || fluxoBusy || fluxoConcluido}
          className="w-full sm:w-auto bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm"
        >
          {fluxoBusy ? 'Movimentando FAV...' : fluxoConcluido ? 'Movimentação concluída' : 'Movimentar FAV'}
        </button>

        {fluxoBusy && (
          <div className="text-xs text-gray-600">Executando o fluxo no PCNet. As etapas são independentes: uma falha não interrompe automaticamente as demais.</div>
        )}

        {fluxoResumo.length > 0 && (
          <div className={`rounded-xl border p-4 ${temErroResumo ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className={`text-sm font-bold ${temErroResumo ? 'text-amber-950' : 'text-emerald-900'}`}>
              {temErroResumo ? 'Resumo · concluído com pendências' : 'Resumo · fluxo concluído'}
            </div>
            <div className="mt-3 space-y-2">
              {fluxoResumo.map((item, i) => (
                <div key={`${item.etapa}-${i}`} className="flex items-start gap-2 text-xs">
                  <span className={`font-bold w-4 shrink-0 ${classeResumo(item.status)}`}>{iconeResumo(item.status)}</span>
                  <div>
                    <span className={`font-bold ${classeResumo(item.status)}`}>{item.etapa}:</span>{' '}
                    <span className="text-gray-700">{item.detalhe}</span>
                  </div>
                </div>
              ))}
            </div>
            {favAmostra && <div className="mt-3 pt-3 border-t border-black/5 text-[11px] text-gray-600">FAV da amostra: <b>{favAmostra}</b>.</div>}
          </div>
        )}

        {erro && !fluxoResumo.length && (
          <div className="text-xs rounded-xl border p-3 bg-red-50 border-red-200 text-red-700"><b>{erroCodigo ? `${erroCodigo}: ` : ''}</b>{erro}</div>
        )}
        {erro && fluxoResumo.length > 0 && erroCodigo === 'FLUXO_CONCLUIDO_COM_PENDENCIAS' && (
          <div className="text-[11px] text-amber-800">Você pode clicar novamente em <b>Movimentar FAV</b>: o Nexus reaproveita o que já foi concluído e tenta apenas o que ainda estiver pendente, respeitando as proteções contra duplicidade.</div>
        )}
      </section>
    );
  }

  const temErroResumo = fluxoResumo.some(x => x.status === 'erro' || x.status === 'pendente');
  const itemResumo = fluxoResumo[0];

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="font-bold text-sky-950">PCNet · Movimentação</h3>
          {bridge === 'checking' && <div className="text-[11px] text-gray-500 mt-1">Procurando o PCNet Bridge...</div>}
          {bridge === 'missing' && <div className="text-[11px] text-amber-700 mt-1">Extensão PCNet Bridge não detectada.</div>}
          {bridge === 'ready' && <div className={`text-[11px] mt-1 ${conectado ? 'text-emerald-700' : 'text-gray-600'}`}>{conectado ? '● PCNet conectado' : '○ PCNet não conectado'}</div>}
        </div>
        {bridge === 'ready' && !conectado && (
          <button type="button" onClick={() => comandoStatus('OPEN_PCNET')} className="px-3 py-2 rounded-lg bg-sky-700 text-white text-xs font-bold">Conectar PCNet</button>
        )}
      </div>

      <button
        type="button"
        onClick={executarFluxoSimples}
        disabled={bridge !== 'ready' || !conectado || fluxoBusy || fluxoConcluido || !!movimentacaoSalva}
        className="w-full sm:w-auto bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm"
      >
        {fluxoBusy ? 'Movimentando FAV...' : (fluxoConcluido || movimentacaoSalva) ? 'Movimentação concluída' : 'Movimentar FAV'}
      </button>

      {fluxoBusy && <div className="text-xs text-gray-600">Executando busca, validação e movimentação no PCNet...</div>}

      {(itemResumo || movimentacaoSalva) && (
        <div className={`rounded-xl border p-4 ${(temErroResumo) ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className={`text-sm font-bold ${temErroResumo ? 'text-amber-950' : 'text-emerald-900'}`}>{temErroResumo ? 'Resumo · concluído com pendência' : 'Resumo · fluxo concluído'}</div>
          <div className="mt-2 text-xs text-gray-700">
            {itemResumo ? itemResumo.detalhe : `FAV ${favBusca} já movimentada neste laudo; nova gravação bloqueada.`}
          </div>
        </div>
      )}

      {erro && !fluxoResumo.length && (
        <div className="text-xs rounded-xl border p-3 bg-red-50 border-red-200 text-red-700"><b>{erroCodigo ? `${erroCodigo}: ` : ''}</b>{erro}</div>
      )}
    </section>
  );
}
