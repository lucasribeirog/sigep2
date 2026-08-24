import React, { useEffect, useMemo, useState } from 'react';
import { pcnetBridgeRequest } from '../services/pcnetBridgeClient';

const ITENS_POR_PAGINA = 20;

function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function textoLimpo(valor) {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function badgeSituacao(situacao) {
  const valor = normalizar(situacao);
  if (valor === 'nova') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (valor.includes('aguardando material')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (valor.includes('aceita')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (valor.includes('devolvida')) return 'bg-red-100 text-red-700 border-red-200';
  if (valor.includes('distribu')) return 'bg-violet-100 text-violet-700 border-violet-200';
  if (valor.includes('sobrestada')) return 'bg-orange-100 text-orange-700 border-orange-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function textoErro(error) {
  const codigo = error?.codigo || error?.erroCodigo || error?.code || '';
  const mapa = {
    PCNET_NAO_CONECTADO: 'O PCNet não está conectado. Conecte-se pelo Nexus e tente novamente.',
    PCNET_OCUPADO: 'O PCNet está sendo usado por outra operação do Nexus. Aguarde a conclusão e tente novamente.',
    BRIDGE_TIMEOUT: 'O Bridge demorou para responder. Verifique a conexão com o PCNet e tente novamente.',
    REQUISICAO_NAO_LOCALIZADA_NA_TELA: 'A requisição não foi localizada na tela de Aceite do PCNet.',
    CONTROLE_ABRIR_REQUISICAO_NAO_IDENTIFICADO: 'A requisição foi localizada, mas o Bridge não identificou o controle nativo para abri-la.',
    DETALHE_REQUISICAO_NAO_ABRIU: 'A requisição foi acionada no PCNet, mas a tela de detalhes não ficou pronta a tempo.',
    ANEXO_ID_INVALIDO: 'O identificador do anexo não foi localizado com segurança.',
    DOWNLOADS_PERMISSION_NAO_DISPONIVEL: 'A extensão precisa da permissão de downloads. Recarregue a V2.20 com o manifest atualizado.',
    DOWNLOAD_ANEXO_FALHOU: 'Não foi possível iniciar o download do anexo.',
    BO_ROTA_NAO_LOCALIZADA: 'A rota do BO não foi localizada na ocorrência.',
    BO_ROTA_INVALIDA: 'A rota de visualização do BO é inválida.',
    BO_ROTA_NAO_AUTORIZADA: 'A rota capturada não corresponde ao visualizador oficial esperado do PCNet.',
    BO_REDS_DIVERGENTE: 'O número do REDS não corresponde à rota capturada.',
    BO_ABERTURA_FALHOU: 'Não foi possível abrir o BO.',
    ACAO_ACEITE_INVALIDA: 'A ação selecionada não é válida para o Aceite.',
    ACAO_ACEITE_JA_EM_ANDAMENTO: 'Esta ação já está em andamento. Aguarde a conclusão.',
    ACAO_ACEITE_NAO_DISPONIVEL: 'Esta ação não está disponível para a situação atual da requisição.',
    ACAO_ACEITE_CONTROLE_NATIVO_NAO_CONFIRMADO: 'O botão nativo desta ação não corresponde ao controle esperado do PCNet. Nenhum clique foi executado.',
    ACAO_ACEITE_AMBIGUA: 'O PCNet apresentou mais de um controle para esta ação. Nenhum deles foi executado.',
    JUSTIFICATIVA_OBRIGATORIA: 'Informe a justificativa da devolução.',
    CAMPO_JUSTIFICATIVA_NAO_ENCONTRADO: 'O campo Justificativa não foi localizado no PCNet. Nenhuma devolução foi executada.',
    JUSTIFICATIVA_NAO_CONFIRMADA_NO_DOM: 'O PCNet não confirmou o preenchimento da justificativa. A devolução foi interrompida.',
    DETALHE_ACEITE_NAO_ESTA_ABERTO: 'A tela da requisição não está mais aberta no PCNet. Volte à caixa e abra a requisição novamente.',
    CLICK_ACAO_ACEITE_FALHOU: 'O botão nativo do PCNet foi localizado, mas o clique falhou.',
    PCNET_RECUSOU_ACAO_ACEITE: error?.message || 'O PCNet recusou a operação.',
    ACAO_ACEITE_RESULTADO_INDETERMINADO: 'O PCNet recebeu o comando, mas o resultado não pôde ser confirmado. A ação não será repetida automaticamente. Atualize a caixa antes de tentar novamente.'
  };
  return mapa[codigo] || error?.message || error?.erro || 'Não foi possível consultar o PCNet.';
}

function todosParesDetalhe(resposta) {
  const detalhes = resposta?.detalhes || {};
  const pares = [];

  for (const campo of (Array.isArray(detalhes.campos) ? detalhes.campos : [])) {
    if (campo?.nome && campo?.valor) {
      pares.push({ nome: textoLimpo(campo.nome), valor: textoLimpo(campo.valor) });
    }
  }

  for (const par of (Array.isArray(detalhes.paresTabela) ? detalhes.paresTabela : [])) {
    if (par?.nome && par?.valor) {
      pares.push({ nome: textoLimpo(par.nome), valor: textoLimpo(par.valor) });
    }
  }

  return pares;
}

function buscarValorDetalhe(resposta, expressoes) {
  for (const par of todosParesDetalhe(resposta)) {
    const nome = normalizar(par.nome);
    if (expressoes.some(regex => regex.test(nome))) return par.valor;
  }
  return '';
}

function extrairDescricao(resposta) {
  const direto = buscarValorDetalhe(resposta, [
    /^descricao$/,
    /^descricao da requisicao$/,
    /^descricao do fato$/,
    /^descricao do exame$/
  ]);
  if (direto) return direto;

  const linhas = resposta?.detalhes?.linhasTabela;
  if (Array.isArray(linhas)) {
    for (const linha of linhas) {
      if (!Array.isArray(linha) || !linha.length) continue;
      if (/^descricao$/.test(normalizar(linha[0])) && linha.length >= 2) {
        return textoLimpo(linha.slice(1).join(' '));
      }
    }
  }
  return '';
}

function extrairDocumentos(resposta) {
  const estruturados = resposta?.detalhes?.documentos;
  if (Array.isArray(estruturados) && estruturados.length) {
    return estruturados.map(doc => ({
      nome: doc?.nome || 'Documento',
      idArquivoAnexadoPlc: doc?.idArquivoAnexadoPlc || null,
      urlBaixar: doc?.urlBaixar || null,
      podeBaixar: Boolean(doc?.podeBaixar || doc?.idArquivoAnexadoPlc),
      controleBaixar: doc?.controleBaixar || null
    }));
  }

  const encontrados = new Set();
  const adicionar = (valor) => {
    const matches = String(valor || '').match(
      /[^|;\n\r<>"]+?\.(?:pdf|docx?|xlsx?|xls|csv|txt|jpe?g|png|bmp|tiff?|zip|rar|7z)\b/gi
    ) || [];
    for (const match of matches) {
      const nome = textoLimpo(match).replace(/^[\s:;,.-]+/, '').trim();
      if (nome) encontrados.add(nome);
    }
  };

  adicionar(resposta?.detalhes?.texto);
  for (const linha of (Array.isArray(resposta?.detalhes?.linhasTabela) ? resposta.detalhes.linhasTabela : [])) {
    if (Array.isArray(linha)) linha.forEach(adicionar);
  }

  return [...encontrados].map(nome => ({ nome, podeBaixar: false }));
}

function extrairOcorrencias(resposta) {
  const estruturadas = resposta?.detalhes?.ocorrencias;
  if (Array.isArray(estruturadas) && estruturadas.length) {
    return estruturadas.map(ocorrencia => ({
      numero: ocorrencia?.numero || '',
      natureza: ocorrencia?.natureza || '',
      rotaVisualizacao: ocorrencia?.rotaVisualizacao || null,
      podeVisualizar: Boolean(ocorrencia?.podeVisualizar || ocorrencia?.rotaVisualizacao),
      controleLupa: ocorrencia?.controleLupa || null
    }));
  }

  const encontrados = new Map();
  const linhas = resposta?.detalhes?.linhasTabela;
  if (Array.isArray(linhas)) {
    for (const linha of linhas) {
      if (!Array.isArray(linha)) continue;
      const texto = linha.map(textoLimpo).join(' ');
      const numero = texto.match(/\b\d{4}-\d{8,10}-\d{3}\b/)?.[0];
      if (!numero) continue;
      const indice = linha.findIndex(valor => String(valor || '').includes(numero));
      let natureza = '';
      if (indice >= 0) {
        natureza = linha
          .slice(indice + 1)
          .map(textoLimpo)
          .filter(Boolean)
          .find(valor => !/^\d+$/.test(valor) && normalizar(valor) !== 'natureza da ocorrencia') || '';
      }
      encontrados.set(numero, { numero, natureza, podeVisualizar: false });
    }
  }
  return [...encontrados.values()];
}

export default function AceitePcnet() {
  const [bridgeDetectado, setBridgeDetectado] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [itens, setItens] = useState([]);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [natureza, setNatureza] = useState('');
  const [pagina, setPagina] = useState(1);
  const [requisicaoAberta, setRequisicaoAberta] = useState(null);

  const [detalhesRequisicao, setDetalhesRequisicao] = useState(null);
  const [carregandoDetalhes, setCarregandoDetalhes] = useState(false);
  const [erroDetalhes, setErroDetalhes] = useState('');
  const [codigoErroDetalhes, setCodigoErroDetalhes] = useState('');

  const [baixandoDocumento, setBaixandoDocumento] = useState('');
  const [abrindoBo, setAbrindoBo] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [sucessoAcao, setSucessoAcao] = useState('');
  const [modalAcao, setModalAcao] = useState(null);
  const [justificativaAcao, setJustificativaAcao] = useState('');
  const [acaoEmAndamento, setAcaoEmAndamento] = useState('');


  async function consultarStatus() {
    try {
      const status = await pcnetBridgeRequest('STATUS', null, 4500);
      setBridgeDetectado(true);
      setConectado(Boolean(status?.conectado));
      return status;
    } catch (e) {
      setBridgeDetectado(false);
      setConectado(false);
      throw e;
    }
  }

  async function carregar() {
    setCarregando(true);
    setErro('');

    try {
      const status = await consultarStatus();

      if (!status?.conectado) {
        setItens([]);
        setAtualizadoEm(null);
        return null;
      }

      const resposta = await pcnetBridgeRequest(
        'LISTAR_ACEITE',
        null,
        60000
      );

      if (resposta?.erro) {
        const falha = new Error(resposta.erro);
        falha.codigo = resposta?.erroCodigo || null;
        throw falha;
      }

      const lista = Array.isArray(resposta?.itens)
        ? resposta.itens
        : [];

      setItens(lista);
      setAtualizadoEm(resposta?.atualizadoEm || Date.now());
      setPagina(1);

      if (requisicaoAberta?.requisicao) {
        const atualizado = lista.find(
          x => x.requisicao === requisicaoAberta.requisicao
        );

        if (atualizado) {
          setRequisicaoAberta(atualizado);
        }
      }

      return resposta;

    } catch (e) {
      setErro(textoErro(e));
      return null;

    } finally {
      setCarregando(false);
    }
  }

  async function conectarPcnet() {
    setErro('');
    try {
      await pcnetBridgeRequest('OPEN_PCNET', null, 8000);
      setBridgeDetectado(true);
      setTimeout(() => carregar().catch(() => {}), 500);
    } catch (e) {
      setErro(textoErro(e));
    }
  }

  async function carregarDetalhes(item) {
    if (!item?.requisicao) return;
    setDetalhesRequisicao(null);
    setErroDetalhes('');
    setCodigoErroDetalhes('');
    setErroAcao('');
    setSucessoAcao('');
    setCarregandoDetalhes(true);

    try {
      const resposta = await pcnetBridgeRequest(
        'DETALHAR_ACEITE',
        {
          requisicao: item.requisicao,

          // V2.24: página/posição ORIGINAL do registro no PCNet. Esses campos
          // vêm do CSV completo e permanecem estáveis mesmo com filtros locais.
          paginaPcnet: item.paginaPcnet || 1,
          indicePcnet: Number.isFinite(Number(item.indicePcnet))
            ? Number(item.indicePcnet)
            : null,
          posicaoPcnet: Number.isFinite(Number(item.posicaoPcnet))
            ? Number(item.posicaoPcnet)
            : null
        },
        60000
      );

      console.log('RETORNO DETALHAR_ACEITE:', resposta);
      console.log('PAGINAÇÃO PCNET:', {
        paginaPcnet: item.paginaPcnet || 1,
        indicePcnet: item.indicePcnet ?? null,
        posicaoPcnet: item.posicaoPcnet ?? null,
        diagnostico: resposta?.diagnostico?.pesquisaRequisicao
          || resposta?.pesquisaRequisicao
          || null
      });
      console.log('CAPTURA DOCUMENTOS:', resposta?.capturaDocumentos || null);
      console.log('CAPTURA OCORRÊNCIAS:', resposta?.capturaOcorrencias || null);

      if (resposta?.erro) {
        const falha = new Error(resposta.erro);
        falha.codigo = resposta?.erroCodigo || null;
        falha.diagnostico = resposta?.diagnostico || null;
        throw falha;
      }
      if (resposta?.status !== 'SUCESSO') {
        const falha = new Error('O Bridge não confirmou a leitura da requisição.');
        falha.codigo = 'DETALHE_SEM_CONFIRMACAO';
        throw falha;
      }
      setDetalhesRequisicao(resposta);
    } catch (e) {
      console.error('ERRO DETALHAR_ACEITE:', e);
      setCodigoErroDetalhes(e?.codigo || e?.erroCodigo || '');
      setErroDetalhes(textoErro(e));
    } finally {
      setCarregandoDetalhes(false);
    }
  }

  function abrirRequisicao(item) {
    setRequisicaoAberta(item);
    carregarDetalhes(item);
  }

  function fecharRequisicao() {
    setRequisicaoAberta(null);
    setDetalhesRequisicao(null);
    setErroDetalhes('');
    setCodigoErroDetalhes('');
    setErroAcao('');
    setSucessoAcao('');
  }

  async function baixarDocumento(documento) {
    if (!requisicaoAberta?.requisicao || !documento?.idArquivoAnexadoPlc) return;
    const chave = String(documento.idArquivoAnexadoPlc);
    setBaixandoDocumento(chave);
    setErroAcao('');
    setSucessoAcao('');
    try {
      const resposta = await pcnetBridgeRequest(
        'BAIXAR_ANEXO_ACEITE',
        {
          requisicao: requisicaoAberta.requisicao,
          idArquivoAnexadoPlc: documento.idArquivoAnexadoPlc,
          urlBaixar: documento.urlBaixar,
          nome: documento.nome
        },
        15000
      );
      if (resposta?.erro) {
        const falha = new Error(resposta.erro);
        falha.codigo = resposta?.erroCodigo || null;
        throw falha;
      }
      setSucessoAcao(resposta?.mensagem || `Download de ${documento.nome} iniciado.`);
    } catch (e) {
      setErroAcao(textoErro(e));
    } finally {
      setBaixandoDocumento('');
    }
  }

  async function visualizarBo(ocorrencia) {
    if (!requisicaoAberta?.requisicao || !ocorrencia?.rotaVisualizacao) return;
    const chave = ocorrencia.numero || ocorrencia.rotaVisualizacao;
    setAbrindoBo(chave);
    setErroAcao('');
    setSucessoAcao('');
    try {
      const resposta = await pcnetBridgeRequest(
        'ABRIR_BO_ACEITE',
        {
          requisicao: requisicaoAberta.requisicao,
          numeroReds: ocorrencia.numero,
          rotaVisualizacao: ocorrencia.rotaVisualizacao
        },
        15000
      );
      if (resposta?.erro) {
        const falha = new Error(resposta.erro);
        falha.codigo = resposta?.erroCodigo || null;
        throw falha;
      }
      setSucessoAcao(resposta?.mensagem || `BO ${ocorrencia.numero} aberto.`);
    } catch (e) {
      setErroAcao(textoErro(e));
    } finally {
      setAbrindoBo('');
    }
  }

  function solicitarAcao(acao, titulo) {
    setErroAcao('');
    setSucessoAcao('');
    setJustificativaAcao('');
    setModalAcao({ acao, titulo });
  }

  function cancelarAcao() {
    if (acaoEmAndamento) return;
    setModalAcao(null);
    setJustificativaAcao('');
    setErroAcao('');
  }

  async function confirmarAcao() {
    if (!modalAcao || !requisicaoAberta?.requisicao) return;

    const justificativa = justificativaAcao.trim();
    if (modalAcao.acao === 'DEVOLVER' && !justificativa) {
      setErroAcao('Informe a justificativa da devolução.');
      return;
    }

    setErroAcao('');
    setSucessoAcao('');
    setAcaoEmAndamento(modalAcao.acao);

    try {
      const resposta = await pcnetBridgeRequest(
        'ACAO_ACEITE',
        {
          requisicao: requisicaoAberta.requisicao,
          acao: modalAcao.acao,
          justificativa: modalAcao.acao === 'DEVOLVER' ? justificativa : '',
          situacaoAnterior: requisicaoAberta.situacao || ''
        },
        60000
      );

      if (resposta?.erro) {
        const falha = new Error(resposta.erro);
        falha.codigo = resposta?.erroCodigo || '';
        falha.diagnostico = resposta?.diagnostico || null;
        throw falha;
      }

      if (resposta?.status !== 'SUCESSO') {
        const falha = new Error('O PCNet não confirmou a operação.');
        falha.codigo = 'ACAO_ACEITE_SEM_CONFIRMACAO';
        throw falha;
      }

      const mensagem = resposta?.mensagem || `${modalAcao.titulo} realizado com sucesso.`;
      setSucessoAcao(mensagem);
      setModalAcao(null);
      setJustificativaAcao('');

      // Volta para a caixa e recarrega o estado real do PCNet.
      setRequisicaoAberta(null);
      setDetalhesRequisicao(null);
      setErroDetalhes('');
      setCodigoErroDetalhes('');
      await carregar();
    } catch (e) {
      setErroAcao(textoErro(e));
    } finally {
      setAcaoEmAndamento('');
    }
  }

  useEffect(() => {
    // V2.23: no React StrictMode o primeiro mount de desenvolvimento é desmontado
    // imediatamente. Agendar a carga permite que o cleanup cancele essa primeira
    // chamada, evitando duas LISTAR_ACEITE concorrentes e o falso PCNET_OCUPADO.
    const timer = setTimeout(() => {
      carregar().catch(() => {});
    }, 60);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [busca, situacao, natureza]);

  const situacoes = useMemo(
    () => Array.from(new Set(itens.map(x => x.situacao).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [itens]
  );

  const naturezas = useMemo(
    () => Array.from(new Set(itens.map(x => x.natureza).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [itens]
  );

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return itens.filter(item => {
      if (situacao && item.situacao !== situacao) return false;
      if (natureza && item.natureza !== natureza) return false;
      if (!termo) return true;
      return normalizar([
        item.requisicao,
        item.procedimentoOrigem,
        item.situacao,
        item.tipo,
        item.natureza,
        item.unidadeOrigem,
        item.dataHora,
        item.especieExame,
        item.fav
      ].join(' ')).includes(termo);
    });
  }, [itens, busca, situacao, natureza]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * ITENS_POR_PAGINA;
  const paginaAtual = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA);

  function irPagina(novaPagina) {
    setPagina(Math.max(1, Math.min(totalPaginas, novaPagina)));
  }

  if (requisicaoAberta) {
    const item = requisicaoAberta;
    const descricao = extrairDescricao(detalhesRequisicao);
    const documentos = extrairDocumentos(detalhesRequisicao);
    const ocorrencias = extrairOcorrencias(detalhesRequisicao);
    const involucro = buscarValorDetalhe(detalhesRequisicao, [/involucro/, /lacre/]);
    const informacoesAdicionais = buscarValorDetalhe(detalhesRequisicao, [
      /informacoes adicionais/,
      /informacao adicional/
    ]);

    return (
      <div className="space-y-5">
        <section className="bg-white border rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={fecharRequisicao}
                className="text-sm text-sky-700 font-semibold hover:text-sky-900 mb-4"
              >
                ← Voltar para o Aceite
              </button>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center text-xl">📄</div>
                <div>
                  <div className="text-xs uppercase tracking-wide font-bold text-gray-400">Requisição Pericial</div>
                  <h2 className="text-2xl font-bold text-gray-900">{item.requisicao}</h2>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end gap-2">
              <span className={`inline-flex border rounded-full px-3 py-1.5 text-xs font-bold ${badgeSituacao(item.situacao)}`}>
                {item.situacao || '—'}
              </span>
              {item.tipo && <span className="text-xs text-gray-500">{item.tipo}</span>}
            </div>
          </div>
        </section>

        {carregandoDetalhes && (
          <section className="bg-sky-50 border border-sky-200 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
              <div>
                <div className="text-sm font-bold text-sky-800">Consultando PCNet</div>
                <div className="text-xs text-sky-700 mt-0.5">Carregando os detalhes completos da requisição...</div>
              </div>
            </div>
          </section>
        )}

        {erroDetalhes && (
          <section className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-red-800">Não foi possível carregar os detalhes do PCNet</div>
                <div className="text-sm text-red-700 mt-1">{erroDetalhes}</div>
                {codigoErroDetalhes && <div className="text-[11px] text-red-500 font-mono mt-2">{codigoErroDetalhes}</div>}
              </div>
              <button
                type="button"
                onClick={() => carregarDetalhes(item)}
                className="border border-red-300 bg-white hover:bg-red-100 text-red-700 px-4 py-2 rounded-xl text-xs font-bold"
              >
                Tentar novamente
              </button>
            </div>
          </section>
        )}

        {detalhesRequisicao && !erroDetalhes && (
          <section className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700">
            ✓ Detalhes carregados diretamente do PCNet.
          </section>
        )}

        {erroAcao && (
          <section className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {erroAcao}
          </section>
        )}

        {sucessoAcao && (
          <section className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            ✓ {sucessoAcao}
          </section>
        )}

        <section className="bg-white border rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Ações da Requisição</h3>
              <p className="text-xs text-gray-500 mt-1">As ações abaixo são executadas diretamente no PCNet após confirmação.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!detalhesRequisicao || carregandoDetalhes || Boolean(acaoEmAndamento)}
                onClick={() => solicitarAcao('RECEBER', 'Receber')}
                className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Receber
              </button>

              <button
                type="button"
                disabled={!detalhesRequisicao || carregandoDetalhes || Boolean(acaoEmAndamento)}
                onClick={() => solicitarAcao('ACEITAR', 'Aceitar')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Aceitar
              </button>

              <button
                type="button"
                disabled={!detalhesRequisicao || carregandoDetalhes || Boolean(acaoEmAndamento)}
                onClick={() => solicitarAcao('AGUARDAR_MATERIAL', 'Aguardar material')}
                className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Aguardar material
              </button>

              <button
                type="button"
                disabled={!detalhesRequisicao || carregandoDetalhes || Boolean(acaoEmAndamento)}
                onClick={() => solicitarAcao('DEVOLVER', 'Devolver')}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Devolver
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="font-bold text-gray-900">Dados Básicos da Requisição</h3>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-7 p-6">
            <CampoDetalhe titulo="Nº da Requisição" valor={item.requisicao} destaque />
            <CampoDetalhe titulo="Situação" valor={item.situacao} />
            <CampoDetalhe titulo="Tipo" valor={item.tipo} />
            <CampoDetalhe titulo="Natureza" valor={item.natureza} destaque />
            <CampoDetalhe titulo="Espécie de Exame" valor={item.especieExame} />
            <CampoDetalhe titulo="Data/Hora" valor={item.dataHora} />
            <div className="md:col-span-2"><CampoDetalhe titulo="Unidade de Origem" valor={item.unidadeOrigem} /></div>
            <CampoDetalhe titulo="Nº Procedimento de Origem" valor={item.procedimentoOrigem} />
            <CampoDetalhe titulo="Nº FAV" valor={item.fav} mono />
            {involucro && <CampoDetalhe titulo="Invólucro / Lacre" valor={involucro} />}
          </div>
        </section>

        <section className="bg-white border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <h3 className="font-bold text-gray-900">Descrição</h3>
          </div>
          {carregandoDetalhes ? (
            <div className="mt-4 bg-gray-50 border rounded-xl p-5 text-sm text-gray-400">Carregando descrição...</div>
          ) : descricao ? (
            <div className="mt-4 bg-gray-50 border rounded-xl p-5 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{descricao}</div>
          ) : (
            <div className="mt-4 bg-gray-50 border rounded-xl p-5 text-sm text-gray-400">{erroDetalhes ? 'Descrição não carregada.' : 'Nenhuma descrição identificada.'}</div>
          )}
        </section>

        {informacoesAdicionais && (
          <section className="bg-white border rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-900">Informações Adicionais</h3>
            <div className="mt-4 bg-gray-50 border rounded-xl p-5 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{informacoesAdicionais}</div>
          </section>
        )}

        <section className="bg-white border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">📎</div>
            <div>
              <h3 className="font-bold text-gray-900">Documentos Anexados</h3>
              <p className="text-xs text-gray-500 mt-1">Arquivos vinculados à requisição no PCNet.</p>
            </div>
          </div>

          {carregandoDetalhes ? (
            <Placeholder texto="Carregando documentos..." />
          ) : documentos.length ? (
            <div className="mt-5 space-y-2">
              {documentos.map((documento, index) => {
                const chave = String(documento.idArquivoAnexadoPlc || `${documento.nome}-${index}`);
                const baixando = baixandoDocumento === String(documento.idArquivoAnexadoPlc || '');
                return (
                  <div key={chave} className="border rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span>📄</span>
                      <span className="text-sm font-semibold text-gray-700 break-all">{documento.nome}</span>
                    </div>

                    {documento.podeBaixar ? (
                      <button
                        type="button"
                        onClick={() => baixarDocumento(documento)}
                        disabled={Boolean(baixandoDocumento)}
                        className="inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 whitespace-nowrap"
                      >
                        {baixando ? 'Baixando...' : '↓ Baixar'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Download não identificado</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Placeholder texto="Nenhum documento identificado." />
          )}
        </section>

        <section className="bg-white border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">🔗</div>
            <div>
              <h3 className="font-bold text-gray-900">Ocorrências</h3>
              <p className="text-xs text-gray-500 mt-1">Fatos e ocorrências vinculados à requisição.</p>
            </div>
          </div>

          {carregandoDetalhes ? (
            <Placeholder texto="Carregando ocorrências..." />
          ) : ocorrencias.length ? (
            <div className="mt-5 border rounded-xl overflow-hidden">
              {ocorrencias.map((ocorrencia, index) => {
                const chave = ocorrencia.numero || String(index);
                const abrindo = abrindoBo === (ocorrencia.numero || ocorrencia.rotaVisualizacao);
                return (
                  <div key={chave} className="px-4 py-3 border-b last:border-b-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{ocorrencia.numero}</div>
                      <div className="text-sm text-gray-500 mt-0.5">{ocorrencia.natureza || '—'}</div>
                    </div>

                    {ocorrencia.podeVisualizar ? (
                      <button
                        type="button"
                        onClick={() => visualizarBo(ocorrencia)}
                        disabled={Boolean(abrindoBo)}
                        className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 whitespace-nowrap"
                      >
                        {abrindo ? 'Abrindo...' : '🔎 Visualizar BO'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Lupa não identificada</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Placeholder texto="Nenhuma ocorrência identificada." />
          )}
        </section>
        {modalAcao && (
          <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden">
              <div className="px-6 py-5 border-b">
                <h3 className="text-lg font-bold text-gray-900">
                  Confirmar {modalAcao.titulo}
                </h3>
                <p className="text-sm text-gray-500 mt-2">
                  Requisição <strong>{requisicaoAberta.requisicao}</strong>
                </p>
              </div>

              <div className="px-6 py-5">
                {modalAcao.acao === 'DEVOLVER' ? (
                  <>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Justificativa da devolução
                    </label>
                    <textarea
                      value={justificativaAcao}
                      onChange={e => setJustificativaAcao(e.target.value)}
                      disabled={Boolean(acaoEmAndamento)}
                      rows={5}
                      autoFocus
                      placeholder="Informe a justificativa que será registrada no PCNet..."
                      className="w-full border rounded-xl px-4 py-3 text-sm resize-y outline-none focus:ring-2 focus:ring-red-200"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      O texto será inserido no campo Justificativa da própria requisição antes de acionar Devolver.
                    </p>
                  </>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    Esta ação modificará a requisição diretamente no PCNet.
                  </div>
                )}

                {erroAcao && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    {erroAcao}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={Boolean(acaoEmAndamento)}
                  onClick={cancelarAcao}
                  className="border bg-white hover:bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={
                    Boolean(acaoEmAndamento)
                    || (modalAcao.acao === 'DEVOLVER' && !justificativaAcao.trim())
                  }
                  onClick={confirmarAcao}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                    modalAcao.acao === 'DEVOLVER'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-sky-600 hover:bg-sky-700'
                  }`}
                >
                  {acaoEmAndamento ? 'Executando...' : `Confirmar ${modalAcao.titulo}`}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="bg-white border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center text-xl">📥</div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Aceite de Requisições</h2>
              <p className="text-sm text-gray-500 mt-0.5">Consulta ao vivo da caixa de Aceite do PCNet.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs font-bold px-3 py-2 rounded-full ${
              !bridgeDetectado
                ? 'bg-amber-50 text-amber-700'
                : conectado
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-100 text-gray-600'
            }`}>
              {!bridgeDetectado ? '○ Bridge não detectado' : conectado ? '● PCNet conectado' : '○ PCNet desconectado'}
            </span>

            {bridgeDetectado && !conectado ? (
              <button type="button" onClick={conectarPcnet} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl text-sm font-bold">
                Conectar PCNet
              </button>
            ) : (
              <button type="button" onClick={carregar} disabled={carregando} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                {carregando ? 'Consultando...' : '↻ Atualizar'}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-xs text-gray-500">
          <span>{carregando && itens.length === 0 ? <b className="text-sky-700">Consultando requisições...</b> : <><b className="text-gray-700">{itens.length}</b> requisição(ões) carregada(s)</>}</span>
          {atualizadoEm && <span>Atualizado em {new Date(atualizadoEm).toLocaleString('pt-BR')}</span>}
          <span className="text-gray-400">Dados mantidos somente nesta sessão.</span>
        </div>
      </section>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{erro}</div>}

      {sucessoAcao && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm font-semibold">
          ✓ {sucessoAcao}
        </div>
      )}

      {!bridgeDetectado && !carregando && (
        <section className="bg-white border border-amber-200 rounded-2xl py-14 px-6 text-center">
          <div className="text-4xl mb-3">🧩</div>
          <h3 className="font-bold text-gray-800">PCNet Bridge não detectado</h3>
          <p className="text-sm text-gray-500 mt-2">Verifique se a extensão Nexus PCNet Bridge está instalada e habilitada.</p>
        </section>
      )}

      {bridgeDetectado && !conectado && !carregando && (
        <section className="bg-white border rounded-2xl py-14 px-6 text-center">
          <div className="text-4xl mb-3">🔌</div>
          <h3 className="font-bold text-gray-800">PCNet não conectado</h3>
          <p className="text-sm text-gray-500 mt-2">Conecte-se ao PCNet para consultar as requisições.</p>
        </section>
      )}

      {bridgeDetectado && conectado && (
        <>
          <section className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="grid lg:grid-cols-[1fr_220px_240px] gap-3">
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar requisição, FAV, espécie, unidade..."
                className="border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-200"
              />

              <select value={situacao} onChange={e => setSituacao(e.target.value)} className="border rounded-xl px-3 py-2.5 text-sm bg-white">
                <option value="">Todas as situações</option>
                {situacoes.map(valor => <option key={valor} value={valor}>{valor}</option>)}
              </select>

              <select value={natureza} onChange={e => setNatureza(e.target.value)} className="border rounded-xl px-3 py-2.5 text-sm bg-white">
                <option value="">Todas as naturezas</option>
                {naturezas.map(valor => <option key={valor} value={valor}>{valor}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
              <span>{filtrados.length} registro(s) após filtros</span>
              {(busca || situacao || natureza) && (
                <button
                  type="button"
                  onClick={() => { setBusca(''); setSituacao(''); setNatureza(''); }}
                  className="text-sky-700 font-semibold"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </section>

          <section className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            {carregando ? (
              <div className="py-16 text-center text-gray-500">Consultando caixa de Aceite do PCNet...</div>
            ) : paginaAtual.length === 0 ? (
              <div className="py-16 text-center text-gray-500">Nenhuma requisição encontrada.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-4 py-3">Requisição</th>
                        <th className="text-left px-4 py-3">Situação</th>
                        <th className="text-left px-4 py-3">Natureza / Espécie</th>
                        <th className="text-left px-4 py-3">Unidade</th>
                        <th className="text-left px-4 py-3 whitespace-nowrap">Data/Hora</th>
                        <th className="text-left px-4 py-3">FAV</th>
                        <th className="text-right px-4 py-3">Ações</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {paginaAtual.map((item, index) => (
                        <tr key={`${item.requisicao}-${item.fav}-${inicio + index}`} className="hover:bg-sky-50/40 transition">
                          <td className="px-4 py-4 align-top">
                            <div className="font-bold text-gray-900 whitespace-nowrap">{item.requisicao}</div>
                            {item.procedimentoOrigem && <div className="text-[11px] text-gray-400 mt-1">Proc. {item.procedimentoOrigem}</div>}
                          </td>

                          <td className="px-4 py-4 align-top">
                            <span className={`inline-flex border rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${badgeSituacao(item.situacao)}`}>
                              {item.situacao || '—'}
                            </span>
                          </td>

                          <td className="px-4 py-4 align-top min-w-[300px]">
                            <div className="font-semibold text-gray-800">{item.natureza || '—'}</div>
                            <div className="text-xs text-gray-500 mt-1">{item.especieExame || '—'}</div>
                            {item.tipo && <div className="text-[11px] text-gray-400 mt-1">{item.tipo}</div>}
                          </td>

                          <td className="px-4 py-4 align-top min-w-[230px] text-xs text-gray-600">{item.unidadeOrigem || '—'}</td>
                          <td className="px-4 py-4 align-top whitespace-nowrap text-xs text-gray-600">{item.dataHora || '—'}</td>
                          <td className="px-4 py-4 align-top font-mono text-xs">{item.fav || '—'}</td>

                          <td className="px-4 py-4 align-top text-right">
                            <button
                              type="button"
                              onClick={() => abrirRequisicao(item)}
                              className="inline-flex items-center gap-2 border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition"
                            >
                              Abrir <span>→</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t bg-gray-50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-gray-500">
                    Exibindo {filtrados.length ? inicio + 1 : 0}–{Math.min(inicio + ITENS_POR_PAGINA, filtrados.length)} de {filtrados.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={paginaSegura <= 1} onClick={() => irPagina(paginaSegura - 1)} className="border bg-white px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40">← Anterior</button>
                    <span className="text-xs text-gray-600 min-w-[110px] text-center">Página {paginaSegura} de {totalPaginas}</span>
                    <button type="button" disabled={paginaSegura >= totalPaginas} onClick={() => irPagina(paginaSegura + 1)} className="border bg-white px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40">Próxima →</button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CampoDetalhe({ titulo, valor, destaque = false, mono = false }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{titulo}</div>
      <div className={`mt-1 text-gray-800 ${destaque ? 'font-semibold' : ''} ${mono ? 'font-mono' : ''}`}>
        {valor || '—'}
      </div>
    </div>
  );
}

function Placeholder({ texto }) {
  return (
    <div className="mt-5 border border-dashed rounded-xl p-8 text-center text-sm text-gray-400">
      {texto}
    </div>
  );
}
