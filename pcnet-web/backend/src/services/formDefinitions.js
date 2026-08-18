const FORMULARIOS = {
  balistica: {
    id: 'balistica',
    nome: 'Balística — arma de fogo / munição',
    suportaIA: true,
  },
  eficiencia_objeto: {
    id: 'eficiencia_objeto',
    nome: 'Eficiência / prestabilidade de objeto',
    suportaIA: false,
  },
  drogas: {
    id: 'drogas',
    nome: 'Constatação preliminar de drogas',
    suportaIA: true,
  },
};

const VARIAVEIS_SISTEMA = [
  'perito_nome', 'perito_masp', 'perito_unidade',
  'especie_nome', 'especie_oficial', 'natureza',
];

const DEFINICOES = {
  balistica: {
    simples: [
      'calibre', 'marca', 'modelo', 'numero_serie', 'acabamento',
      'comprimento_cano', 'comprimento_total', 'capacidade', 'capacidade_texto',
      'n_lacre', 'defeito_constatado', 'tipo_acao_carabina', 'detalhes_coronha',
      'sistema_alimentacao', 'empunhadura_revolver', 'carregador_info',
      'detalhes_armacao', 'detalhes_fuzil', 'qtd_municao', 'instituicao_carga',
      'nome_arma_livre', 'descricao_livre', 'municoes_detalhes',
    ],
    secoes: [
      'tem_imagem', 'is_carabina', 'is_revolver', 'is_pistola', 'is_fuzil',
      'is_municao_isolada', 'is_coringa', 'is_pm', 'is_eficiente', 'is_ineficiente',
      'is_nao_calcou', 'is_rajada', 'is_municao_eficiente', 'is_municao_ineficiente',
      'is_encaminha_custodia', 'is_municao_consumida', 'tem_lacre',
    ],
    imagens: ['imagem_vestigio'],
  },
  drogas: {
    simples: [
      'cor_material', 'qtd_involucros', 'massa_liquida', 'extenso_massa',
      'envelope_recebimento', 'massa_amostra', 'fav_amostra', 'envelope_amostra',
      'numero_fav', 'envelope_encaminhamento', 'n_lacre',
    ],
    secoes: [
      'is_cocaina', 'is_maconha', 'is_plural', 'tem_envelope_recebimento',
      'resultado_positivo', 'resultado_negativo', 'resultado_inconclusivo',
      'is_material_fragmentado', 'tem_cor_material', 'tem_imagem',
    ],
    imagens: ['imagem_vestigio'],
  },
  eficiencia_objeto: {
    simples: [
      'n_lacre', 'n_fav', 'unidade_custodia', 'marca', 'material_cabo', 'cor_cabo',
      'comp_lamina', 'largura_base', 'comp_total', 'tipo_abertura', 'secao_madeira',
      'comp_madeira', 'larg_madeira', 'massa', 'nome_objeto', 'material_predominante',
      'cor_objeto', 'compr_objeto', 'larg_objeto', 'espessura_objeto', 'massa_objeto',
    ],
    secoes: [
      'is_faca', 'is_canivete', 'is_madeira', 'is_outro', 'is_eficiente',
      'is_ineficiente', 'tem_lacre',
    ],
    imagens: [],
  },
};

function conjuntoConhecido(formulario) {
  const d = DEFINICOES[formulario] || { simples: [], secoes: [], imagens: [] };
  return new Set([...VARIAVEIS_SISTEMA, ...d.simples, ...d.secoes, ...d.imagens]);
}

function capacidadeFormulario(formulario) {
  const d = DEFINICOES[formulario] || { simples: [], secoes: [], imagens: [] };
  return {
    simples: [...VARIAVEIS_SISTEMA, ...d.simples],
    secoes: [...d.secoes],
    imagens: [...d.imagens],
  };
}

module.exports = {
  FORMULARIOS,
  VARIAVEIS_SISTEMA,
  DEFINICOES,
  conjuntoConhecido,
  capacidadeFormulario,
};
