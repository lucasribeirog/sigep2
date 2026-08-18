const { processarBalistica, extrairDadosArmaViaIA } = require('./especies/balistica');
const { processarDrogas, extrairDadosDrogasViaIA } = require('./especies/drogas');
const processarEficienciaObjeto = require('./especies/eficienciaObjeto');
const { FORMULARIOS } = require('./formDefinitions');

async function analisarImagemPericial(caminhoImagem, formulario) {
  switch (formulario) {
    case 'balistica': return extrairDadosArmaViaIA(caminhoImagem);
    case 'drogas': return extrairDadosDrogasViaIA(caminhoImagem);
    case 'eficiencia_objeto': return {};
    default: throw new Error('O modelo de formulário desta espécie não suporta análise automatizada.');
  }
}

function prepararVariaveis(formulario, dadosForm, perito, contexto = {}) {
  const dadosOriginais = typeof dadosForm === 'string' ? JSON.parse(dadosForm) : (dadosForm || {});
  const p = typeof perito === 'string' ? JSON.parse(perito) : (perito || {});
  const fav = String(contexto.favDetectada || '').trim();

  // A FAV extraída do DOCX-base funciona como fallback. Um valor digitado pelo
  // usuário sempre tem precedência, o que cobre documentos antigos em que a
  // extração automática não é possível.
  const dados = { ...dadosOriginais };
  if (fav) {
    if (!dados.n_fav) dados.n_fav = fav;
    if (!dados.numero_fav) dados.numero_fav = fav;
    if (!dados.fav) dados.fav = fav;
  }

  const base = {
    perito_nome: p.nome || '',
    perito_masp: p.masp || '',
    perito_unidade: p.unidade || '',
  };

  let esp;
  switch (formulario) {
    case 'eficiencia_objeto': esp = processarEficienciaObjeto(dados, contexto); break;
    case 'balistica': esp = processarBalistica(dados, null, contexto); break;
    case 'drogas': esp = processarDrogas(dados, null, contexto); break;
    default: esp = { ...dados };
  }

  // Dados brutos ficam disponíveis para placeholders adicionais detectados no
  // template. Variáveis calculadas pelos processadores têm precedência.
  return { ...base, ...dados, ...esp };
}

module.exports = { FORMULARIOS, analisarImagemPericial, prepararVariaveis };
